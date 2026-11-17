import { Hono } from "hono";
import { layBangTenKtv, gopDongTheoKtv } from "../lib/ktvTen";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc } from "../middleware/scopeByKhuVuc";
import { cachedReport, buildReportKey } from "../lib/reportCache";
import { getSnapshotForUserAnToan, isDefaultReportParams } from "../lib/dailySnapshot";
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
  const dimQ = c.req.query("dim") ?? "khu_vuc";
  // "ky_thuat_vien_tinh" (bo loc Tinh cho bang KTV) + "tinh" (bao cao theo tinh) - 2026-10-09, khong co trong snapshot
  // 08:00 -> bo qua nhanh snapshot, tinh qua cachedReport.
  const dim = REVENUE_SNAPSHOT_FIELD[dimQ] || dimQ === "ky_thuat_vien_tinh" || dimQ === "tinh" ? dimQ : "khu_vuc";
  const params = { dim, khu_vuc: c.req.query("khu_vuc"), hang: c.req.query("hang"), thang: c.req.query("thang") };
  if (REVENUE_SNAPSHOT_FIELD[dim] && isDefaultReportParams(params)) {
    const snap = await getSnapshotForUserAnToan(c.env.DB, c.get("user"), (p) => c.executionCtx.waitUntil(p));
    const tuSnap = snap?.payload[REVENUE_SNAPSHOT_FIELD[dim]];
    if (tuSnap) return c.json(await gopTheoMaKtv(c.env.DB, dim, tuSnap));
  }
  // "rv": doi khi doi output compute() (2 = them so_ca_co_dt, 2026-10-09) - cache cu cung ngay khong tu het han.
  const key = buildReportKey("revenue", { ...params, rv: "3" }, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases", "doanh_thu"], () => computeRevenue(c.env.DB, params, scope));
  return c.json(await gopTheoMaKtv(c.env.DB, dim, payload));
});

// Doanh thu theo KTV: gom theo MA KTV, hien ten moi nhat (lib/ktvTen.ts, 2026-11-17) - ap luc doc (ca so chot 08:00 cu).
async function gopTheoMaKtv<T extends { byDim: unknown[] }>(db: D1Database, dim: string, payload: T): Promise<T> {
  if (dim !== "ky_thuat_vien" && dim !== "ky_thuat_vien_tinh") return payload;
  const bang = await layBangTenKtv(db);
  const byDim = gopDongTheoKtv(payload.byDim as Record<string, unknown>[], bang, ["nhom"], dim === "ky_thuat_vien_tinh" ? ["tinh", "tinh_moi"] : []);
  if (dim === "ky_thuat_vien") byDim.sort((a, b) => (Number(b.doanh_thu) || 0) - (Number(a.doanh_thu) || 0));
  return { ...payload, byDim };
}

export default revenue;
