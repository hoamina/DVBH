import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { khuVucAdHocClause, REPORT_DIMS, dimAdHocClause } from "../lib/filterParams";
import { CASE_FILTER_DA_DONG_RANGE, latestGiaiTrinhJoin } from "../lib/needGiaiTrinh";
import { cachedReport, buildReportKey } from "../lib/reportCache";

const tranhChap = new Hono<{ Bindings: Env }>();
tranhChap.use("*", verifySessionMiddleware, loadUser);

// Vai tro "KSNB Doi tac" xem TOAN BO tranh chap, khong gioi han khu_vuc - quyet dinh nghiep vu
// rieng cho tinh nang nay (khac scopeByKhuVuc() dung chung, chi tra null cho ROLES_XEM_TOAN_BO).
// KHONG them "KSNB Doi tac" vao ROLES_XEM_TOAN_BO trong types.ts vi hang so do dung o nhieu noi
// khac trong he thong (cac module ma KSNB Doi tac KHONG duoc xem). CHOT 2026-07-24: vai tro nay
// KHONG con duoc "giai trinh" tranh chap nua (xem cases.ts POST /:id/giai-trinh + App.tsx
// canGiaiTrinh) - tranh chap gio CHI tinh tren ca DA DONG nen khai niem "giai trinh ca dang ton
// thuoc tranh chap" khong con y nghia (giai_trinh chi nhan duoc tren ca dang MO), nhung vai tro nay
// VAN giu quyen XEM (chi doc) module nay - chi bo di quyen ghi.
function scopeTranhChap(c: Context<{ Bindings: Env }>): string[] | null {
  const user = c.get("user");
  if (user.vai_tro === "KSNB Doi tac") return null;
  return scopeByKhuVuc(c);
}

// "Thuoc tranh chap" - CHOT 2026-07-24: CHI con 1 nguon duy nhat la case_dvbh.ly_do_qua_han (cot
// import, CRM dien khi DONG ca) thuoc nhom thuoc_tranh_chap=1 trong settings_ly_do - BO HOAN TOAN
// nguon giai_trinh (truoc day ket hop OR voi ly do cham cua giai_trinh moi nhat) vi giai_trinh la 1
// LOG DONG (bat ky vai tro co quyen giai trinh nao cung sua duoc bat ky luc nao), khien danh sach
// tranh chap co the doi ma KHONG can co import CRM moi - trai voi nguyen tac "danh sach chi doi khi
// co import moi" ap dung dong nhat voi module Danh gia nap gas (xem backend/src/routes/napGas.ts).
// Ket hop dieu kien CHI ca DA DONG (Hoan thanh XLSC hoac Khong hoan thanh XLSC - dung 2 gia tri
// tien_do_hoan_thanh "da dong" giong dashboard.ts) - tranh chap khong con khai niem "dang ton" nua.
const TRANH_CHAP_ELIGIBLE = `sld2.id IS NOT NULL AND c.tien_do_hoan_thanh IN ('Hoàn thành XLSC', 'Không hoàn thành XLSC')`;

// lg (latestGiaiTrinhJoin) o day CHI dung de hien thi trang thai "da/chua giai trinh" (co the co tu
// LUC CA CON DANG MO, truoc khi dong) - KHONG con anh huong TRANH_CHAP_ELIGIBLE (xem giai thich o
// tren). "caseFilterSql" gioi han subquery latestGiaiTrinhJoin - dung CASE_FILTER_DA_DONG_RANGE vi
// pham vi cau hoi luon la "ca da dong trong 1 khoang thoi gian", giong nguyen ban truoc day.
function baseJoin(caseFilterSql: string): string {
  return `
  LEFT JOIN settings_ly_do sld2 ON sld2.ten_ly_do = c.ly_do_qua_han AND sld2.thuoc_tranh_chap = 1
  ${latestGiaiTrinhJoin(caseFilterSql)}
`;
}

// "last_ly_do_cham" gio la c.ly_do_qua_han truc tiep (nguon DUY NHAT xac dinh tranh chap) - khong
// con can CASE WHEN uu tien nguon giai_trinh nhu truoc.
const SELECT_COLS = `c.*, c.ly_do_qua_han as last_ly_do_cham,
  CASE WHEN lg.case_id IS NOT NULL THEN 1 ELSE 0 END as da_giai_trinh`;

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

// GET /api/tranh-chap?khu_vuc=&thang=&dim=&dim_value=&trang_thai=&page=&pageSize= - danh sach ca
// tranh chap (xem TRANH_CHAP_ELIGIBLE) DONG trong 1 thang. "trang_thai=da-giai-trinh|chua-giai-trinh"
// loc them theo da/chua tung co giai trinh (log tu luc ca con mo). Tra "chuaGiaiTrinh" (so ca CHUA
// tung giai trinh trong PHAM VI DANG LOC) cho StatCard cua tab "Danh sach chi tiet".
tranhChap.get("/", async (c) => {
  const scope = scopeTranhChap(c);
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const thang = c.req.query("thang") || new Date().toISOString().slice(0, 7);
  const { start, end } = monthBounds(thang);
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const dimClause = dimAdHocClause(`c.${REPORT_DIMS[c.req.query("dim") ?? ""] ?? "khu_vuc"}`, c.req.query("dim"), c.req.query("dim_value"));
  const trangThai = c.req.query("trang_thai");
  const trangThaiClause = trangThai === "da-giai-trinh" ? " AND lg.case_id IS NOT NULL" : trangThai === "chua-giai-trinh" ? " AND lg.case_id IS NULL" : "";

  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  const query = `
    SELECT ${SELECT_COLS}
    FROM case_dvbh c
    ${baseJoin(CASE_FILTER_DA_DONG_RANGE)}
    WHERE ${TRANH_CHAP_ELIGIBLE} AND c.thoi_gian_hoan_thanh >= ? AND c.thoi_gian_hoan_thanh < ?${scopeClause.sql}${khuVucClause.sql}${dimClause.sql}${trangThaiClause}
  `;
  // CASE_FILTER_DA_DONG_RANGE (trong latestGiaiTrinhJoin, qua baseJoin) co 2 bind (start, end) nam
  // TRUOC 2 bind (start, end) cua WHERE ngoai trong chuoi SQL cuoi cung - bind (start, end) 2 lan
  // lien tiep.
  const binds = [start, end, start, end, ...scopeClause.binds, ...khuVucClause.binds, ...dimClause.binds];

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM (${query})`)
    .bind(...binds)
    .first<{ total: number }>();
  const chuaGiaiTrinhRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM (${query}) WHERE da_giai_trinh = 0`)
    .bind(...binds)
    .first<{ total: number }>();
  const { results } = await c.env.DB.prepare(`${query} ORDER BY c.thoi_gian_hoan_thanh DESC LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, offset)
    .all();

  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0, chuaGiaiTrinh: chuaGiaiTrinhRow?.total ?? 0, thang });
});

export interface TranhChapByKhuVucParams {
  dim?: string;
  khu_vuc?: string;
  thang?: string;
  [key: string]: string | undefined;
}

/** Tach tu tranhChap.get("/by-khu-vuc") - xem chu thich route ben duoi. "dim" da qua whitelist
 * REPORT_DIMS o route (tra 400 NGOAI cache) truoc khi toi day. */
export async function computeTranhChapByKhuVuc(db: D1Database, params: TranhChapByKhuVucParams, scope: string[] | null) {
  const dimColRaw = REPORT_DIMS[params.dim ?? "khu_vuc"] ?? "khu_vuc";
  const dimCol = `c.${dimColRaw}`;
  const thang = params.thang || new Date().toISOString().slice(0, 7);
  const { start, end } = monthBounds(thang);

  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", params.khu_vuc);

  const { results } = await db
    .prepare(
      `SELECT ${dimCol} as nhom,
         COUNT(*) as tong,
         SUM(CASE WHEN lg.case_id IS NOT NULL THEN 1 ELSE 0 END) as da_giai_trinh,
         SUM(CASE WHEN lg.case_id IS NULL THEN 1 ELSE 0 END) as chua_giai_trinh
       FROM case_dvbh c
       ${baseJoin(CASE_FILTER_DA_DONG_RANGE)}
       WHERE ${TRANH_CHAP_ELIGIBLE} AND c.thoi_gian_hoan_thanh >= ? AND c.thoi_gian_hoan_thanh < ? AND ${dimCol} IS NOT NULL${scopeClause.sql}${khuVucClause.sql}
       GROUP BY ${dimCol}
       ORDER BY tong DESC`,
    )
    .bind(start, end, start, end, ...scopeClause.binds, ...khuVucClause.binds)
    .all();

  return { rows: results, thang };
}

// GET /api/tranh-chap/by-khu-vuc?dim=&khu_vuc=&thang= - bao cao ca tranh chap DA DONG trong 1
// thang, nhom theo 1 cot bat ky trong REPORT_DIMS (mac dinh khu_vuc). Boc qua cachedReport (xem
// lib/reportCache.ts) - domain "cases"+"giai_trinh"+"settings" (giai_trinh anh huong cot
// da_giai_trinh/chua_giai_trinh, settings anh huong TRANH_CHAP_ELIGIBLE qua thuoc_tranh_chap).
tranhChap.get("/by-khu-vuc", async (c) => {
  const dimKey = c.req.query("dim") ?? "khu_vuc";
  if (!REPORT_DIMS[dimKey]) return c.json({ error: "INVALID_DIM" }, 400);

  const scope = scopeTranhChap(c);
  const params: TranhChapByKhuVucParams = { dim: dimKey, khu_vuc: c.req.query("khu_vuc"), thang: c.req.query("thang") };
  const key = buildReportKey("tranh-chap/by-khu-vuc", params, scope);
  const data = await cachedReport(c.env.DB, key, ["cases", "giai_trinh", "settings"], () => computeTranhChapByKhuVuc(c.env.DB, params, scope));
  return c.json(data);
});

export default tranhChap;
