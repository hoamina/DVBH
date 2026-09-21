/**
 * Bao cao rieng cho case doi tac "NSKX" (yeu cau tach rieng khoi bao cao tong the de phan tich truc
 * quan, 2026-09-21).
 *
 * QUAN TRONG ve chi phi doc D1 (xem "D1 read-budget discipline" trong CLAUDE.md): ban dau file nay
 * tai su dung computeDashboardKpis/computeDashboardPivot (dashboardCompute.ts) bang cach them
 * doi_tac="NSKX" vao DashboardFilterParams - DA BO cach do sau khi kiem tra EXPLAIN QUERY PLAN phat
 * hien buildDashboardFilterClause() ep dung INDEXED BY idx_case_ton / idx_case_hoan_thanh_not_null
 * (toi uu cho truong hop "khong loc doi_tac, can moi ca dang ton") - SQLite KHONG the ket hop 2
 * INDEXED BY, nen dieu kien "doi_tac = 'NSKX'" chi loc SAU KHI da SCAN toan bo ket qua UNION ALL (moi
 * ca dang ton + moi ca dong trong thang, toan he thong, ~1500+ dong tren production) roi loai bo gan
 * het (NSKX la 1 doi tac nho). File nay vi vay TU XAY WHERE rieng, dat "doi_tac = 'NSKX'" lam dieu
 * kien dan dau KHONG co INDEXED BY ep buoc - da xac nhan qua EXPLAIN QUERY PLAN (D1 local) ca 4 truy
 * van (tong-quan x4, da-chieu, aging) deu ra "SEARCH ... USING INDEX idx_case_doi_tac (doi_tac=?)",
 * tuc chi doc dung so dong case_dvbh co doi_tac=NSKX (rat nho) thay vi toan bo case dang ton/thang.
 * Xu huong theo ngay van doc lai daily_snapshot da co (khong tinh song), khong doi.
 */
import type { AppUser } from "../types";
import { ageExpr } from "./ageCalc";
import { khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { khuVucAdHocClause, khuVucReportExclusionClause, CURRENT_MONTH_VALUE } from "./filterParams";
import { roleVariantOf, buildSnapshotScopeKey } from "./dailySnapshot";
import { getVnDateStr } from "./reportCache";

const DOI_TAC_NSKX = "NSKX";

export interface NskxBaoCaoParams {
  khu_vuc?: string;
  thang?: string;
  // Index signature bat buoc de truyen truc tiep vao buildReportKey() - xem lib/reportCache.ts.
  [key: string]: string | undefined;
}

export interface DashboardKpisPayload {
  total: number;
  hoanThanh: number;
  ton: number;
  tonDaGiaiTrinh: number;
  nghiNgo: number;
  xacNhan: number;
  tySla: number;
  ty24h: number;
  tyGiaiTrinh: number;
  tyViPham: number;
  tyDaKhaoSat: number;
}

// WHERE dan dau bang "doi_tac = 'NSKX'" (index idx_case_doi_tac, migration 0094) - KHONG dung
// INDEXED BY ep buoc nhu buildDashboardFilterClause() (dashboardCompute.ts), de SQLite tu chon dung
// idx_case_doi_tac thay vi quet toan bo case dang ton/thang roi loc sau (xem docstring dau file).
function buildNskxWhere(params: NskxBaoCaoParams, scope: string[] | null, prefix = ""): { sql: string; binds: unknown[] } {
  let sql = ` AND ${prefix}doi_tac = ? AND ${prefix}archived_at IS NULL AND ${prefix}huy_bo_at IS NULL`;
  const binds: unknown[] = [DOI_TAC_NSKX];

  const scopeClause = khuVucWhereClause(scope, `${prefix}khu_vuc`);
  sql += scopeClause.sql;
  binds.push(...scopeClause.binds);

  const khuVucClause = khuVucAdHocClause(`${prefix}khu_vuc`, params.khu_vuc);
  sql += khuVucClause.sql;
  binds.push(...khuVucClause.binds);

  const exclusionClause = khuVucReportExclusionClause(`${prefix}khu_vuc`);
  sql += exclusionClause.sql;
  binds.push(...exclusionClause.binds);

  const thang = params.thang || CURRENT_MONTH_VALUE;
  if (thang === CURRENT_MONTH_VALUE) {
    sql += ` AND (${prefix}thoi_gian_hoan_thanh IS NULL OR (${prefix}thoi_gian_hoan_thanh >= date('now','start of month') AND ${prefix}thoi_gian_hoan_thanh < date('now','start of month','+1 month')))`;
  } else {
    sql += ` AND ${prefix}thoi_gian_hoan_thanh >= ? || '-01' AND ${prefix}thoi_gian_hoan_thanh < date(? || '-01', '+1 month')`;
    binds.push(thang, thang);
  }
  return { sql, binds };
}

// 5 KPI giong bo the cua Dashboard tong the (DashboardModule.tsx), cong thuc port lai tu
// computeDashboardKpis (dashboardCompute.ts) nhung tu doc case_dvbh voi doi_tac='NSKX' dan dau thay
// vi goi lai ham do (xem ly do o docstring dau file).
export async function computeNskxTongQuan(db: D1Database, params: NskxBaoCaoParams, scope: string[] | null): Promise<DashboardKpisPayload> {
  const { sql, binds } = buildNskxWhere(params, scope);
  const { sql: sqlC, binds: bindsC } = buildNskxWhere(params, scope, "c.");

  const base = await db.prepare(
    `SELECT
      SUM(CASE WHEN tien_do_hoan_thanh IN ('Hoàn thành XLSC', 'Không hoàn thành XLSC') THEN 1 ELSE 0 END) as total,
      SUM(CASE WHEN tinh_vao_kpi = 1 AND tien_do_hoan_thanh = 'Hoàn thành XLSC' THEN 1 ELSE 0 END) as hoan_thanh,
      SUM(CASE WHEN tinh_vao_kpi = 1 AND dung_han = 'Đúng hạn' THEN 1 ELSE 0 END) as dung_han_count,
      SUM(CASE WHEN tinh_vao_kpi = 1 AND dung_han IS NOT NULL THEN 1 ELSE 0 END) as dung_han_tinh,
      SUM(CASE WHEN tinh_vao_kpi = 1 AND xu_ly_24h_bucket = '0. Dưới 24h' THEN 1 ELSE 0 END) as duoi_24h_count,
      SUM(CASE WHEN tinh_vao_kpi = 1 AND xu_ly_24h_bucket IS NOT NULL THEN 1 ELSE 0 END) as co_tinh_24h,
      SUM(CASE WHEN thoi_gian_hoan_thanh IS NULL THEN 1 ELSE 0 END) as ton,
      SUM(loi_120p + loi_qua_han_24h + loi_lo_ke_hoach + loi_kh_hen_lai) as nghi_ngo
    FROM case_dvbh WHERE 1=1${sql}`,
  )
    .bind(...binds)
    .first<Record<string, number>>();

  const tonDaGiaiTrinh = await db.prepare(
    `SELECT COUNT(*) as n FROM case_dvbh c
     WHERE c.thoi_gian_hoan_thanh IS NULL AND EXISTS (SELECT 1 FROM giai_trinh g WHERE g.case_id = c.id)${sqlC}`,
  )
    .bind(...bindsC)
    .first<{ n: number }>();

  const xacNhan = await db.prepare(
    `SELECT COUNT(*) as n FROM vi_pham v
     INNER JOIN case_dvbh c ON c.id = v.case_id
     WHERE COALESCE(v.chot_bo_cap_2, CASE WHEN v.ket_qua_cap_1 != 'Khong loi' THEN 1 ELSE 0 END) = 1${sqlC}`,
  )
    .bind(...bindsC)
    .first<{ n: number }>();

  const daKhaoSat = await db.prepare(
    `SELECT COUNT(*) as n FROM vi_pham v
     INNER JOIN case_dvbh c ON c.id = v.case_id
     WHERE 1=1${sqlC}`,
  )
    .bind(...bindsC)
    .first<{ n: number }>();

  const total = base?.total ?? 0;
  const ton = base?.ton ?? 0;
  const nghiNgo = base?.nghi_ngo ?? 0;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

  return {
    total,
    hoanThanh: base?.hoan_thanh ?? 0,
    ton,
    tonDaGiaiTrinh: tonDaGiaiTrinh?.n ?? 0,
    nghiNgo,
    xacNhan: xacNhan?.n ?? 0,
    tySla: pct(base?.dung_han_count ?? 0, base?.dung_han_tinh ?? 0),
    ty24h: pct(base?.duoi_24h_count ?? 0, base?.co_tinh_24h ?? 0),
    tyGiaiTrinh: pct(tonDaGiaiTrinh?.n ?? 0, ton),
    tyViPham: pct(xacNhan?.n ?? 0, nghiNgo),
    tyDaKhaoSat: pct(daKhaoSat?.n ?? 0, nghiNgo),
  };
}

export interface NskxDaChieuRow {
  nhom: string;
  total: number;
  sla_ok: number;
  dung_han_tinh: number;
  nghi_ngo: number;
}

const DA_CHIEU_DIMS: Record<string, string> = { khu_vuc: "khu_vuc", ky_thuat_vien: "ky_thuat_vien" };

export async function computeNskxDaChieu(db: D1Database, params: NskxBaoCaoParams & { dimKey?: string }, scope: string[] | null): Promise<{ rows: NskxDaChieuRow[] }> {
  const dim = DA_CHIEU_DIMS[params.dimKey ?? "khu_vuc"] ?? "khu_vuc";
  const { sql, binds } = buildNskxWhere(params, scope);

  const { results } = await db
    .prepare(
      `SELECT ${dim} as nhom,
         SUM(CASE WHEN tien_do_hoan_thanh IN ('Hoàn thành XLSC', 'Không hoàn thành XLSC') THEN 1 ELSE 0 END) as total,
         SUM(CASE WHEN tinh_vao_kpi = 1 AND dung_han = 'Đúng hạn' THEN 1 ELSE 0 END) as sla_ok,
         SUM(CASE WHEN tinh_vao_kpi = 1 AND dung_han IS NOT NULL THEN 1 ELSE 0 END) as dung_han_tinh,
         SUM(loi_120p + loi_qua_han_24h + loi_lo_ke_hoach + loi_kh_hen_lai) as nghi_ngo
       FROM case_dvbh WHERE ${dim} IS NOT NULL${sql}
       GROUP BY ${dim}
       ORDER BY total DESC`,
    )
    .bind(...binds)
    .all<NskxDaChieuRow>();

  return { rows: results };
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
  const { sql, binds } = buildNskxWhere({ khu_vuc: params.khu_vuc }, scope);
  const age = ageExpr("thoi_gian_cskh_tiep_nhan");

  const row = await db
    .prepare(
      `SELECT
        SUM(CASE WHEN ${age} < 2 THEN 1 ELSE 0 END) as bucket_0_1,
        SUM(CASE WHEN ${age} >= 2 AND ${age} < 4 THEN 1 ELSE 0 END) as bucket_2_3,
        SUM(CASE WHEN ${age} >= 4 THEN 1 ELSE 0 END) as bucket_4_plus
      FROM case_dvbh WHERE thoi_gian_hoan_thanh IS NULL${sql}`,
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
