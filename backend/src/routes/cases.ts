import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { ageExpr, ageFilterClause as ageFilterClauseFor } from "../lib/ageCalc";
import { khuVucAdHocClause, REPORT_DIMS, dimAdHocClause, sharedReportFilters } from "../lib/filterParams";
import { LATEST_GIAI_TRINH_JOIN, NEED_GIAI_TRINH_CATEGORIES, NEED_LO_KE_HOACH, NEED_TAI_GIAI_TRINH } from "../lib/needGiaiTrinh";
import { getCaLapDetection } from "./caLap";

const cases = new Hono<{ Bindings: Env }>();
cases.use("*", verifySessionMiddleware, loadUser);

const SORTABLE_COLUMNS = new Set(["id", "khach_hang", "khu_vuc", "thoi_gian_cskh_tiep_nhan", "ngay_import"]);

const TAB_FILTERS: Record<string, string> = {
  "da-giai-trinh": "lg.case_id IS NOT NULL",
};

/** "2026-06" -> { start: "2026-06-01", end: "2026-07-01" } - dung range thay vi strftime(...) = ? de
 * tan dung index. KHONG duoc them gio "00:00:00" vao day: mot so ca co thoi_gian_hoan_thanh chi
 * la ngay thuan (vd "2026-07-01", khong gio) do nguon CRM khong co gio cho dong do - neu bound la
 * "2026-07-01 00:00:00" thi so sanh chuoi "2026-07-01" >= "2026-07-01 00:00:00" se la FALSE (chuoi
 * ngan hon la tien to cua chuoi dai hon, SQLite coi la NHO HON), lam ca dong dung ngay dau thang bi
 * rot khoi bao cao thang do. Dung ngay thuan (khong gio) o ca 2 dau lam bound thi moi gia tri (co
 * gio hay khong) deu so sanh dung. */
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

const AGE_EXPR = ageExpr("c.thoi_gian_cskh_tiep_nhan");

function ageFilterClause(tuoiTu?: string, tuoiDen?: string): { sql: string; binds: unknown[] } {
  return ageFilterClauseFor("c.thoi_gian_cskh_tiep_nhan", tuoiTu, tuoiDen);
}

// GET /api/cases?tab=&khu_vuc=&page=&pageSize=&sortBy=&sortDir=&export=
// tab dac biet:
// - "ton-hien-tai": TOAN BO ca dang ton (khong phan biet da/chua giai trinh), loc them duoc qua
//   tuoi_tu/tuoi_den (vd "Ton tren 7 ngay").
// - "can-giai-trinh": 1 trong 5 nhom NEED_GIAI_TRINH_CATEGORIES (query "category", mac dinh "tong"
//   = hop OR ca 5 nhom, 1 ca thuoc nhieu nhom van chi dem/hien 1 lan).
cases.get("/", async (c) => {
  const scope = scopeByKhuVuc(c);
  const tab = c.req.query("tab") ?? "ton-hien-tai";
  const khuVucFilter = c.req.query("khu_vuc");
  const isExport = c.req.query("export") === "true";
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const dimClause = dimAdHocClause(`c.${REPORT_DIMS[c.req.query("dim") ?? ""] ?? "khu_vuc"}`, c.req.query("dim"), c.req.query("dim_value"));
  const sharedClause = sharedReportFilters(c, "c.");
  const idFilter = (c.req.query("id") ?? "").trim();
  const idClause: { sql: string; binds: unknown[] } = idFilter ? { sql: " AND c.id LIKE ?", binds: [`%${idFilter}%`] } : { sql: "", binds: [] };

  // "Ca da dong" - tra cuu lich su giai trinh/thong tin ca theo thang hoan thanh, khong phan trang
  // server (da gioi han theo thang nen tap du liệu nho, phan trang thuan client sau khi cache).
  if (tab === "da-dong") {
    const thang = c.req.query("thang") || new Date().toISOString().slice(0, 7);
    const { start, end } = monthBounds(thang);
    const khuVucClause = khuVucAdHocClause("c.khu_vuc", khuVucFilter);
    const hang = c.req.query("hang");
    const hangClause: { sql: string; binds: unknown[] } = hang ? { sql: " AND c.hang = ?", binds: [hang] } : { sql: "", binds: [] };
    const binds: unknown[] = [start, end, ...scopeClause.binds, ...khuVucClause.binds, ...hangClause.binds, ...dimClause.binds, ...sharedClause.binds, ...idClause.binds];
    const { results } = await c.env.DB.prepare(
      `SELECT c.*, lg.ly_do_cham as last_ly_do_cham, lg.ngay_giai_trinh as last_ngay_giai_trinh,
              lg.ngay_du_kien_hoan_thanh as last_ngay_du_kien_hoan_thanh
       FROM case_dvbh c
       ${LATEST_GIAI_TRINH_JOIN}
       WHERE c.thoi_gian_hoan_thanh >= ? AND c.thoi_gian_hoan_thanh < ?${scopeClause.sql}${khuVucClause.sql}${hangClause.sql}${dimClause.sql}${sharedClause.sql}${idClause.sql}
       ORDER BY c.thoi_gian_hoan_thanh DESC`,
    )
      .bind(...binds)
      .all();
    return c.json({ rows: results, thang });
  }

  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const sortByRaw = c.req.query("sortBy") ?? "id";
  const sortBy = SORTABLE_COLUMNS.has(sortByRaw) ? sortByRaw : "id";
  const sortDir = c.req.query("sortDir") === "asc" ? "ASC" : "DESC";

  let tabFilter: string | null = null;
  if (tab === "ton-hien-tai") {
    tabFilter = "1=1";
  } else if (tab === "can-giai-trinh") {
    const category = c.req.query("category") ?? "tong";
    tabFilter = NEED_GIAI_TRINH_CATEGORIES[category] ?? null;
  } else {
    tabFilter = TAB_FILTERS[tab] ?? null;
  }
  if (!tabFilter) return c.json({ error: "INVALID_TAB" }, 400);

  const khuVucClause = khuVucAdHocClause("c.khu_vuc", khuVucFilter);
  const ageClause = ageFilterClause(c.req.query("tuoi_tu"), c.req.query("tuoi_den"));
  const extraFilter = khuVucClause.sql + ageClause.sql + dimClause.sql + sharedClause.sql + idClause.sql;
  const binds: unknown[] = [...scopeClause.binds, ...khuVucClause.binds, ...ageClause.binds, ...dimClause.binds, ...sharedClause.binds, ...idClause.binds];

  const whereSql = `WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND ${tabFilter}${scopeClause.sql}${extraFilter}`;

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM case_dvbh c ${LATEST_GIAI_TRINH_JOIN} ${whereSql}`,
  )
    .bind(...binds)
    .first<{ total: number }>();

  const baseQuery = `
    SELECT c.*, lg.ly_do_cham as last_ly_do_cham, lg.ngay_giai_trinh as last_ngay_giai_trinh,
           lg.ngay_du_kien_hoan_thanh as last_ngay_du_kien_hoan_thanh
    FROM case_dvbh c
    ${LATEST_GIAI_TRINH_JOIN}
    ${whereSql}
    ORDER BY c.${sortBy} ${sortDir}
  `;

  if (isExport) {
    const { results } = await c.env.DB.prepare(`${baseQuery} LIMIT 5000`).bind(...binds).all();
    return c.json({ rows: results });
  }

  const offset = (page - 1) * pageSize;
  const { results } = await c.env.DB.prepare(`${baseQuery} LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, offset)
    .all();

  return c.json({
    rows: results,
    page,
    pageSize,
    total: countRow?.total ?? 0,
  });
});

// GET /api/cases/search?q= - tra cuu nhanh theo ID hoac Serial (TopBar)
cases.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (!q) return c.json({ found: null });

  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "khu_vuc");
  // ID tu CRM la text (co the chua ky tu), khong con phan biet so/chuoi - thu khop ca id lan serial
  const row = await c.env.DB.prepare(
    `SELECT id FROM case_dvbh WHERE (id = ? OR seri_san_pham = ?)${scopeClause.sql}`,
  )
    .bind(q, q, ...scopeClause.binds)
    .first<{ id: string }>();

  return c.json({ found: row?.id ?? null });
});

// GET /api/cases/counts - so luong tung tab Backlog trong 1 query (cho hien thi "Chua giai trinh (4500)")
cases.get("/counts", async (c) => {
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const sharedClause = sharedReportFilters(c, "c.");
  const extraFilter = khuVucClause.sql + sharedClause.sql;
  const extraBinds = [...khuVucClause.binds, ...sharedClause.binds];

  const row = await c.env.DB.prepare(
    `SELECT
       SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.tong} THEN 1 ELSE 0 END) as tong,
       SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.lo_ke_hoach} THEN 1 ELSE 0 END) as lo_ke_hoach,
       SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.tai_giai_trinh} THEN 1 ELSE 0 END) as tai_giai_trinh,
       SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.chua_gt_3_ngay} THEN 1 ELSE 0 END) as chua_gt_3_ngay,
       SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.chua_gt_5_ngay} THEN 1 ELSE 0 END) as chua_gt_5_ngay,
       SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.dieu_hoa} THEN 1 ELSE 0 END) as dieu_hoa,
       SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.b2b} THEN 1 ELSE 0 END) as b2b,
       SUM(CASE WHEN lg.case_id IS NOT NULL THEN 1 ELSE 0 END) as da_giai_trinh
     FROM case_dvbh c
     ${LATEST_GIAI_TRINH_JOIN}
     WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL${scopeClause.sql}${extraFilter}`,
  )
    .bind(...scopeClause.binds, ...extraBinds)
    .first<Record<string, number>>();

  return c.json({
    can_giai_trinh_tong: row?.tong ?? 0,
    lo_ke_hoach: row?.lo_ke_hoach ?? 0,
    tai_giai_trinh: row?.tai_giai_trinh ?? 0,
    chua_gt_3_ngay: row?.chua_gt_3_ngay ?? 0,
    chua_gt_5_ngay: row?.chua_gt_5_ngay ?? 0,
    dieu_hoa: row?.dieu_hoa ?? 0,
    b2b: row?.b2b ?? 0,
    da_giai_trinh: row?.da_giai_trinh ?? 0,
  });
});

// GET /api/cases/backlog-stats - tong ton hien tai theo nguong tuoi (1/3/7/14 ngay) + phan bo tuoi
// ca ton (cho bieu do) + co cau theo ly do cham gan nhat
cases.get("/backlog-stats", async (c) => {
  const scope = scopeByKhuVuc(c);
  const scopeClauseC = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClauseC = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const sharedClause = sharedReportFilters(c, "c.");
  const extraFilter = khuVucClauseC.sql + sharedClause.sql;
  const extraBinds = [...khuVucClauseC.binds, ...sharedClause.binds];

  const tongTon = await c.env.DB.prepare(
    `SELECT
       COUNT(*) as tong,
       SUM(CASE WHEN ${AGE_EXPR} >= 1 THEN 1 ELSE 0 END) as tren_1,
       SUM(CASE WHEN ${AGE_EXPR} >= 3 THEN 1 ELSE 0 END) as tren_3,
       SUM(CASE WHEN ${AGE_EXPR} >= 7 THEN 1 ELSE 0 END) as tren_7,
       SUM(CASE WHEN ${AGE_EXPR} >= 14 THEN 1 ELSE 0 END) as tren_14,
       SUM(CASE WHEN lg.case_id IS NOT NULL THEN 1 ELSE 0 END) as da_giai_trinh
     FROM case_dvbh c
     ${LATEST_GIAI_TRINH_JOIN}
     WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL${scopeClauseC.sql}${extraFilter}`,
  )
    .bind(...scopeClauseC.binds, ...extraBinds)
    .first<Record<string, number>>();

  const aging = await c.env.DB.prepare(
    `SELECT
       SUM(CASE WHEN ${AGE_EXPR} < 1 THEN 1 ELSE 0 END) as duoi_1_ngay,
       SUM(CASE WHEN ${AGE_EXPR} >= 1 AND ${AGE_EXPR} < 3 THEN 1 ELSE 0 END) as tu_1_den_3,
       SUM(CASE WHEN ${AGE_EXPR} >= 3 AND ${AGE_EXPR} < 7 THEN 1 ELSE 0 END) as tu_3_den_7,
       SUM(CASE WHEN ${AGE_EXPR} >= 7 AND ${AGE_EXPR} < 14 THEN 1 ELSE 0 END) as tu_7_den_14,
       SUM(CASE WHEN ${AGE_EXPR} >= 14 THEN 1 ELSE 0 END) as tren_14_ngay
     FROM case_dvbh c
     WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL${scopeClauseC.sql}${extraFilter}`,
  )
    .bind(...scopeClauseC.binds, ...extraBinds)
    .first<Record<string, number>>();

  const { results: byReason } = await c.env.DB.prepare(
    `SELECT COALESCE(lg.ly_do_cham, 'Chưa giải trình') as ly_do, COUNT(*) as n
     FROM case_dvbh c
     ${LATEST_GIAI_TRINH_JOIN}
     WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL${scopeClauseC.sql}${extraFilter}
     GROUP BY ly_do
     ORDER BY n DESC`,
  )
    .bind(...scopeClauseC.binds, ...extraBinds)
    .all<{ ly_do: string; n: number }>();

  return c.json({
    tongTon: {
      tong: tongTon?.tong ?? 0,
      tren1: tongTon?.tren_1 ?? 0,
      tren3: tongTon?.tren_3 ?? 0,
      tren7: tongTon?.tren_7 ?? 0,
      tren14: tongTon?.tren_14 ?? 0,
      daGiaiTrinh: tongTon?.da_giai_trinh ?? 0,
    },
    aging: {
      duoi1: aging?.duoi_1_ngay ?? 0,
      tu1den3: aging?.tu_1_den_3 ?? 0,
      tu3den7: aging?.tu_3_den_7 ?? 0,
      tu7den14: aging?.tu_7_den_14 ?? 0,
      tren14: aging?.tren_14_ngay ?? 0,
    },
    byReason,
  });
});

// GET /api/cases/backlog-by-khu-vuc?dim= - bao cao ca dang TON (thoi diem hien tai, khong theo
// thang) nhom theo 1 cot bat ky trong REPORT_DIMS (mac dinh khu_vuc): tong ton + tung nguong tuoi
// (1/3/7/14 ngay), so ca thieu linh kien, so/ty le da giai trinh, va 5 nhom "can giai trinh" (dung
// chung dinh nghia needGiaiTrinh.ts voi phan con lai cua he thong). Tra ten cot nhom chung la "nhom".
cases.get("/backlog-by-khu-vuc", async (c) => {
  const dimKey = c.req.query("dim") ?? "khu_vuc";
  const dimColRaw = REPORT_DIMS[dimKey];
  if (!dimColRaw) return c.json({ error: "INVALID_DIM" }, 400);
  const dimCol = `c.${dimColRaw}`;

  const scope = scopeByKhuVuc(c);
  const scopeClauseC = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClauseC = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const sharedClause = sharedReportFilters(c, "c.");
  const extraFilter = khuVucClauseC.sql + sharedClause.sql;
  const extraBinds = [...khuVucClauseC.binds, ...sharedClause.binds];

  const { results: rows } = await c.env.DB.prepare(
    `SELECT ${dimCol} as nhom,
       SUM(CASE WHEN ${AGE_EXPR} >= 1 THEN 1 ELSE 0 END) as tong_ton,
       SUM(CASE WHEN ${AGE_EXPR} >= 3 THEN 1 ELSE 0 END) as tren_3,
       SUM(CASE WHEN ${AGE_EXPR} >= 7 THEN 1 ELSE 0 END) as tren_7,
       SUM(CASE WHEN ${AGE_EXPR} >= 14 THEN 1 ELSE 0 END) as tren_14,
       SUM(CASE WHEN lg.case_id IS NOT NULL THEN 1 ELSE 0 END) as da_giai_trinh,
       SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.tong} THEN 1 ELSE 0 END) as can_giai_trinh_tong,
       SUM(CASE WHEN ${NEED_LO_KE_HOACH} THEN 1 ELSE 0 END) as lo_ke_hoach,
       SUM(CASE WHEN ${NEED_TAI_GIAI_TRINH} THEN 1 ELSE 0 END) as cho_giai_trinh_lai,
       SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.chua_gt_3_ngay} THEN 1 ELSE 0 END) as chua_gt_3_ngay,
       SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.chua_gt_5_ngay} THEN 1 ELSE 0 END) as chua_gt_5_ngay,
       SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.dieu_hoa} THEN 1 ELSE 0 END) as dieu_hoa_1_ngay,
       SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.b2b} THEN 1 ELSE 0 END) as b2b_1_ngay,
       SUM(CASE WHEN EXISTS (SELECT 1 FROM settings_ly_do sld WHERE sld.ten_ly_do = lg.ly_do_cham AND sld.thuoc_thieu_linh_kien = 1) THEN 1 ELSE 0 END) as thieu_linh_kien
     FROM case_dvbh c
     ${LATEST_GIAI_TRINH_JOIN}
     WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND ${dimCol} IS NOT NULL${scopeClauseC.sql}${extraFilter}
     GROUP BY ${dimCol}
     ORDER BY tong_ton DESC`,
  )
    .bind(...scopeClauseC.binds, ...extraBinds)
    .all<Record<string, string | number>>();

  return c.json({ rows });
});

// GET /api/cases/archived
cases.get("/archived", requireRole("Admin", "Viewer"), async (c) => {
  const countRow = await c.env.DB.prepare(
    "SELECT COUNT(*) as total FROM case_dvbh WHERE archived_at IS NOT NULL",
  ).first<{ total: number }>();

  if (c.req.query("export") === "true") {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM case_dvbh WHERE archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT 5000",
    ).all();
    return c.json({ rows: results });
  }

  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM case_dvbh WHERE archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT ? OFFSET ?",
  )
    .bind(pageSize, offset)
    .all();

  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// GET /api/cases/tong-hop?khu_vuc=&hang=&trang_thai=&page=&pageSize=&export=
// "Danh sach tong" - toan bo ca da dong trong 3 thang gan nhat (thang hien tai + 2 thang truoc,
// tinh theo lich thang) CONG voi TAT CA ca dang ton (khong gioi han tuoi) - dung de doi chieu du
// lieu / lam bao cao, khac voi Backlog (chi ca dang ton) hay "Ca da dong" (chi 1 thang don).
cases.get("/tong-hop", async (c) => {
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const hang = c.req.query("hang");
  const hangClause: { sql: string; binds: unknown[] } = hang ? { sql: " AND c.hang = ?", binds: [hang] } : { sql: "", binds: [] };
  const trangThai = c.req.query("trang_thai");
  const trangThaiClause = trangThai === "dang-ton" ? " AND c.thoi_gian_hoan_thanh IS NULL" : trangThai === "da-dong" ? " AND c.thoi_gian_hoan_thanh IS NOT NULL" : "";

  const whereSql = `WHERE c.archived_at IS NULL
     AND (c.thoi_gian_hoan_thanh IS NULL OR c.thoi_gian_hoan_thanh >= date(datetime('now', '+7 hours'), 'start of month', '-2 months'))
     ${scopeClause.sql}${khuVucClause.sql}${hangClause.sql}${trangThaiClause}`;
  const binds = [...scopeClause.binds, ...khuVucClause.binds, ...hangClause.binds];

  const baseQuery = `SELECT c.* FROM case_dvbh c ${whereSql} ORDER BY c.id DESC`;

  if (c.req.query("export") === "true") {
    const { results } = await c.env.DB.prepare(`${baseQuery} LIMIT 5000`).bind(...binds).all();
    return c.json({ rows: results });
  }

  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM case_dvbh c ${whereSql}`)
    .bind(...binds)
    .first<{ total: number }>();
  const { results } = await c.env.DB.prepare(`${baseQuery} LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, offset)
    .all();

  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// GET /api/cases/:id
cases.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "INVALID_ID" }, 400);

  const caseRow = await c.env.DB.prepare("SELECT * FROM case_dvbh WHERE id = ?").bind(id).first();
  if (!caseRow) return c.json({ error: "NOT_FOUND" }, 404);

  const scope = scopeByKhuVuc(c);
  if (scope !== null && !scope.includes(String(caseRow.khu_vuc))) {
    return c.json({ error: "FORBIDDEN_KHU_VUC" }, 403);
  }

  const [giaiTrinhLog, ketQuaGoi, viPham, caLap] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM giai_trinh WHERE case_id = ? ORDER BY ngay_giai_trinh DESC").bind(id).all(),
    c.env.DB.prepare("SELECT * FROM ket_qua_goi WHERE case_id = ? ORDER BY ngay_gio_thuc_hien DESC").bind(id).all(),
    c.env.DB.prepare("SELECT * FROM vi_pham WHERE case_id = ? ORDER BY ngay_ghi_nhan DESC").bind(id).all(),
    getCaLapDetection(c.env.DB, id),
  ]);

  return c.json({
    case: caseRow,
    giaiTrinh: giaiTrinhLog.results,
    ketQuaGoi: ketQuaGoi.results,
    viPham: viPham.results,
    caLap,
  });
});

// POST /api/cases/:id/giai-trinh - append-only, khong bao gio UPDATE/DELETE
cases.post("/:id/giai-trinh", requireRole("Giam sat", "TBP DVBH", "Admin"), async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "INVALID_ID" }, 400);

  const caseRow = await c.env.DB.prepare("SELECT id, khu_vuc, thoi_gian_hoan_thanh FROM case_dvbh WHERE id = ?")
    .bind(id)
    .first<{ id: string; khu_vuc: string | null; thoi_gian_hoan_thanh: string | null }>();
  if (!caseRow) return c.json({ error: "NOT_FOUND" }, 404);
  if (caseRow.thoi_gian_hoan_thanh) return c.json({ error: "CASE_ALREADY_DONE" }, 400);

  const scope = scopeByKhuVuc(c);
  if (scope !== null && !scope.includes(String(caseRow.khu_vuc))) {
    return c.json({ error: "FORBIDDEN_KHU_VUC" }, 403);
  }

  const body = await c.req.json<{
    ly_do_cham: string;
    noi_dung?: string;
    linh_kien_thieu?: string | null;
    ngay_du_kien_hoan_thanh?: string | null;
    ngay_yeu_cau_co_hang?: string | null;
    ma_xuat_hang_lien_quan?: string | null;
  }>();

  if (!body.ly_do_cham) return c.json({ error: "MISSING_LY_DO_CHAM" }, 400);
  if (!body.noi_dung || !body.noi_dung.trim()) return c.json({ error: "MISSING_NOI_DUNG" }, 400);
  if (!body.ngay_du_kien_hoan_thanh) return c.json({ error: "MISSING_NGAY_DU_KIEN" }, 400);

  const lyDo = await c.env.DB.prepare("SELECT ten_ly_do, thuoc_thieu_linh_kien FROM settings_ly_do WHERE ten_ly_do = ? AND bat_tat = 1")
    .bind(body.ly_do_cham)
    .first<{ ten_ly_do: string; thuoc_thieu_linh_kien: number }>();
  if (!lyDo) return c.json({ error: "INVALID_LY_DO_CHAM" }, 400);

  // Ly do thuoc nhom "thieu linh kien" bat buoc ke ca 3 truong con (linh kien / ngay yeu cau co
  // hang / ma xuat hang) - khac cac ly do khac chi bat buoc 3 truong chung o tren.
  if (lyDo.thuoc_thieu_linh_kien) {
    if (!body.linh_kien_thieu) return c.json({ error: "MISSING_LINH_KIEN_THIEU" }, 400);
    if (!body.ngay_yeu_cau_co_hang) return c.json({ error: "MISSING_NGAY_YEU_CAU_CO_HANG" }, 400);
    if (!body.ma_xuat_hang_lien_quan) return c.json({ error: "MISSING_MA_XUAT_HANG" }, 400);
  }

  const user = c.get("user");
  const giaiTrinhId = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO giai_trinh (id, case_id, ly_do_cham, noi_dung, linh_kien_thieu, ngay_du_kien_hoan_thanh,
       ngay_yeu_cau_co_hang, ma_xuat_hang_lien_quan, nguoi_giai_trinh)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      giaiTrinhId,
      id,
      body.ly_do_cham,
      body.noi_dung ?? null,
      lyDo.thuoc_thieu_linh_kien ? body.linh_kien_thieu ?? null : null,
      body.ngay_du_kien_hoan_thanh ?? null,
      body.ngay_yeu_cau_co_hang ?? null,
      body.ma_xuat_hang_lien_quan ?? null,
      user.email,
    )
    .run();

  return c.json({ id: giaiTrinhId }, 201);
});

export default cases;
