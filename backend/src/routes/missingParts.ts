import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { ageExpr, ageFilterClause, AGE_ANCHOR } from "../lib/ageCalc";
import { khuVucAdHocClause, REPORT_DIMS, dimAdHocClause } from "../lib/filterParams";

const AGE_EXPR = ageExpr("c.thoi_gian_cskh_tiep_nhan");

const missingParts = new Hono<{ Bindings: Env }>();
missingParts.use("*", verifySessionMiddleware, loadUser);

// "Moi nhat" theo case_id qua ROW_NUMBER() - xem giai thich chi tiet o LATEST_GIAI_TRINH_JOIN trong
// cases.ts (MAX() + JOIN nguoc lai se nhan doi dong khi co >=2 ban ghi giai_trinh trung gio).
const BASE_JOIN = `
  INNER JOIN (
    SELECT case_id, ly_do_cham, linh_kien_thieu, ngay_yeu_cau_co_hang, ngay_du_kien_hoan_thanh FROM (
      SELECT gt.case_id, gt.ly_do_cham, gt.linh_kien_thieu, gt.ngay_yeu_cau_co_hang, gt.ngay_du_kien_hoan_thanh,
             ROW_NUMBER() OVER (PARTITION BY gt.case_id ORDER BY gt.ngay_giai_trinh DESC, gt.id DESC) AS rn
      FROM giai_trinh gt
    ) WHERE rn = 1
  ) lg ON lg.case_id = c.id
  INNER JOIN settings_ly_do sld ON sld.ten_ly_do = lg.ly_do_cham AND sld.thuoc_thieu_linh_kien = 1
`;

const SELECT_COLS = `c.*, lg.ly_do_cham as last_ly_do_cham, lg.linh_kien_thieu as last_linh_kien_thieu,
       lg.ngay_yeu_cau_co_hang as last_ngay_yeu_cau_co_hang, lg.ngay_du_kien_hoan_thanh as last_ngay_du_kien_hoan_thanh`;

// KHONG them gio "00:00:00" vao bound - xem giai thich chi tiet o monthBounds() trong cases.ts
// (mot so ca co thoi_gian_hoan_thanh chi la ngay thuan, so sanh chuoi voi bound co gio se sai).
function monthBounds(thang: string): { start: string; end: string } {
  const m = thang.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const [y, mo] = m ? [Number(m[1]), Number(m[2])] : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const start = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-01`;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const nextY = mo === 12 ? y + 1 : y;
  const end = `${String(nextY).padStart(4, "0")}-${String(nextMo).padStart(2, "0")}-01`;
  return { start, end };
}

// GET /api/missing-parts?trang_thai=dang-ton|da-dong - case (ton hoac da dong) co giai_trinh moi nhat thuoc nhom "thieu linh kien"
missingParts.get("/", async (c) => {
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const trangThai = c.req.query("trang_thai") === "da-dong" ? "da-dong" : "dang-ton";

  const dimClause = dimAdHocClause(`c.${REPORT_DIMS[c.req.query("dim") ?? ""] ?? "khu_vuc"}`, c.req.query("dim"), c.req.query("dim_value"));

  if (trangThai === "da-dong") {
    const thang = c.req.query("thang") || new Date().toISOString().slice(0, 7);
    const { start, end } = monthBounds(thang);
    const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
    const { results } = await c.env.DB.prepare(
      `SELECT ${SELECT_COLS}
       FROM case_dvbh c
       ${BASE_JOIN}
       WHERE c.thoi_gian_hoan_thanh >= ? AND c.thoi_gian_hoan_thanh < ?${scopeClause.sql}${khuVucClause.sql}${dimClause.sql}
       ORDER BY c.thoi_gian_hoan_thanh DESC`,
    )
      .bind(start, end, ...scopeClause.binds, ...khuVucClause.binds, ...dimClause.binds)
      .all();
    return c.json({ rows: results, thang });
  }

  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  const ageClause = ageFilterClause("c.thoi_gian_cskh_tiep_nhan", c.req.query("tuoi_tu"), c.req.query("tuoi_den"));
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const extraFilter = ageClause.sql + khuVucClause.sql + dimClause.sql;
  const extraBinds = [...ageClause.binds, ...khuVucClause.binds, ...dimClause.binds];

  const query = `
    SELECT ${SELECT_COLS}
    FROM case_dvbh c
    ${BASE_JOIN}
    WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL${scopeClause.sql}${extraFilter}
  `;
  const binds = [...scopeClause.binds, ...extraBinds];

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM (${query})`)
    .bind(...binds)
    .first<{ total: number }>();
  const { results } = await c.env.DB.prepare(`${query} ORDER BY c.id DESC LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, offset)
    .all();

  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// GET /api/missing-parts/by-khu-vuc?dim=... - bao cao ca thieu linh kien nhom theo 1 cot bat ky
// trong REPORT_DIMS (mac dinh khu_vuc): tong ton + cac moc "tren N ngay", tong gia tri linh kien
// du kien, so ma linh kien khac nhau, so ca lo ke hoach. Tra ten cot nhom chung la "nhom" (khong
// con luon la "khu_vuc") de FE hien 1 kieu bang cho moi dim.
missingParts.get("/by-khu-vuc", async (c) => {
  const dimKey = c.req.query("dim") ?? "khu_vuc";
  const dimColRaw = REPORT_DIMS[dimKey];
  if (!dimColRaw) return c.json({ error: "INVALID_DIM" }, 400);
  const dimCol = `c.${dimColRaw}`;

  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));

  const { results } = await c.env.DB.prepare(
    `SELECT ${dimCol} as nhom,
       SUM(CASE WHEN ${AGE_EXPR} >= 1 THEN 1 ELSE 0 END) as tong_ton,
       SUM(CASE WHEN ${AGE_EXPR} >= 3 THEN 1 ELSE 0 END) as tren_3,
       SUM(CASE WHEN ${AGE_EXPR} >= 5 THEN 1 ELSE 0 END) as tren_5,
       SUM(CASE WHEN ${AGE_EXPR} >= 7 THEN 1 ELSE 0 END) as tren_7,
       SUM(CASE WHEN ${AGE_EXPR} >= 1 THEN COALESCE(c.dt_linh_kien, 0) ELSE 0 END) as tong_gia_tri_linh_kien,
       COUNT(DISTINCT CASE WHEN ${AGE_EXPR} >= 1 THEN lg.linh_kien_thieu END) as so_ma_linh_kien,
       SUM(CASE WHEN ${AGE_EXPR} >= 1 AND c.thoi_gian_hen_xu_ly IS NOT NULL AND c.thoi_gian_hen_xu_ly < ${AGE_ANCHOR} THEN 1 ELSE 0 END) as lo_ke_hoach
     FROM case_dvbh c
     ${BASE_JOIN}
     WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND ${dimCol} IS NOT NULL${scopeClause.sql}${khuVucClause.sql}
     GROUP BY ${dimCol}
     ORDER BY tong_ton DESC`,
  )
    .bind(...scopeClause.binds, ...khuVucClause.binds)
    .all();

  return c.json({ rows: results });
});

export default missingParts;
