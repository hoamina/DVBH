import { Hono, type Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc } from "../middleware/scopeByKhuVuc";
import { hasModule } from "../lib/moduleAccess";
import { cachedReport, buildReportKey } from "../lib/reportCache";
import { computeNskxTongQuan, computeNskxDaChieu, computeNskxAging, computeNskxXuHuong, type NskxBaoCaoParams } from "../lib/nskxBaoCao";

// Module rieng "Bao cao NSKX" - tach case doi tac NSKX ra phan tich truc quan (KPI/xu huong/da chieu/
// phan bo tuoi), yeu cau chu he thong 2026-09-21. Toan bo tinh toan tai su dung dashboardCompute.ts +
// daily_snapshot da co san, xem lib/nskxBaoCao.ts.
const baoCaoNskx = new Hono<{ Bindings: Env }>();
baoCaoNskx.use("*", verifySessionMiddleware, loadUser, async (c, next) => {
  if (!hasModule(c.get("user"), "bao-cao-nskx")) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  await next();
});

function readParams(c: Context<{ Bindings: Env }>): NskxBaoCaoParams {
  return {
    khu_vuc: c.req.query("khu_vuc"),
    thang: c.req.query("thang"),
  };
}

// GET /api/bao-cao-nskx/tong-quan - 5 KPI (Tong so ca/Ty le dat SLA/Ty le xu ly <=24h/Ca ton dong/
// Nghi ngo vi pham), scope doi_tac=NSKX. Domain list KHOP dung /api/dashboard/kpis (goi cung ham).
baoCaoNskx.get("/tong-quan", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params = readParams(c);
  const key = buildReportKey("bao-cao-nskx/tong-quan", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases", "vi_pham", "giai_trinh"], () => computeNskxTongQuan(c.env.DB, params, scope));
  return c.json(payload);
});

// GET /api/bao-cao-nskx/da-chieu?dim=khu_vuc|ky_thuat_vien - bang nhom theo 1 chieu.
baoCaoNskx.get("/da-chieu", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params = { ...readParams(c), dimKey: c.req.query("dim") };
  const key = buildReportKey("bao-cao-nskx/da-chieu", { ...params, dim: params.dimKey }, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases"], () => computeNskxDaChieu(c.env.DB, params, scope));
  return c.json(payload);
});

// GET /api/bao-cao-nskx/aging - phan bo tuoi ton (0-1/2-3/>=4 ngay) cua case NSKX dang mo.
baoCaoNskx.get("/aging", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params = readParams(c);
  const key = buildReportKey("bao-cao-nskx/aging", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases"], () => computeNskxAging(c.env.DB, params, scope));
  return c.json(payload);
});

// GET /api/bao-cao-nskx/xu-huong?tu_ngay=&den_ngay= - xu huong theo ngay, doc lai daily_snapshot da
// co (khong tinh song tu case_dvbh) - scope tu dong theo user dang goi, xem lib/nskxBaoCao.ts.
baoCaoNskx.get("/xu-huong", async (c) => {
  const user = c.get("user");
  const tuNgay = c.req.query("tu_ngay");
  const denNgay = c.req.query("den_ngay");
  const scope = scopeByKhuVuc(c);
  const key = buildReportKey("bao-cao-nskx/xu-huong", { tu_ngay: tuNgay, den_ngay: denNgay }, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases"], () => computeNskxXuHuong(c.env.DB, user, tuNgay, denNgay));
  return c.json(payload);
});

export default baoCaoNskx;
