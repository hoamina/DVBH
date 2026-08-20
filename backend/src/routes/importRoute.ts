import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { processImport } from "../lib/importProcessor";
import { COLUMN_MAP, BUSINESS_FIELDS, businessFieldValue, computeCrmHashFromDbRow, resplitStoredLinkHinhAnh } from "../lib/ratchet";
import { fetchCaseSheetRows } from "../lib/caseSheetSync";
import { getSheetUrl } from "../lib/backfillSheetSync";
import { csvTemplateResponse } from "../lib/csvTemplate";
import { refreshCaLapPrecompute } from "../lib/caLapRefresh";
import { recompute, invalidateScopedDashboardFilters, DASHBOARD_FILTERS_CACHE_KEY, DASHBOARD_MONTHS_CACHE_KEY, DASHBOARD_SYNC_STATUS_CACHE_KEY } from "../lib/precomputedCache";
import { computeDashboardFilters, computeDashboardMonths } from "./dashboard";
import type { SyncStatusPayload } from "./dashboard";
import { bumpVersions } from "../lib/dataVersions";
import { warmDefaultReports } from "../lib/reportWarmup";
import { generateDailySnapshot, generateKhuVucBacklogSnapshots } from "../lib/dailySnapshot";
import { nowVN } from "../lib/vnTime";
import { recomputeDaDongDayChunks } from "../lib/daDongDayChunks";

// Tinh lai cache /dashboard/filters (pham vi khong gioi han) + /dashboard/months (xem
// lib/precomputedCache.ts, routes/dashboard.ts) va don cac bien the /dashboard/filters theo
// khu_vuc_phu_trach (Giam sat) de chung tu compute-on-miss lai voi du lieu moi o lan doc tiep theo -
// xem comment invalidateScopedDashboardFilters ve ly do khong recompute() truc tiep duoc cac bien the nay.
async function recomputeDashboardCaches(db: D1Database): Promise<void> {
  await Promise.all([
    recompute(db, DASHBOARD_FILTERS_CACHE_KEY, () => computeDashboardFilters(db, null)),
    recompute(db, DASHBOARD_MONTHS_CACHE_KEY, () => computeDashboardMonths(db)),
    // "/dashboard/sync-status" (TopBar poll 5 phut/lan) - ghi TRUC TIEP thoi diem import nay (nowVN()),
    // KHONG con quet MAX(thoi_gian_tai_du_lieu_crm) qua case_dvbh nua (rao soat lag 2026-08-20, buoc
    // 2 - chu he thong chot: "dong bo" o day dung nghia la thoi diem he thong VUA import xong, ta da
    // biet chac gia tri nay ngay tai day, khong can suy ngoai tu du lieu). computeSyncStatus() (con lai
    // trong dashboard.ts) chi con dung lam fallback compute-on-miss cho lan doc DAU TIEN truoc khi tung
    // co import nao chay qua code nay (vd ngay sau deploy tinh nang, cache con trong).
    recompute(db, DASHBOARD_SYNC_STATUS_CACHE_KEY, async () => ({ lastSynced: nowVN() }) satisfies SyncStatusPayload),
    invalidateScopedDashboardFilters(db),
  ]);
}

// Don rac cache bao cao "rpt:%" (xem lib/reportCache.ts) qua han 7 ngay - khac cac key
// "dashboard-filters"/"dashboard-months" (luon duoc ghi de moi lan lien quan, khong bao gio thanh
// rac), key "rpt:%" co the ton dong vinh vien khi bo loc/pham vi cu khong con ai doc lai (vd doi
// khu_vuc_phu_trach cua 1 Giam sat) - don dinh ky sau moi lan import, KHONG phu thuoc GHI_MOI/GHI_DE
// vi day chi la don rac theo tuoi, khong lien quan viec du lieu co that su doi hay khong.
async function cleanupOldReportCache(db: D1Database): Promise<void> {
  // Dọn dẹp các cache quá hạn 7 ngày, đồng thời giới hạn giữ lại tối đa 1000 bản ghi cache báo cáo
  // hoạt động gần đây nhất để ngăn chặn kẻ tấn công cố tình spam làm tràn dung lượng D1.
  await db.batch([
    db.prepare("DELETE FROM precomputed_cache WHERE key LIKE 'rpt:%' AND updated_at < datetime('now', '-7 days')"),
    db.prepare(`
      DELETE FROM precomputed_cache
      WHERE key LIKE 'rpt:%' AND key NOT IN (
        SELECT key FROM (
          SELECT key FROM precomputed_cache
          WHERE key LIKE 'rpt:%'
          ORDER BY updated_at DESC
          LIMIT 1000
        )
      )
    `),
  ]);
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
//
// "warmReports" (mac dinh true, xem externalImport.ts truyen false) - CHOT 2026-07-30 sau khi phat
// hien bug rang so lieu dashboard "dong cung" sai (SLA-trend hien 0% cho ca ngay co du lieu that):
// pipeline QuickSight tu dong (POST /api/external-import/commit) ban nhieu file lien tiep trong 1
// dot chay (moi file 1 request rieng), MOI request tu spawn 1 chuoi nen doc lap "bump + warm 15 bao
// cao mac dinh" (xem warmDefaultReports() trong lib/reportWarmup.ts) - cac chuoi nay chay CHONG LAP
// khong co khoa dieu phoi, deu ghi vao CUNG 1 dong cache theo key bao cao. Chuoi nao ghi xong SAU se
// de chuoi ghi truoc, KHONG lien quan chuoi nao tinh dung/du du lieu hon - neu 1 chuoi tu file nho
// (tinh nhanh nhung dua tren du lieu tai thoi diem som, truoc khi cac file lon hon kip ghi xong) lai
// ghi xong SAU CUNG, no de mat ket qua dung cua chuoi khac. Tag version van ghi dung (doc version
// MOI NHAT tai luc ghi) nen trong nhu "con han", co che lazy-invalidate khong phat hien duoc dang bi
// de boi du lieu cu hon - bao cao "dong cung" sai cho toi khi sang ngay VN moi (tag co "ngay:").
// Giai phap: BO buoc warm (tinh san truoc) cho pipeline tu dong - van bumpVersions (dam bao cache cu
// het han dung), chi khong CHU DONG tinh lai ngay nua (de nguoi xem that dau tien tu kich hoat
// compute-on-miss, tranh nhieu chuoi nen doc lap cung ghi de nhau). Import thu cong (mot nguoi, mot
// luot) khong co rui ro dua tranh nay nen giu nguyen warm=true.
export function scheduleCaLapRefreshIfChanged(
  c: Context<{ Bindings: Env }>,
  summary: { GHI_MOI: number; GHI_DE: number; affectedSerials: string[]; affectedDates: string[] },
  importHistoryId: number,
  options?: { warmReports?: boolean },
) {
  const warmReports = options?.warmReports ?? true;
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
    // bo bao cao mac dinh (R7 - warmDefaultReports, xem lib/reportWarmup.ts) KHI warmReports=true:
    // "tat ca bao cao se tinh lai 1 lan duy nhat khi import moi" - bump PHAI xong truoc khi warm de
    // ban tinh san mang dung version tag moi (neu warm truoc bump, tag cu se bi coi la het han ngay
    // lan doc dau tien, warm thanh cong coc). Khi warmReports=false, CHI bump (khong warm) - xem
    // giai thich rui ro dua tranh o comment dau ham.
    c.executionCtx.waitUntil(
      runBgTask(
        c.env,
        importHistoryId,
        "bump version + warm bao cao",
        bumpVersions(c.env.DB, ["cases"]).then(() => (warmReports ? warmDefaultReports(c.env.DB) : undefined)),
      ),
    );
    // Snapshot R2 "ca da dong" theo tung ngay (xem lib/daDongDayChunks.ts) - DAY LA NOI DUY NHAT
    // duoc phep tao/ghi de JSON len R2 cho tinh nang nay (nguyen tac chot voi chu he thong, xem
    // memory r2-json-write-trigger-rule.md) - chi tinh lai DUNG nhung ngay trong affectedDates,
    // khong dung cron/compute-on-miss nao khac.
    c.executionCtx.waitUntil(runBgTask(c.env, importHistoryId, "snapshot R2 ca da dong", recomputeDaDongDayChunks(c.env, summary.affectedDates)));
  }
  // Don rac "rpt:%" chay moi lan import (khong dieu kien GHI_MOI/GHI_DE, xem cleanupOldReportCache).
  c.executionCtx.waitUntil(runBgTask(c.env, importHistoryId, "don rac rpt cache", cleanupOldReportCache(c.env.DB)));
}

const importRoute = new Hono<{ Bindings: Env }>();
importRoute.use("*", verifySessionMiddleware, loadUser, requireRole("Admin", "TBP DVBH"));

// POST /api/import/refresh-reports - ep tinh lai toan bo cache bao cao dashboard mac dinh NGAY LAP
// TUC, khong doi import moi. Dung khi cache bi "dong cung" sai (vd bi de boi 1 chuoi warm cu hon -
// xem comment ve warmReports o scheduleCaLapRefreshIfChanged ben tren, CHOT 2026-07-30 sau su co
// bieu do SLA-trend hien 0% dù co du lieu that). Goi TUAN TU, cho xong hoan toan (khong waitUntil -
// day la hanh dong nguoi dung chu dong bam, can biet ket qua ngay) - bumpVersions truoc de moi cache
// cu (ke ca cac key khac "scope=all" mac dinh) deu het han dung, roi warmDefaultReports() tinh san
// lai bo tham so mac dinh cho nguoi xem tiep theo khong phai cho.
importRoute.post("/refresh-reports", async (c) => {
  await bumpVersions(c.env.DB, ["cases"]);
  await warmDefaultReports(c.env.DB);
  // Cung 1 nut "Lam moi bao cao" (Import data) con dung de tinh lai NGAY "Bao cao ngay 08:00" (banner
  // Tong quat, xem lib/dailySnapshot.ts) thay vi cho den cron 08:00 hom sau - boc rieng try/catch,
  // loi o day khong duoc lam that bai request refresh-reports goc (2 co che doc lap nhau).
  try {
    await generateDailySnapshot(c.env.DB, c.get("user").email);
  } catch (err) {
    console.error("refresh-reports: loi khi generateDailySnapshot", err);
  }
  try {
    await generateKhuVucBacklogSnapshots(c.env.DB, c.get("user").email);
  } catch (err) {
    console.error("refresh-reports: loi khi generateKhuVucBacklogSnapshots", err);
  }
  return c.json({ ok: true });
});

// GET /api/import/column-map - anh xa cot Excel -> cot DB, de frontend parse dung tren trinh duyet.
// updatableColumns: danh sach cot duoc phep dung cho tinh nang "cap nhat 1 cot theo ID"
// (/import/update-column/*) - khac COLUMN_MAP o cho COLUMN_MAP con chua ca 6 cot vi pham
// (VIOLATION_FIELDS), khong duoc phep sua tay qua tinh nang nay (chi ratchet tu import CRM that).
importRoute.get("/column-map", async (c) => c.json({ columnMap: COLUMN_MAP, updatableColumns: BUSINESS_FIELDS }));

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

// POST /api/import/backfill-link-hinh-anh - chi Admin, chay THU CONG sau khi deploy fix tach anh
// (xem parseLinkHinhAnh()/resplitStoredLinkHinhAnh() trong ratchet.ts) - sua lai cac dong
// link_hinh_anh DA CO SAN trong DB tu truoc ban fix. Phat hien 3 dang loi qua json_each:
// (1) phan tu nao KHONG bat dau bang "http" - JSON array bi tach nham 1 anh thanh 2 phan tu rieng
// (URL / ten file) tu ban parseLinkHinhAnh() cu, phan ten file hien "Khong tai duoc" trong gallery;
// (2) phan tu la URL nhung co dau phay KHONG kem khoang trang theo sau ("http%,%" nhung khong khop
// "http%, %") - dong DA qua 1 lan backfill truoc (dang (1) da duoc gop lai thanh 1 phan tu) nhung
// van thieu dau cach giua URL va ten file (dinh dang CRM goc la "URL, Ten file.jpeg" - CO dau cach -
// nhung .trim() trong ban parseLinkHinhAnh() cu da xoa mat dau cach nay tu truoc khi backfill lan 1
// chay, nen chi gop lai bang dau phay thuong khong khoi phuc duoc; thieu dau cach nay khien
// auth-media.smarthiz.vn khong khop dung anh goc du domain/path deu dung - xac nhan voi chu he
// thong 2026-07-31); (3) phan tu ket thuc bang dau phay (co hoac khong kem khoang trang) - ANH CUOI
// CUNG trong chuoi CRM tho thuong con dinh 1 dau phay o cuoi cung (khong co domain nao theo sau de
// tach), nen tach xong van con dinh vao URL cuoi, khien anh cuoi cung cua MOI ca bi loi hien thi -
// xac nhan voi chu he thong 2026-07-31. Xu ly theo lo (limit) - goi lai nhieu lan (dua vao "hasMore")
// toi khi false. Idempotent - dong da sua dung dinh dang se khong con khop dieu kien nao tren nen
// khong bi chon lai o lan sau. KHONG dong bo lai crm_hash o day - lan import CRM that tiep theo cham
// vao ca nay se thay hash lech (vi link_hinh_anh da doi) va tu GHI_DE 1 lan, giong co che "self-heal"
// da co san cho crm_hash IS NULL (xem importProcessor.ts), khong can xu ly gi them.
importRoute.post("/backfill-link-hinh-anh", requireRole("Admin"), async (c) => {
  const limitParam = Number(c.req.query("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 200;

  const { results } = await c.env.DB.prepare(
    `SELECT id, link_hinh_anh FROM case_dvbh WHERE id IN (
       SELECT DISTINCT c.id FROM case_dvbh c, json_each(c.link_hinh_anh) je
       WHERE c.link_hinh_anh IS NOT NULL AND c.link_hinh_anh != '[]'
         AND (
           je.value NOT LIKE 'http%'
           OR (je.value LIKE 'http%,%' AND je.value NOT LIKE 'http%, %')
           OR je.value LIKE '%,'
           OR je.value LIKE '%, '
         )
       ORDER BY c.id LIMIT ?
     )`,
  )
    .bind(limit)
    .all<{ id: string; link_hinh_anh: string }>();

  if (results.length === 0) {
    return c.json({ updated: 0, hasMore: false });
  }

  const statements = results.map((row) => {
    const fixed = resplitStoredLinkHinhAnh(row.link_hinh_anh);
    return c.env.DB.prepare("UPDATE case_dvbh SET link_hinh_anh = ? WHERE id = ?").bind(fixed, row.id);
  });
  await c.env.DB.batch(statements);

  return c.json({ updated: results.length, hasMore: results.length === limit });
});

// ---------- Cap nhat rieng 1 cot theo ID (khong dung processImport - KHONG ghi de cac cot khac) ----------
// CHOT 2026-08-03: chu he thong can bo sung du lieu con thieu (vd link hinh anh) cho cac ca DA CO
// san trong DB, chi bang file gom cot ID + DUNG 1 cot can cap nhat - dung processImport()/GHI_DE binh
// thuong se XOA MAT moi cot khac ve NULL (buildFullOverwrite ghi DE TOAN BO BUSINESS_FIELDS, cot nao
// khong co trong file la undefined -> null, xem businessFieldValue). Route nay CHI UPDATE dung 1 cot,
// khong dung crm_hash/ratchet - giong dung nguyen tac da chot cho /backfill-link-hinh-anh (KHONG dong
// bo lai crm_hash sau khi sua tay, lan import CRM that tiep theo se tu GHI_DE lai neu du lieu nguon
// CRM khac - chap nhan duoc, khong co cach nao tranh vi hash luon tinh tu du lieu file CRM THAT su,
// khong biet gi ve ban va tay nay).
const UPDATABLE_COLUMNS = new Set<string>(BUSINESS_FIELDS);

interface UpdateColumnRow {
  id?: unknown;
  [key: string]: unknown;
}

function validateUpdateColumnBody(body: { column?: string; rows?: unknown }): { column: string; rows: UpdateColumnRow[] } | null {
  if (!body.column || !UPDATABLE_COLUMNS.has(body.column) || !Array.isArray(body.rows)) return null;
  return { column: body.column, rows: body.rows as UpdateColumnRow[] };
}

// Gop trung ID trong cung file (giu dong CUOI CUNG xuat hien) + loai bo dong thieu ID - dung chung
// cho ca preview lan commit de 2 ben LUON tra ve cung so lieu.
function dedupeUpdateColumnRows(rows: UpdateColumnRow[]): { valid: Map<string, UpdateColumnRow>; missingIdCount: number } {
  const valid = new Map<string, UpdateColumnRow>();
  let missingIdCount = 0;
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (!id) {
      missingIdCount++;
      continue;
    }
    valid.set(id, row);
  }
  return { valid, missingIdCount };
}

async function findExistingIds(db: D1Database, ids: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const placeholders = chunk.map(() => "?").join(", ");
    const { results } = await db.prepare(`SELECT id FROM case_dvbh WHERE id IN (${placeholders})`).bind(...chunk).all<{ id: string }>();
    for (const r of results) existing.add(r.id);
  }
  return existing;
}

// GET /api/import/update-column/template?column=<db_field> - file mau CSV 2 cot: ID + dung header
// tieng Viet cua cot da chon (tra ve tu COLUMN_MAP, dao nguoc gia tri->key). 400 neu column khong
// hop le/khong duoc phep sua tay qua tinh nang nay.
importRoute.get("/update-column/template", (c) => {
  const column = c.req.query("column") ?? "";
  if (!UPDATABLE_COLUMNS.has(column)) return c.json({ error: "INVALID_COLUMN" }, 400);
  const label = Object.entries(COLUMN_MAP).find(([, dbCol]) => dbCol === column)?.[0] ?? column;
  const csv = `ID,${label}\n`;
  return csvTemplateResponse(c, csv, `mau_cap_nhat_${column}.csv`);
});

// POST /api/import/update-column/preview - than: { column: string, rows: [{id, [column]: gia_tri}] }.
// Khong ghi DB - chi dem so ID hop le/khong ton tai de nguoi dung xem truoc.
importRoute.post("/update-column/preview", requireRole("Admin"), async (c) => {
  const body = await c.req.json<{ column?: string; rows?: unknown }>();
  const parsed = validateUpdateColumnBody(body);
  if (!parsed) return c.json({ error: "INVALID_BODY" }, 400);

  const { valid, missingIdCount } = dedupeUpdateColumnRows(parsed.rows);
  const existing = await findExistingIds(c.env.DB, [...valid.keys()]);
  const khongTonTai = [...valid.keys()].filter((id) => !existing.has(id));

  return c.json({
    column: parsed.column,
    capNhat: existing.size,
    khongTonTai: khongTonTai.length,
    khongTonTaiList: khongTonTai.slice(0, 200),
    thieuId: missingIdCount,
  });
});

// POST /api/import/update-column/commit - thuc thi that: UPDATE case_dvbh SET <column> = ? WHERE id = ?
// cho TUNG ID ton tai - KHONG dung cac cot BUSINESS_FIELDS khac, KHONG dong bo crm_hash (xem giai
// thich o comment dau khoi).
importRoute.post("/update-column/commit", requireRole("Admin"), async (c) => {
  const body = await c.req.json<{ column?: string; rows?: unknown; filename?: string }>();
  const parsed = validateUpdateColumnBody(body);
  if (!parsed) return c.json({ error: "INVALID_BODY" }, 400);

  const { valid, missingIdCount } = dedupeUpdateColumnRows(parsed.rows);
  const existing = await findExistingIds(c.env.DB, [...valid.keys()]);
  const khongTonTai = [...valid.keys()].filter((id) => !existing.has(id));

  const statements = [...existing].map((id) => {
    const row = valid.get(id)!;
    const value = businessFieldValue(parsed.column, row);
    return c.env.DB.prepare(`UPDATE case_dvbh SET ${parsed.column} = ?, updated_at = ? WHERE id = ?`).bind(value, nowVN(), id);
  });
  for (let i = 0; i < statements.length; i += 500) {
    await c.env.DB.batch(statements.slice(i, i + 500));
  }

  const user = c.get("user");
  await c.env.DB.prepare(
    `INSERT INTO import_history (ten_file, nguoi_import, ghi_moi, ghi_de, bo_qua, loi, thoi_gian, loai)
     VALUES (?, ?, 0, ?, 0, ?, ?, 'update_column')`,
  )
    .bind(body.filename ?? `Cập nhật cột "${parsed.column}"`, user.email, existing.size, khongTonTai.length + missingIdCount, nowVN())
    .run();

  return c.json({
    column: parsed.column,
    capNhat: existing.size,
    khongTonTai: khongTonTai.length,
    khongTonTaiList: khongTonTai.slice(0, 200),
    thieuId: missingIdCount,
  });
});

// GET /api/import/history?loai=&export= - "loai" loc theo nguon (crm/giai_trinh_cu/giai_trinh_lap_cu/
// khao_sat_cu/nap_gas_danh_gia_cu, xem migration 0027) de moi tab trong module Import data chi thay
// lich su cua dung minh, khong bi lan lich su cua cac loai import khac. Ho tro "loai" la DANH SACH
// phan cach dau phay (vd "crm,quicksight_auto") - CHOT 2026-07-30: tab "Import CRM hang ngay" can
// gop CA lich su tu pipeline QuickSight tu dong (loai='quicksight_auto', xem externalImport.ts) VOI
// import thu cong (loai='crm' - mac dinh cua cot, xem migration 0028) vao CUNG 1 bang, vi voi nguoi
// dung day deu la "dong bo CRM hang ngay", chi khac nguon kich hoat (nguoi_import da phan biet ro
// "he-thong-tu-dong@dvbh.internal" voi email nguoi that trong bang).
importRoute.get("/history", async (c) => {
  const limit = c.req.query("export") === "true" ? 5000 : 50;
  const loaiParam = c.req.query("loai");
  const loaiList = loaiParam
    ? loaiParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const { results } = await c.env.DB.prepare(
    loaiList.length > 0
      ? `SELECT * FROM import_history WHERE loai IN (${loaiList.map(() => "?").join(", ")}) ORDER BY thoi_gian DESC LIMIT ?`
      : "SELECT * FROM import_history ORDER BY thoi_gian DESC LIMIT ?",
  )
    .bind(...loaiList, limit)
    .all();
  return c.json({ rows: results });
});

export default importRoute;
