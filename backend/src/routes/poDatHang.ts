import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";

/**
 * GET /api/po-dat-hang?v=<version da co> - PO dat hang day tu app "EO Mua hang" (bang po_dat_hang_eo,
 * partnerApi.ts POST /sync/po-dat-hang). Frontend (lib/purchaseWarrantySync.ts) gop voi Google Sheet
 * "po-dat-hang" cu trong giai doan chay song song.
 * Tra ~8k dong -> client gui kem version domain "po_dat_hang" da cache; trung thi tra {unchanged} (1 dong
 * doc) thay vi quet lai ca bang. KHONG dung cachedReport (payload JSON vai MB vuot gioi han 1 dong D1).
 */
const poDatHang = new Hono<{ Bindings: Env }>();
poDatHang.use("*", verifySessionMiddleware, loadUser);

// 2026-11-14: CHI GUI DONG THAY DOI. ?v=N (version client dang co, N < hien tai) -> chi dong phien_ban > N (qua index, migration
// 0168), kem "delta":true; client tron vao cache theo id_dat_lk. Khong co v / v la (lon hon hien tai...) -> gui full.
poDatHang.get("/", async (c) => {
  const row = await c.env.DB.prepare("SELECT version FROM data_versions WHERE domain = 'po_dat_hang'").first<{ version: number }>();
  const cur = row?.version ?? 0;
  const v = String(cur);
  const q = c.req.query("v");
  if (q === v) return c.json({ v, unchanged: true });
  const tu = q !== undefined && /^\d+$/.test(q) && Number(q) < cur ? Number(q) : null;
  const { results } =
    tu === null
      ? await c.env.DB.prepare("SELECT payload FROM po_dat_hang_eo").all<{ payload: string }>()
      : await c.env.DB.prepare("SELECT payload FROM po_dat_hang_eo WHERE phien_ban > ?").bind(tu).all<{ payload: string }>();
  // ghep chuoi JSON san co thay vi parse + stringify lai ~8k object
  return c.body(`{"v":${JSON.stringify(v)},"delta":${tu !== null},"rows":[${results.map((r) => r.payload).join(",")}]}`, 200, {
    "Content-Type": "application/json; charset=utf-8",
  });
});

export default poDatHang;
