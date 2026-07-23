import { Hono } from "hono";
import type { Env } from "../types";
import { ROLES_XEM_TOAN_BO } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { khuVucAdHocClause, CURRENT_MONTH_VALUE } from "../lib/filterParams";
import { kpiEligibleClause } from "../lib/kpiEligible";
import { cachedReport, buildReportKey } from "../lib/reportCache";

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

// Bo loc dung chung cho cac bao cao Revenue - PHIEN BAN KHONG PHU THUOC Context, khac
// parseFilterParams(c) trong lib/filterParams.ts, vi cac ham computeXxx ben duoi phai goi lai duoc
// tu R7 warm-up (chi co db + params object thuan + scope, khong co Context - xem "BO SUNG BAT BUOC
// cho R5/R6" trong YEU_CAU_BAO_CAO_TINH_SAN.md). Logic giong het parseFilterParams, chi khac nguon
// du lieu dau vao (params object thay vi c.req.query()).
interface RevenueFilterParams {
  khu_vuc?: string;
  hang?: string;
  thang?: string;
}

function buildRevenueFilterClause(params: RevenueFilterParams, scope: string[] | null, prefix = ""): { sql: string; binds: unknown[] } {
  const scopeClause = khuVucWhereClause(scope, `${prefix}khu_vuc`);
  const binds: unknown[] = [...scopeClause.binds];
  let sql = ` AND ${prefix}archived_at IS NULL${scopeClause.sql}`;

  const khuVucClause = khuVucAdHocClause(`${prefix}khu_vuc`, params.khu_vuc);
  sql += khuVucClause.sql;
  binds.push(...khuVucClause.binds);

  if (params.hang) {
    sql += ` AND ${prefix}hang = ?`;
    binds.push(params.hang);
  }

  if (params.thang === CURRENT_MONTH_VALUE) {
    sql += ` AND (strftime('%Y-%m', ${prefix}thoi_gian_hoan_thanh) = strftime('%Y-%m', 'now') OR ${prefix}thoi_gian_hoan_thanh IS NULL)`;
  } else if (params.thang) {
    sql += ` AND strftime('%Y-%m', ${prefix}thoi_gian_hoan_thanh) = ?`;
    binds.push(params.thang);
  }

  return { sql, binds };
}

// Tach rieng phan tinh toan cua GET / - dung chung cho compute-on-miss va warm-up (R7).
export async function computeRevenue(
  db: D1Database,
  params: RevenueFilterParams & { dim?: string },
  scope: string[] | null,
): Promise<{ totals: unknown; byDim: unknown[] }> {
  const dim = params.dim === "hang" ? "hang" : "khu_vuc";
  const { sql, binds } = buildRevenueFilterClause(params, scope);

  const totals = await db.prepare(
    `SELECT SUM(${REVENUE_EXPR}) as tong,
       SUM(COALESCE(dt_san_pham,0)) as dt_san_pham,
       SUM(COALESCE(dt_linh_kien,0)) as dt_linh_kien,
       SUM(COALESCE(dt_dich_vu,0)) as dt_dich_vu
     FROM case_dvbh WHERE ${KPI_ELIGIBLE_CLAUSE}${sql}`,
  )
    .bind(...binds)
    .first();

  const { results } = await db.prepare(
    `SELECT ${dim} as nhom, COUNT(*) as so_ca, SUM(${REVENUE_EXPR}) as doanh_thu
     FROM case_dvbh WHERE ${dim} IS NOT NULL AND ${KPI_ELIGIBLE_CLAUSE}${sql}
     GROUP BY ${dim} ORDER BY doanh_thu DESC`,
  )
    .bind(...binds)
    .all();

  return { totals, byDim: results };
}

// GET /api/revenue?dim=khu_vuc|hang - doc qua reportCache, chi tinh lai khi domain "cases" co ghi moi.
revenue.get("/", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params = { dim: c.req.query("dim"), khu_vuc: c.req.query("khu_vuc"), hang: c.req.query("hang"), thang: c.req.query("thang") };
  const key = buildReportKey("revenue", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases"], () => computeRevenue(c.env.DB, params, scope));
  return c.json(payload);
});

// Tach rieng phan tinh toan cua /trend - dung chung cho compute-on-miss va warm-up (R7).
export async function computeRevenueTrend(
  db: D1Database,
  params: RevenueFilterParams & { months?: string },
  scope: string[] | null,
): Promise<{ rows: unknown[] }> {
  const months = Math.min(24, Math.max(1, Number(params.months ?? 12)));
  const { sql, binds } = buildRevenueFilterClause(params, scope);

  const { results } = await db.prepare(
    `SELECT strftime('%Y-%m', thoi_gian_hoan_thanh) as thang, SUM(${REVENUE_EXPR}) as doanh_thu
     FROM case_dvbh WHERE thoi_gian_hoan_thanh IS NOT NULL AND ${KPI_ELIGIBLE_CLAUSE}
       AND thoi_gian_hoan_thanh >= datetime('now', ?)${sql}
     GROUP BY thang
     ORDER BY thang ASC`,
  )
    .bind(`-${months} months`, ...binds)
    .all();

  return { rows: results };
}

// GET /api/revenue/trend?months=12 - xu huong doanh thu theo thang. Doc qua reportCache, "months"
// nam trong cache key (xem luu y sla-trend/trend trong YEU_CAU_BAO_CAO_TINH_SAN.md).
revenue.get("/trend", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params = { months: c.req.query("months"), khu_vuc: c.req.query("khu_vuc"), hang: c.req.query("hang"), thang: c.req.query("thang") };
  const key = buildReportKey("revenue/trend", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases"], () => computeRevenueTrend(c.env.DB, params, scope));
  return c.json(payload);
});

// Tach rieng phan tinh toan cua /giam-sat - dung chung cho compute-on-miss va warm-up (R7).
export async function computeRevenueGiamSat(db: D1Database, params: RevenueFilterParams, scope: string[] | null): Promise<{ rows: unknown[] }> {
  const { sql, binds } = buildRevenueFilterClause(params, scope, "c.");
  const { results } = await db.prepare(
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
  return { rows: results };
}

// GET /api/revenue/giam-sat - Giam sat la vai tro user gan voi khu_vuc_phu_trach (JSON array),
// khong phai truong tren case_dvbh, nen phai join qua json_each. Doc qua reportCache: phu thuoc ca
// domain "users" (bang list Giam sat/khu_vuc_phu_trach co the doi) lan "cases".
revenue.get("/giam-sat", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params = { khu_vuc: c.req.query("khu_vuc"), hang: c.req.query("hang"), thang: c.req.query("thang") };
  const key = buildReportKey("revenue/giam-sat", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases", "users"], () => computeRevenueGiamSat(c.env.DB, params, scope));
  return c.json(payload);
});

export default revenue;
