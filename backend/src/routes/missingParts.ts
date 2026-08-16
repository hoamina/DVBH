import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { ageExpr, ageFilterClause, AGE_ANCHOR } from "../lib/ageCalc";
import { khuVucAdHocClause, REPORT_DIMS, dimAdHocClause, khuVucReportExclusionClause } from "../lib/filterParams";
import { CASE_FILTER_TON } from "../lib/needGiaiTrinh";
import { cachedReport, buildReportKey } from "../lib/reportCache";
import { getDaDongManifest, getDaDongReasons, getThieuLinhKienLyDoList } from "../lib/daDongDayChunks";

const AGE_EXPR = ageExpr("c.thoi_gian_cskh_tiep_nhan");

const missingParts = new Hono<{ Bindings: Env }>();
missingParts.use("*", verifySessionMiddleware, loadUser);

// "Moi nhat" theo case_id qua ROW_NUMBER() - xem giai thich chi tiet o latestGiaiTrinhJoin() trong
// needGiaiTrinh.ts (MAX() + JOIN nguoc lai se nhan doi dong khi co >=2 ban ghi giai_trinh trung
// gio). caseFilterSql gioi han subquery vao dung tap case dang xet - xem giai thich an toan
// (superset) o latestGiaiTrinhJoin() trong needGiaiTrinh.ts, ap dung y het cho ham nay.
function baseJoin(caseFilterSql: string): string {
  return `
  INNER JOIN (
    SELECT case_id, ly_do_cham, linh_kien_thieu, ngay_yeu_cau_co_hang, ngay_du_kien_hoan_thanh FROM (
      SELECT gt.case_id, gt.ly_do_cham, gt.linh_kien_thieu, gt.ngay_yeu_cau_co_hang, gt.ngay_du_kien_hoan_thanh,
             ROW_NUMBER() OVER (PARTITION BY gt.case_id ORDER BY gt.ngay_giai_trinh DESC, gt.id DESC) AS rn
      FROM giai_trinh gt
      WHERE gt.case_id IN (SELECT id FROM case_dvbh WHERE ${caseFilterSql})
    ) WHERE rn = 1
  ) lg ON lg.case_id = c.id
  INNER JOIN settings_ly_do sld ON sld.ten_ly_do = lg.ly_do_cham AND sld.thuoc_thieu_linh_kien = 1
`;
}

// CHOT 2026-08-12: them "tuoi_ton" (${AGE_EXPR}, giong pattern cases.ts GET "/") cho cot "Tuoi ton"
// o "Danh sach chi tiet" - "last_ly_do_cham" da co san tu truoc, dung thang cho cot "Ly do ton gan
// nhat" (khong can them field moi).
const SELECT_COLS = `c.*, lg.ly_do_cham as last_ly_do_cham, lg.linh_kien_thieu as last_linh_kien_thieu,
       lg.ngay_yeu_cau_co_hang as last_ngay_yeu_cau_co_hang, lg.ngay_du_kien_hoan_thanh as last_ngay_du_kien_hoan_thanh,
       ${AGE_EXPR} as tuoi_ton`;

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
  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClause = { sql: scopeClauseBase.sql + exclusion.sql, binds: [...scopeClauseBase.binds, ...exclusion.binds] };
  const trangThai = c.req.query("trang_thai") === "da-dong" ? "da-dong" : "dang-ton";

  const dimClause = dimAdHocClause(`c.${REPORT_DIMS[c.req.query("dim") ?? ""] ?? "khu_vuc"}`, c.req.query("dim"), c.req.query("dim_value"));

  // "Da dong" (tab thieu linh kien) da tach thanh /da-dong-manifest, dung chung file R2 theo ngay
  // voi cases.ts (xem lib/daDongDayChunks.ts) - noi dung chunk goi qua POST /api/cases/da-dong-chunks.
  if (trangThai === "da-dong") return c.json({ error: "DEPRECATED_USE_MANIFEST_ENDPOINT" }, 410);

  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  const ageClause = ageFilterClause("c.thoi_gian_cskh_tiep_nhan", c.req.query("tuoi_tu"), c.req.query("tuoi_den"));
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  // CHOT 2026-08-12: o tim ID/Serial rieng cho "Danh sach chi tiet" (giong pattern idClause cua
  // cases.ts GET "/") - khop CA id lan seri_san_pham.
  const idFilter = (c.req.query("id") ?? "").trim();
  const idClause: { sql: string; binds: unknown[] } = idFilter
    ? { sql: " AND (c.id LIKE ? OR c.seri_san_pham LIKE ?)", binds: [`%${idFilter}%`, `%${idFilter}%`] }
    : { sql: "", binds: [] };
  // CHOT 2026-08-12: bo loc chung "Model"/"Doi tac" (doc lap voi "dim" - dim chi dung cho drill-down
  // tu 1 dong bao cao pivot) - ap dung ca cho "/" (danh sach) lan "/by-khu-vuc" (bao cao) ben duoi.
  const modelClause = dimAdHocClause("c.nhom_san_pham", "nhom_san_pham", c.req.query("nhom_san_pham"));
  const doiTacClause = dimAdHocClause("c.doi_tac", "doi_tac", c.req.query("doi_tac"));
  // CHOT 2026-08-12: nut filter nhanh "Loc tong, BCN" ("nhom_san_pham_group=loc_tong_bcn") - gop 2
  // Model cung luc (OR), khac modelClause o tren chi khop DUNG 1 gia tri - FE tu dam bao khong gui
  // dong thoi ca 2 param nay (bam nut nhanh se tu xoa modelFilter dang chon, xem MissingPartsModule.tsx).
  const modelGroupClause: { sql: string; binds: unknown[] } =
    c.req.query("nhom_san_pham_group") === "loc_tong_bcn" ? { sql: " AND c.nhom_san_pham = 'Lọc tổng'", binds: [] } : { sql: "", binds: [] };
  const extraFilter = ageClause.sql + khuVucClause.sql + dimClause.sql + idClause.sql + modelClause.sql + doiTacClause.sql + modelGroupClause.sql;
  const extraBinds = [
    ...ageClause.binds,
    ...khuVucClause.binds,
    ...dimClause.binds,
    ...idClause.binds,
    ...modelClause.binds,
    ...doiTacClause.binds,
    ...modelGroupClause.binds,
  ];

  const query = `
    SELECT ${SELECT_COLS}
    FROM case_dvbh c
    ${baseJoin(CASE_FILTER_TON)}
    WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND c.huy_bo_at IS NULL${scopeClause.sql}${extraFilter}
  `;
  const binds = [...scopeClause.binds, ...extraBinds];

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM (${query})`)
    .bind(...binds)
    .first<{ total: number }>();
  // CHOT 2026-08-16: sap ca VIP/S.VIP len dau tien (theo yeu cau "toan bo danh sach ca ton chi tiet o
  // moi cho" - dua VIP len dau), roi trong tung nhom sap ca ton lau nhat len truoc (thay vi ORDER BY
  // id DESC/moi nhat truoc nhu cu) - theo yeu cau uu tien xu ly ca cang tre cang truoc.
  const { results } = await c.env.DB.prepare(`${query} ORDER BY (CASE WHEN c.nhom_kh LIKE '%VIP%' THEN 0 ELSE 1 END), tuoi_ton DESC, c.id DESC LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, offset)
    .all();

  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// GET /api/missing-parts/da-dong-manifest?thang=YYYY-MM - hash tung ngay (dung chung voi
// cases.ts/da-dong-manifest, cung bang da_dong_chunk_manifest + cung file R2 theo ngay) + "ly do/linh
// kien thieu gan nhat" (getDaDongReasons, mo rong them linh_kien_thieu/ngay_yeu_cau_co_hang) + danh
// sach ten ly_do thuoc nhom "thieu linh kien" de client tu loc dung nhu INNER JOIN settings_ly_do
// truoc day. Noi dung chunk thuc su goi qua POST /api/cases/da-dong-chunks (dung chung, khong tao
// endpoint rieng vi la CUNG 1 file R2).
missingParts.get("/da-dong-manifest", async (c) => {
  const thang = c.req.query("thang") || new Date().toISOString().slice(0, 7);
  const { start, end } = monthBounds(thang);
  const [chunks, reasons, thieuLinhKienLyDo] = await Promise.all([
    getDaDongManifest(c.env.DB, start, end),
    getDaDongReasons(c.env.DB, thang, start, end),
    getThieuLinhKienLyDoList(c.env.DB),
  ]);
  return c.json({ thang, chunks, reasons, thieuLinhKienLyDo });
});

export interface MissingPartsByKhuVucParams {
  dim?: string;
  khu_vuc?: string;
  nhom_san_pham?: string;
  doi_tac?: string;
  [key: string]: string | undefined;
}

/** Tach tu missingParts.get("/by-khu-vuc") - xem chu thich route ben duoi. "dim" da qua whitelist
 * REPORT_DIMS o route (tra 400 NGOAI cache) truoc khi toi day. "nhom_san_pham"/"doi_tac" (CHOT
 * 2026-08-12) la bo loc CHUNG doc lap voi "dim" - ap dung them dong thoi voi dim dang chon, khong
 * thay the (vd van nhom theo Khu vuc nhung chi tinh rieng Model = "Loc tong"). */
export async function computeMissingPartsByKhuVuc(db: D1Database, params: MissingPartsByKhuVucParams, scope: string[] | null) {
  const dimColRaw = REPORT_DIMS[params.dim ?? "khu_vuc"] ?? "khu_vuc";
  const dimCol = `c.${dimColRaw}`;

  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClause = { sql: scopeClauseBase.sql + exclusion.sql, binds: [...scopeClauseBase.binds, ...exclusion.binds] };
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", params.khu_vuc);
  const modelClause = dimAdHocClause("c.nhom_san_pham", "nhom_san_pham", params.nhom_san_pham);
  const doiTacClause = dimAdHocClause("c.doi_tac", "doi_tac", params.doi_tac);
  const extraFilter = khuVucClause.sql + modelClause.sql + doiTacClause.sql;
  const extraBinds = [...khuVucClause.binds, ...modelClause.binds, ...doiTacClause.binds];

  const { results } = await db
    .prepare(
      `SELECT ${dimCol} as nhom,
         SUM(CASE WHEN ${AGE_EXPR} >= 1 THEN 1 ELSE 0 END) as tong_ton,
         SUM(CASE WHEN ${AGE_EXPR} >= 3 THEN 1 ELSE 0 END) as tren_3,
         SUM(CASE WHEN ${AGE_EXPR} >= 5 THEN 1 ELSE 0 END) as tren_5,
         SUM(CASE WHEN ${AGE_EXPR} >= 7 THEN 1 ELSE 0 END) as tren_7,
         SUM(CASE WHEN ${AGE_EXPR} >= 14 THEN 1 ELSE 0 END) as tren_14,
         SUM(CASE WHEN ${AGE_EXPR} >= 1 THEN COALESCE(c.dt_linh_kien, 0) ELSE 0 END) as tong_gia_tri_linh_kien,
         COUNT(DISTINCT CASE WHEN ${AGE_EXPR} >= 1 THEN lg.linh_kien_thieu END) as so_ma_linh_kien,
         SUM(CASE WHEN ${AGE_EXPR} >= 1 AND c.thoi_gian_hen_xu_ly IS NOT NULL AND c.thoi_gian_hen_xu_ly < ${AGE_ANCHOR} THEN 1 ELSE 0 END) as lo_ke_hoach
       FROM case_dvbh c
       ${baseJoin(CASE_FILTER_TON)}
       WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND c.huy_bo_at IS NULL AND ${dimCol} IS NOT NULL${scopeClause.sql}${extraFilter}
       GROUP BY ${dimCol}
       ORDER BY tong_ton DESC`,
    )
    .bind(...scopeClause.binds, ...extraBinds)
    .all();

  return { rows: results };
}

// GET /api/missing-parts/by-khu-vuc?dim=... - bao cao ca thieu linh kien nhom theo 1 cot bat ky
// trong REPORT_DIMS (mac dinh khu_vuc): tong ton + cac moc "tren N ngay", tong gia tri linh kien
// du kien, so ma linh kien khac nhau, so ca lo ke hoach. Tra ten cot nhom chung la "nhom" (khong
// con luon la "khu_vuc") de FE hien 1 kieu bang cho moi dim.
// Boc qua cachedReport (xem lib/reportCache.ts) - domain: cases, giai_trinh, settings (bang R5 trong
// YEU_CAU_BAO_CAO_TINH_SAN.md, giong het cases.ts/backlog-by-khu-vuc). Tag "ngay VN" trong
// cachedReport() tu lo cac moc "tren N ngay" doi khi sang ngay moi.
missingParts.get("/by-khu-vuc", async (c) => {
  const dimKey = c.req.query("dim") ?? "khu_vuc";
  if (!REPORT_DIMS[dimKey]) return c.json({ error: "INVALID_DIM" }, 400);

  const scope = scopeByKhuVuc(c);
  const params: MissingPartsByKhuVucParams = {
    dim: dimKey,
    khu_vuc: c.req.query("khu_vuc"),
    nhom_san_pham: c.req.query("nhom_san_pham"),
    doi_tac: c.req.query("doi_tac"),
  };
  const key = buildReportKey("missing-parts/by-khu-vuc", params, scope);
  const data = await cachedReport(c.env.DB, key, ["cases", "giai_trinh", "settings"], () => computeMissingPartsByKhuVuc(c.env.DB, params, scope));
  return c.json(data);
});

export default missingParts;
