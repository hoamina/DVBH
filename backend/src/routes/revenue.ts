import { Hono } from "hono";
import type { Env } from "../types";
import { ROLES_XEM_TOAN_BO } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { parseFilterParams } from "../lib/filterParams";
import { kpiEligibleClause } from "../lib/kpiEligible";

const revenue = new Hono<{ Bindings: Env }>();
// Doanh thu la du lieu tai chinh - chi cho vai tro co module "Bao cao doanh thu" o frontend
// (navConfig.ts: Admin/Viewer/TBP DVBH/TBP CSKH, trung khop ROLES_XEM_TOAN_BO). Truoc day route
// nay chi dua vao viec an module o UI, khong chan o backend - vai tro khac goi thang API van
// xem duoc doanh thu khu vuc minh phu trach.
revenue.use("*", verifySessionMiddleware, loadUser, requireRole(...ROLES_XEM_TOAN_BO));

const REVENUE_EXPR = "COALESCE(dt_san_pham,0) + COALESCE(dt_linh_kien,0) + COALESCE(dt_dich_vu,0)";
const REVENUE_EXPR_C = "COALESCE(c.dt_san_pham,0) + COALESCE(c.dt_linh_kien,0) + COALESCE(c.dt_dich_vu,0)";

// Doanh thu chi tinh ca "tinh vao KPI" - xem giai thich chi tiet trong lib/kpiEligible.ts. Truoc
// day route nay KHONG loc gi ca, gay lech ~161 trieu (tren tong ~2.8 ty) so voi cach tinh dung.
const KPI_ELIGIBLE_CLAUSE = kpiEligibleClause();
const KPI_ELIGIBLE_CLAUSE_C = kpiEligibleClause("c.");

// GET /api/revenue?dim=khu_vuc|hang
revenue.get("/", async (c) => {
  const dim = c.req.query("dim") === "hang" ? "hang" : "khu_vuc";
  const { sql, binds } = parseFilterParams(c);

  const totals = await c.env.DB.prepare(
    `SELECT SUM(${REVENUE_EXPR}) as tong,
       SUM(COALESCE(dt_san_pham,0)) as dt_san_pham,
       SUM(COALESCE(dt_linh_kien,0)) as dt_linh_kien,
       SUM(COALESCE(dt_dich_vu,0)) as dt_dich_vu
     FROM case_dvbh WHERE ${KPI_ELIGIBLE_CLAUSE}${sql}`,
  )
    .bind(...binds)
    .first();

  const { results } = await c.env.DB.prepare(
    `SELECT ${dim} as nhom, COUNT(*) as so_ca, SUM(${REVENUE_EXPR}) as doanh_thu
     FROM case_dvbh WHERE ${dim} IS NOT NULL AND ${KPI_ELIGIBLE_CLAUSE}${sql}
     GROUP BY ${dim} ORDER BY doanh_thu DESC`,
  )
    .bind(...binds)
    .all();

  return c.json({ totals, byDim: results });
});

// GET /api/revenue/trend?months=12 - xu huong doanh thu theo thang
revenue.get("/trend", async (c) => {
  const months = Math.min(24, Math.max(1, Number(c.req.query("months") ?? 12)));
  const { sql, binds } = parseFilterParams(c);

  const { results } = await c.env.DB.prepare(
    `SELECT strftime('%Y-%m', thoi_gian_hoan_thanh) as thang, SUM(${REVENUE_EXPR}) as doanh_thu
     FROM case_dvbh WHERE thoi_gian_hoan_thanh IS NOT NULL AND ${KPI_ELIGIBLE_CLAUSE}
       AND thoi_gian_hoan_thanh >= datetime('now', ?)${sql}
     GROUP BY thang
     ORDER BY thang ASC`,
  )
    .bind(`-${months} months`, ...binds)
    .all();

  return c.json({ rows: results });
});

// GET /api/revenue/giam-sat - Giam sat la vai tro user gan voi khu_vuc_phu_trach (JSON array),
// khong phai truong tren case_dvbh, nen phai join qua json_each.
revenue.get("/giam-sat", async (c) => {
  const { sql, binds } = parseFilterParams(c, "c.");
  const { results } = await c.env.DB.prepare(
    `SELECT u.email as giam_sat_email, u.ten as giam_sat, jv.value as khu_vuc,
            COUNT(c.id) as so_ca, SUM(${REVENUE_EXPR_C}) as doanh_thu
     FROM users u, json_each(u.khu_vuc_phu_trach) jv
     INNER JOIN case_dvbh c ON c.khu_vuc = jv.value
     WHERE u.vai_tro = 'Giam sat' AND ${KPI_ELIGIBLE_CLAUSE_C}${sql}
     GROUP BY u.email, jv.value
     ORDER BY doanh_thu DESC`,
  )
    .bind(...binds)
    .all();
  return c.json({ rows: results });
});

export default revenue;
