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

poDatHang.get("/", async (c) => {
  const row = await c.env.DB.prepare("SELECT version FROM data_versions WHERE domain = 'po_dat_hang'").first<{ version: number }>();
  const v = String(row?.version ?? 0);
  if (c.req.query("v") === v) return c.json({ v, unchanged: true });
  const { results } = await c.env.DB.prepare("SELECT payload FROM po_dat_hang_eo").all<{ payload: string }>();
  // ghep chuoi JSON san co thay vi parse + stringify lai ~8k object
  return c.body(`{"v":${JSON.stringify(v)},"rows":[${results.map((r) => r.payload).join(",")}]}`, 200, {
    "Content-Type": "application/json; charset=utf-8",
  });
});

export default poDatHang;
