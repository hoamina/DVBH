import { Hono } from "hono";
import type { Env } from "../types";
import { processImport } from "../lib/importProcessor";
import { nowVN } from "../lib/vnTime";
import { scheduleCaLapRefreshIfChanged } from "./importRoute";

/**
 * Import tu dong cho pipeline QuickSight (Python, chay nen - xem
 * YEU_CAU_API_IMPORT_TU_DONG_QUICKSIGHT.md). KHONG dung verifySessionMiddleware/OAuth (pipeline
 * khong co nguoi ngoi truoc may de dang nhap) - xac thuc bang 1 API key tinh rieng
 * (EXTERNAL_IMPORT_API_KEY, dat qua `wrangler secret put`, KHONG trung secret nao khac).
 *
 * Mount o 1 prefix TACH BIET HOAN TOAN voi "/api/import" (xem index.ts) - tranh moi nhap nhang ve
 * viec middleware ".use('*', verifySessionMiddleware...)" cua importRoute.ts co the ap dung nham
 * len route nay neu mount chung 1 prefix voi importRoutes.
 */
const externalImport = new Hono<{ Bindings: Env }>();

// User he thong dung lam "nguoi_import" (import_history.nguoi_import co FK REFERENCES users(email)
// - xem migration 0033_system_user_for_cron.sql) - khong co session that de lay user dang goi API.
const SYSTEM_USER_EMAIL = "he-thong-tu-dong@dvbh.internal";

externalImport.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  const key = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  if (!key || key !== c.env.EXTERNAL_IMPORT_API_KEY) {
    return c.json({ error: "UNAUTHORIZED" }, 401);
  }
  await next();
});

// POST /api/external-import/commit - than giong het POST /api/import/commit (dung chung
// processImport + scheduleCaLapRefreshIfChanged), chi khac nguon xac thuc va "nguoi_import"/"loai"
// ghi vao import_history.
externalImport.post("/commit", async (c) => {
  const body = await c.req.json<{ filename: string; rows: unknown[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);

  const summary = await processImport(c.env.DB, body.rows, true);

  const inserted = await c.env.DB.prepare(
    `INSERT INTO import_history (ten_file, nguoi_import, ghi_moi, ghi_de, bo_qua, loi, thoi_gian, loai)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'quicksight_auto')`,
  )
    .bind(body.filename, SYSTEM_USER_EMAIL, summary.GHI_MOI, summary.GHI_DE, summary.BO_QUA, summary.LOI, nowVN())
    .run();

  // warmReports:false - pipeline nay ban nhieu file lien tiep trong 1 dot chay, moi file tu spawn 1
  // chuoi nen doc lap; bat warm o day gay dua tranh ghi de cache bao cao (xem giai thich chi tiet o
  // comment cua scheduleCaLapRefreshIfChanged trong importRoute.ts). Van bumpVersions binh thuong -
  // cache cu van het han dung, chi khong chu dong tinh lai truoc nua.
  scheduleCaLapRefreshIfChanged(c, summary, inserted.meta.last_row_id, { warmReports: false });
  return c.json({ filename: body.filename, ...summary });
});

export default externalImport;
