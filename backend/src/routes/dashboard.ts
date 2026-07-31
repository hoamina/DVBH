import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { khuVucAdHocClause, CURRENT_MONTH_VALUE } from "../lib/filterParams";
import { computeDailyReport } from "../lib/dailyReport";
import { getOrCompute, DASHBOARD_MONTHS_CACHE_KEY, scopedFiltersCacheKey } from "../lib/precomputedCache";
import { cachedReport, buildReportKey } from "../lib/reportCache";

const dashboard = new Hono<{ Bindings: Env }>();
dashboard.use("*", verifySessionMiddleware, loadUser);

// Bo loc dung chung cho cac bao cao Dashboard (kpis/violation-breakdown/pivot/sla-trend/monthly-trend)
// - PHIEN BAN KHONG PHU THUOC Context, khac parseFilterParams(c) trong lib/filterParams.ts, vi cac
// ham computeXxx ben duoi phai goi lai duoc tu R7 warm-up (chi co db + params object thuan + scope,
// khong co Context - xem "BO SUNG BAT BUOC cho R5/R6" trong YEU_CAU_BAO_CAO_TINH_SAN.md). Logic
// giong het parseFilterParams, chi khac nguon du lieu dau vao (params object thay vi c.req.query()).
interface DashboardFilterParams {
  khu_vuc?: string;
  hang?: string;
  thang?: string;
  // Index signature bat buoc de truyen truc tiep vao buildReportKey() (Record<string, string |
  // undefined>) khi bien da duoc gan kieu ten (interface) thay vi object literal - xem
  // lib/reportCache.ts.
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

function buildDashboardFilterClause(params: DashboardFilterParams, scope: string[] | null, prefix = ""): { from: string; sql: string; binds: unknown[] } {
  const alias = prefix ? prefix.slice(0, -1) : "case_dvbh";
  const scopeClause = khuVucWhereClause(scope, `${prefix}khu_vuc`);
  const binds: unknown[] = [...scopeClause.binds];
  let sql = scopeClause.sql;

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
    return { from: currentMonthOrOpenSource(alias), sql, binds };
  }

  const from = prefix ? `case_dvbh ${alias}` : "case_dvbh";
  sql = ` AND ${prefix}archived_at IS NULL AND ${prefix}huy_bo_at IS NULL${sql}`;
  sql += ` AND ${prefix}thoi_gian_hoan_thanh >= ? || '-01' AND ${prefix}thoi_gian_hoan_thanh < date(? || '-01', '+1 month')`;
  binds.push(thang, thang);
  return { from, sql, binds };
}

export interface DashboardFiltersPayload {
  khuVuc: (string | null)[];
  hang: (string | null)[];
  tinh: (string | null)[];
  doiTac: (string | null)[];
  nhomSanPham: (string | null)[];
  nhomKh: (string | null)[];
  nganh: (string | null)[];
  kyThuatVien: (string | null)[];
  // Tinh -> danh sach quan/huyen cua tinh do (dung cho filter cascade tinh->huyen o Bao cao khao
  // sat theo khu vuc) - khac 7 distinct-list phia tren (deu la 1 cot don), day la nhom theo 2 cot.
  tinhHuyen: Record<string, string[]>;
}

// Tinh that su 8 SELECT DISTINCT (ton kem - moi cau quet toan bo case_dvbh vi hau het cot khong
// index, xem KE_HOACH_TOI_UU_D1.md Giai doan 2). Tach rieng ham nay (khong goi truc tiep tu route)
// de dung chung cho ca compute-on-miss (route /filters ben duoi) va recompute sau import (importRoute.ts).
export async function computeDashboardFilters(db: D1Database, scope: string[] | null): Promise<DashboardFiltersPayload> {
  const scopeClause = khuVucWhereClause(scope, "khu_vuc");

  const distinctOf = (col: string) =>
    db
      .prepare(`SELECT DISTINCT ${col} FROM case_dvbh WHERE ${col} IS NOT NULL${scopeClause.sql} ORDER BY ${col}`)
      .bind(...scopeClause.binds)
      .all<Record<string, string>>();

  const tinhHuyenRes = db
    .prepare(`SELECT DISTINCT tinh, quan_huyen FROM case_dvbh WHERE tinh IS NOT NULL AND quan_huyen IS NOT NULL${scopeClause.sql} ORDER BY tinh, quan_huyen`)
    .bind(...scopeClause.binds)
    .all<{ tinh: string; quan_huyen: string }>();

  const [khuVucRes, hangRes, tinhRes, doiTacRes, nhomSanPhamRes, nhomKhRes, nganhRes, kyThuatVienRes, tinhHuyenRows] = await Promise.all([
    distinctOf("khu_vuc"),
    distinctOf("hang"),
    distinctOf("tinh"),
    distinctOf("doi_tac"),
    distinctOf("nhom_san_pham"),
    distinctOf("nhom_kh"),
    distinctOf("nganh"),
    distinctOf("ky_thuat_vien"),
    tinhHuyenRes,
  ]);

  const tinhHuyen: Record<string, string[]> = {};
  for (const r of tinhHuyenRows.results) {
    (tinhHuyen[r.tinh] ??= []).push(r.quan_huyen);
  }

  return {
    khuVuc: khuVucRes.results.map((r) => r.khu_vuc),
    hang: hangRes.results.map((r) => r.hang),
    tinh: tinhRes.results.map((r) => r.tinh),
    doiTac: doiTacRes.results.map((r) => r.doi_tac),
    nhomSanPham: nhomSanPhamRes.results.map((r) => r.nhom_san_pham),
    nhomKh: nhomKhRes.results.map((r) => r.nhom_kh),
    nganh: nganhRes.results.map((r) => r.nganh),
    kyThuatVien: kyThuatVienRes.results.map((r) => r.ky_thuat_vien),
    tinhHuyen,
  };
}

// GET /api/dashboard/filters - danh sach gia tri duy nhat cua tung dim (cho dropdown loc), theo pham
// vi user - dung chung cho moi bo loc REPORT_DIMS (BacklogModule bao cao ton can giai trinh, v.v.)
// Doc qua precomputed_cache (xem lib/precomputedCache.ts) - gia tri chi thay doi khi import ghi
// case_dvbh nen khong can tinh lai moi request; key tach theo pham vi khu_vuc cua user (Giam sat
// bi gioi han co key rieng, xem scopedFiltersCacheKey) de khong lo du lieu giua cac pham vi khac nhau.
dashboard.get("/filters", async (c) => {
  const scope = scopeByKhuVuc(c);
  const key = scopedFiltersCacheKey(scope);
  const payload = await getOrCompute(c.env.DB, key, () => computeDashboardFilters(c.env.DB, scope));
  return c.json(payload);
});

// GET /api/dashboard/sync-status - thoi gian tiep nhan cua ca gan nhat da import, dung lam moc
// "he thong da dong bo den thoi diem nao" - khong loc theo khu_vuc, phan anh trang thai tong the.
dashboard.get("/sync-status", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT MAX(thoi_gian_cskh_tiep_nhan) as last_synced FROM case_dvbh",
  ).first<{ last_synced: string | null }>();
  return c.json({ lastSynced: row?.last_synced ?? null });
});

export interface DashboardMonthsPayload {
  months: string[];
}

// Quet toan bo ca da dong de liet ke cac thang co du lieu (ton kem - xem KE_HOACH_TOI_UU_D1.md
// Giai doan 2). Tach rieng de dung chung cho compute-on-miss va recompute sau import.
export async function computeDashboardMonths(db: D1Database): Promise<DashboardMonthsPayload> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT strftime('%Y-%m', thoi_gian_hoan_thanh) as thang FROM case_dvbh
       WHERE thoi_gian_hoan_thanh IS NOT NULL ORDER BY thang DESC`,
    )
    .all<{ thang: string }>();
  return { months: results.map((r) => r.thang) };
}

// GET /api/dashboard/months - danh sach thang xu ly (theo thoi_gian_hoan_thanh) de loc bao cao.
// Doc qua precomputed_cache - danh sach thang chi doi khi co ca dong moi, ma dieu do cung chi
// xay ra qua import (xem importRoute.ts).
dashboard.get("/months", async (c) => {
  const payload = await getOrCompute(c.env.DB, DASHBOARD_MONTHS_CACHE_KEY, () => computeDashboardMonths(c.env.DB));
  return c.json(payload);
});

// GET /api/dashboard/daily-report - bao cao nhanh van de trong ngay theo vai tro (Giam sat: loc
// theo khu vuc phu trach; vai tro khac: so tong toan he thong). Luon tinh moi, khong cache.
dashboard.get("/daily-report", async (c) => {
  const report = await computeDailyReport(c.env.DB, c.get("user"));
  return c.json(report);
});

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
// compute-on-miss (cachedReport ben duoi) va warm-up sau import (R7, xem YEU_CAU_BAO_CAO_TINH_SAN.md).
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

// GET /api/dashboard/kpis - doc qua reportCache (xem lib/reportCache.ts), chi tinh lai khi domain
// "cases", "vi_pham" hoac "giai_trinh" co ghi moi (subquery tonDaGiaiTrinh doc bang giai_trinh).
dashboard.get("/kpis", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params: DashboardFilterParams = { khu_vuc: c.req.query("khu_vuc"), hang: c.req.query("hang"), thang: c.req.query("thang") };
  const key = buildReportKey("dashboard/kpis", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases", "vi_pham", "giai_trinh"], () => computeDashboardKpis(c.env.DB, params, scope));
  return c.json(payload);
});

export interface TrendRow {
  [key: string]: unknown;
}

// Tach rieng phan tinh toan cua /sla-trend - dung chung cho compute-on-miss va warm-up (R7).
//
// CHOT 2026-07-31: truc ngay cua bieu do nay PHAI la ngay HOAN THANH (thoi_gian_hoan_thanh), khong
// phai ngay tiep nhan (thoi_gian_cskh_tiep_nhan) nhu ban truoc - day la bieu do "xu huong SLA/xu ly
// 24h theo tung ngay", tuc la ket qua xu ly cua nhung ca DONG trong ngay do, giong het cach
// computeMonthlyTrend() da lam dung tu truoc (group by thoi_gian_hoan_thanh). Dung sai truc ngay lam
// lech han so sanh thu cong: xac nhan voi chu he thong bang file Excel doi chieu tay, sau khi doi
// sang thoi_gian_hoan_thanh (giu nguyen dieu kien tinh_vao_kpi = 1, chu he thong xac nhan day van la
// chuan dung) thi so khop gan nhu tuyet doi (vd 26/07: 135/263 khop CHINH XAC voi Excel).
export async function computeSlaTrend(
  db: D1Database,
  params: DashboardFilterParams & { days?: string },
  scope: string[] | null,
): Promise<{ rows: TrendRow[] }> {
  const days = Math.min(90, Math.max(1, Number(params.days ?? 14)));
  const { from, sql, binds } = buildDashboardFilterClause(params, scope);

  const { results } = await db.prepare(
    `SELECT date(thoi_gian_hoan_thanh) as ngay,
       COUNT(*) as total,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND dung_han = 'Đúng hạn' THEN 1 ELSE 0 END) as dung_han_count,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND dung_han IS NOT NULL THEN 1 ELSE 0 END) as dung_han_tinh,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND xu_ly_24h_bucket = '0. Dưới 24h' THEN 1 ELSE 0 END) as duoi_24h_count,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND xu_ly_24h_bucket IS NOT NULL THEN 1 ELSE 0 END) as co_tinh_24h
     FROM ${from} WHERE thoi_gian_hoan_thanh IS NOT NULL
       AND date(thoi_gian_hoan_thanh) >= date('now', ?)${sql}
     GROUP BY date(thoi_gian_hoan_thanh)
     ORDER BY ngay ASC`,
  )
    .bind(`-${days} days`, ...binds)
    .all<TrendRow>();

  return { rows: results };
}

// GET /api/dashboard/sla-trend?days=14 - doc qua reportCache, "days" nam trong cache key (xem
// luu y sla-trend/trend trong YEU_CAU_BAO_CAO_TINH_SAN.md).
dashboard.get("/sla-trend", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params = { days: c.req.query("days"), khu_vuc: c.req.query("khu_vuc"), hang: c.req.query("hang"), thang: c.req.query("thang") };
  const key = buildReportKey("dashboard/sla-trend", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases"], () => computeSlaTrend(c.env.DB, params, scope));
  return c.json(payload);
});

// Tach rieng phan tinh toan cua /monthly-trend - dung chung cho compute-on-miss va warm-up (R7).
export async function computeMonthlyTrend(
  db: D1Database,
  params: DashboardFilterParams & { months?: string },
  scope: string[] | null,
): Promise<{ rows: TrendRow[] }> {
  const months = Math.min(24, Math.max(1, Number(params.months ?? 12)));
  const { from, sql, binds } = buildDashboardFilterClause(params, scope);

  const { results } = await db.prepare(
    `SELECT strftime('%Y-%m', thoi_gian_hoan_thanh) as thang,
       COUNT(*) as total,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND dung_han = 'Đúng hạn' THEN 1 ELSE 0 END) as dung_han_count,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND dung_han IS NOT NULL THEN 1 ELSE 0 END) as dung_han_tinh,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND xu_ly_24h_bucket = '0. Dưới 24h' THEN 1 ELSE 0 END) as duoi_24h_count,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND xu_ly_24h_bucket IS NOT NULL THEN 1 ELSE 0 END) as co_tinh_24h
     FROM ${from} WHERE thoi_gian_hoan_thanh IS NOT NULL
       AND thoi_gian_hoan_thanh >= datetime('now', ?)${sql}
     GROUP BY thang
     ORDER BY thang ASC`,
  )
    .bind(`-${months} months`, ...binds)
    .all<TrendRow>();

  return { rows: results };
}

// GET /api/dashboard/monthly-trend?months=12 - xu huong so ca hoan thanh + SLA/24h theo thang.
// Doc qua reportCache, "months" nam trong cache key.
dashboard.get("/monthly-trend", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params = { months: c.req.query("months"), khu_vuc: c.req.query("khu_vuc"), hang: c.req.query("hang"), thang: c.req.query("thang") };
  const key = buildReportKey("dashboard/monthly-trend", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases"], () => computeMonthlyTrend(c.env.DB, params, scope));
  return c.json(payload);
});

// Tach rieng phan tinh toan cua /violation-breakdown - dung chung cho compute-on-miss va warm-up (R7).
export async function computeViolationBreakdown(db: D1Database, params: DashboardFilterParams, scope: string[] | null): Promise<Record<string, number>> {
  const { from, sql, binds } = buildDashboardFilterClause(params, scope);
  const row = await db.prepare(
    `SELECT SUM(loi_120p) as loi_120p, SUM(loi_qua_han_24h) as loi_qua_han_24h,
            SUM(loi_lo_ke_hoach) as loi_lo_ke_hoach, SUM(loi_kh_hen_lai) as loi_kh_hen_lai
     FROM ${from} WHERE 1=1${sql}`,
  )
    .bind(...binds)
    .first<Record<string, number>>();
  return row ?? {};
}

// GET /api/dashboard/violation-breakdown - doc qua reportCache, chi tinh lai khi domain "cases" co ghi moi.
dashboard.get("/violation-breakdown", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params: DashboardFilterParams = { khu_vuc: c.req.query("khu_vuc"), hang: c.req.query("hang"), thang: c.req.query("thang") };
  const key = buildReportKey("dashboard/violation-breakdown", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases"], () => computeViolationBreakdown(c.env.DB, params, scope));
  return c.json(payload);
});

const PIVOT_DIMS: Record<string, string> = {
  khu_vuc: "khu_vuc",
  tinh: "tinh",
  doi_tac: "doi_tac",
  hang: "hang",
  ky_thuat_vien: "ky_thuat_vien",
};

// Tach rieng phan tinh toan cua /pivot - dung chung cho compute-on-miss va warm-up (R7). "dimKey" da
// duoc route validate qua PIVOT_DIMS truoc khi goi (xem duoi) - mac dinh "khu_vuc" neu khong hop le,
// phong khi warm-up truyen thieu.
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

// GET /api/dashboard/pivot?dim=khu_vuc|tinh|doi_tac|hang|ky_thuat_vien - doc qua reportCache, "dim"
// nam trong cache key.
dashboard.get("/pivot", async (c) => {
  const dimKey = c.req.query("dim") ?? "khu_vuc";
  if (!PIVOT_DIMS[dimKey]) return c.json({ error: "INVALID_DIM" }, 400);
  const scope = scopeByKhuVuc(c);
  const params = { dimKey, khu_vuc: c.req.query("khu_vuc"), hang: c.req.query("hang"), thang: c.req.query("thang") };
  const key = buildReportKey("dashboard/pivot", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases"], () => computeDashboardPivot(c.env.DB, params, scope));
  return c.json(payload);
});

export default dashboard;
