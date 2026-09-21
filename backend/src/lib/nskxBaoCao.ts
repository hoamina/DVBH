/**
 * Bao cao rieng cho case doi tac "NSKX" (yeu cau tach rieng khoi bao cao tong the de phan tich truc
 * quan, 2026-09-21). Toi da tai su dung logic da co: KPI tong quan/da chieu goi thang
 * computeDashboardKpis/computeDashboardPivot (dashboardCompute.ts) voi doi_tac="NSKX" cong them vao
 * DashboardFilterParams (xem doi_tac trong dashboardCompute.ts), xu huong theo ngay doc lai bang
 * daily_snapshot da co (dailySnapshot.ts, ghi moi ngay 08:00 VN, KHONG tao cron/bang moi).
 */
import type { AppUser } from "../types";
import { ageExpr } from "./ageCalc";
import { buildDashboardFilterClause, computeDashboardKpis, computeDashboardPivot, type DashboardFilterParams, type DashboardKpisPayload, type TrendRow } from "./dashboardCompute";
import { roleVariantOf, buildSnapshotScopeKey } from "./dailySnapshot";
import { getVnDateStr } from "./reportCache";

const DOI_TAC_NSKX = "NSKX";

export type NskxBaoCaoParams = Pick<DashboardFilterParams, "khu_vuc" | "thang">;

export async function computeNskxTongQuan(db: D1Database, params: NskxBaoCaoParams, scope: string[] | null): Promise<DashboardKpisPayload> {
  return computeDashboardKpis(db, { ...params, doi_tac: DOI_TAC_NSKX }, scope);
}

export async function computeNskxDaChieu(db: D1Database, params: NskxBaoCaoParams & { dimKey?: string }, scope: string[] | null): Promise<{ rows: TrendRow[] }> {
  return computeDashboardPivot(db, { ...params, doi_tac: DOI_TAC_NSKX }, scope);
}

// 3 bucket tuoi ton (tinh tu thoi_gian_cskh_tiep_nhan, cung moc AGE_ANCHOR voi NEED_NSKX_2_NGAY o
// needGiaiTrinh.ts) cho case NSKX DANG TON (thoi_gian_hoan_thanh IS NULL) - "0-1 ngay" la chua vi
// pham SLA rieng (2 ngay), "2-3 ngay"/">=4 ngay" la 2 muc do vi pham.
export interface NskxAgingPayload {
  bucket0_1: number;
  bucket2_3: number;
  bucket4Plus: number;
}

export async function computeNskxAging(db: D1Database, params: NskxBaoCaoParams, scope: string[] | null): Promise<NskxAgingPayload> {
  const { from, sql, binds } = buildDashboardFilterClause({ khu_vuc: params.khu_vuc, doi_tac: DOI_TAC_NSKX }, scope, "c.");
  const age = ageExpr("c.thoi_gian_cskh_tiep_nhan");

  const row = await db
    .prepare(
      `SELECT
        SUM(CASE WHEN ${age} < 2 THEN 1 ELSE 0 END) as bucket_0_1,
        SUM(CASE WHEN ${age} >= 2 AND ${age} < 4 THEN 1 ELSE 0 END) as bucket_2_3,
        SUM(CASE WHEN ${age} >= 4 THEN 1 ELSE 0 END) as bucket_4_plus
      FROM ${from} WHERE c.thoi_gian_hoan_thanh IS NULL${sql}`,
    )
    .bind(...binds)
    .first<{ bucket_0_1: number; bucket_2_3: number; bucket_4_plus: number }>();

  return {
    bucket0_1: row?.bucket_0_1 ?? 0,
    bucket2_3: row?.bucket_2_3 ?? 0,
    bucket4Plus: row?.bucket_4_plus ?? 0,
  };
}

export interface NskxXuHuongRow {
  ngay: string;
  soCa: number;
}

// Doc lich su tu daily_snapshot (bucket "backlogNskx" = so ca NSKX chua giai trinh >=2 ngay tai moc
// 08:00 VN moi ngay) - scope_key suy DUNG THEO user dang goi (giong het getSnapshotForUser trong
// dailySnapshot.ts) de nguoi "Giam sat" (khong nam trong ROLES_XEM_TOAN_BO) chi thay dung khu vuc ho
// phu trach, khong lo so lieu toan he thong. Mac dinh 30 ngay gan nhat neu khong truyen tuNgay/denNgay.
export async function computeNskxXuHuong(db: D1Database, user: AppUser, tuNgay?: string, denNgay?: string): Promise<{ rows: NskxXuHuongRow[] }> {
  const roleVariant = roleVariantOf(user.vai_tro);
  const isGiamSat = roleVariant === "giam_sat";
  const khuVucList = isGiamSat ? user.khu_vuc_phu_trach : [];
  if (isGiamSat && khuVucList.length === 0) return { rows: [] };

  const scopeKey = buildSnapshotScopeKey(roleVariant, khuVucList);
  const den = denNgay || getVnDateStr();

  const { results } = await db
    .prepare(
      `SELECT ngay, json_extract(payload, '$.backlogNskx.count') as so_ca
       FROM daily_snapshot WHERE scope_key = ? AND ngay >= COALESCE(?, date(?, '-29 days')) AND ngay <= ?
       ORDER BY ngay`,
    )
    .bind(scopeKey, tuNgay || null, den, den)
    .all<{ ngay: string; so_ca: number | null }>();

  return { rows: results.map((r) => ({ ngay: r.ngay, soCa: r.so_ca ?? 0 })) };
}
