/**
 * Tach rieng khoi routes/dashboard.ts (2026-08-01) de lib/dailySnapshot.ts co the goi truc tiep
 * computeDashboardKpis/computeDashboardPivot khi tinh "Bao cao ngay 08:00" ma KHONG tao import cycle
 * (routes/dashboard.ts da import tu lib/dailySnapshot.ts de doc snapshot - neu lib/dailySnapshot.ts
 * quay lai import tu routes/dashboard.ts se thanh vong lap). File nay la lib thuan (khong import gi
 * tu routes/*), dung chung cho ca routes/dashboard.ts (route /kpis, /pivot - duong live/fallback) lan
 * lib/dailySnapshot.ts (duong dong bang 08:00).
 */
import { khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { khuVucAdHocClause, khuVucReportExclusionClause, CURRENT_MONTH_VALUE } from "./filterParams";

// Bo loc dung chung cho cac bao cao Dashboard (kpis/pivot) - PHIEN BAN KHONG PHU THUOC Context, khac
// parseFilterParams(c) trong lib/filterParams.ts, vi cac ham computeXxx phai goi lai duoc tu snapshot
// job (chi co db + params object thuan + scope, khong co Context).
export interface DashboardFilterParams {
  khu_vuc?: string;
  hang?: string;
  thang?: string;
  // CHOT 2026-08-12: bo loc "Model" (nhom_san_pham) o the "Tong quan" - ap dung dong thoi cho KPI
  // tong ("Filter tong") lan "Bang pivot phan tich da chieu" (ca 2 deu dung chung
  // buildDashboardFilterClause ben duoi).
  nhom_san_pham?: string;
  // Index signature bat buoc de truyen truc tiep vao buildReportKey() (Record<string, string |
  // undefined>) khi bien da duoc gan kieu ten (interface) thay vi object literal - xem lib/reportCache.ts.
  [key: string]: string | undefined;
}

// Nguon FROM cho case_dvbh, da loc SAN theo dieu kien "thang hien tai HOAC con ton" bang UNION ALL
// 2 nhanh, MOI nhanh ep dung 1 index chon loc rieng qua INDEXED BY - CHOT 2026-07-30 sau khi phat
// hien bug hieu nang nghiem trong: viet dieu kien nay duoi dang 1 cau WHERE co OR (ban cu, xem git
// history) khien SQLite/D1 CHON SAI index (idx_case_huy_bo_at - gan nhu khong chon loc, huy_bo_at
// IS NULL khop ~96% bang) thay vi 2 index rat chon loc co san (idx_case_ton cho ca con ton,
// idx_case_hoan_thanh_not_null cho khoang ngay thang nay) - EXPLAIN QUERY PLAN xac nhan dung index
// sai, va do that tren production: 1 truy van dai dien giam tu 74,510 dong doc con 28,035 (~62%)
// sau khi tach UNION ALL + INDEXED BY (test them voi GROUP BY: 99,043 -> 52,579, ~47%). Ket qua
// CUOI CUNG giong het truoc (cung 1 tap dong), chi khac duong doc - AN TOAN doi voi moi noi goi.
// "archived_at"/"huy_bo_at" da loc SAN NGAY BEN TRONG day, khong con nam trong WHERE con lai nua.
function currentMonthOrOpenSource(alias: string): string {
  return `(
    SELECT * FROM case_dvbh INDEXED BY idx_case_ton
      WHERE thoi_gian_hoan_thanh IS NULL AND archived_at IS NULL AND huy_bo_at IS NULL
    UNION ALL
    SELECT * FROM case_dvbh INDEXED BY idx_case_hoan_thanh_not_null
      WHERE thoi_gian_hoan_thanh >= date('now','start of month') AND thoi_gian_hoan_thanh < date('now','start of month','+1 month')
        AND archived_at IS NULL AND huy_bo_at IS NULL
  ) ${alias}`;
}

export function buildDashboardFilterClause(params: DashboardFilterParams, scope: string[] | null, prefix = ""): { from: string; sql: string; binds: unknown[] } {
  const alias = prefix ? prefix.slice(0, -1) : "case_dvbh";
  const scopeClause = khuVucWhereClause(scope, `${prefix}khu_vuc`);
  const binds: unknown[] = [...scopeClause.binds];
  let sql = scopeClause.sql;

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

  if (params.nhom_san_pham) {
    sql += ` AND ${prefix}nhom_san_pham = ?`;
    binds.push(params.nhom_san_pham);
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
    return { from: currentMonthOrOpenSource(alias), sql, binds };
  }

  const from = prefix ? `case_dvbh ${alias}` : "case_dvbh";
  sql = ` AND ${prefix}archived_at IS NULL AND ${prefix}huy_bo_at IS NULL${sql}`;
  sql += ` AND ${prefix}thoi_gian_hoan_thanh >= ? || '-01' AND ${prefix}thoi_gian_hoan_thanh < date(? || '-01', '+1 month')`;
  binds.push(thang, thang);
  return { from, sql, binds };
}

export interface TrendRow {
  [key: string]: unknown;
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

// Tach rieng phan tinh toan cua /kpis (khong goi truc tiep tu route) de dung chung cho ca
// compute-on-miss (cachedReport, duong fallback filter khac mac dinh) va "Bao cao ngay 08:00"
// (lib/dailySnapshot.ts, duong mac dinh - xem YEU_CAU_BAO_CAO_TINH_SAN.md).
export async function computeDashboardKpis(db: D1Database, params: DashboardFilterParams, scope: string[] | null): Promise<DashboardKpisPayload> {
  const { from, sql, binds } = buildDashboardFilterClause(params, scope);
  const { from: fromC, sql: sqlC, binds: bindsC } = buildDashboardFilterClause(params, scope, "c.");

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
    FROM ${from} WHERE 1=1${sql}`,
  )
    .bind(...binds)
    .first<Record<string, number>>();

  const tonDaGiaiTrinh = await db.prepare(
    `SELECT COUNT(*) as n FROM ${fromC}
     WHERE c.thoi_gian_hoan_thanh IS NULL AND EXISTS (SELECT 1 FROM giai_trinh g WHERE g.case_id = c.id)${sqlC}`,
  )
    .bind(...bindsC)
    .first<{ n: number }>();

  const xacNhan = await db.prepare(
    `SELECT COUNT(*) as n FROM vi_pham v
     INNER JOIN ${fromC} ON c.id = v.case_id
     WHERE COALESCE(v.chot_bo_cap_2, CASE WHEN v.ket_qua_cap_1 != 'Khong loi' THEN 1 ELSE 0 END) = 1
       ${sqlC}`,
  )
    .bind(...bindsC)
    .first<{ n: number }>();

  // Da khao sat = so luot co nghi ngo da co ket qua goi ghi nhan (bat ke ket luan Loi/Khong loi),
  // tuc la so dong vi_pham da ton tai cho case trong pham vi loc - khac tyViPham (chi tinh loi da xac nhan).
  const daKhaoSat = await db.prepare(
    `SELECT COUNT(*) as n FROM vi_pham v
     INNER JOIN ${fromC} ON c.id = v.case_id
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

export const PIVOT_DIMS: Record<string, string> = {
  khu_vuc: "khu_vuc",
  tinh: "tinh",
  doi_tac: "doi_tac",
  hang: "hang",
  ky_thuat_vien: "ky_thuat_vien",
};

// Tach rieng phan tinh toan cua /pivot - dung chung cho compute-on-miss (fallback) va "Bao cao ngay
// 08:00" (dailySnapshot.ts tinh san CA 5 dim). "dimKey" da duoc route validate qua PIVOT_DIMS truoc
// khi goi - mac dinh "khu_vuc" neu khong hop le.
export async function computeDashboardPivot(
  db: D1Database,
  params: DashboardFilterParams & { dimKey?: string },
  scope: string[] | null,
): Promise<{ rows: TrendRow[] }> {
  const dim = PIVOT_DIMS[params.dimKey ?? "khu_vuc"] ?? "khu_vuc";
  const { from, sql, binds } = buildDashboardFilterClause(params, scope);

  const { results } = await db.prepare(
    `SELECT ${dim} as nhom,
       SUM(CASE WHEN tien_do_hoan_thanh IN ('Hoàn thành XLSC', 'Không hoàn thành XLSC') THEN 1 ELSE 0 END) as total,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND tien_do_hoan_thanh = 'Hoàn thành XLSC' THEN 1 ELSE 0 END) as ht_tinh_kpi,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND dung_han = 'Đúng hạn' THEN 1 ELSE 0 END) as sla_ok,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND dung_han IS NOT NULL THEN 1 ELSE 0 END) as dung_han_tinh,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND xu_ly_24h_bucket = '0. Dưới 24h' THEN 1 ELSE 0 END) as duoi_24h_count,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND xu_ly_24h_bucket IS NOT NULL THEN 1 ELSE 0 END) as co_tinh_24h,
       SUM(loi_120p + loi_qua_han_24h + loi_lo_ke_hoach + loi_kh_hen_lai) as nghi_ngo,
       SUM(loi_120p) as loi_120p, SUM(loi_qua_han_24h) as loi_qua_han_24h,
       SUM(loi_lo_ke_hoach) as loi_lo_ke_hoach, SUM(loi_kh_hen_lai) as loi_kh_hen_lai
     FROM ${from} WHERE ${dim} IS NOT NULL${sql}
     GROUP BY ${dim}
     ORDER BY total DESC`,
  )
    .bind(...binds)
    .all<TrendRow>();

  return { rows: results };
}
