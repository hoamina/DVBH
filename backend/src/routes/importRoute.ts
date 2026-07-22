import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { processImport } from "../lib/importProcessor";
import { COLUMN_MAP } from "../lib/ratchet";
import { fetchCaseSheetRows } from "../lib/caseSheetSync";
import { getSheetUrl } from "../lib/backfillSheetSync";

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
