import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { processImport } from "../lib/importProcessor";
import { COLUMN_MAP, BUSINESS_FIELDS, computeCrmHashFromDbRow } from "../lib/ratchet";
import { fetchCaseSheetRows } from "../lib/caseSheetSync";
import { getSheetUrl } from "../lib/backfillSheetSync";
import { csvTemplateResponse } from "../lib/csvTemplate";
import { refreshCaLapPrecompute } from "../lib/caLapRefresh";
import { recompute, invalidateScopedDashboardFilters, DASHBOARD_FILTERS_CACHE_KEY, DASHBOARD_MONTHS_CACHE_KEY } from "../lib/precomputedCache";
import { computeDashboardFilters, computeDashboardMonths } from "./dashboard";
import { bumpVersions } from "../lib/dataVersions";
import { warmDefaultReports } from "../lib/reportWarmup";
import { nowVN } from "../lib/vnTime";
import { recomputeDaDongDayChunks } from "../lib/daDongDayChunks";
import { recomputeSurveySnapshot } from "../lib/surveySnapshot";

// Tinh lai cache /dashboard/filters (pham vi khong gioi han) + /dashboard/months (xem
// lib/precomputedCache.ts, routes/dashboard.ts) va don cac bien the /dashboard/filters theo
// khu_vuc_phu_trach (Giam sat) de chung tu compute-on-miss lai voi du lieu moi o lan doc tiep theo -
// xem comment invalidateScopedDashboardFilters ve ly do khong recompute() truc tiep duoc cac bien the nay.
async function recomputeDashboardCaches(db: D1Database): Promise<void> {
  await Promise.all([
    recompute(db, DASHBOARD_FILTERS_CACHE_KEY, () => computeDashboardFilters(db, null)),
    recompute(db, DASHBOARD_MONTHS_CACHE_KEY, () => computeDashboardMonths(db)),
    invalidateScopedDashboardFilters(db),
  ]);
}

// Don rac cache bao cao "rpt:%" (xem lib/reportCache.ts) qua han 7 ngay - khac cac key
// "dashboard-filters"/"dashboard-months" (luon duoc ghi de moi lan lien quan, khong bao gio thanh
// rac), key "rpt:%" co the ton dong vinh vien khi bo loc/pham vi cu khong con ai doc lai (vd doi
// khu_vuc_phu_trach cua 1 Giam sat) - don dinh ky sau moi lan import, KHONG phu thuoc GHI_MOI/GHI_DE
// vi day chi la don rac theo tuoi, khong lien quan viec du lieu co that su doi hay khong.
async function cleanupOldReportCache(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM precomputed_cache WHERE key LIKE 'rpt:%' AND updated_at < datetime('now', '-7 days')").run();
}

// Boc 1 tac vu nen (waitUntil) de loi khong con roi mat tich vao Worker log - ghi noi vao cot
// import_history.bg_error (migration 0032) neu task nem loi, de nguoi van hanh biet snapshot/cache
// co the da khong duoc cap nhat du API tra ve "import thanh cong" (xem P0 #2 trong BAO_CAO_RAO_SOAT_
// IMPORT_CRM_CACHE_2026-07-28.md). KHONG throw lai - 1 task loi khong duoc lam cac task con lai
// trong scheduleCaLapRefreshIfChanged bi huy (moi task la 1 waitUntil doc lap).
async function runBgTask(env: Env, importHistoryId: number, label: string, task: Promise<unknown>): Promise<void> {
  try {
    await task;
  } catch (err) {
    console.error(`[import bg] ${label} that bai:`, err);
    const message = err instanceof Error ? err.message : String(err);
    await env.DB.prepare(
      `UPDATE import_history SET bg_error = COALESCE(bg_error || char(10), '') || ? WHERE id = ?`,
    )
      .bind(`${label}: ${message}`, importHistoryId)
      .run();
  }
}

// Danh sach "ca lap" chi thay doi that su khi co GHI_MOI/GHI_DE that (BO_QUA khong doi du lieu
// nghiep vu/co vi pham nen khong anh huong ket qua phat hien lap) - tranh tinh lai vo ich khi import
// chi toan dong da co san khong doi gi (vd chay lai file cu, hoac Google Sheet dong bo khong co gi
// moi). Chay qua waitUntil() de KHONG lam cham phan hoi cua nguoi import - cron hang gio (co guard
// shouldSkipCronRefresh, xem lib/caLapRefresh.ts) van con lam luoi an toan.
// Cung dot nay tinh lai luon cache dashboard filters/months (xem recomputeDashboardCaches).
function scheduleCaLapRefreshIfChanged(
  c: Context<{ Bindings: Env }>,
  summary: { GHI_MOI: number; GHI_DE: number; affectedSerials: string[]; affectedDates: string[] },
  importHistoryId: number,
) {
  if (summary.GHI_MOI + summary.GHI_DE > 0) {
    // Truyen affectedSerials de refreshCaLapPrecompute() chi tinh lai INCREMENTAL trong pham vi
    // serial bi anh huong (xem lib/caLapRefresh.ts + lib/importProcessor.ts) - neu rong sau loc,
    // ham tu dong roi ve full recompute (luoi an toan).
    c.executionCtx.waitUntil(runBgTask(c.env, importHistoryId, "refresh ca lap", refreshCaLapPrecompute(c.env.DB, summary.affectedSerials)));
    // Danh sach dim (khu_vuc/hang/tinh/...) va danh sach thang chi co the doi khi co GHI_MOI/GHI_DE
    // that su - tinh lai ngay trong waitUntil() cung dot voi refresh "ca lap", khong lam cham phan
    // hoi cho nguoi import (xem KE_HOACH_TOI_UU_D1.md Giai doan 2).
    c.executionCtx.waitUntil(runBgTask(c.env, importHistoryId, "cache dashboard filters/months", recomputeDashboardCaches(c.env.DB)));
    // Bump domain "cases" (xem lib/dataVersions.ts, YEU_CAU_BAO_CAO_TINH_SAN.md) roi TINH SAN ngay
    // bo bao cao mac dinh (R7 - warmDefaultReports, xem lib/reportWarmup.ts): "tat ca bao cao se
    // tinh lai 1 lan duy nhat khi import moi" - bump PHAI xong truoc khi warm de ban tinh san mang
    // dung version tag moi (neu warm truoc bump, tag cu se bi coi la het han ngay lan doc dau tien,
    // warm thanh cong coc).
    c.executionCtx.waitUntil(
      runBgTask(c.env, importHistoryId, "bump version + warm bao cao", bumpVersions(c.env.DB, ["cases"]).then(() => warmDefaultReports(c.env.DB))),
    );
    // Snapshot R2 "ca da dong" theo tung ngay (xem lib/daDongDayChunks.ts) - DAY LA NOI DUY NHAT
    // duoc phep tao/ghi de JSON len R2 cho tinh nang nay (nguyen tac chot voi chu he thong, xem
    // memory r2-json-write-trigger-rule.md) - chi tinh lai DUNG nhung ngay trong affectedDates,
    // khong dung cron/compute-on-miss nao khac.
    c.executionCtx.waitUntil(runBgTask(c.env, importHistoryId, "snapshot R2 ca da dong", recomputeDaDongDayChunks(c.env, summary.affectedDates)));
    // Snapshot R2 "ung vien khao sat" (xem lib/surveySnapshot.ts) - cung DUY NHAT 1 diem ghi nay,
    // dung nguyen tac voi snapshot ca da dong o tren.
    c.executionCtx.waitUntil(runBgTask(c.env, importHistoryId, "snapshot R2 ung vien khao sat", recomputeSurveySnapshot(c.env)));
  }
  // Don rac "rpt:%" chay moi lan import (khong dieu kien GHI_MOI/GHI_DE, xem cleanupOldReportCache).
  c.executionCtx.waitUntil(runBgTask(c.env, importHistoryId, "don rac rpt cache", cleanupOldReportCache(c.env.DB)));
}

const importRoute = new Hono<{ Bindings: Env }>();
importRoute.use("*", verifySessionMiddleware, loadUser, requireRole("Admin", "TBP DVBH"));

// GET /api/import/column-map - anh xa cot Excel -> cot DB, de frontend parse dung tren trinh duyet
importRoute.get("/column-map", async (c) => c.json({ columnMap: COLUMN_MAP }));

// GET /api/import/template - file mau CSV voi dung header tieng Viet nhu COLUMN_MAP
importRoute.get("/template", (c) => {
  const headers = Object.keys(COLUMN_MAP);
  const csv = headers.join(",") + "\n";
  return csvTemplateResponse(c, csv, "mau_import_crm_hang_ngay.csv");
});

// POST /api/import/preview - khong ghi DB, chi tra ve so luong du kien theo 4 nhanh
importRoute.post("/preview", async (c) => {
  const body = await c.req.json<{ filename: string; rows: unknown[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);

  const summary = await processImport(c.env.DB, body.rows, false);
  return c.json({ filename: body.filename, ...summary });
});

// POST /api/import/commit - thuc thi that, ghi lich su import
importRoute.post("/commit", async (c) => {
  const body = await c.req.json<{ filename: string; rows: unknown[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);

  const summary = await processImport(c.env.DB, body.rows, true);
  const user = c.get("user");

  const inserted = await c.env.DB.prepare(
    `INSERT INTO import_history (ten_file, nguoi_import, ghi_moi, ghi_de, bo_qua, loi, thoi_gian)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(body.filename, user.email, summary.GHI_MOI, summary.GHI_DE, summary.BO_QUA, summary.LOI, nowVN())
    .run();

  scheduleCaLapRefreshIfChanged(c, summary, inserted.meta.last_row_id);
  return c.json({ filename: body.filename, ...summary });
});

// POST /api/import/sync-sheet - dong bo ca moi tu Google Sheet publish TSV, chi Admin
// (nghiem ngat hon quyen import thu cong Admin+TBP DVBH o tren, vi day la tu dong,
// khong co buoc nguoi xem lai truoc khi ghi). Link cau hinh o Settings > sheet-urls.
importRoute.post("/sync-sheet", requireRole("Admin"), async (c) => {
  const url = await getSheetUrl(c.env.DB, "case");
  if (!url) return c.json({ error: "MISSING_SHEET_URL" }, 400);

  let rows: Record<string, unknown>[];
  try {
    rows = await fetchCaseSheetRows(url);
  } catch (err) {
    return c.json({ error: "FETCH_FAILED", message: (err as Error).message }, 502);
  }

  const summary = await processImport(c.env.DB, rows, true);
  const user = c.get("user");

  const inserted = await c.env.DB.prepare(
    `INSERT INTO import_history (ten_file, nguoi_import, ghi_moi, ghi_de, bo_qua, loi, thoi_gian)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind("Đồng bộ ca mới từ Google Sheet", user.email, summary.GHI_MOI, summary.GHI_DE, summary.BO_QUA, summary.LOI, nowVN())
    .run();

  scheduleCaLapRefreshIfChanged(c, summary, inserted.meta.last_row_id);
  return c.json(summary);
});

// POST /api/import/backfill-crm-hash - chi Admin, chay THU CONG 1 lan sau khi deploy tinh nang
// crm_hash (migration 0032) va TRUOC lan import/sync-sheet CRM tiep theo - dien crm_hash cho cac
// dong da co san trong DB (crm_hash con NULL), tranh de processImport() coi tat ca dong nay la "da
// doi" o lan cham dau tien (moi dong NULL deu khac bat ky hash nao) roi GHI_DE hang loat khong can
// thiet. Xu ly theo lo (LIMIT, mac dinh 1000) - goi lai nhieu lan (dung "remaining" trong response
// de biet con hay het) toi khi remaining = 0. Idempotent - goi lai an toan, chi dong crm_hash IS NULL
// moi bi dong tiep.
importRoute.post("/backfill-crm-hash", requireRole("Admin"), async (c) => {
  const limitParam = Number(c.req.query("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 2000) : 1000;

  const { results } = await c.env.DB.prepare(
    `SELECT id, ${BUSINESS_FIELDS.join(", ")} FROM case_dvbh WHERE crm_hash IS NULL ORDER BY id LIMIT ?`,
  )
    .bind(limit)
    .all<Record<string, unknown>>();

  if (results.length === 0) {
    return c.json({ updated: 0, remaining: 0 });
  }

  const statements = await Promise.all(
    results.map(async (row) => {
      const hash = await computeCrmHashFromDbRow(row);
      return c.env.DB.prepare("UPDATE case_dvbh SET crm_hash = ? WHERE id = ?").bind(hash, row.id);
    }),
  );
  await c.env.DB.batch(statements);

  const remainingRow = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM case_dvbh WHERE crm_hash IS NULL").first<{ n: number }>();
  return c.json({ updated: results.length, remaining: remainingRow?.n ?? 0 });
});

// GET /api/import/history?loai=&export= - "loai" loc theo nguon (crm/giai_trinh_cu/giai_trinh_lap_cu/
// khao_sat_cu/nap_gas_danh_gia_cu, xem migration 0027) de moi tab trong module Import data chi thay
// lich su cua dung minh, khong bi lan lich su cua cac loai import khac.
importRoute.get("/history", async (c) => {
  const limit = c.req.query("export") === "true" ? 5000 : 50;
  const loai = c.req.query("loai");
  const { results } = await c.env.DB.prepare(
    loai ? "SELECT * FROM import_history WHERE loai = ? ORDER BY thoi_gian DESC LIMIT ?" : "SELECT * FROM import_history ORDER BY thoi_gian DESC LIMIT ?",
  )
    .bind(...(loai ? [loai, limit] : [limit]))
    .all();
  return c.json({ rows: results });
});

export default importRoute;
