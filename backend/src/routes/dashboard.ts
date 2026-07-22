import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { parseFilterParams } from "../lib/filterParams";
import { computeDailyReport } from "../lib/dailyReport";

const dashboard = new Hono<{ Bindings: Env }>();
dashboard.use("*", verifySessionMiddleware, loadUser);

// GET /api/dashboard/filters - danh sach gia tri duy nhat cua tung dim (cho dropdown loc), theo pham
// vi user - dung chung cho moi bo loc REPORT_DIMS (BacklogModule bao cao ton can giai trinh, v.v.)
dashboard.get("/filters", async (c) => {
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "khu_vuc");

  const distinctOf = (col: string) =>
    c.env.DB.prepare(`SELECT DISTINCT ${col} FROM case_dvbh WHERE ${col} IS NOT NULL${scopeClause.sql} ORDER BY ${col}`)
      .bind(...scopeClause.binds)
      .all<Record<string, string>>();

  const [khuVucRes, hangRes, tinhRes, doiTacRes, nhomSanPhamRes, nhomKhRes, nganhRes] = await Promise.all([
    distinctOf("khu_vuc"),
    distinctOf("hang"),
    distinctOf("tinh"),
    distinctOf("doi_tac"),
    distinctOf("nhom_san_pham"),
    distinctOf("nhom_kh"),
    distinctOf("nganh"),
  ]);

  return c.json({
    khuVuc: khuVucRes.results.map((r) => r.khu_vuc),
    hang: hangRes.results.map((r) => r.hang),
    tinh: tinhRes.results.map((r) => r.tinh),
    doiTac: doiTacRes.results.map((r) => r.doi_tac),
    nhomSanPham: nhomSanPhamRes.results.map((r) => r.nhom_san_pham),
    nhomKh: nhomKhRes.results.map((r) => r.nhom_kh),
    nganh: nganhRes.results.map((r) => r.nganh),
  });
});

// GET /api/dashboard/sync-status - thoi gian tiep nhan cua ca gan nhat da import, dung lam moc
// "he thong da dong bo den thoi diem nao" - khong loc theo khu_vuc, phan anh trang thai tong the.
dashboard.get("/sync-status", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT MAX(thoi_gian_cskh_tiep_nhan) as last_synced FROM case_dvbh",
  ).first<{ last_synced: string | null }>();
  return c.json({ lastSynced: row?.last_synced ?? null });
});

// GET /api/dashboard/months - danh sach thang xu ly (theo thoi_gian_hoan_thanh) de loc bao cao
dashboard.get("/months", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT DISTINCT strftime('%Y-%m', thoi_gian_hoan_thanh) as thang FROM case_dvbh
     WHERE thoi_gian_hoan_thanh IS NOT NULL ORDER BY thang DESC`,
  ).all<{ thang: string }>();
  return c.json({ months: results.map((r) => r.thang) });
});

// GET /api/dashboard/daily-report - bao cao nhanh van de trong ngay theo vai tro (Giam sat: loc
// theo khu vuc phu trach; vai tro khac: so tong toan he thong). Luon tinh moi, khong cache.
dashboard.get("/daily-report", async (c) => {
  const report = await computeDailyReport(c.env.DB, c.get("user"));
  return c.json(report);
});

// GET /api/dashboard/kpis
dashboard.get("/kpis", async (c) => {
  const { sql, binds } = parseFilterParams(c);
  const { sql: sqlC, binds: bindsC } = parseFilterParams(c, "c.");

  const base = await c.env.DB.prepare(
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

  const tonDaGiaiTrinh = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM case_dvbh c
     WHERE c.thoi_gian_hoan_thanh IS NULL AND EXISTS (SELECT 1 FROM giai_trinh g WHERE g.case_id = c.id)${sqlC}`,
  )
    .bind(...bindsC)
    .first<{ n: number }>();

  const xacNhan = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM vi_pham v
     INNER JOIN case_dvbh c ON c.id = v.case_id
     WHERE COALESCE(v.chot_bo_cap_2, CASE WHEN v.ket_qua_cap_1 != 'Khong loi' THEN 1 ELSE 0 END) = 1
       ${sqlC}`,
  )
    .bind(...bindsC)
    .first<{ n: number }>();

  // Da khao sat = so luot co nghi ngo da co ket qua goi ghi nhan (bat ke ket luan Loi/Khong loi),
  // tuc la so dong vi_pham da ton tai cho case trong pham vi loc - khac tyViPham (chi tinh loi da xac nhan).
  const daKhaoSat = await c.env.DB.prepare(
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

  return c.json({
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
  });
});

// GET /api/dashboard/sla-trend?days=14
dashboard.get("/sla-trend", async (c) => {
  const days = Math.min(90, Math.max(1, Number(c.req.query("days") ?? 14)));
  const { sql, binds } = parseFilterParams(c);

  const { results } = await c.env.DB.prepare(
    `SELECT date(thoi_gian_cskh_tiep_nhan) as ngay,
       COUNT(*) as total,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND dung_han = 'Đúng hạn' THEN 1 ELSE 0 END) as dung_han_count,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND dung_han IS NOT NULL THEN 1 ELSE 0 END) as dung_han_tinh,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND xu_ly_24h_bucket = '0. Dưới 24h' THEN 1 ELSE 0 END) as duoi_24h_count,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND xu_ly_24h_bucket IS NOT NULL THEN 1 ELSE 0 END) as co_tinh_24h
     FROM case_dvbh WHERE thoi_gian_cskh_tiep_nhan IS NOT NULL
       AND date(thoi_gian_cskh_tiep_nhan) >= date('now', ?)${sql}
     GROUP BY date(thoi_gian_cskh_tiep_nhan)
     ORDER BY ngay ASC`,
  )
    .bind(`-${days} days`, ...binds)
    .all();

  return c.json({ rows: results });
});

// GET /api/dashboard/monthly-trend?months=12 - xu huong so ca hoan thanh + SLA/24h theo thang
dashboard.get("/monthly-trend", async (c) => {
  const months = Math.min(24, Math.max(1, Number(c.req.query("months") ?? 12)));
  const { sql, binds } = parseFilterParams(c);

  const { results } = await c.env.DB.prepare(
    `SELECT strftime('%Y-%m', thoi_gian_hoan_thanh) as thang,
       COUNT(*) as total,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND dung_han = 'Đúng hạn' THEN 1 ELSE 0 END) as dung_han_count,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND dung_han IS NOT NULL THEN 1 ELSE 0 END) as dung_han_tinh,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND xu_ly_24h_bucket = '0. Dưới 24h' THEN 1 ELSE 0 END) as duoi_24h_count,
       SUM(CASE WHEN tinh_vao_kpi = 1 AND xu_ly_24h_bucket IS NOT NULL THEN 1 ELSE 0 END) as co_tinh_24h
     FROM case_dvbh WHERE thoi_gian_hoan_thanh IS NOT NULL
       AND thoi_gian_hoan_thanh >= datetime('now', ?)${sql}
     GROUP BY thang
     ORDER BY thang ASC`,
  )
    .bind(`-${months} months`, ...binds)
    .all();

  return c.json({ rows: results });
});

// GET /api/dashboard/violation-breakdown
dashboard.get("/violation-breakdown", async (c) => {
  const { sql, binds } = parseFilterParams(c);
  const row = await c.env.DB.prepare(
    `SELECT SUM(loi_120p) as loi_120p, SUM(loi_qua_han_24h) as loi_qua_han_24h,
            SUM(loi_lo_ke_hoach) as loi_lo_ke_hoach, SUM(loi_kh_hen_lai) as loi_kh_hen_lai
     FROM case_dvbh WHERE 1=1${sql}`,
  )
    .bind(...binds)
    .first<Record<string, number>>();
  return c.json(row);
});

const PIVOT_DIMS: Record<string, string> = {
  khu_vuc: "khu_vuc",
  tinh: "tinh",
  doi_tac: "doi_tac",
  hang: "hang",
  ky_thuat_vien: "ky_thuat_vien",
};

// GET /api/dashboard/pivot?dim=khu_vuc|tinh|doi_tac|hang|ky_thuat_vien
dashboard.get("/pivot", async (c) => {
  const dim = PIVOT_DIMS[c.req.query("dim") ?? "khu_vuc"];
  if (!dim) return c.json({ error: "INVALID_DIM" }, 400);
  const { sql, binds } = parseFilterParams(c);

  const { results } = await c.env.DB.prepare(
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
     FROM case_dvbh WHERE ${dim} IS NOT NULL${sql}
     GROUP BY ${dim}
     ORDER BY total DESC`,
  )
    .bind(...binds)
    .all();

  return c.json({ rows: results });
});

export default dashboard;
