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
import { fromJsonArray } from "../lib/jsonArray";

const revenue = new Hono<{ Bindings: Env }>();
// Doanh thu la du lieu tai chinh - chi cho vai tro co module "Bao cao doanh thu" o frontend
// (navConfig.ts: Admin/Viewer/TBP DVBH/TBP CSKH + Giam sat, trung khop ROLES_XEM_TOAN_BO cong them
// "Giam sat"). Truoc day route nay chi dua vao viec an module o UI, khong chan o backend - vai tro
// khac goi thang API van xem duoc doanh thu khu vuc minh phu trach.
// Giam sat KHONG duoc them vao ROLES_XEM_TOAN_BO (hang so do dung o scopeByKhuVuc de nghia "xem toan
// bo khong gioi han khu vuc") - Giam sat chi duoc mo quyen truy cap route nay, con ket qua van bi
// scopeByKhuVuc/khuVucWhereClause thu hep theo khu_vuc_phu_trach cua ho o tung handler ben duoi.
revenue.use("*", verifySessionMiddleware, loadUser, requireRole(...ROLES_XEM_TOAN_BO, "Giam sat"));

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

  // Doi strftime('%Y-%m', cot) = ... sang dang RANGE (>=, <) de planner dung duoc index tren
  // thoi_gian_hoan_thanh thay vi phai quet toan bo case_dvbh (strftime la expression tren cot nen
  // khong dung duoc index - xem migration 0007 idx_case_hoan_thanh_not_null va migration 0001
  // idx_case_ton). So sanh chuoi ISO 'YYYY-MM-DD HH:MM:SS' >= 'YYYY-MM-01' va < 'YYYY-MM-01' (thang
  // ke tiep) tuong duong so thang, giu nguyen ngu nghia. 'now' trong SQLite la UTC nen range cung
  // tinh theo UTC, khop voi ban goc strftime('%Y-%m','now').
  // Chot 2026-07-24: BAT BUOC luon gioi han theo 1 thang (khong con nhanh "khong chon = toan thoi
  // gian") - "thang" rong/thieu mac dinh ve CURRENT_MONTH_VALUE ngay o day, phong truong hop 1 loi
  // goi API truc tiep khong kem "thang" (FE luon gui san, day la lop phong ve thu 2).
  const thang = params.thang || CURRENT_MONTH_VALUE;
  if (thang === CURRENT_MONTH_VALUE) {
    sql += ` AND ((${prefix}thoi_gian_hoan_thanh >= date('now','start of month') AND ${prefix}thoi_gian_hoan_thanh < date('now','start of month','+1 month')) OR ${prefix}thoi_gian_hoan_thanh IS NULL)`;
  } else {
    sql += ` AND ${prefix}thoi_gian_hoan_thanh >= ? || '-01' AND ${prefix}thoi_gian_hoan_thanh < date(? || '-01', '+1 month')`;
    binds.push(thang, thang);
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
//
// TRUOC DAY ham nay join thang "users x json_each(khu_vuc_phu_trach) INNER JOIN case_dvbh" - tuc
// la case_dvbh bi quet/doi chieu 1 LAN CHO MOI CAP (Giam sat, khu_vuc), roi moi loc theo scope SAU
// khi join xong (dieu kien "c.khu_vuc IN (...)" trong ${sql} chi thu hep KET QUA join, khong giup
// giam so lan quet case_dvbh). Do thuc te (2026-07-24, insights D1): 1 lan goi doc trung binh
// 388,072 dong, 13 lan goi/ngay = 5.04 trieu dong doc (~46% han muc 5M/ngay). Sua lai: quet
// case_dvbh CHI 1 LAN (gom theo khu_vuc), lay danh sach Giam sat (bang users rat nho) rieng, roi
// GOP O TANG JS thay vi SQL join - giu nguyen 100% cong thuc/dieu kien loc (KPI_ELIGIBLE_CLAUSE_C +
// buildRevenueFilterClause khong doi), chi doi cach ket hop du lieu.
export async function computeRevenueGiamSat(db: D1Database, params: RevenueFilterParams, scope: string[] | null): Promise<{ rows: unknown[] }> {
  const { sql, binds } = buildRevenueFilterClause(params, scope, "c.");

  const [byKhuVuc, giamSatUsers] = await Promise.all([
    db
      .prepare(
        `SELECT c.khu_vuc as khu_vuc, COUNT(*) as so_ca, SUM(${REVENUE_EXPR_C}) as doanh_thu
         FROM case_dvbh c
         WHERE ${KPI_ELIGIBLE_CLAUSE_C}${sql}
         GROUP BY c.khu_vuc`,
      )
      .bind(...binds)
      .all<{ khu_vuc: string; so_ca: number; doanh_thu: number }>(),
    db.prepare("SELECT email, ten, khu_vuc_phu_trach FROM users WHERE vai_tro = 'Giam sat'").all<{ email: string; ten: string | null; khu_vuc_phu_trach: string | null }>(),
  ]);

  const byKhuVucMap = new Map(byKhuVuc.results.map((r) => [r.khu_vuc, r]));

  const rows: { giam_sat_email: string; giam_sat: string | null; khu_vuc: string; so_ca: number; doanh_thu: number }[] = [];
  for (const u of giamSatUsers.results) {
    for (const kv of fromJsonArray(u.khu_vuc_phu_trach)) {
      const agg = byKhuVucMap.get(kv);
      if (!agg) continue; // giong INNER JOIN goc: khu_vuc khong co ca nao khop thi khong xuat hien
      rows.push({ giam_sat_email: u.email, giam_sat: u.ten, khu_vuc: kv, so_ca: agg.so_ca, doanh_thu: agg.doanh_thu });
    }
  }
  rows.sort((a, b) => b.doanh_thu - a.doanh_thu);

  return { rows };
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
