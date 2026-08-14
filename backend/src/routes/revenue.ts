import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc } from "../middleware/scopeByKhuVuc";
import { cachedReport, buildReportKey } from "../lib/reportCache";
import { getSnapshotForUser, isDefaultReportParams } from "../lib/dailySnapshot";
import { computeRevenue } from "../lib/revenueCompute";
import { hasModule } from "../lib/moduleAccess";

const revenue = new Hono<{ Bindings: Env }>();
// Doanh thu la du lieu tai chinh - chi cho user co module "revenue" trong danh sach duoc xem (xem
// lib/moduleAccess.ts - CHOT 2026-08-01, thay the requireRole co dinh bang co che tuy chinh theo
// tung tai khoan). Truoc day route nay chi dua vao viec an module o UI, khong chan o backend - vai
// tro khac goi thang API van xem duoc doanh thu khu vuc minh phu trach; gio van chan o day nhung
// dieu kien la hasModule() thay vi danh sach vai_tro co dinh.
revenue.use("*", verifySessionMiddleware, loadUser, async (c, next) => {
  if (!hasModule(c.get("user"), "revenue")) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  await next();
});

const REVENUE_SNAPSHOT_FIELD: Record<string, "revenueByKhuVuc" | "revenueByHang" | "revenueByKtv"> = {
  khu_vuc: "revenueByKhuVuc",
  hang: "revenueByHang",
  ky_thuat_vien: "revenueByKtv",
};

// GET /api/revenue?dim=khu_vuc|hang|ky_thuat_vien - CHOT 2026-08-01: voi bo loc MAC DINH doc tu
// "Bao cao ngay 08:00" (dong bang, xem lib/dailySnapshot.ts) thay vi tinh song - dong bo voi
// Dashboard. Bo loc khac mac dinh van qua reportCache song nhu truoc. "ky_thuat_vien" (them
// 2026-08-01) thay the hoan toan "Doanh thu theo Giam sat" cu (route /giam-sat da bi go bo).
revenue.get("/", async (c) => {
  const scope = scopeByKhuVuc(c);
  const dim = REVENUE_SNAPSHOT_FIELD[c.req.query("dim") ?? "khu_vuc"] ? (c.req.query("dim") as string) : "khu_vuc";
  const params = { dim, khu_vuc: c.req.query("khu_vuc"), hang: c.req.query("hang"), thang: c.req.query("thang") };
  if (isDefaultReportParams(params)) {
    const snap = await getSnapshotForUser(c.env.DB, c.get("user"));
    if (snap) return c.json(snap.payload[REVENUE_SNAPSHOT_FIELD[dim]]);
  }
  const key = buildReportKey("revenue", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases"], () => computeRevenue(c.env.DB, params, scope));
  return c.json(payload);
});

export default revenue;
