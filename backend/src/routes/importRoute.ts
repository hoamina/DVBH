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

// Danh sach "ca lap" chi thay doi that su khi co GHI_MOI/GHI_DE that (BO_QUA/CAP_NHAT_MOC_THOI_GIAN
// khong doi du lieu nghiep vu nen khong anh huong ket qua phat hien lap) - tranh tinh lai vo ich
// khi import chi toan dong da co san khong doi gi (vd chay lai file cu, hoac Google Sheet dong bo
// khong co gi moi). Chay qua waitUntil() de KHONG lam cham phan hoi cua nguoi import (tinh lai mat
// ~1 giay do quet ~15 nghin dong, xem lib/caLapRefresh.ts) - cron */20 phut van con lam luoi an toan.
function scheduleCaLapRefreshIfChanged(c: Context<{ Bindings: Env }>, summary: { GHI_MOI: number; GHI_DE: number }) {
  if (summary.GHI_MOI + summary.GHI_DE > 0) {
    c.executionCtx.waitUntil(refreshCaLapPrecompute(c.env.DB));
  }
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
