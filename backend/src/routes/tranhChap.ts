import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { khuVucAdHocClause, khuVucReportExclusionClause, multiValueAdHocClause } from "../lib/filterParams";
import { cachedReport, buildReportKey } from "../lib/reportCache";
import { nextSequentialId, reserveSequentialIds } from "../lib/idCounter";
import { nowVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";
import { AGE_ANCHOR } from "../lib/ageCalc";
import { runBatched } from "../lib/backfillImportProcessor";
import { csvTemplateResponse } from "../lib/csvTemplate";
import {
  ALL_TRANG_THAI_LOG,
  GIAM_SAT_STATUSES,
  CSKH_STATUSES,
  TRANH_CHAP_TRANG_THAI_DONG,
  TRANG_THAI_CAN_KET_QUA,
  KSNB_WATCH_STATUSES,
  MUC_DO_VALUES,
  HAI_LONG_VALUES,
  CASE_TRANH_CHAP_STATUS_EXPR,
  TUOI_TIEN_TRINH_EXPR,
  latestLogStatusOfTienTrinh,
  phaseOfStatus,
  canWriteTranhChap,
  canEditTienTrinhMeta,
  canWriteCskhPhase,
  canConfirmAiTranhChap,
  loadGiamSatByKhuVucMap,
  loadGiamSatHistoryByCaseIds,
  IS_GQKN_DAY_LAI_GS_EXPR,
  isTrangThaiDangMo,
  nowUtcSqlite,
  type GiamSatInfo,
} from "../lib/tranhChapTienTrinh";

const tranhChap = new Hono<{ Bindings: Env }>();
tranhChap.use("*", verifySessionMiddleware, loadUser);

// Nguoi dung co co "la_ksnb_doi_tac" (xem types.ts + migration 0035) xem TOAN BO tranh chap,
// khong gioi han khu_vuc - quyet dinh nghiep vu rieng cho tinh nang nay (khac scopeByKhuVuc() dung
// chung, chi tra null cho ROLES_XEM_TOAN_BO). CHOT 2026-07-29: dung co rieng nay THAY THE hoan toan
// kiem tra "vai_tro === 'KSNB Doi tac'" cu - vai tro do KHONG the gan duoc trong CHECK cua bang
// users (xem canh bao dai trong migration 0023_tranh_chap.sql: mo rong CHECK doi hoi recreate ca
// chuoi ~13 bang co FK toi users, ke ca case_dvbh - qua rui ro cho production), nen nguoi lam KSNB
// Doi tac trong thuc te van giu 1 vai_tro hop le khac (vd Viewer) + duoc bat co nay.
function scopeTranhChap(c: Context<{ Bindings: Env }>): string[] | null {
  const user = c.get("user");
  if (user.la_ksnb_doi_tac) return null;
  return scopeByKhuVuc(c);
}

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

// CHOT 2026-08-20: them dieu kien "la_ksnb_doi_tac = 1" - truoc chi liet ke theo vai_tro (Giam sat/
// TBP DVBH/QC) nen bi THIEU nguoi lam KSNB Doi tac (co la_ksnb_doi_tac nhung vai_tro thuc te la vai
// tro khac, vd Viewer - xem chu thich scopeTranhChap() dau file) khoi danh sach "Dang cho nguoi xu
// ly" - trong khi KSNB chinh la nguoi thuong duoc chon o day khi ban giao/chuyen tiep giai doan CSKH.
tranhChap.get("/handling-users", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT email, ten, vai_tro FROM users WHERE trang_thai_duyet = 'Da duyet' AND bi_khoa = 0 AND (vai_tro IN ('Giam sat', 'TBP DVBH', 'QC') OR la_ksnb_doi_tac = 1) ORDER BY ten"
  ).all();
  return c.json({ rows: results });
});

tranhChap.get("/tai-khoan-ton", async (c) => {
  const scope = scopeTranhChap(c);
  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const scopeClauseC = {
    sql: scopeClauseBase.sql + exclusion.sql + khuVucClause.sql,
    binds: [...scopeClauseBase.binds, ...exclusion.binds, ...khuVucClause.binds]
  };

  const thang = c.req.query("thang");
  let dateClause = "";
  const binds = [...scopeClauseC.binds];
  if (thang) {
    dateClause = " AND strftime('%Y-%m', tt.ngay_tao) = ?";
    binds.push(thang);
  }
  // "phan_loai" - them cho tab "Dòi doi may" (CHOT 2026-08-21), loc them theo phan_loai_tranh_chap
  // khi truyen (khong anh huong hanh vi cu khi bo trong).
  const phanLoaiParam = c.req.query("phan_loai");
  let phanLoaiClause = "";
  if (phanLoaiParam) {
    phanLoaiClause = " AND tt.phan_loai_tranh_chap = ?";
    binds.push(phanLoaiParam);
  }

  // CHOT 2026-08-22: doc tt.trang_thai_hien_tai/nguoi_xu_ly_hien_tai/dang_cho_nguoi_xu_ly_hien_tai
  // (migration 0098) thay vi JOIN tranh_chap_log - "tt.dang_mo = 1" loc SOM qua partial index
  // idx_tctt_dang_mo, tuong duong dieu kien "trang_thai NOT IN (...)" cu nhung tranh quet toan bo
  // lich su log.
  const { results } = await c.env.DB.prepare(
    `WITH active_latest_logs AS (
      SELECT
        tt.trang_thai_hien_tai as trang_thai_xu_ly,
        tt.nguoi_xu_ly_hien_tai as nguoi_xu_ly,
        tt.dang_cho_nguoi_xu_ly_hien_tai as dang_cho_nguoi_xu_ly
      FROM tranh_chap_tien_trinh tt
      CROSS JOIN case_dvbh c ON c.id = tt.case_id
      WHERE tt.dang_mo = 1
        AND c.archived_at IS NULL AND c.huy_bo_at IS NULL
        ${scopeClauseC.sql}
        ${dateClause}
        ${phanLoaiClause}
    )
    SELECT
      u.email,
      u.ten,
      u.vai_tro,
      SUM(CASE WHEN l.trang_thai_xu_ly IN ('Giam sat chua xu ly', 'Giam sat dang xu ly', 'CSKH dang xu ly') AND l.nguoi_xu_ly = u.email THEN 1 ELSE 0 END) as chua_xong_count,
      SUM(CASE WHEN l.dang_cho_nguoi_xu_ly = u.email THEN 1 ELSE 0 END) as duoc_nhac_ten_count
    FROM users u
    JOIN active_latest_logs l ON (l.nguoi_xu_ly = u.email OR l.dang_cho_nguoi_xu_ly = u.email)
    WHERE u.trang_thai_duyet = 'Da duyet' AND u.bi_khoa = 0
    GROUP BY u.email, u.ten, u.vai_tro
    HAVING chua_xong_count > 0 OR duoc_nhac_ten_count > 0
    ORDER BY u.ten`
  )
    .bind(...binds)
    .all();

  return c.json({ rows: results });
});


// "Thuoc tranh chap" - CHOT 2026-07-29: doc truc tiep cot case_dvbh.nghi_ngo_tranh_chap (cot import,
// CRM dien khi DONG ca, ratchet 1 chieu giong nghi_ngo_nap_gas - xem VIOLATION_FIELDS trong
// lib/ratchet.ts va migration 0034_nghi_ngo_tranh_chap.sql). Van giu dieu kien CHI ca DA DONG
// (Hoan thanh XLSC hoac Khong hoan thanh XLSC - dung 2 gia tri tien_do_hoan_thanh "da dong" giong
// dashboard.ts) - tranh chap khong co khai niem "dang ton".
//
// CHOT 2026-07-29 (cau hoi F): TOAN BO khai niem cu "da giai trinh / chua giai trinh" (dua vao bang
// giai_trinh, chi co y nghia khi ca con dang MO) da bi THAY THE HOAN TOAN boi khai niem tien trinh
// xu ly tranh chap moi (tranh_chap_tien_trinh/tranh_chap_log, ben duoi) - da XOA GET / va GET
// /by-khu-vuc cu (tung tra "chuaGiaiTrinh"/bao cao theo da_giai_trinh) cung cac ham/hang so chi
// phuc vu rieng 2 route do (baseJoin, SELECT_COLS, monthBounds, computeTranhChapByKhuVuc).
const TRANH_CHAP_ELIGIBLE = `c.nghi_ngo_tranh_chap = 1 AND c.tien_do_hoan_thanh IN ('Hoàn thành XLSC', 'Không hoàn thành XLSC')`;

// CHOT 2026-08-20: "nghi_ngo_tranh_chap = 2" = AI phat hien, DANG CHO xac nhan thu cong (khac "= 1" la
// DA XAC NHAN, hoac tu CRM that hoac sau khi qua buoc xac nhan nay) - xem ratchetNghiNgoTranhChap()
// trong lib/ratchet.ts va migration 0096. Dieu kien "da dong" giong het TRANH_CHAP_ELIGIBLE.
const TRANH_CHAP_AI_CHO_XAC_NHAN = `c.nghi_ngo_tranh_chap = 2 AND c.tien_do_hoan_thanh IN ('Hoàn thành XLSC', 'Không hoàn thành XLSC')`;

// CHOT 2026-08-21: tab rieng "Đòi đổi máy" trong module Tranh chap - loc theo dung 1 gia tri
// settings_phan_loai_tranh_chap.ten_phan_loai (id=5, da co san tu 2026-07-31). Gia tri la text tu do
// Admin sua duoc trong Cai dat (khong phai enum CHECK) - neu Admin doi ten trong tuong lai, hang so
// nay PHAI duoc cap nhat theo, giong het cach cac gia tri trang_thai_xu_ly/ket_qua_xu_ly khac dang
// duoc so sanh truc tiep bang chuoi trong file nay.
const DOI_MAY_PHAN_LOAI = "KH đòi đổi máy";

// ============================================================
// "Quan ly tranh chap" - tien trinh xu ly + log (them 2026-07-29, xem migration
// 0035_tranh_chap_tien_trinh.sql + lib/tranhChapTienTrinh.ts). 2 danh sach:
//  1) GET /cho-xu-ly - ca DU DIEU KIEN (TRANH_CHAP_ELIGIBLE) nhung CHUA TUNG co tien trinh nao.
//  2) GET /tien-trinh (+ /tien-trinh/stats, /tien-trinh/:id) - quan ly tien trinh da tao, xem/ghi log.
// ============================================================

/** Ngay hom sau (chi lay ngay, khong gio), theo gio VN - dung lam goi y mac dinh "ngay du kien xu
 * ly xong" cho log dau tien khi CHUA co log nao truoc do de tham chieu (chot cau hoi E). */
function nextDayVN(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// GET /api/tranh-chap/cho-xu-ly?khu_vuc=&page=&pageSize= - ca thuoc tranh chap (dong, xem
// TRANH_CHAP_ELIGIBLE) nhung CHUA TUNG tao tien trinh xu ly nao. Sap theo thoi_gian_hoan_thanh tang
// dan (cho LAU NHAT len dau) - dung nghia "uu tien xu ly ca cho lau". Tra kem 4 nguong StatCard
// (cho >=3/7/10/14 ngay, CHOT 2026-08-06 - truoc la ">" nay doi thanh ">=" + them 2 nguong 10/14) tinh
// tren CUNG dieu kien loc dang ap dung (khong phai toan bo).
tranhChap.get("/cho-xu-ly", async (c) => {
  const scope = scopeTranhChap(c);
  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClause = { sql: scopeClauseBase.sql + exclusion.sql, binds: [...scopeClauseBase.binds, ...exclusion.binds] };
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  // CHOT 2026-08-20: bo loc "tinh" (chon nhieu tinh cung luc, chi luu localStorage phia client - xem
  // TranhChapModule.tsx) - hanh vi giong khuVucClause: anh huong CA StatCard/bucket (baseWhereSql) lan
  // danh sach, khong phai loc rieng danh sach nhu id/min_days.
  const tinhClause = multiValueAdHocClause("c.tinh", c.req.query("tinh"));
  // CHOT 2026-08-20: them "Nhom KH" (chon nhieu, giong "tinh" o tren) - mirror pattern cua BacklogModule.
  const nhomKhClause = multiValueAdHocClause("c.nhom_kh", c.req.query("nhom_kh"));
  const monthParam = c.req.query("thang");
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  let monthClauseSql = "";
  const monthBinds: unknown[] = [];
  if (monthParam) {
    const { start, end } = monthBounds(monthParam);
    monthClauseSql = " AND c.thoi_gian_hoan_thanh >= ? AND c.thoi_gian_hoan_thanh < ?";
    monthBinds.push(start, end);
  }

  const minDaysParam = c.req.query("min_days");
  let minDaysClauseSql = "";
  if (minDaysParam) {
    const minDays = Number(minDaysParam);
    if (!isNaN(minDays)) {
      minDaysClauseSql = ` AND CAST((julianday(${AGE_ANCHOR}) - julianday(c.thoi_gian_hoan_thanh)) AS INTEGER) >= ${minDays}`;
    }
  }

  // CHOT 2026-08-12: o tim ID/Serial rieng cho danh sach "Cho xu ly" (giong pattern idClause cua
  // cases.ts GET "/") - khop CA id lan seri_san_pham. Khong anh huong "unfilteredTotal"/bucketRow
  // (van tinh tren baseWhereSql, KHONG gom idClause) - cac so KPI dau trang van phan anh dung TOAN
  // BO hang doi, chi rieng danh sach ben duoi bi loc theo o tim kiem.
  const idFilter = (c.req.query("id") ?? "").trim();
  const idClauseSql = idFilter ? " AND (c.id LIKE ? OR c.seri_san_pham LIKE ?)" : "";
  const idBinds = idFilter ? [`%${idFilter}%`, `%${idFilter}%`] : [];

  // CHOT 2026-08-20: gom them ca "GQKN day lai GS" (${IS_GQKN_DAY_LAI_GS_EXPR}, DA CO tien trinh -
  // khac phan con lai cua danh sach nay la ca CHUA TUNG co tien trinh nao) - fix mismatch phat hien
  // thuc te: bao-cao-khu-vuc.count_chua_xu_ly da cong nhom ca nay vao nhung danh sach chi tiet o day
  // (cung tab "Cho xu ly") lai khong hien, gay lech so lieu StatCard vs bang chi tiet.
  const baseWhereSql = `(${TRANH_CHAP_ELIGIBLE} AND NOT EXISTS (SELECT 1 FROM tranh_chap_tien_trinh tt WHERE tt.case_id = c.id) OR ${IS_GQKN_DAY_LAI_GS_EXPR})${scopeClause.sql}${khuVucClause.sql}${tinhClause.sql}${nhomKhClause.sql}${monthClauseSql}`;
  const listWhereSql = `${baseWhereSql}${minDaysClauseSql}${idClauseSql}`;
  const binds = [...scopeClause.binds, ...khuVucClause.binds, ...tinhClause.binds, ...nhomKhClause.binds, ...monthBinds];
  const listBinds = [...binds, ...idBinds];
  const ageColExpr = `CAST((julianday(${AGE_ANCHOR}) - julianday(c.thoi_gian_hoan_thanh)) AS INTEGER)`;


  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM case_dvbh c WHERE ${listWhereSql}`)
    .bind(...listBinds)
    .first<{ total: number }>();
  const baseCountRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM case_dvbh c WHERE ${baseWhereSql}`)
    .bind(...binds)
    .first<{ total: number }>();
  const bucketRow = await c.env.DB.prepare(
    `SELECT
       SUM(CASE WHEN ${ageColExpr} >= 3 THEN 1 ELSE 0 END) as cho_tu_3_ngay,
       SUM(CASE WHEN ${ageColExpr} >= 7 THEN 1 ELSE 0 END) as cho_tu_7_ngay,
       SUM(CASE WHEN ${ageColExpr} >= 10 THEN 1 ELSE 0 END) as cho_tu_10_ngay,
       SUM(CASE WHEN ${ageColExpr} >= 14 THEN 1 ELSE 0 END) as cho_tu_14_ngay
     FROM case_dvbh c WHERE ${baseWhereSql}`,
  )
    .bind(...binds)
    .first<{ cho_tu_3_ngay: number; cho_tu_7_ngay: number; cho_tu_10_ngay: number; cho_tu_14_ngay: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.khach_hang, c.khu_vuc, c.nhom_kh, c.thoi_gian_hoan_thanh, c.ly_do_qua_han as last_ly_do_cham,
       ${ageColExpr} as so_ngay_cho, ${IS_GQKN_DAY_LAI_GS_EXPR} as is_gqkn_day_lai_gs
     FROM case_dvbh c WHERE ${listWhereSql}
     ORDER BY (CASE WHEN c.nhom_kh LIKE '%VIP%' THEN 0 ELSE 1 END), c.thoi_gian_hoan_thanh ASC
     LIMIT ? OFFSET ?`,
  )
    .bind(...listBinds, pageSize, offset)
    .all();

  return c.json({
    rows: results,
    page,
    pageSize,
    total: countRow?.total ?? 0,
    unfilteredTotal: baseCountRow?.total ?? 0,
    choTuNgay3: bucketRow?.cho_tu_3_ngay ?? 0,
    choTuNgay7: bucketRow?.cho_tu_7_ngay ?? 0,
    choTuNgay10: bucketRow?.cho_tu_10_ngay ?? 0,
    choTuNgay14: bucketRow?.cho_tu_14_ngay ?? 0,
  });
});

// GET /api/tranh-chap/cho-xac-nhan-ai?khu_vuc=&tinh=&nhom_kh=&thang=&id=&page=&pageSize= - ca AI phat
// hien (TRANH_CHAP_AI_CHO_XAC_NHAN, nghi_ngo_tranh_chap = 2) CHUA TUNG co tien trinh - can nguoi co
// canConfirmAiTranhChap() xac nhan "Dung la tranh chap" (-> 1, roi rot qua GET /cho-xu-ly binh
// thuong) hoac "Khong phai tranh chap" (-> 3, khoa vinh vien - xem POST /:caseId/xac-nhan-ai). Cung
// mirror shape voi GET /cho-xu-ly (khong ho tro min_days rieng - danh sach nay khong dung khai niem
// "cho >=X ngay" cua workflow xu ly, chi can tong so + phan trang).
tranhChap.get("/cho-xac-nhan-ai", async (c) => {
  const scope = scopeTranhChap(c);
  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClause = { sql: scopeClauseBase.sql + exclusion.sql, binds: [...scopeClauseBase.binds, ...exclusion.binds] };
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const tinhClause = multiValueAdHocClause("c.tinh", c.req.query("tinh"));
  const nhomKhClause = multiValueAdHocClause("c.nhom_kh", c.req.query("nhom_kh"));
  const monthParam = c.req.query("thang");
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  let monthClauseSql = "";
  const monthBinds: unknown[] = [];
  if (monthParam) {
    const { start, end } = monthBounds(monthParam);
    monthClauseSql = " AND c.thoi_gian_hoan_thanh >= ? AND c.thoi_gian_hoan_thanh < ?";
    monthBinds.push(start, end);
  }

  const idFilter = (c.req.query("id") ?? "").trim();
  const idClauseSql = idFilter ? " AND (c.id LIKE ? OR c.seri_san_pham LIKE ?)" : "";
  const idBinds = idFilter ? [`%${idFilter}%`, `%${idFilter}%`] : [];

  const baseWhereSql = `${TRANH_CHAP_AI_CHO_XAC_NHAN} AND NOT EXISTS (SELECT 1 FROM tranh_chap_tien_trinh tt WHERE tt.case_id = c.id)${scopeClause.sql}${khuVucClause.sql}${tinhClause.sql}${nhomKhClause.sql}${monthClauseSql}`;
  const listWhereSql = `${baseWhereSql}${idClauseSql}`;
  const binds = [...scopeClause.binds, ...khuVucClause.binds, ...tinhClause.binds, ...nhomKhClause.binds, ...monthBinds];
  const listBinds = [...binds, ...idBinds];
  const ageColExpr = `CAST((julianday(${AGE_ANCHOR}) - julianday(c.thoi_gian_hoan_thanh)) AS INTEGER)`;

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM case_dvbh c WHERE ${listWhereSql}`)
    .bind(...listBinds)
    .first<{ total: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.khach_hang, c.khu_vuc, c.nhom_kh, c.thoi_gian_hoan_thanh, c.ly_do_qua_han as last_ly_do_cham,
       ${ageColExpr} as so_ngay_cho
     FROM case_dvbh c WHERE ${listWhereSql}
     ORDER BY (CASE WHEN c.nhom_kh LIKE '%VIP%' THEN 0 ELSE 1 END), c.thoi_gian_hoan_thanh ASC
     LIMIT ? OFFSET ?`,
  )
    .bind(...listBinds, pageSize, offset)
    .all();

  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

/** Tach tu tranhChap.get("/cho-xac-nhan-ai/count") - dung cho badge do tren tab "Cho xac nhan AI"
 * (CHOT 2026-08-22). CUNG dieu kien WHERE voi GET /cho-xac-nhan-ai (khong loc khu_vuc/tinh/nhom_kh/
 * thang/id rieng - la TONG so ca cho xac nhan trong pham vi scope cua user) - nghi_ngo_tranh_chap = 2
 * la dieu kien loc dau tien nen SQLite dung duoc idx_case_nghi_ngo_tranh_chap_2 (migration 0096, index
 * rieng cho dung gia tri = 2) de tim ung vien TRUOC khi loc tiep cac dieu kien con lai - khong quet
 * toan bo case_dvbh. Boc cachedReport (giong moi endpoint dem/thong ke khac) de cac lan mo module sau
 * khong phai tinh lai neu du lieu chua doi. */
async function computeChoXacNhanAiCount(db: D1Database, scope: string[] | null): Promise<number> {
  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClause = { sql: scopeClauseBase.sql + exclusion.sql, binds: [...scopeClauseBase.binds, ...exclusion.binds] };
  const row = await db
    .prepare(
      `SELECT COUNT(*) as n FROM case_dvbh c
       WHERE ${TRANH_CHAP_AI_CHO_XAC_NHAN} AND NOT EXISTS (SELECT 1 FROM tranh_chap_tien_trinh tt WHERE tt.case_id = c.id)${scopeClause.sql}`,
    )
    .bind(...scopeClause.binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

tranhChap.get("/cho-xac-nhan-ai/count", async (c) => {
  const scope = scopeTranhChap(c);
  const key = buildReportKey("tranh-chap/cho-xac-nhan-ai/count", {}, scope);
  const count = await cachedReport(c.env.DB, key, ["cases", "tranh_chap"], () => computeChoXacNhanAiCount(c.env.DB, scope));
  return c.json({ count });
});

// POST /api/tranh-chap/:caseId/xac-nhan-ai - xac nhan 1 ca AI phat hien (nghi_ngo_tranh_chap = 2).
// "dung" -> 1 (tham gia ratchet 1 chieu nhu tranh chap xac nhan that, roi xuat hien o GET /cho-xu-ly
// binh thuong). "khong_phai" -> 3 (khoa vinh vien - CHOT 2026-08-20: khong bao gio hoi lai du AI phat
// hien lai nhieu lan, tranh nag lap lai 1 quyet dinh da xac nhan sai). Dieu kien WHERE ...= 2 trong
// UPDATE la optimistic-concurrency: neu ca vua bi xac nhan boi nguoi khac giua luc load va luc bam nut,
// UPDATE se khong doi dong nao, tra ALREADY_CONFIRMED thay vi ghi de am tham.
tranhChap.post("/:caseId/xac-nhan-ai", async (c) => {
  const caseId = c.req.param("caseId");
  const body = await c.req.json<{ ket_qua?: string }>();
  if (body.ket_qua !== "dung" && body.ket_qua !== "khong_phai") return c.json({ error: "INVALID_KET_QUA" }, 400);

  const caseRow = await c.env.DB.prepare("SELECT khu_vuc, nghi_ngo_tranh_chap FROM case_dvbh WHERE id = ?")
    .bind(caseId)
    .first<{ khu_vuc: string | null; nghi_ngo_tranh_chap: number }>();
  if (!caseRow) return c.json({ error: "CASE_NOT_FOUND" }, 404);
  if (caseRow.nghi_ngo_tranh_chap !== 2) return c.json({ error: "KHONG_PHAI_CHO_XAC_NHAN" }, 409);
  if (!canConfirmAiTranhChap(c, caseRow.khu_vuc)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);

  const user = c.get("user");
  const nextValue = body.ket_qua === "dung" ? 1 : 3;
  const result = await c.env.DB.prepare(
    "UPDATE case_dvbh SET nghi_ngo_tranh_chap = ?, nghi_ngo_tranh_chap_xac_nhan_boi = ?, nghi_ngo_tranh_chap_xac_nhan_luc = ? WHERE id = ? AND nghi_ngo_tranh_chap = 2",
  )
    .bind(nextValue, user.email, nowVN(), caseId)
    .run();
  if ((result.meta.changes ?? 0) === 0) return c.json({ error: "ALREADY_CONFIRMED" }, 409);

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["tranh_chap"]));
  return c.json({ ok: true, ket_qua: body.ket_qua });
});

// ============================================================
// "Theo doi doi tra" (tab moi, CHOT 2026-09-03) - case_dvbh.theo_doi_doi_tra tinh TU DONG tai import
// (xem lib/theoDoiDoiTra.ts + migration 0104), KHONG can dieu kien "da dong" nao khac (khac
// TRANH_CHAP_ELIGIBLE/TRANH_CHAP_AI_CHO_XAC_NHAN o tren - chi dung dung 2 dieu kien nguoi dung yeu
// cau). Sau khi xac nhan "dung" (-> 1), case hien trong bang "Da xac nhan" cua tab nay va van dung
// NGUYEN quy trinh "Tiep nhan" hien co (POST /:caseId/tiep-nhan, khong rang buoc nghi_ngo_tranh_chap)
// de tao tien trinh xu ly - KHONG tao duong rieng, dung y nghia "xu ly nhu 1 khieu nai binh thuong".
// ============================================================
const THEO_DOI_DOI_TRA_CHO_DANH_GIA = `c.theo_doi_doi_tra = 2`;
const THEO_DOI_DOI_TRA_DA_XAC_NHAN = `c.theo_doi_doi_tra = 1`;

// GET /api/tranh-chap/theo-doi-doi-tra/cho-danh-gia?khu_vuc=&tinh=&nhom_kh=&thang=&id=&page=&pageSize=
// - danh sach case KHOP dieu kien tu dong (theo_doi_doi_tra = 2), dang cho con nguoi xac nhan "Dung"/
// "Bo qua". Mirror shape voi GET /cho-xac-nhan-ai.
tranhChap.get("/theo-doi-doi-tra/cho-danh-gia", async (c) => {
  const scope = scopeTranhChap(c);
  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClause = { sql: scopeClauseBase.sql + exclusion.sql, binds: [...scopeClauseBase.binds, ...exclusion.binds] };
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const tinhClause = multiValueAdHocClause("c.tinh", c.req.query("tinh"));
  const nhomKhClause = multiValueAdHocClause("c.nhom_kh", c.req.query("nhom_kh"));
  const monthParam = c.req.query("thang");
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  let monthClauseSql = "";
  const monthBinds: unknown[] = [];
  if (monthParam) {
    const { start, end } = monthBounds(monthParam);
    monthClauseSql = " AND c.thoi_gian_hoan_thanh >= ? AND c.thoi_gian_hoan_thanh < ?";
    monthBinds.push(start, end);
  }

  const idFilter = (c.req.query("id") ?? "").trim();
  const idClauseSql = idFilter ? " AND (c.id LIKE ? OR c.seri_san_pham LIKE ?)" : "";
  const idBinds = idFilter ? [`%${idFilter}%`, `%${idFilter}%`] : [];

  const baseWhereSql = `${THEO_DOI_DOI_TRA_CHO_DANH_GIA}${scopeClause.sql}${khuVucClause.sql}${tinhClause.sql}${nhomKhClause.sql}${monthClauseSql}`;
  const listWhereSql = `${baseWhereSql}${idClauseSql}`;
  const binds = [...scopeClause.binds, ...khuVucClause.binds, ...tinhClause.binds, ...nhomKhClause.binds, ...monthBinds];
  const listBinds = [...binds, ...idBinds];

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM case_dvbh c WHERE ${listWhereSql}`)
    .bind(...listBinds)
    .first<{ total: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.khach_hang, c.khu_vuc, c.nhom_kh, c.thoi_gian_hoan_thanh, c.loai_yeu_cau, c.luu_y_loi_linh_kien
     FROM case_dvbh c WHERE ${listWhereSql}
     ORDER BY (CASE WHEN c.nhom_kh LIKE '%VIP%' THEN 0 ELSE 1 END), c.thoi_gian_hoan_thanh DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...listBinds, pageSize, offset)
    .all();

  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

/** Dung cho badge "(x)" tren tab "Theo doi doi tra" - mirror computeChoXacNhanAiCount(). */
async function computeTheoDoiDoiTraChoDanhGiaCount(db: D1Database, scope: string[] | null): Promise<number> {
  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClause = { sql: scopeClauseBase.sql + exclusion.sql, binds: [...scopeClauseBase.binds, ...exclusion.binds] };
  const row = await db
    .prepare(`SELECT COUNT(*) as n FROM case_dvbh c WHERE ${THEO_DOI_DOI_TRA_CHO_DANH_GIA}${scopeClause.sql}`)
    .bind(...scopeClause.binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

tranhChap.get("/theo-doi-doi-tra/cho-danh-gia/count", async (c) => {
  const scope = scopeTranhChap(c);
  const key = buildReportKey("tranh-chap/theo-doi-doi-tra/cho-danh-gia/count", {}, scope);
  const count = await cachedReport(c.env.DB, key, ["cases", "tranh_chap"], () => computeTheoDoiDoiTraChoDanhGiaCount(c.env.DB, scope));
  return c.json({ count });
});

// POST /api/tranh-chap/:caseId/xac-nhan-doi-tra - xac nhan/bo qua 1 ca khop dieu kien tu dong
// (theo_doi_doi_tra = 2). "dung" -> 1 (khoa, hien trong bang "Da xac nhan" - van dung nguyen quy
// trinh "Tiep nhan" hien co de tao tien trinh, KHONG tu dong tao tien trinh o day). "khong_phai" -> 3
// (khoa vinh vien, khong bao gio tu dong danh gia lai). Dieu kien WHERE ...=2 trong UPDATE la
// optimistic-concurrency, mirror POST /:caseId/xac-nhan-ai.
tranhChap.post("/:caseId/xac-nhan-doi-tra", async (c) => {
  const caseId = c.req.param("caseId");
  const body = await c.req.json<{ ket_qua?: string }>();
  if (body.ket_qua !== "dung" && body.ket_qua !== "khong_phai") return c.json({ error: "INVALID_KET_QUA" }, 400);

  const caseRow = await c.env.DB.prepare("SELECT khu_vuc, theo_doi_doi_tra FROM case_dvbh WHERE id = ?")
    .bind(caseId)
    .first<{ khu_vuc: string | null; theo_doi_doi_tra: number }>();
  if (!caseRow) return c.json({ error: "CASE_NOT_FOUND" }, 404);
  if (caseRow.theo_doi_doi_tra !== 2) return c.json({ error: "KHONG_PHAI_CHO_DANH_GIA" }, 409);
  if (!canConfirmAiTranhChap(c, caseRow.khu_vuc)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);

  const user = c.get("user");
  const nextValue = body.ket_qua === "dung" ? 1 : 3;
  const result = await c.env.DB.prepare(
    "UPDATE case_dvbh SET theo_doi_doi_tra = ?, theo_doi_doi_tra_xac_nhan_boi = ?, theo_doi_doi_tra_xac_nhan_luc = ? WHERE id = ? AND theo_doi_doi_tra = 2",
  )
    .bind(nextValue, user.email, nowVN(), caseId)
    .run();
  if ((result.meta.changes ?? 0) === 0) return c.json({ error: "ALREADY_CONFIRMED" }, 409);

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["tranh_chap"]));
  return c.json({ ok: true, ket_qua: body.ket_qua });
});

/** Danh sach DISTINCT thang (YYYY-MM, theo thoi_gian_hoan_thanh) cua cac ca DA xac nhan
 * (theo_doi_doi_tra = 1) - dung de chia nho bang theo thang o frontend (moi thang 1 bang rieng, theo
 * yeu cau nguoi dung). */
async function computeThangListDaXacNhanDoiTra(db: D1Database, scope: string[] | null): Promise<string[]> {
  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClause = { sql: scopeClauseBase.sql + exclusion.sql, binds: [...scopeClauseBase.binds, ...exclusion.binds] };
  const { results } = await db
    .prepare(
      `SELECT DISTINCT strftime('%Y-%m', c.thoi_gian_hoan_thanh) as thang FROM case_dvbh c
       WHERE ${THEO_DOI_DOI_TRA_DA_XAC_NHAN} AND c.thoi_gian_hoan_thanh IS NOT NULL${scopeClause.sql}
       ORDER BY thang DESC`,
    )
    .bind(...scopeClause.binds)
    .all<{ thang: string }>();
  return results.map((r) => r.thang);
}

tranhChap.get("/theo-doi-doi-tra/da-xac-nhan/thang-list", async (c) => {
  const scope = scopeTranhChap(c);
  const key = buildReportKey("tranh-chap/theo-doi-doi-tra/da-xac-nhan/thang-list", {}, scope);
  const rows = await cachedReport(c.env.DB, key, ["cases", "tranh_chap"], () => computeThangListDaXacNhanDoiTra(c.env.DB, scope));
  return c.json({ rows });
});

// GET /api/tranh-chap/theo-doi-doi-tra/da-xac-nhan?thang=YYYY-MM&khu_vuc=&tinh=&nhom_kh=&id=&page=&pageSize=
// - danh sach case DA xac nhan (theo_doi_doi_tra = 1) trong 1 THANG cu the (bat buoc truyen "thang" -
// frontend goi lai nhieu lan, moi thang 1 bang, xem thang-list o tren).
tranhChap.get("/theo-doi-doi-tra/da-xac-nhan", async (c) => {
  const scope = scopeTranhChap(c);
  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClause = { sql: scopeClauseBase.sql + exclusion.sql, binds: [...scopeClauseBase.binds, ...exclusion.binds] };
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const tinhClause = multiValueAdHocClause("c.tinh", c.req.query("tinh"));
  const nhomKhClause = multiValueAdHocClause("c.nhom_kh", c.req.query("nhom_kh"));
  const monthParam = c.req.query("thang");
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  let monthClauseSql = "";
  const monthBinds: unknown[] = [];
  if (monthParam) {
    const { start, end } = monthBounds(monthParam);
    monthClauseSql = " AND c.thoi_gian_hoan_thanh >= ? AND c.thoi_gian_hoan_thanh < ?";
    monthBinds.push(start, end);
  }

  const idFilter = (c.req.query("id") ?? "").trim();
  const idClauseSql = idFilter ? " AND (c.id LIKE ? OR c.seri_san_pham LIKE ?)" : "";
  const idBinds = idFilter ? [`%${idFilter}%`, `%${idFilter}%`] : [];

  const baseWhereSql = `${THEO_DOI_DOI_TRA_DA_XAC_NHAN}${scopeClause.sql}${khuVucClause.sql}${tinhClause.sql}${nhomKhClause.sql}${monthClauseSql}`;
  const listWhereSql = `${baseWhereSql}${idClauseSql}`;
  const binds = [...scopeClause.binds, ...khuVucClause.binds, ...tinhClause.binds, ...nhomKhClause.binds, ...monthBinds];
  const listBinds = [...binds, ...idBinds];

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM case_dvbh c WHERE ${listWhereSql}`)
    .bind(...listBinds)
    .first<{ total: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.khach_hang, c.khu_vuc, c.nhom_kh, c.thoi_gian_hoan_thanh, c.loai_yeu_cau, c.luu_y_loi_linh_kien,
       c.theo_doi_doi_tra_xac_nhan_boi, c.theo_doi_doi_tra_xac_nhan_luc,
       EXISTS (SELECT 1 FROM tranh_chap_tien_trinh tt WHERE tt.case_id = c.id) as co_tien_trinh
     FROM case_dvbh c WHERE ${listWhereSql}
     ORDER BY (CASE WHEN c.nhom_kh LIKE '%VIP%' THEN 0 ELSE 1 END), c.thoi_gian_hoan_thanh DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...listBinds, pageSize, offset)
    .all();

  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// GET /api/tranh-chap/bao-cao-khu-vuc?thang=
tranhChap.get("/bao-cao-khu-vuc", async (c) => {
  const scope = scopeTranhChap(c);
  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClause = { sql: scopeClauseBase.sql + exclusion.sql, binds: [...scopeClauseBase.binds, ...exclusion.binds] };
  const monthParam = c.req.query("thang");

  let monthClauseSql = "";
  const monthBinds: unknown[] = [];
  if (monthParam) {
    const { start, end } = monthBounds(monthParam);
    monthClauseSql = " AND c.thoi_gian_hoan_thanh >= ? AND c.thoi_gian_hoan_thanh < ?";
    monthBinds.push(start, end);
  }

  const query = `
    SELECT
      khu_vuc,
      SUM(CASE WHEN nghi_ngo_tranh_chap = 1 THEN 1 ELSE 0 END) as count_nghi_ngo,
      SUM(CASE WHEN COALESCE(nghi_ngo_tranh_chap, 0) <> 1 AND status <> 'Chua xu ly' THEN 1 ELSE 0 END) as count_phat_sinh_ngoai,
      SUM(CASE WHEN (nghi_ngo_tranh_chap = 1 AND status = 'Chua xu ly') OR is_gqkn_day_lai_gs = 1 THEN 1 ELSE 0 END) as count_chua_xu_ly,
      SUM(CASE WHEN status <> 'Chua xu ly' THEN 1 ELSE 0 END) as count_da_xu_ly,
      SUM(CASE WHEN status NOT IN ('Chua xu ly', 'Giam sat chua xu ly') THEN 1 ELSE 0 END) as count_gs_da_xu_ly,
      SUM(CASE WHEN status = 'Giam sat dang xu ly' THEN 1 ELSE 0 END) as count_gs_dang_xu_ly,
      SUM(CASE WHEN status IN ('Giam sat dong hoan thanh', 'Giam sat dong that bai') THEN 1 ELSE 0 END) as count_gs_ket_thuc,
      SUM(CASE WHEN status IN ('Giam sat chuyen CSKH', 'CSKH chua tiep nhan', 'CSKH dang xu ly', 'CSKH khong can xu ly', 'CSKH xu ly xong') THEN 1 ELSE 0 END) as count_chuyen_qgkn,
      SUM(CASE WHEN status IN ('CSKH chua tiep nhan', 'CSKH dang xu ly') THEN 1 ELSE 0 END) as count_qgkn_dang_xu_ly,
      SUM(CASE WHEN status IN ('CSKH khong can xu ly', 'CSKH xu ly xong') THEN 1 ELSE 0 END) as count_qgkn_da_dong,
      SUM(CASE WHEN is_gqkn_day_lai_gs = 1 THEN 1 ELSE 0 END) as count_gqkn_day_lai_gs
    FROM (
      SELECT
        c.khu_vuc,
        c.nghi_ngo_tranh_chap,
        ${CASE_TRANH_CHAP_STATUS_EXPR} as status,
        ${IS_GQKN_DAY_LAI_GS_EXPR} as is_gqkn_day_lai_gs
      FROM case_dvbh c
      WHERE ((${TRANH_CHAP_ELIGIBLE}) OR EXISTS (SELECT 1 FROM tranh_chap_tien_trinh tt WHERE tt.case_id = c.id))
        ${scopeClause.sql}
        ${monthClauseSql}
    )
    GROUP BY khu_vuc
    ORDER BY khu_vuc ASC
  `;

  const binds = [...scopeClause.binds, ...monthBinds];
  const { results } = await c.env.DB.prepare(query).bind(...binds).all();

  return c.json({ rows: results });
});

/** Tach tu tranhChap.get("/doi-may/theo-khu-vuc") - bao cao mini "dang mo/qua han" theo khu vuc,
 * CHI cho phan loai DOI_MAY_PHAN_LOAI (xem tab "Đòi đổi máy" trong TranhChapModule.tsx). */
async function computeDoiMayTheoKhuVuc(db: D1Database, scope: string[] | null) {
  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClause = { sql: scopeClauseBase.sql + exclusion.sql, binds: [...scopeClauseBase.binds, ...exclusion.binds] };

  // CHOT 2026-08-22: doc tu cot cache tt.dang_mo/thoi_gian_du_kien_xong_hien_tai (migration 0098)
  // thay vi LEFT JOIN tranh_chap_log - loc "tt.dang_mo = 1" SOM qua partial index idx_tctt_dang_mo,
  // tranh quet toan bo lich su tranh_chap_log (xem chu thich dau migration 0098).
  const { results } = await db
    .prepare(
      `SELECT
         c.khu_vuc,
         COUNT(*) as dang_mo,
         SUM(CASE WHEN tt.thoi_gian_du_kien_xong_hien_tai IS NOT NULL AND tt.thoi_gian_du_kien_xong_hien_tai < ${AGE_ANCHOR} THEN 1 ELSE 0 END) as qua_han
       FROM tranh_chap_tien_trinh tt
       CROSS JOIN case_dvbh c ON c.id = tt.case_id
       WHERE tt.phan_loai_tranh_chap = ? AND tt.dang_mo = 1${scopeClause.sql}
       GROUP BY c.khu_vuc
       ORDER BY c.khu_vuc ASC`,
    )
    .bind(DOI_MAY_PHAN_LOAI, ...scopeClause.binds)
    .all();
  return { rows: results };
}

tranhChap.get("/doi-may/theo-khu-vuc", async (c) => {
  const scope = scopeTranhChap(c);
  const key = buildReportKey("tranh-chap/doi-may/theo-khu-vuc", {}, scope);
  const data = await cachedReport(c.env.DB, key, ["cases", "tranh_chap"], () => computeDoiMayTheoKhuVuc(c.env.DB, scope));
  return c.json(data);
});

// POST /api/tranh-chap/:caseId/tiep-nhan - KSNB Doi tac (co la_ksnb_doi_tac) hoac Giam sat dung khu
// vuc/TBP DVBH/Admin (xem canWriteTranhChap) tao 1 tien trinh MOI cho 1 ca + log dau tien "KSNB da
// tiep nhan". Chi cho tao neu ca CHUA co tien trinh nao dang MO (tien trinh gan nhat, neu co, phai
// da o trang thai dong) - tranh 2 tien trinh dang xu ly song song cho cung 1 ca (xem muc 7 ke hoach,
// tao tien trinh thu 2 tro di dung CHINH route nay, goi lai sau khi tien trinh truoc da dong).
tranhChap.post("/:caseId/tiep-nhan", async (c) => {
  const caseId = c.req.param("caseId");
  const body = await c.req.json<{
    phan_loai_tranh_chap: string;
    muc_do: string;
    trang_thai_xu_ly: string;
    ghi_chu?: string;
    thoi_gian_du_kien_xong?: string;
    ket_qua_xu_ly?: string;
    hai_long_sau_tranh_chap?: string;
    ly_do_ton_tranh_chap?: string;
  }>();
  if (!body.phan_loai_tranh_chap?.trim()) return c.json({ error: "MISSING_PHAN_LOAI" }, 400);
  if (!(MUC_DO_VALUES as readonly string[]).includes(body.muc_do)) return c.json({ error: "INVALID_MUC_DO" }, 400);
  // Trang thai dau tien cua tien trinh LUON thuoc giai doan Giam sat (chot 2026-07-31 diem 1/3) - neu
  // nguoi tao chon thang 1 trong 2 trang thai "dong" (hoan thanh/that bai) thi tien trinh dong NGAY
  // (khong can logic dac biet, trang thai van suy tu log moi nhat nhu binh thuong).
  if (!(GIAM_SAT_STATUSES as readonly string[]).includes(body.trang_thai_xu_ly)) return c.json({ error: "INVALID_TRANG_THAI" }, 400);
  if ((TRANG_THAI_CAN_KET_QUA as readonly string[]).includes(body.trang_thai_xu_ly)) {
    if (!body.ket_qua_xu_ly?.trim()) return c.json({ error: "MISSING_KET_QUA_XU_LY" }, 400);
    if (!body.hai_long_sau_tranh_chap || !(HAI_LONG_VALUES as readonly string[]).includes(body.hai_long_sau_tranh_chap)) {
      return c.json({ error: "MISSING_HAI_LONG" }, 400);
    }
  }
  // CHOT 2026-09-03: "Ly do ton tranh chap" bat buoc tru khi trang thai chon la 1 trong 4 trang thai
  // DONG (isTrangThaiDangMo() = false) - case da dong thi khong con "ton" nua nen khong bat buoc.
  if (isTrangThaiDangMo(body.trang_thai_xu_ly) && !body.ly_do_ton_tranh_chap?.trim()) {
    return c.json({ error: "MISSING_LY_DO_TON" }, 400);
  }

  const caseRow = await c.env.DB.prepare("SELECT khu_vuc, nghi_ngo_tranh_chap FROM case_dvbh WHERE id = ?")
    .bind(caseId)
    .first<{ khu_vuc: string | null; nghi_ngo_tranh_chap: number }>();
  if (!caseRow) return c.json({ error: "CASE_NOT_FOUND" }, 404);

  // CHOT 2026-08-05: bo dieu kien "ca phai da dong (Hoan thanh XLSC / Khong hoan thanh XLSC)" - truoc
  // day tranh chap "khong co khai niem dang ton" (chot 2026-07-29), gio KSNB Doi tac/Giam sat khu vuc
  // duoc chu dong tao yeu cau xu ly tranh chap/khieu nai cho CA CA DANG TON (chua hoan thanh cong tac
  // dich vu), khong chi ca da dong nua. "nghi_ngo_tranh_chap=1" van khong phai dieu kien bat buoc (tu
  // chot 2026-07-30) - chi con dieu kien duy nhat la khong co tien trinh nao dang mo (xem duoi).

  if (!canWriteTranhChap(c, caseRow.khu_vuc)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);

  const latest = await c.env.DB.prepare(
    `SELECT tt.id, ${latestLogStatusOfTienTrinh("tt.id")} as trang_thai FROM tranh_chap_tien_trinh tt WHERE tt.case_id = ? ORDER BY tt.id DESC LIMIT 1`,
  )
    .bind(caseId)
    .first<{ id: string; trang_thai: string | null }>();
  if (latest?.trang_thai && !(TRANH_CHAP_TRANG_THAI_DONG as readonly string[]).includes(latest.trang_thai)) {
    return c.json({ error: "TIEN_TRINH_DANG_MO", tienTrinhId: latest.id }, 409);
  }

  const user = c.get("user");
  const id = await nextSequentialId(c.env.DB, "tranh_chap_tien_trinh", "TC", 6);
  const now = nowVN();
  const logCreatedAt = nowUtcSqlite();
  const thoiGianDuKienXong = body.thoi_gian_du_kien_xong ?? nextDayVN();
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO tranh_chap_tien_trinh
         (id, case_id, phan_loai_tranh_chap, muc_do, nguoi_tao, ngay_tao,
          dang_mo, trang_thai_hien_tai, thoi_gian_du_kien_xong_hien_tai, log_created_at_hien_tai,
          nguoi_xu_ly_hien_tai, dang_cho_nguoi_xu_ly_hien_tai)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      caseId,
      body.phan_loai_tranh_chap.trim(),
      body.muc_do,
      user.email,
      now,
      isTrangThaiDangMo(body.trang_thai_xu_ly) ? 1 : 0,
      body.trang_thai_xu_ly,
      thoiGianDuKienXong,
      logCreatedAt,
      user.email,
      null,
    ),
    c.env.DB.prepare(
      `INSERT INTO tranh_chap_log
         (tien_trinh_id, nguoi_xu_ly, ngay_xu_ly, trang_thai_xu_ly, thoi_gian_du_kien_xong, ghi_chu, ket_qua_xu_ly, hai_long_sau_tranh_chap, ly_do_ton_tranh_chap, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      user.email,
      now,
      body.trang_thai_xu_ly,
      thoiGianDuKienXong,
      body.ghi_chu ?? null,
      body.ket_qua_xu_ly?.trim() || null,
      body.hai_long_sau_tranh_chap || null,
      body.ly_do_ton_tranh_chap?.trim() || null,
      logCreatedAt,
    ),
    // Cache "ly do ton gan nhat" tren case_dvbh (migration 0107) - luon cap nhat, ke ca null (dong
    // ngay khi tao) - dung cho bang "Quan ly ton" (BacklogModule.tsx).
    c.env.DB.prepare("UPDATE case_dvbh SET ly_do_ton_tranh_chap_gan_nhat = ? WHERE id = ?").bind(
      body.ly_do_ton_tranh_chap?.trim() || null,
      caseId,
    ),
  ];
  // CHOT 2026-08-22: tao tien trinh truc tiep tu ca dang "cho xac nhan AI" (nghi_ngo_tranh_chap = 2)
  // duoc tinh la DA xac nhan "Dung la tranh chap" luon (nguoi dung khong can qua buoc POST
  // /:caseId/xac-nhan-ai rieng nua) - cung 1 dieu kien WHERE ...= 2 lam optimistic-concurrency giong
  // het route xac-nhan-ai, tranh ghi de am tham neu ca vua duoc xac nhan/tu choi boi nguoi khac.
  if (caseRow.nghi_ngo_tranh_chap === 2) {
    statements.push(
      c.env.DB.prepare(
        "UPDATE case_dvbh SET nghi_ngo_tranh_chap = 1, nghi_ngo_tranh_chap_xac_nhan_boi = ?, nghi_ngo_tranh_chap_xac_nhan_luc = ? WHERE id = ? AND nghi_ngo_tranh_chap = 2",
      ).bind(user.email, now, caseId),
    );
  }
  await c.env.DB.batch(statements);

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["tranh_chap"]));
  return c.json({ id }, 201);
});

// GET /api/tranh-chap/tien-trinh?khu_vuc=&phan_loai=&trang_thai=&han=&cua_toi=&page=&pageSize= -
// danh sach tien trinh (KHONG bo qua cachedReport - day la danh sach phan trang, xem quy uoc
// "KHONG boc endpoint tra danh sach" trong YEU_CAU_BAO_CAO_TINH_SAN.md). Mac dinh (khong truyen
// trang_thai) AN 2 trang thai dong - nguoi dung phai chu dong bat "trang_thai" chua 2 gia tri do
// moi thay lai (tranh rac man hinh chinh voi tien trinh da xong). "han=qua-han|sap-den-han" loc
// theo thoi_gian_du_kien_xong cua LOG MOI NHAT so voi AGE_ANCHOR (0h sang VN hom nay).
tranhChap.get("/tien-trinh", async (c) => {
  // "case_id" - nhanh rieng cho tab "Tranh chap, khieu nai" trong CaseDetail.tsx (nguoi dung duy
  // nhat truyen case_id, xem frontend/src/modules/CaseDetail.tsx). CHOT 2026-08-20 (rao soat lag):
  // TRUOC day CaseDetail chi lay danh sach tom tat roi tung TienTrinhPanel tu goi rieng GET
  // /tien-trinh/:id de lay full log (N+1 request, N lan goi loadGiamSatByKhuVucMap() quet ca bang
  // users khong index) - GOM lai thanh 1 request duy nhat tra ve DAY DU logs (+logCon) cho TAT CA
  // tien trinh cua ca, va BO HAN loadGiamSatByKhuVucMap() o nhanh nay (goi "Giam sat de xuat" gio
  // client tu suy ra tu chinh logs da co, xem deriveGiamSatSuggestion() o tranhChapShared.ts -
  // khong can biet "khu_vuc -> Giam sat" nua nen khong can quet users).
  const caseIdOnly = c.req.query("case_id");
  if (caseIdOnly) {
    const caseRow = await c.env.DB.prepare(
      "SELECT khu_vuc, khach_hang, tien_do_hoan_thanh, thoi_gian_hoan_thanh FROM case_dvbh WHERE id = ?",
    )
      .bind(caseIdOnly)
      .first<{ khu_vuc: string | null; khach_hang: string | null; tien_do_hoan_thanh: string | null; thoi_gian_hoan_thanh: string | null }>();
    if (!caseRow) return c.json({ rows: [] });
    const scope = scopeTranhChap(c);
    if (scope !== null && (!caseRow.khu_vuc || !scope.includes(caseRow.khu_vuc))) {
      return c.json({ error: "FORBIDDEN_KHU_VUC" }, 403);
    }

    const { results: ttRows } = await c.env.DB.prepare(
      "SELECT id, case_id, phan_loai_tranh_chap, muc_do, ngay_tao FROM tranh_chap_tien_trinh WHERE case_id = ? ORDER BY id DESC",
    )
      .bind(caseIdOnly)
      .all<{ id: string; case_id: string; phan_loai_tranh_chap: string; muc_do: string; ngay_tao: string }>();
    if (ttRows.length === 0) return c.json({ rows: [] });

    const ttIds = ttRows.map((r) => r.id);
    const { results: logs } = await c.env.DB.prepare(
      `SELECT * FROM tranh_chap_log WHERE tien_trinh_id IN (${ttIds.map(() => "?").join(", ")}) ORDER BY tien_trinh_id, id DESC`,
    )
      .bind(...ttIds)
      .all<{ id: number; tien_trinh_id: string }>();

    const logIds = logs.map((l) => l.id);
    const logConByLogId = new Map<number, unknown[]>();
    if (logIds.length > 0) {
      const { results: logConRows } = await c.env.DB.prepare(
        `SELECT * FROM tranh_chap_log_con WHERE tranh_chap_log_id IN (${logIds.map(() => "?").join(", ")}) ORDER BY id ASC`,
      )
        .bind(...logIds)
        .all<{ id: number; tranh_chap_log_id: number }>();
      for (const r of logConRows) {
        const arr = logConByLogId.get(r.tranh_chap_log_id) ?? [];
        arr.push(r);
        logConByLogId.set(r.tranh_chap_log_id, arr);
      }
    }

    const logsByTt = new Map<string, unknown[]>();
    for (const l of logs) {
      const arr = logsByTt.get(l.tien_trinh_id) ?? [];
      arr.push({ ...l, logCon: logConByLogId.get(l.id) ?? [] });
      logsByTt.set(l.tien_trinh_id, arr);
    }

    const rows = ttRows.map((tt) => ({
      tienTrinh: { ...tt, khach_hang: caseRow.khach_hang, khu_vuc: caseRow.khu_vuc, tien_do_hoan_thanh: caseRow.tien_do_hoan_thanh, thoi_gian_hoan_thanh: caseRow.thoi_gian_hoan_thanh },
      logs: logsByTt.get(tt.id) ?? [],
    }));
    return c.json({ rows });
  }

  const scope = scopeTranhChap(c);
  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClause = { sql: scopeClauseBase.sql + exclusion.sql, binds: [...scopeClauseBase.binds, ...exclusion.binds] };
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  // CHOT 2026-08-20: bo loc "tinh" (chon nhieu tinh cung luc) cho danh sach "Quan ly tien trinh" -
  // xem chu thich tuong tu o GET /cho-xu-ly ben tren.
  const tinhClause = multiValueAdHocClause("c.tinh", c.req.query("tinh"));
  // CHOT 2026-08-20: them "Nhom KH" (chon nhieu) - mirror pattern cua BacklogModule/GET /cho-xu-ly.
  const nhomKhClause = multiValueAdHocClause("c.nhom_kh", c.req.query("nhom_kh"));
  const phanLoai = c.req.query("phan_loai");
  const mucDo = c.req.query("muc_do");
  const trangThaiParam = c.req.query("trang_thai");
  const han = c.req.query("han");
  const cuaToi = c.req.query("cua_toi") === "1";
  const user = c.get("user");
  const nguoiDangXuLy = c.req.query("nguoi_dang_xu_ly");
  const loaiDangXuLy = c.req.query("loai_dang_xu_ly");

  const binds: unknown[] = [...scopeClause.binds, ...khuVucClause.binds, ...tinhClause.binds, ...nhomKhClause.binds];
  let whereSql = `1=1${scopeClause.sql}${khuVucClause.sql}${tinhClause.sql}${nhomKhClause.sql}`;
  if (phanLoai) {
    whereSql += " AND tt.phan_loai_tranh_chap = ?";
    binds.push(phanLoai);
  }
  if (mucDo) {
    whereSql += " AND tt.muc_do = ?";
    binds.push(mucDo);
  }
  const dongList = TRANH_CHAP_TRANG_THAI_DONG as readonly string[];
  if (trangThaiParam) {
    const list = trangThaiParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length) {
      whereSql += ` AND ll.trang_thai_xu_ly IN (${list.map(() => "?").join(", ")})`;
      binds.push(...list);
    }
  } else {
    whereSql += ` AND ll.trang_thai_xu_ly NOT IN (${dongList.map(() => "?").join(", ")})`;
    binds.push(...dongList);
  }
  if (han === "qua-han") {
    whereSql += ` AND ll.thoi_gian_du_kien_xong IS NOT NULL AND ll.thoi_gian_du_kien_xong < ${AGE_ANCHOR} AND ll.trang_thai_xu_ly NOT IN (${dongList.map(() => "?").join(", ")})`;
    binds.push(...dongList);
  } else if (han === "sap-den-han") {
    whereSql += ` AND ll.thoi_gian_du_kien_xong IS NOT NULL AND ll.thoi_gian_du_kien_xong >= ${AGE_ANCHOR} AND ll.thoi_gian_du_kien_xong < date(${AGE_ANCHOR}, '+2 day') AND ll.trang_thai_xu_ly NOT IN (${dongList.map(() => "?").join(", ")})`;
    binds.push(...dongList);
  } else if (han === "qua-han-cap-nhat") {
    // "Qua han cap nhat" (CHOT 2026-08-22) - dua vao ll.created_at cua LOG MOI NHAT, cot audit RAW
    // UTC (KHAC ll.thoi_gian_du_kien_xong la cot nghiep vu VN-local) - so sanh voi datetime('now')
    // THUAN UTC, khop dung logic voi bucket qua_han_cap_nhat trong computeTienTrinhStats() o tren.
    whereSql += ` AND ll.trang_thai_xu_ly NOT IN (${dongList.map(() => "?").join(", ")}) AND CAST((julianday(datetime('now')) - julianday(ll.created_at)) AS INTEGER) >= 3`;
    binds.push(...dongList);
  }
  if (nguoiDangXuLy) {
    if (loaiDangXuLy === "chua-xong") {
      whereSql += " AND ll.trang_thai_xu_ly IN ('Giam sat chua xu ly', 'Giam sat dang xu ly', 'CSKH dang xu ly') AND ll.nguoi_xu_ly = ?";
      binds.push(nguoiDangXuLy);
    } else if (loaiDangXuLy === "duoc-nhac-ten") {
      whereSql += " AND ll.dang_cho_nguoi_xu_ly = ?";
      binds.push(nguoiDangXuLy);
    } else {
      whereSql += " AND (ll.dang_cho_nguoi_xu_ly = ? OR (ll.trang_thai_xu_ly IN ('Giam sat chua xu ly', 'Giam sat dang xu ly', 'CSKH dang xu ly') AND ll.nguoi_xu_ly = ?))";
      binds.push(nguoiDangXuLy, nguoiDangXuLy);
    }
  }
  if (cuaToi) {
    whereSql += " AND ll.nguoi_xu_ly = ?";
    binds.push(user.email);
  }
  // "id" (khac "case_id" o tren - do la loc CHINH XAC 1 ca cho tab Tranh chap trong CaseDetail,
  // khong duoc dung chung) - o tim ID/Serial rieng cho danh sach "Quan ly tien trinh", khop CA id
  // lan seri_san_pham.
  const idFilter = (c.req.query("id") ?? "").trim();
  if (idFilter) {
    whereSql += " AND (c.id LIKE ? OR c.seri_san_pham LIKE ?)";
    binds.push(`%${idFilter}%`, `%${idFilter}%`);
  }

  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  // CHOT 2026-08-20 (rao soat lag): "CROSS JOIN" thay "JOIN" - ket qua giong het, chi ep query
  // planner quet tranh_chap_tien_trinh (bang nho, chi chua tien trinh tranh chap) truoc thay vi de
  // tu chon quet case_dvbh (D1 Insights do duoc dang quet gan het ~188k rows/lan du dieu kien loc
  // chinh nam ben tranh_chap_tien_trinh/tranh_chap_log).
  const baseFrom = `FROM tranh_chap_tien_trinh tt
    CROSS JOIN case_dvbh c ON c.id = tt.case_id
    LEFT JOIN tranh_chap_log ll ON ll.id = (SELECT id FROM tranh_chap_log WHERE tien_trinh_id = tt.id ORDER BY id DESC LIMIT 1)
    WHERE ${whereSql}`;

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total ${baseFrom}`)
    .bind(...binds)
    .first<{ total: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT tt.id, tt.case_id, tt.phan_loai_tranh_chap, tt.muc_do, tt.ngay_tao,
       c.khach_hang, c.khu_vuc, c.nhom_kh,
       ll.trang_thai_xu_ly, ll.nguoi_xu_ly, ll.ngay_xu_ly, ll.thoi_gian_du_kien_xong, ll.ghi_chu as log_ghi_chu, ll.dang_cho_nguoi_xu_ly,
       ll.created_at as log_created_at,
       ${TUOI_TIEN_TRINH_EXPR} as so_ngay_ton
     ${baseFrom}
     ORDER BY
       CASE WHEN c.nhom_kh LIKE '%VIP%' THEN 0 ELSE 1 END,
       CASE WHEN ll.thoi_gian_du_kien_xong IS NOT NULL AND ll.thoi_gian_du_kien_xong < ${AGE_ANCHOR} THEN 0 ELSE 1 END,
       CASE WHEN ll.thoi_gian_du_kien_xong IS NULL THEN 1 ELSE 0 END,
       ll.thoi_gian_du_kien_xong ASC
     LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, offset)
    .all<{ khu_vuc: string | null }>();

  const giamSatMap = await loadGiamSatByKhuVucMap(c.env.DB);

  // CHOT 2026-08-20: voi cac dong dang o dung trang thai dau tien "Giam sat chua xu ly" - tu rao soat
  // lich su tranh chap CUA CHINH ca do (cac tien trinh TRUOC DAY, khac chinh tien trinh dang xet) de
  // goi y "Giam sat tung xu ly" - xem loadGiamSatHistoryByCaseIds().
  const rowsAny = results as unknown as { id: string; case_id: string; trang_thai_xu_ly: string | null }[];
  const caseIdsCanRaSoat = Array.from(new Set(rowsAny.filter((r) => r.trang_thai_xu_ly === "Giam sat chua xu ly").map((r) => r.case_id)));
  const historyRows = await loadGiamSatHistoryByCaseIds(c.env.DB, caseIdsCanRaSoat);
  const historyByCaseId = new Map<string, { tienTrinhId: string; email: string; ten: string | null }[]>();
  for (const h of historyRows) {
    const list = historyByCaseId.get(h.caseId) ?? [];
    list.push(h);
    historyByCaseId.set(h.caseId, list);
  }

  const rows = results.map((r) => {
    const rr = r as unknown as { id: string; case_id: string; khu_vuc: string | null; trang_thai_xu_ly: string | null };
    let gsTungXuLy: GiamSatInfo[] = [];
    if (rr.trang_thai_xu_ly === "Giam sat chua xu ly") {
      const seen = new Map<string, GiamSatInfo>();
      for (const h of historyByCaseId.get(rr.case_id) ?? []) {
        if (h.tienTrinhId === rr.id) continue;
        if (!seen.has(h.email)) seen.set(h.email, { email: h.email, ten: h.ten });
      }
      gsTungXuLy = Array.from(seen.values());
    }
    return { ...r, giam_sat_phu_trach: giamSatMap.get(rr.khu_vuc ?? "") ?? [], gs_tung_xu_ly: gsTungXuLy };
  });

  return c.json({ rows, page, pageSize, total: countRow?.total ?? 0 });
});

/** Tach tu tranhChap.get("/tien-trinh/stats") - so lieu StatCard cua tab quan ly tien trinh.
 * "phanLoai" (them cho tab "Dòi doi may", CHOT 2026-08-21) - loc them theo tt.phan_loai_tranh_chap
 * khi truyen, giu nguyen hanh vi cu (khong loc) khi bo trong. */
export async function computeTienTrinhStats(db: D1Database, scope: string[] | null, phanLoai?: string) {
  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClause = { sql: scopeClauseBase.sql + exclusion.sql, binds: [...scopeClauseBase.binds, ...exclusion.binds] };
  const phanLoaiClause = phanLoai ? " AND tt.phan_loai_tranh_chap = ?" : "";
  // CHOT 2026-08-22: doc cac cot cache "*_hien_tai" tren tranh_chap_tien_trinh (migration 0098) thay
  // vi LEFT JOIN tranh_chap_log - "tt.dang_mo = 1" loc SOM qua partial index idx_tctt_dang_mo, tap
  // ho so quet ve chi ~200-300 tien trinh dang mo thuc te thay vi toan bo lich su (xem migration
  // 0098 va thao luan chi phi D1 CHOT 2026-08-22). Vi da loc dang_mo=1, cac dieu kien "NOT IN dong
  // list" cu tro thanh thua (moi dong con lai deu da la dang mo) nen duoc bo.
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) as dang_mo,
         SUM(CASE WHEN tt.trang_thai_hien_tai = 'Giam sat chua xu ly' THEN 1 ELSE 0 END) as giam_sat_chua_xu_ly,
         SUM(CASE WHEN tt.trang_thai_hien_tai = 'Giam sat chuyen CSKH' THEN 1 ELSE 0 END) as giam_sat_chuyen_cskh,
         SUM(CASE WHEN tt.trang_thai_hien_tai = 'CSKH dang xu ly' THEN 1 ELSE 0 END) as cskh_dang_xu_ly,
         SUM(CASE WHEN tt.thoi_gian_du_kien_xong_hien_tai IS NOT NULL AND tt.thoi_gian_du_kien_xong_hien_tai < ${AGE_ANCHOR} THEN 1 ELSE 0 END) as qua_han,
         SUM(CASE WHEN tt.thoi_gian_du_kien_xong_hien_tai IS NOT NULL AND tt.thoi_gian_du_kien_xong_hien_tai >= ${AGE_ANCHOR} AND tt.thoi_gian_du_kien_xong_hien_tai < date(${AGE_ANCHOR}, '+2 day') THEN 1 ELSE 0 END) as sap_den_han,
         SUM(CASE WHEN CAST((julianday(datetime('now')) - julianday(tt.log_created_at_hien_tai)) AS INTEGER) >= 3 THEN 1 ELSE 0 END) as qua_han_cap_nhat
       FROM tranh_chap_tien_trinh tt
       CROSS JOIN case_dvbh c ON c.id = tt.case_id
       WHERE tt.dang_mo = 1${scopeClause.sql}${phanLoaiClause}`,
    )
    .bind(...scopeClause.binds, ...(phanLoai ? [phanLoai] : []))
    .first<{ dang_mo: number; giam_sat_chua_xu_ly: number; giam_sat_chuyen_cskh: number; cskh_dang_xu_ly: number; qua_han: number; sap_den_han: number; qua_han_cap_nhat: number }>();
  return {
    dangMo: row?.dang_mo ?? 0,
    giamSatChuaXuLy: row?.giam_sat_chua_xu_ly ?? 0,
    giamSatChuyenCskh: row?.giam_sat_chuyen_cskh ?? 0,
    cskhDangXuLy: row?.cskh_dang_xu_ly ?? 0,
    quaHan: row?.qua_han ?? 0,
    sapDenHan: row?.sap_den_han ?? 0,
    // "Qua han cap nhat" (CHOT 2026-08-22): tt.log_created_at_hien_tai la ban sao cache cua
    // tranh_chap_log.created_at (cot audit RAW UTC, ghi qua nowUtcSqlite() - xem migration 0098),
    // KHAC voi cac cot nghiep vu VN-local nhu ngay_xu_ly/ngay_tao dat qua nowVN()) - so sanh voi
    // datetime('now') THUAN UTC, KHONG dung AGE_ANCHOR (anchor do la moc 0h VN, chi dung dung cho
    // cot VN-local) de tranh lech ~7h.
    quaHanCapNhat: row?.qua_han_cap_nhat ?? 0,
  };
}

tranhChap.get("/tien-trinh/stats", async (c) => {
  const scope = scopeTranhChap(c);
  const phanLoai = c.req.query("phan_loai") || undefined;
  const key = buildReportKey("tranh-chap/tien-trinh/stats", { phan_loai: phanLoai }, scope);
  const data = await cachedReport(c.env.DB, key, ["cases", "tranh_chap"], () => computeTienTrinhStats(c.env.DB, scope, phanLoai));
  return c.json(data);
});

// PATCH /api/tranh-chap/tien-trinh/:id - sua phan_loai_tranh_chap va/hoac muc_do CUA TIEN TRINH
// (khac PATCH /log/:id sua 1 DONG LOG) - chi KSNB Doi tac/TBP DVBH/Admin (canEditTienTrinhMeta,
// HEP HON canWriteTranhChap - khong gom Giam sat), chi khi tien trinh CHUA DONG (chot 2026-07-29:
// "KSNB co the thay doi cho den khi tranh chap duoc dong").
tranhChap.patch("/tien-trinh/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ phan_loai_tranh_chap?: string; muc_do?: string }>();
  if (body.muc_do !== undefined && !(MUC_DO_VALUES as readonly string[]).includes(body.muc_do)) {
    return c.json({ error: "INVALID_MUC_DO" }, 400);
  }

  const tt = await c.env.DB.prepare(
    `SELECT tt.phan_loai_tranh_chap, tt.muc_do, ${latestLogStatusOfTienTrinh("tt.id")} as trang_thai FROM tranh_chap_tien_trinh tt WHERE tt.id = ?`,
  )
    .bind(id)
    .first<{ phan_loai_tranh_chap: string; muc_do: string; trang_thai: string | null }>();
  if (!tt) return c.json({ error: "NOT_FOUND" }, 404);
  if (tt.trang_thai && (TRANH_CHAP_TRANG_THAI_DONG as readonly string[]).includes(tt.trang_thai)) {
    return c.json({ error: "TIEN_TRINH_DA_DONG" }, 409);
  }
  if (!canEditTienTrinhMeta(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);

  const next = {
    phan_loai_tranh_chap: body.phan_loai_tranh_chap?.trim() || tt.phan_loai_tranh_chap,
    muc_do: body.muc_do ?? tt.muc_do,
  };
  await c.env.DB.prepare("UPDATE tranh_chap_tien_trinh SET phan_loai_tranh_chap = ?, muc_do = ? WHERE id = ?")
    .bind(next.phan_loai_tranh_chap, next.muc_do, id)
    .run();

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["tranh_chap"]));
  return c.json({ ok: true });
});

// POST /api/tranh-chap/tien-trinh/:id/log - them 1 log xu ly moi. "thoi_gian_du_kien_xong" khong
// truyen se lay theo log GAN NHAT truoc do (chot cau hoi E) - CHUA co log nao truoc (khong xay ra
// thuc te vi log dau tien luon tao cung /tiep-nhan, nhung van xu ly an toan) thi mac dinh ngay mai.
tranhChap.post("/tien-trinh/:id/log", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    trang_thai_xu_ly: string;
    thoi_gian_du_kien_xong?: string;
    ghi_chu?: string;
    ngay_xu_ly?: string;
    ket_qua_xu_ly?: string;
    hai_long_sau_tranh_chap?: string;
    dang_cho_nguoi_xu_ly?: string | null;
    ly_do_ton_tranh_chap?: string;
  }>();
  if (!(ALL_TRANG_THAI_LOG as readonly string[]).includes(body.trang_thai_xu_ly)) return c.json({ error: "INVALID_TRANG_THAI" }, 400);
  // Chi 2 trang thai "thanh cong" bat buoc 2 truong ket qua (chot 2026-07-31) - xem TRANG_THAI_CAN_KET_QUA.
  if ((TRANG_THAI_CAN_KET_QUA as readonly string[]).includes(body.trang_thai_xu_ly)) {
    if (!body.ket_qua_xu_ly?.trim()) return c.json({ error: "MISSING_KET_QUA_XU_LY" }, 400);
    if (!body.hai_long_sau_tranh_chap || !(HAI_LONG_VALUES as readonly string[]).includes(body.hai_long_sau_tranh_chap)) {
      return c.json({ error: "MISSING_HAI_LONG" }, 400);
    }
  }
  // CHOT 2026-09-03: "Ly do ton tranh chap" bat buoc tru khi trang thai chon la 1 trong 4 trang thai
  // DONG - xem giai thich o POST /:caseId/tiep-nhan.
  if (isTrangThaiDangMo(body.trang_thai_xu_ly) && !body.ly_do_ton_tranh_chap?.trim()) {
    return c.json({ error: "MISSING_LY_DO_TON" }, 400);
  }

  const tt = await c.env.DB.prepare(
    `SELECT tt.case_id, tt.dang_cho_nguoi_xu_ly_hien_tai, c.khu_vuc, ${latestLogStatusOfTienTrinh("tt.id")} as trang_thai FROM tranh_chap_tien_trinh tt JOIN case_dvbh c ON c.id = tt.case_id WHERE tt.id = ?`,
  )
    .bind(id)
    .first<{ case_id: string; dang_cho_nguoi_xu_ly_hien_tai: string | null; khu_vuc: string | null; trang_thai: string | null }>();
  if (!tt) return c.json({ error: "NOT_FOUND" }, 404);
  const user = c.get("user");
  // CHOT 2026-08-22: nguoi dang duoc "Dang cho nguoi xu ly" cua log MOI NHAT duoc mo quyen ghi log
  // CHINH cho DUNG tien trinh nay, BAT KE vai tro/khu_vuc/giai doan - ho la nguoi dang "giu bong",
  // can duoc giai trinh ngay ca khi khong thuoc nhom vai tro binh thuong duoc phep xu ly tranh chap.
  // Chi ap dung cho tien trinh HO dang duoc gan (dang_cho_nguoi_xu_ly_hien_tai, cache tu migration
  // 0098) - khong mo rong quyen sang tien trinh khac. Van phai tuan theo allowedForPhase ben duoi
  // (rang buoc CHUYEN TRANG THAI hop le, khac voi quyen AI duoc ghi).
  const isAssignedToMe = !!tt.dang_cho_nguoi_xu_ly_hien_tai && tt.dang_cho_nguoi_xu_ly_hien_tai === user.email;
  if (!canWriteTranhChap(c, tt.khu_vuc) && !isAssignedToMe) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  // Trang thai moi phai thuoc DUNG giai doan hien tai cua tien trinh (chot 2026-07-31 diem 1: khong
  // duoc quay lai giai doan Giam sat sau khi da chuyen CSKH).
  const currentPhase = phaseOfStatus(tt.trang_thai);
  // Them 2026-08-20: giai doan CSKH la trach nhiem cua KSNB Doi tac/TBP DVBH/Admin - Giam sat khu vuc
  // (canWriteTranhChap da cho qua o tren, chi kiem tra khu_vuc) KHONG duoc ghi them log khi tien trinh
  // dang o giai doan nay nua (fix: truoc day Giam sat van co the ghi ca trang thai rieng cua CSKH).
  if (currentPhase === "cskh" && !canWriteCskhPhase(c) && !isAssignedToMe) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const allowedForPhase = currentPhase === "cskh" ? CSKH_STATUSES : GIAM_SAT_STATUSES;
  // CHOT 2026-08-20: "Chuyen lai giam sat xu ly" (CSKH day nguoc tien trinh ve giai doan Giam sat) BAT
  // BUOC phai chi dinh "dang_cho_nguoi_xu_ly" - truoc day chi la goi y tu dong dien (co the bi bo
  // trong/xoa tay), khien ca khong xuat hien trong hang doi ca nhan cua Giam sat nao (xem
  // loadGiamSatByKhuVucMap()/showDangCho trong TienTrinhPanel.tsx phia frontend).
  const isChuyenLaiGiamSat = currentPhase === "cskh" && body.trang_thai_xu_ly === "Giam sat chua xu ly";
  if (!(allowedForPhase as readonly string[]).includes(body.trang_thai_xu_ly)) {
    const isKsnbOrAdminSpecial = (!!user.la_ksnb_doi_tac || user.vai_tro === "Admin") && isChuyenLaiGiamSat;
    if (!isKsnbOrAdminSpecial) {
      return c.json({ error: "INVALID_PHASE_TRANSITION" }, 400);
    }
  }
  if (isChuyenLaiGiamSat && !body.dang_cho_nguoi_xu_ly?.trim()) {
    return c.json({ error: "MISSING_DANG_CHO_NGUOI_XU_LY" }, 400);
  }

  let thoiGianDuKien = body.thoi_gian_du_kien_xong;
  if (thoiGianDuKien === undefined) {
    const prevLog = await c.env.DB.prepare("SELECT thoi_gian_du_kien_xong FROM tranh_chap_log WHERE tien_trinh_id = ? ORDER BY id DESC LIMIT 1")
      .bind(id)
      .first<{ thoi_gian_du_kien_xong: string | null }>();
    thoiGianDuKien = prevLog?.thoi_gian_du_kien_xong ?? nextDayVN();
  }

  const logCreatedAt = nowUtcSqlite();
  const lyDoTonTranhChap = body.ly_do_ton_tranh_chap?.trim() || null;
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO tranh_chap_log
         (tien_trinh_id, nguoi_xu_ly, ngay_xu_ly, trang_thai_xu_ly, thoi_gian_du_kien_xong, ghi_chu, ket_qua_xu_ly, hai_long_sau_tranh_chap, dang_cho_nguoi_xu_ly, ly_do_ton_tranh_chap, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      user.email,
      body.ngay_xu_ly ?? nowVN(),
      body.trang_thai_xu_ly,
      thoiGianDuKien ?? null,
      body.ghi_chu ?? null,
      body.ket_qua_xu_ly?.trim() || null,
      body.hai_long_sau_tranh_chap || null,
      body.dang_cho_nguoi_xu_ly || null,
      lyDoTonTranhChap,
      logCreatedAt,
    ),
    c.env.DB.prepare(
      `UPDATE tranh_chap_tien_trinh
       SET dang_mo = ?, trang_thai_hien_tai = ?, thoi_gian_du_kien_xong_hien_tai = ?, log_created_at_hien_tai = ?,
           nguoi_xu_ly_hien_tai = ?, dang_cho_nguoi_xu_ly_hien_tai = ?
       WHERE id = ?`,
    ).bind(
      isTrangThaiDangMo(body.trang_thai_xu_ly) ? 1 : 0,
      body.trang_thai_xu_ly,
      thoiGianDuKien ?? null,
      logCreatedAt,
      user.email,
      body.dang_cho_nguoi_xu_ly || null,
      id,
    ),
    // Cache "ly do ton gan nhat" tren case_dvbh (migration 0107) - xem giai thich o POST /:caseId/tiep-nhan.
    c.env.DB.prepare("UPDATE case_dvbh SET ly_do_ton_tranh_chap_gan_nhat = ? WHERE id = ?").bind(lyDoTonTranhChap, tt.case_id),
  ]);

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["tranh_chap"]));
  return c.json({ ok: true }, 201);
});

// POST /api/tranh-chap/log/:logId/log-con - them 1 "log con" (ghi chu tien do phu, KHONG doi
// trang_thai_xu_ly cua tien trinh - xem migration 0092). Chi cho phep them vao log CHINH nao dang la
// log MOI NHAT cua 1 tien trinh CHUA DONG - dung y nghia "ghi chu tien do trong luc dang xu ly giai
// doan nay", khong cho ghi vao log da bi "vuot mat" hoac tien trinh da dong. CHOT 2026-08-21 (doi tu
// quyet dinh 2026-08-20): quyen ghi log con CHI can canWriteTranhChap (khong con doi hoi them
// canWriteCskhPhase khi dang o giai doan CSKH nhu log CHINH) - chu he thong yeu cau "tat ca vai tro xu
// ly duoc phep" (Giam sat khu vuc) deu duoc them log con de giai trinh mien tien trinh CHUA DONG, vi
// log con KHONG doi trang thai (khac han log chinh - van GIU nguyen canWriteCskhPhase() cho log chinh,
// chi rieng log con noi long).
tranhChap.post("/log/:logId/log-con", async (c) => {
  const logId = Number(c.req.param("logId"));
  const body = await c.req.json<{ noi_dung?: string }>();
  const noiDung = (body.noi_dung ?? "").trim();
  if (!noiDung) return c.json({ error: "MISSING_NOI_DUNG" }, 400);

  const log = await c.env.DB.prepare(
    `SELECT ll.id, ll.tien_trinh_id, ll.trang_thai_xu_ly, ll.dang_cho_nguoi_xu_ly, c.khu_vuc
     FROM tranh_chap_log ll
     JOIN tranh_chap_tien_trinh tt ON tt.id = ll.tien_trinh_id
     JOIN case_dvbh c ON c.id = tt.case_id
     WHERE ll.id = ?`,
  )
    .bind(logId)
    .first<{ id: number; tien_trinh_id: string; trang_thai_xu_ly: string; dang_cho_nguoi_xu_ly: string | null; khu_vuc: string | null }>();
  if (!log) return c.json({ error: "NOT_FOUND" }, 404);
  const user = c.get("user");
  // CHOT 2026-08-22: nguoi dang duoc gan "Dang cho nguoi xu ly" TREN CHINH log nay (da xac nhan la
  // log MOI NHAT ben duoi) cung duoc them log con, bat ke vai tro - khop dung tinh than voi log CHINH
  // o route POST /tien-trinh/:id/log ben tren.
  const isAssignedToMe = !!log.dang_cho_nguoi_xu_ly && log.dang_cho_nguoi_xu_ly === user.email;
  if (!canWriteTranhChap(c, log.khu_vuc) && !isAssignedToMe) return c.json({ error: "FORBIDDEN_ROLE" }, 403);

  const latestRow = await c.env.DB.prepare("SELECT id FROM tranh_chap_log WHERE tien_trinh_id = ? ORDER BY id DESC LIMIT 1")
    .bind(log.tien_trinh_id)
    .first<{ id: number }>();
  if (latestRow?.id !== log.id) return c.json({ error: "NOT_LATEST_LOG" }, 409);
  if ((TRANH_CHAP_TRANG_THAI_DONG as readonly string[]).includes(log.trang_thai_xu_ly)) return c.json({ error: "TIEN_TRINH_DA_DONG" }, 409);

  // Fix 2026-08-27: truoc day INSERT khong dat created_at nen roi vao DEFAULT cua migration 0092
  // (datetime('now') = UTC that) - LECH voi quy uoc VN-local dung cho MOI cot thoi gian khac trong
  // he thong (nowVN(), xem lib/vnTime.ts), khien log con hien thi som hon thuc te 7 tieng va sap xep
  // sai trong "Tien trinh chung" (CaseDetail.tsx). Dat tuong minh qua nowVN() cho dung quy uoc.
  await c.env.DB.prepare("INSERT INTO tranh_chap_log_con (tranh_chap_log_id, nguoi_ghi, noi_dung, created_at) VALUES (?, ?, ?, ?)")
    .bind(logId, user.email, noiDung, nowVN())
    .run();

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["tranh_chap"]));
  return c.json({ ok: true }, 201);
});

// PATCH /api/tranh-chap/log/:id - sua 1 log DA GHI. Chi cho phep neu CA 3: (1) chinh minh la tac
// gia, (2) con trong 24h ke tu luc tao, (3) log nay VAN la log moi nhat cua tien trinh (chua bi
// "vuot mat" boi 1 log moi hon) - chot theo cau hoi D.
tranhChap.patch("/log/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{
    trang_thai_xu_ly?: string;
    thoi_gian_du_kien_xong?: string;
    ghi_chu?: string;
    ket_qua_xu_ly?: string;
    hai_long_sau_tranh_chap?: string;
    dang_cho_nguoi_xu_ly?: string | null;
    ly_do_ton_tranh_chap?: string;
  }>();

  // "case_id" (qua join) can cho cap nhat cache case_dvbh.ly_do_ton_tranh_chap_gan_nhat ben duoi.
  const log = await c.env.DB.prepare(
    "SELECT tl.*, tt.case_id as case_id FROM tranh_chap_log tl JOIN tranh_chap_tien_trinh tt ON tt.id = tl.tien_trinh_id WHERE tl.id = ?",
  )
    .bind(id)
    .first<{
      id: number;
      tien_trinh_id: string;
      nguoi_xu_ly: string;
      created_at: string;
      trang_thai_xu_ly: string;
      thoi_gian_du_kien_xong: string | null;
      ghi_chu: string | null;
      ket_qua_xu_ly: string | null;
      hai_long_sau_tranh_chap: string | null;
      dang_cho_nguoi_xu_ly: string | null;
      ly_do_ton_tranh_chap: string | null;
      case_id: string;
    }>();
  if (!log) return c.json({ error: "NOT_FOUND" }, 404);

  const user = c.get("user");
  if (log.nguoi_xu_ly !== user.email) return c.json({ error: "FORBIDDEN_NOT_AUTHOR" }, 403);

  const latestRow = await c.env.DB.prepare("SELECT id FROM tranh_chap_log WHERE tien_trinh_id = ? ORDER BY id DESC LIMIT 1")
    .bind(log.tien_trinh_id)
    .first<{ id: number }>();
  if (latestRow?.id !== log.id) return c.json({ error: "NOT_LATEST_LOG" }, 409);

  const hoursRow = await c.env.DB.prepare("SELECT (julianday(?) - julianday(created_at)) * 24 as hours FROM tranh_chap_log WHERE id = ?")
    .bind(nowVN(), id)
    .first<{ hours: number }>();
  if ((hoursRow?.hours ?? 999) > 24) return c.json({ error: "EDIT_WINDOW_EXPIRED" }, 403);

  if (body.trang_thai_xu_ly !== undefined && !(ALL_TRANG_THAI_LOG as readonly string[]).includes(body.trang_thai_xu_ly)) {
    return c.json({ error: "INVALID_TRANG_THAI" }, 400);
  }
  // Giai doan tinh tu log NGAY TRUOC log dang sua (khong phai chinh no) - tranh tu chan chinh minh
  // (chot 2026-07-31, xem phaseOfStatus()).
  if (body.trang_thai_xu_ly !== undefined) {
    const prevLog = await c.env.DB.prepare("SELECT trang_thai_xu_ly FROM tranh_chap_log WHERE tien_trinh_id = ? AND id < ? ORDER BY id DESC LIMIT 1")
      .bind(log.tien_trinh_id, log.id)
      .first<{ trang_thai_xu_ly: string }>();
    const currentPhase = phaseOfStatus(prevLog?.trang_thai_xu_ly ?? null);
    const allowedForPhase = currentPhase === "cskh" ? CSKH_STATUSES : GIAM_SAT_STATUSES;
    if (!(allowedForPhase as readonly string[]).includes(body.trang_thai_xu_ly)) {
      const isKsnbOrAdminSpecial = (!!user.la_ksnb_doi_tac || user.vai_tro === "Admin") && body.trang_thai_xu_ly === "Giam sat chua xu ly";
      if (!isKsnbOrAdminSpecial) {
        return c.json({ error: "INVALID_PHASE_TRANSITION" }, 400);
      }
    }
  }

  const next = {
    trang_thai_xu_ly: body.trang_thai_xu_ly ?? log.trang_thai_xu_ly,
    thoi_gian_du_kien_xong: body.thoi_gian_du_kien_xong !== undefined ? body.thoi_gian_du_kien_xong : log.thoi_gian_du_kien_xong,
    ghi_chu: body.ghi_chu !== undefined ? body.ghi_chu : log.ghi_chu,
    ket_qua_xu_ly: body.ket_qua_xu_ly !== undefined ? body.ket_qua_xu_ly.trim() || null : log.ket_qua_xu_ly,
    hai_long_sau_tranh_chap: body.hai_long_sau_tranh_chap !== undefined ? body.hai_long_sau_tranh_chap : log.hai_long_sau_tranh_chap,
    dang_cho_nguoi_xu_ly: body.dang_cho_nguoi_xu_ly !== undefined ? body.dang_cho_nguoi_xu_ly : log.dang_cho_nguoi_xu_ly,
    ly_do_ton_tranh_chap: body.ly_do_ton_tranh_chap !== undefined ? body.ly_do_ton_tranh_chap.trim() || null : log.ly_do_ton_tranh_chap,
  };
  // Neu (sau khi sua) trang thai la 1 trong 2 trang thai "thanh cong" thi 2 truong ket qua BAT BUOC
  // phai co gia tri hop le - kiem tra tren gia tri SAU CUNG (co the da co san tu luc tao, hoac vua
  // sua trong chinh request nay).
  if ((TRANG_THAI_CAN_KET_QUA as readonly string[]).includes(next.trang_thai_xu_ly)) {
    if (!next.ket_qua_xu_ly) return c.json({ error: "MISSING_KET_QUA_XU_LY" }, 400);
    if (!next.hai_long_sau_tranh_chap || !(HAI_LONG_VALUES as readonly string[]).includes(next.hai_long_sau_tranh_chap)) {
      return c.json({ error: "MISSING_HAI_LONG" }, 400);
    }
  }
  // CHOT 2026-09-03: "Ly do ton tranh chap" bat buoc tru khi trang thai (sau cung) la 1 trong 4 trang
  // thai DONG - xem giai thich o POST /:caseId/tiep-nhan.
  if (isTrangThaiDangMo(next.trang_thai_xu_ly) && !next.ly_do_ton_tranh_chap) {
    return c.json({ error: "MISSING_LY_DO_TON" }, 400);
  }

  // Log dang sua da duoc xac nhan la log MOI NHAT cua tien trinh o tren (latestRow check) - nen cap
  // nhat cache tren tranh_chap_tien_trinh song song, KHONG dong log_created_at_hien_tai/nguoi_xu_ly_hien_tai
  // (sua log KHONG tao log moi, khong doi tac gia/thoi diem tao ban dau).
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE tranh_chap_log
       SET trang_thai_xu_ly = ?, thoi_gian_du_kien_xong = ?, ghi_chu = ?, ket_qua_xu_ly = ?, hai_long_sau_tranh_chap = ?, dang_cho_nguoi_xu_ly = ?, ly_do_ton_tranh_chap = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(
      next.trang_thai_xu_ly,
      next.thoi_gian_du_kien_xong,
      next.ghi_chu,
      next.ket_qua_xu_ly,
      next.hai_long_sau_tranh_chap,
      next.dang_cho_nguoi_xu_ly || null,
      next.ly_do_ton_tranh_chap,
      nowVN(),
      id,
    ),
    c.env.DB.prepare(
      `UPDATE tranh_chap_tien_trinh
       SET dang_mo = ?, trang_thai_hien_tai = ?, thoi_gian_du_kien_xong_hien_tai = ?, dang_cho_nguoi_xu_ly_hien_tai = ?
       WHERE id = ?`,
    ).bind(isTrangThaiDangMo(next.trang_thai_xu_ly) ? 1 : 0, next.trang_thai_xu_ly, next.thoi_gian_du_kien_xong, next.dang_cho_nguoi_xu_ly || null, log.tien_trinh_id),
    // Cache "ly do ton gan nhat" tren case_dvbh (migration 0107) - log dang sua la log MOI NHAT cua
    // tien trinh (da xac nhan o tren), coi la ly do "gan nhat" cua case.
    c.env.DB.prepare("UPDATE case_dvbh SET ly_do_ton_tranh_chap_gan_nhat = ? WHERE id = ?").bind(next.ly_do_ton_tranh_chap, log.case_id),
  ]);

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["tranh_chap"]));
  return c.json({ ok: true });
});

// CHOT 2026-08-12: chu he thong yeu cau badge sidebar "Tranh chap, KN (N)" chi tinh ca hoan thanh
// TU MOC NAY tro di (khong con cong don backlog tranh chap/khieu nai cu truoc do vao badge) - moc
// co dinh (khong tu dong tinh theo "thang hien tai"), chi doi khi co quyet dinh nghiep vu moi.
const TRANH_CHAP_COUNT_TU_NGAY = "2026-08-01";

/** Dung boi notifications.ts computeNotificationsCount() - so ca "chua xu ly xong" tranh chap (xem
 * CASE_TRANH_CHAP_STATUS_EXPR: gom ca ca CHUA TUNG co tien trinh lan ca co tien trinh dang mo), GIOI
 * HAN tu TRANH_CHAP_COUNT_TU_NGAY tro di (xem chu thich hang so o tren) - dung c.thoi_gian_hoan_thanh
 * lam moc (TRANH_CHAP_ELIGIBLE bat buoc ca da dong moi tinh "tranh chap"/"phat sinh" nen cot nay luon
 * co gia tri, xem chu thich TRANH_CHAP_ELIGIBLE).
 * "isKsnb" (chot 2026-07-31 diem 4): KSNB (la_ksnb_doi_tac) chi can quan tam ca dang o dung
 * KSNB_WATCH_STATUSES (diem ban giao Giam sat -> CSKH) - vai tro khac giu nguyen hanh vi cu (moi ca
 * chua dong). */
export async function computeTranhChapCount(db: D1Database, scope: string[] | null, isKsnb: boolean): Promise<number> {
  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClause = { sql: scopeClauseBase.sql + exclusion.sql, binds: [...scopeClauseBase.binds, ...exclusion.binds] };
  const statusList = (isKsnb ? KSNB_WATCH_STATUSES : TRANH_CHAP_TRANG_THAI_DONG) as readonly string[];
  const cond = isKsnb ? "IN" : "NOT IN";
  const row = await db
    .prepare(
      `SELECT COUNT(*) as n FROM case_dvbh c
       WHERE ((${TRANH_CHAP_ELIGIBLE}) OR EXISTS (SELECT 1 FROM tranh_chap_tien_trinh tt WHERE tt.case_id = c.id))${scopeClause.sql}
         AND c.thoi_gian_hoan_thanh >= ?
         AND ${CASE_TRANH_CHAP_STATUS_EXPR} ${cond} (${statusList.map(() => "?").join(", ")})`,
    )
    .bind(...scopeClause.binds, TRANH_CHAP_COUNT_TU_NGAY, ...statusList)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// ---------- Import hang loat tranh chap theo ID (CHOT 2026-08-12) ----------
// Quyen rieng users.co_the_import_tranh_chap (hoac Admin) - xem migration 0052 + users.ts. Moi dong
// hop le tao 1 tien trinh MOI cho 1 case_id, trang_thai_xu_ly luon khoi tao "Giam sat chua xu ly"
// (buoc dau cua quy trinh, dung y het nhanh trang_thai dau tien cua POST /:caseId/tiep-nhan) - GS/
// KSNB xu ly tiep tu "Quan ly tien trinh" nhu binh thuong sau khi import, khong co gi dac biet.
function canImportTranhChap(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return user.vai_tro === "Admin" || user.co_the_import_tranh_chap;
}

const TRANH_CHAP_IMPORT_TEMPLATE_CSV = "id,phan_loai_tranh_chap,muc_do\n1234567,Khieu nai chat luong,Binh thuong\n";

// GET /api/tranh-chap/import/template
tranhChap.get("/import/template", (c) => csvTemplateResponse(c, TRANH_CHAP_IMPORT_TEMPLATE_CSV, "mau_import_tranh_chap.csv"));

interface TranhChapImportRow {
  id?: string | number;
  phan_loai_tranh_chap?: string;
  muc_do?: string;
}

/** Dung chung cho preview (commit=false) va commit that (commit=true) - xem 2 route ben duoi. Kiem
 * tra tung dong GIONG HET dieu kien cua POST /:caseId/tiep-nhan (ca ton tai, dung quyen khu_vuc qua
 * canWriteTranhChap(), chua co tien trinh dang mo) de dam bao 1 ca import qua day tuong duong 1 ca
 * tao tay qua "Tiep nhan" - khong tao ra du lieu le loi khac quy tac binh thuong. */
async function processTranhChapImportRows(c: Context<{ Bindings: Env }>, rows: TranhChapImportRow[], commit: boolean) {
  const db = c.env.DB;
  const user = c.get("user");
  const summary = { thanhCong: 0, boQua: 0, errors: [] as string[] };

  // Chuan hoa + loc trung ID trong file (giu dong CUOI cung neu 1 ID xuat hien nhieu lan, khop
  // hanh vi "dong de" cua cac import khac trong app - xem processBlacklistRows() trong caLap.ts).
  const byId = new Map<string, { row: TranhChapImportRow; line: number }>();
  rows.forEach((row, i) => {
    const id = String(row.id ?? "").trim();
    if (!id) {
      summary.boQua++;
      summary.errors.push(`Dòng ${i + 2}: thiếu ID, đã bỏ qua`);
      return;
    }
    byId.set(id, { row, line: i + 2 });
  });

  const validRows: { id: string; phanLoai: string; mucDo: string; line: number }[] = [];

  for (const [id, { row, line }] of byId) {
    const phanLoai = String(row.phan_loai_tranh_chap ?? "").trim();
    const mucDo = String(row.muc_do ?? "").trim();
    if (!phanLoai) {
      summary.boQua++;
      summary.errors.push(`Dòng ${line} (${id}): thiếu phân loại tranh chấp`);
      continue;
    }
    if (!(MUC_DO_VALUES as readonly string[]).includes(mucDo)) {
      summary.boQua++;
      summary.errors.push(`Dòng ${line} (${id}): mức độ "${mucDo}" không hợp lệ (phải là ${(MUC_DO_VALUES as readonly string[]).join("/")})`);
      continue;
    }

    const caseRow = await db.prepare("SELECT khu_vuc FROM case_dvbh WHERE id = ?").bind(id).first<{ khu_vuc: string | null }>();
    if (!caseRow) {
      summary.boQua++;
      summary.errors.push(`Dòng ${line}: không tìm thấy ca ${id}`);
      continue;
    }
    if (!canWriteTranhChap(c, caseRow.khu_vuc)) {
      summary.boQua++;
      summary.errors.push(`Dòng ${line} (${id}): không có quyền tạo tranh chấp cho khu vực của ca này`);
      continue;
    }
    const latest = await db
      .prepare(`SELECT ${latestLogStatusOfTienTrinh("tt.id")} as trang_thai FROM tranh_chap_tien_trinh tt WHERE tt.case_id = ? ORDER BY tt.id DESC LIMIT 1`)
      .bind(id)
      .first<{ trang_thai: string | null }>();
    if (latest?.trang_thai && !(TRANH_CHAP_TRANG_THAI_DONG as readonly string[]).includes(latest.trang_thai)) {
      summary.boQua++;
      summary.errors.push(`Dòng ${line} (${id}): ca đang có tiến trình mở, bỏ qua`);
      continue;
    }

    validRows.push({ id, phanLoai, mucDo, line });
  }

  summary.thanhCong = validRows.length;

  if (commit && validRows.length > 0) {
    const ids = await reserveSequentialIds(db, "tranh_chap_tien_trinh", "TC", 6, validRows.length);
    const now = nowVN();
    const statements = validRows.flatMap((r, i) => {
      const tienTrinhId = ids[i];
      const logCreatedAt = nowUtcSqlite();
      const thoiGianDuKienXong = nextDayVN();
      return [
        db
          .prepare(
            `INSERT INTO tranh_chap_tien_trinh
               (id, case_id, phan_loai_tranh_chap, muc_do, nguoi_tao, ngay_tao,
                dang_mo, trang_thai_hien_tai, thoi_gian_du_kien_xong_hien_tai, log_created_at_hien_tai,
                nguoi_xu_ly_hien_tai, dang_cho_nguoi_xu_ly_hien_tai)
             VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, NULL)`,
          )
          .bind(tienTrinhId, r.id, r.phanLoai, r.mucDo, user.email, now, "Giam sat chua xu ly", thoiGianDuKienXong, logCreatedAt, user.email),
        db
          .prepare(
            `INSERT INTO tranh_chap_log (tien_trinh_id, nguoi_xu_ly, ngay_xu_ly, trang_thai_xu_ly, thoi_gian_du_kien_xong, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(tienTrinhId, user.email, now, "Giam sat chua xu ly", thoiGianDuKienXong, logCreatedAt),
      ];
    });
    await runBatched(db, statements);
    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["tranh_chap"]));
  }

  return summary;
}

// POST /api/tranh-chap/import/preview
tranhChap.post("/import/preview", async (c) => {
  if (!canImportTranhChap(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{ rows: TranhChapImportRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processTranhChapImportRows(c, body.rows, false);
  return c.json(summary);
});

// POST /api/tranh-chap/import/commit
tranhChap.post("/import/commit", async (c) => {
  if (!canImportTranhChap(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{ rows: TranhChapImportRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processTranhChapImportRows(c, body.rows, true);
  return c.json(summary);
});

export default tranhChap;
