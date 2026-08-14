/**
 * Tach rieng khoi routes/revenue.ts (2026-08-01) - cung ly do voi lib/dashboardCompute.ts: lib/
 * dailySnapshot.ts can goi truc tiep cac ham tinh doanh thu khi tinh "Bao cao ngay 08:00" ma khong
 * tao import cycle voi routes/revenue.ts (routes/revenue.ts se import nguoc lai lib/dailySnapshot.ts
 * de doc snapshot cho duong mac dinh). File nay la lib thuan, khong import gi tu routes/*.
 */
import { khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { khuVucAdHocClause, khuVucReportExclusionClause, CURRENT_MONTH_VALUE } from "./filterParams";
import { kpiEligibleClause } from "./kpiEligible";

const REVENUE_EXPR = "COALESCE(dt_san_pham,0) + COALESCE(dt_linh_kien,0) + COALESCE(dt_dich_vu,0)";

// Doanh thu chi tinh ca "tinh vao KPI" - xem giai thich chi tiet trong lib/kpiEligible.ts. Truoc
// day route nay KHONG loc gi ca, gay lech ~161 trieu (tren tong ~2.8 ty) so voi cach tinh dung.
const KPI_ELIGIBLE_CLAUSE = kpiEligibleClause();

// Cac dim hop le cho GET /revenue?dim=... - CHOT 2026-08-01: them "ky_thuat_vien" (thay the hoan
// toan bang "Doanh thu theo Giam sat" cu, xem computeRevenueGiamSat da bi go bo).
const REVENUE_DIMS: Record<string, string> = { khu_vuc: "khu_vuc", hang: "hang", ky_thuat_vien: "ky_thuat_vien" };

// Bo loc dung chung cho cac bao cao Revenue - PHIEN BAN KHONG PHU THUOC Context, khac
// parseFilterParams(c) trong lib/filterParams.ts, vi cac ham computeXxx ben duoi phai goi lai duoc
// tu snapshot job (chi co db + params object thuan + scope, khong co Context).
export interface RevenueFilterParams {
  khu_vuc?: string;
  hang?: string;
  thang?: string;
}

export function buildRevenueFilterClause(params: RevenueFilterParams, scope: string[] | null, prefix = ""): { sql: string; binds: unknown[] } {
  const scopeClause = khuVucWhereClause(scope, `${prefix}khu_vuc`);
  const binds: unknown[] = [...scopeClause.binds];
  let sql = ` AND ${prefix}archived_at IS NULL AND ${prefix}huy_bo_at IS NULL${scopeClause.sql}`;

  const khuVucClause = khuVucAdHocClause(`${prefix}khu_vuc`, params.khu_vuc);
  sql += khuVucClause.sql;
  binds.push(...khuVucClause.binds);

  const exclusionClause = khuVucReportExclusionClause(`${prefix}khu_vuc`);
  sql += exclusionClause.sql;
  binds.push(...exclusionClause.binds);

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

// Tach rieng phan tinh toan cua GET / - dung chung cho compute-on-miss (fallback) va "Bao cao ngay
// 08:00" (lib/dailySnapshot.ts).
export async function computeRevenue(
  db: D1Database,
  params: RevenueFilterParams & { dim?: string },
  scope: string[] | null,
): Promise<{ totals: unknown; byDim: unknown[] }> {
  const dim = REVENUE_DIMS[params.dim ?? "khu_vuc"] ?? "khu_vuc";
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

