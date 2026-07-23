import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { processImport } from "../lib/importProcessor";
import { COLUMN_MAP } from "../lib/ratchet";
import { fetchCaseSheetRows } from "../lib/caseSheetSync";
import { getSheetUrl } from "../lib/backfillSheetSync";
import { refreshCaLapPrecompute } from "../lib/caLapRefresh";
import { recompute, invalidateScopedDashboardFilters, DASHBOARD_FILTERS_CACHE_KEY, DASHBOARD_MONTHS_CACHE_KEY } from "../lib/precomputedCache";
import { computeDashboardFilters, computeDashboardMonths } from "./dashboard";
import { bumpVersions } from "../lib/dataVersions";
import { warmDefaultReports } from "../lib/reportWarmup";

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

// Danh sach "ca lap" chi thay doi that su khi co GHI_MOI/GHI_DE that (BO_QUA/CAP_NHAT_MOC_THOI_GIAN
// khong doi du lieu nghiep vu nen khong anh huong ket qua phat hien lap) - tranh tinh lai vo ich
// khi import chi toan dong da co san khong doi gi (vd chay lai file cu, hoac Google Sheet dong bo
// khong co gi moi). Chay qua waitUntil() de KHONG lam cham phan hoi cua nguoi import - cron hang
// gio (co guard shouldSkipCronRefresh, xem lib/caLapRefresh.ts) van con lam luoi an toan.
// Cung dot nay tinh lai luon cache dashboard filters/months (xem recomputeDashboardCaches).
function scheduleCaLapRefreshIfChanged(
  c: Context<{ Bindings: Env }>,
  summary: { GHI_MOI: number; GHI_DE: number; affectedSerials: string[] },
) {
  if (summary.GHI_MOI + summary.GHI_DE > 0) {
    // Truyen affectedSerials de refreshCaLapPrecompute() chi tinh lai INCREMENTAL trong pham vi
    // serial bi anh huong (xem lib/caLapRefresh.ts + lib/importProcessor.ts) - neu rong sau loc,
    // ham tu dong roi ve full recompute (luoi an toan).
    c.executionCtx.waitUntil(refreshCaLapPrecompute(c.env.DB, summary.affectedSerials));
    // Danh sach dim (khu_vuc/hang/tinh/...) va danh sach thang chi co the doi khi co GHI_MOI/GHI_DE
    // that su - tinh lai ngay trong waitUntil() cung dot voi refresh "ca lap", khong lam cham phan
    // hoi cho nguoi import (xem KE_HOACH_TOI_UU_D1.md Giai doan 2).
    c.executionCtx.waitUntil(recomputeDashboardCaches(c.env.DB));
    // Bump domain "cases" (xem lib/dataVersions.ts, YEU_CAU_BAO_CAO_TINH_SAN.md) roi TINH SAN ngay
    // bo bao cao mac dinh (R7 - warmDefaultReports, xem lib/reportWarmup.ts): "tat ca bao cao se
    // tinh lai 1 lan duy nhat khi import moi" - bump PHAI xong truoc khi warm de ban tinh san mang
    // dung version tag moi (neu warm truoc bump, tag cu se bi coi la het han ngay lan doc dau tien,
    // warm thanh cong coc).
    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["cases"]).then(() => warmDefaultReports(c.env.DB)));
  }
  // Don rac "rpt:%" chay moi lan import (khong dieu kien GHI_MOI/GHI_DE, xem cleanupOldReportCache).
  c.executionCtx.waitUntil(cleanupOldReportCache(c.env.DB));
}

const importRoute = new Hono<{ Bindings: Env }>();
importRoute.use("*", verifySessionMiddleware, loadUser, requireRole("Admin", "TBP DVBH"));

// GET /api/import/column-map - anh xa cot Excel -> cot DB, de frontend parse dung tren trinh duyet
importRoute.get("/column-map", async (c) => c.json({ columnMap: COLUMN_MAP }));

// GET /api/import/template - file mau CSV voi dung header tieng Viet nhu COLUMN_MAP
importRoute.get("/template", (c) => {
  const headers = Object.keys(COLUMN_MAP);
  const csv = headers.join(",") + "\n";
  return c.body(csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": "attachment; filename=mau_import_crm_hang_ngay.csv",
  });
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

  await c.env.DB.prepare(
    `INSERT INTO import_history (ten_file, nguoi_import, ghi_moi, ghi_de, bo_qua, loi)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(body.filename, user.email, summary.GHI_MOI, summary.GHI_DE, summary.BO_QUA, summary.LOI)
    .run();

  scheduleCaLapRefreshIfChanged(c, summary);
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

  await c.env.DB.prepare(
    `INSERT INTO import_history (ten_file, nguoi_import, ghi_moi, ghi_de, bo_qua, loi)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind("Đồng bộ ca mới từ Google Sheet", user.email, summary.GHI_MOI, summary.GHI_DE, summary.BO_QUA, summary.LOI)
    .run();

  scheduleCaLapRefreshIfChanged(c, summary);
  return c.json(summary);
});

// GET /api/import/history
importRoute.get("/history", async (c) => {
  const limit = c.req.query("export") === "true" ? 5000 : 50;
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM import_history ORDER BY thoi_gian DESC LIMIT ?",
  )
    .bind(limit)
    .all();
  return c.json({ rows: results });
});

export default importRoute;
