import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { khuVucAdHocClause, khuVucReportExclusionClause } from "../lib/filterParams";
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

tranhChap.get("/handling-users", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT email, ten, vai_tro FROM users WHERE trang_thai_duyet = 'Da duyet' AND bi_khoa = 0 AND vai_tro IN ('Giam sat', 'TBP DVBH', 'QC') ORDER BY ten"
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

  const { results } = await c.env.DB.prepare(
    `WITH active_latest_logs AS (
      SELECT
        ll.trang_thai_xu_ly,
        ll.nguoi_xu_ly,
        ll.dang_cho_nguoi_xu_ly
      FROM tranh_chap_tien_trinh tt
      JOIN case_dvbh c ON c.id = tt.case_id
      JOIN tranh_chap_log ll ON ll.id = (SELECT id FROM tranh_chap_log WHERE tien_trinh_id = tt.id ORDER BY id DESC LIMIT 1)
      WHERE ll.trang_thai_xu_ly NOT IN ('Giam sat dong hoan thanh', 'Giam sat dong that bai', 'CSKH khong can xu ly', 'CSKH xu ly xong')
        AND c.archived_at IS NULL AND c.huy_bo_at IS NULL
        ${scopeClauseC.sql}
        ${dateClause}
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

  const baseWhereSql = `${TRANH_CHAP_ELIGIBLE} AND NOT EXISTS (SELECT 1 FROM tranh_chap_tien_trinh tt WHERE tt.case_id = c.id)${scopeClause.sql}${khuVucClause.sql}${monthClauseSql}`;
  const listWhereSql = `${baseWhereSql}${minDaysClauseSql}${idClauseSql}`;
  const binds = [...scopeClause.binds, ...khuVucClause.binds, ...monthBinds];
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
    `SELECT c.id, c.khach_hang, c.khu_vuc, c.thoi_gian_hoan_thanh, c.ly_do_qua_han as last_ly_do_cham,
       ${ageColExpr} as so_ngay_cho
     FROM case_dvbh c WHERE ${listWhereSql}
     ORDER BY c.thoi_gian_hoan_thanh ASC
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
      SUM(CASE WHEN nghi_ngo_tranh_chap = 1 AND status = 'Chua xu ly' THEN 1 ELSE 0 END) as count_chua_xu_ly,
      SUM(CASE WHEN status <> 'Chua xu ly' THEN 1 ELSE 0 END) as count_da_xu_ly,
      SUM(CASE WHEN status NOT IN ('Chua xu ly', 'Giam sat chua xu ly') THEN 1 ELSE 0 END) as count_gs_da_xu_ly,
      SUM(CASE WHEN status = 'Giam sat dang xu ly' THEN 1 ELSE 0 END) as count_gs_dang_xu_ly,
      SUM(CASE WHEN status IN ('Giam sat dong hoan thanh', 'Giam sat dong that bai') THEN 1 ELSE 0 END) as count_gs_ket_thuc,
      SUM(CASE WHEN status IN ('Giam sat chuyen CSKH', 'CSKH chua tiep nhan', 'CSKH dang xu ly', 'CSKH khong can xu ly', 'CSKH xu ly xong') THEN 1 ELSE 0 END) as count_chuyen_qgkn,
      SUM(CASE WHEN status IN ('CSKH chua tiep nhan', 'CSKH dang xu ly') THEN 1 ELSE 0 END) as count_qgkn_dang_xu_ly,
      SUM(CASE WHEN status IN ('CSKH khong can xu ly', 'CSKH xu ly xong') THEN 1 ELSE 0 END) as count_qgkn_da_dong
    FROM (
      SELECT
        c.khu_vuc,
        c.nghi_ngo_tranh_chap,
        ${CASE_TRANH_CHAP_STATUS_EXPR} as status
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

  const caseRow = await c.env.DB.prepare("SELECT khu_vuc FROM case_dvbh WHERE id = ?")
    .bind(caseId)
    .first<{ khu_vuc: string | null }>();
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
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO tranh_chap_tien_trinh (id, case_id, phan_loai_tranh_chap, muc_do, nguoi_tao, ngay_tao) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(id, caseId, body.phan_loai_tranh_chap.trim(), body.muc_do, user.email, now),
    c.env.DB.prepare(
      `INSERT INTO tranh_chap_log
         (tien_trinh_id, nguoi_xu_ly, ngay_xu_ly, trang_thai_xu_ly, thoi_gian_du_kien_xong, ghi_chu, ket_qua_xu_ly, hai_long_sau_tranh_chap)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      user.email,
      now,
      body.trang_thai_xu_ly,
      body.thoi_gian_du_kien_xong ?? nextDayVN(),
      body.ghi_chu ?? null,
      body.ket_qua_xu_ly?.trim() || null,
      body.hai_long_sau_tranh_chap || null,
    ),
  ]);

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
  const scope = scopeTranhChap(c);
  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClause = { sql: scopeClauseBase.sql + exclusion.sql, binds: [...scopeClauseBase.binds, ...exclusion.binds] };
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const phanLoai = c.req.query("phan_loai");
  const mucDo = c.req.query("muc_do");
  const caseId = c.req.query("case_id");
  const trangThaiParam = c.req.query("trang_thai");
  const han = c.req.query("han");
  const cuaToi = c.req.query("cua_toi") === "1";
  const user = c.get("user");
  const nguoiDangXuLy = c.req.query("nguoi_dang_xu_ly");
  const loaiDangXuLy = c.req.query("loai_dang_xu_ly");

  const binds: unknown[] = [...scopeClause.binds, ...khuVucClause.binds];
  let whereSql = `1=1${scopeClause.sql}${khuVucClause.sql}`;
  if (phanLoai) {
    whereSql += " AND tt.phan_loai_tranh_chap = ?";
    binds.push(phanLoai);
  }
  if (mucDo) {
    whereSql += " AND tt.muc_do = ?";
    binds.push(mucDo);
  }
  // "case_id" - dung boi tab "Tranh chap, khieu nai" trong CaseDetail.tsx de liet ke TOAN BO tien
  // trinh (ke ca da dong, xem "trang_thai" client tu truyen day du 4 gia tri) cua 1 ca cu the.
  if (caseId) {
    whereSql += " AND tt.case_id = ?";
    binds.push(caseId);
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

  const baseFrom = `FROM tranh_chap_tien_trinh tt
    JOIN case_dvbh c ON c.id = tt.case_id
    LEFT JOIN tranh_chap_log ll ON ll.id = (SELECT id FROM tranh_chap_log WHERE tien_trinh_id = tt.id ORDER BY id DESC LIMIT 1)
    WHERE ${whereSql}`;

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total ${baseFrom}`)
    .bind(...binds)
    .first<{ total: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT tt.id, tt.case_id, tt.phan_loai_tranh_chap, tt.muc_do, tt.ngay_tao,
       c.khach_hang, c.khu_vuc,
       ll.trang_thai_xu_ly, ll.nguoi_xu_ly, ll.ngay_xu_ly, ll.thoi_gian_du_kien_xong, ll.ghi_chu as log_ghi_chu, ll.dang_cho_nguoi_xu_ly,
       ${TUOI_TIEN_TRINH_EXPR} as so_ngay_ton
     ${baseFrom}
     ORDER BY
       CASE WHEN ll.thoi_gian_du_kien_xong IS NOT NULL AND ll.thoi_gian_du_kien_xong < ${AGE_ANCHOR} THEN 0 ELSE 1 END,
       CASE WHEN ll.thoi_gian_du_kien_xong IS NULL THEN 1 ELSE 0 END,
       ll.thoi_gian_du_kien_xong ASC
     LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, offset)
    .all();

  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

/** Tach tu tranhChap.get("/tien-trinh/stats") - so lieu StatCard cua tab quan ly tien trinh. */
export async function computeTienTrinhStats(db: D1Database, scope: string[] | null) {
  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClause = { sql: scopeClauseBase.sql + exclusion.sql, binds: [...scopeClauseBase.binds, ...exclusion.binds] };
  const dongList = TRANH_CHAP_TRANG_THAI_DONG as readonly string[];
  const dongPlaceholders = dongList.map(() => "?").join(", ");
  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN ll.trang_thai_xu_ly NOT IN (${dongPlaceholders}) THEN 1 ELSE 0 END) as dang_mo,
         SUM(CASE WHEN ll.trang_thai_xu_ly = 'Giam sat chua xu ly' THEN 1 ELSE 0 END) as giam_sat_chua_xu_ly,
         SUM(CASE WHEN ll.trang_thai_xu_ly = 'Giam sat chuyen CSKH' THEN 1 ELSE 0 END) as giam_sat_chuyen_cskh,
         SUM(CASE WHEN ll.trang_thai_xu_ly = 'CSKH dang xu ly' THEN 1 ELSE 0 END) as cskh_dang_xu_ly,
         SUM(CASE WHEN ll.trang_thai_xu_ly NOT IN (${dongPlaceholders}) AND ll.thoi_gian_du_kien_xong IS NOT NULL AND ll.thoi_gian_du_kien_xong < ${AGE_ANCHOR} THEN 1 ELSE 0 END) as qua_han,
         SUM(CASE WHEN ll.trang_thai_xu_ly NOT IN (${dongPlaceholders}) AND ll.thoi_gian_du_kien_xong IS NOT NULL AND ll.thoi_gian_du_kien_xong >= ${AGE_ANCHOR} AND ll.thoi_gian_du_kien_xong < date(${AGE_ANCHOR}, '+2 day') THEN 1 ELSE 0 END) as sap_den_han
       FROM tranh_chap_tien_trinh tt
       JOIN case_dvbh c ON c.id = tt.case_id
       LEFT JOIN tranh_chap_log ll ON ll.id = (SELECT id FROM tranh_chap_log WHERE tien_trinh_id = tt.id ORDER BY id DESC LIMIT 1)
       WHERE 1=1${scopeClause.sql}`,
    )
    .bind(...dongList, ...dongList, ...dongList, ...scopeClause.binds)
    .first<{ dang_mo: number; giam_sat_chua_xu_ly: number; giam_sat_chuyen_cskh: number; cskh_dang_xu_ly: number; qua_han: number; sap_den_han: number }>();
  return {
    dangMo: row?.dang_mo ?? 0,
    giamSatChuaXuLy: row?.giam_sat_chua_xu_ly ?? 0,
    giamSatChuyenCskh: row?.giam_sat_chuyen_cskh ?? 0,
    cskhDangXuLy: row?.cskh_dang_xu_ly ?? 0,
    quaHan: row?.qua_han ?? 0,
    sapDenHan: row?.sap_den_han ?? 0,
  };
}

tranhChap.get("/tien-trinh/stats", async (c) => {
  const scope = scopeTranhChap(c);
  const key = buildReportKey("tranh-chap/tien-trinh/stats", {}, scope);
  const data = await cachedReport(c.env.DB, key, ["cases", "tranh_chap"], () => computeTienTrinhStats(c.env.DB, scope));
  return c.json(data);
});

// GET /api/tranh-chap/tien-trinh/:id - chi tiet 1 tien trinh + toan bo log (moi nhat truoc, id
// DESC) + thong tin ca goc de "truy van nguoc" (khach_hang, khu_vuc, tien_do_hoan_thanh...).
tranhChap.get("/tien-trinh/:id", async (c) => {
  const id = c.req.param("id");
  const tt = await c.env.DB.prepare(
    `SELECT tt.*, c.khach_hang, c.khu_vuc, c.tien_do_hoan_thanh, c.thoi_gian_hoan_thanh
     FROM tranh_chap_tien_trinh tt JOIN case_dvbh c ON c.id = tt.case_id WHERE tt.id = ?`,
  )
    .bind(id)
    .first<{ khu_vuc: string | null }>();
  if (!tt) return c.json({ error: "NOT_FOUND" }, 404);

  const scope = scopeTranhChap(c);
  if (scope !== null && (!tt.khu_vuc || !scope.includes(tt.khu_vuc))) {
    return c.json({ error: "FORBIDDEN_KHU_VUC" }, 403);
  }

  const { results: logs } = await c.env.DB.prepare("SELECT * FROM tranh_chap_log WHERE tien_trinh_id = ? ORDER BY id DESC").bind(id).all();
  return c.json({ tienTrinh: tt, logs });
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
  }>();
  if (!(ALL_TRANG_THAI_LOG as readonly string[]).includes(body.trang_thai_xu_ly)) return c.json({ error: "INVALID_TRANG_THAI" }, 400);
  // Chi 2 trang thai "thanh cong" bat buoc 2 truong ket qua (chot 2026-07-31) - xem TRANG_THAI_CAN_KET_QUA.
  if ((TRANG_THAI_CAN_KET_QUA as readonly string[]).includes(body.trang_thai_xu_ly)) {
    if (!body.ket_qua_xu_ly?.trim()) return c.json({ error: "MISSING_KET_QUA_XU_LY" }, 400);
    if (!body.hai_long_sau_tranh_chap || !(HAI_LONG_VALUES as readonly string[]).includes(body.hai_long_sau_tranh_chap)) {
      return c.json({ error: "MISSING_HAI_LONG" }, 400);
    }
  }

  const tt = await c.env.DB.prepare(
    `SELECT tt.case_id, c.khu_vuc, ${latestLogStatusOfTienTrinh("tt.id")} as trang_thai FROM tranh_chap_tien_trinh tt JOIN case_dvbh c ON c.id = tt.case_id WHERE tt.id = ?`,
  )
    .bind(id)
    .first<{ case_id: string; khu_vuc: string | null; trang_thai: string | null }>();
  if (!tt) return c.json({ error: "NOT_FOUND" }, 404);
  if (!canWriteTranhChap(c, tt.khu_vuc)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const user = c.get("user");
  // Trang thai moi phai thuoc DUNG giai doan hien tai cua tien trinh (chot 2026-07-31 diem 1: khong
  // duoc quay lai giai doan Giam sat sau khi da chuyen CSKH).
  const currentPhase = phaseOfStatus(tt.trang_thai);
  const allowedForPhase = currentPhase === "cskh" ? CSKH_STATUSES : GIAM_SAT_STATUSES;
  if (!(allowedForPhase as readonly string[]).includes(body.trang_thai_xu_ly)) {
    const isKsnbOrAdminSpecial = (!!user.la_ksnb_doi_tac || user.vai_tro === "Admin") && body.trang_thai_xu_ly === "Giam sat chua xu ly";
    if (!isKsnbOrAdminSpecial) {
      return c.json({ error: "INVALID_PHASE_TRANSITION" }, 400);
    }
  }

  let thoiGianDuKien = body.thoi_gian_du_kien_xong;
  if (thoiGianDuKien === undefined) {
    const prevLog = await c.env.DB.prepare("SELECT thoi_gian_du_kien_xong FROM tranh_chap_log WHERE tien_trinh_id = ? ORDER BY id DESC LIMIT 1")
      .bind(id)
      .first<{ thoi_gian_du_kien_xong: string | null }>();
    thoiGianDuKien = prevLog?.thoi_gian_du_kien_xong ?? nextDayVN();
  }

  await c.env.DB.prepare(
    `INSERT INTO tranh_chap_log
       (tien_trinh_id, nguoi_xu_ly, ngay_xu_ly, trang_thai_xu_ly, thoi_gian_du_kien_xong, ghi_chu, ket_qua_xu_ly, hai_long_sau_tranh_chap, dang_cho_nguoi_xu_ly)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      user.email,
      body.ngay_xu_ly ?? nowVN(),
      body.trang_thai_xu_ly,
      thoiGianDuKien ?? null,
      body.ghi_chu ?? null,
      body.ket_qua_xu_ly?.trim() || null,
      body.hai_long_sau_tranh_chap || null,
      body.dang_cho_nguoi_xu_ly || null,
    )
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
  }>();

  const log = await c.env.DB.prepare("SELECT * FROM tranh_chap_log WHERE id = ?").bind(id).first<{
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

  await c.env.DB.prepare(
    `UPDATE tranh_chap_log
     SET trang_thai_xu_ly = ?, thoi_gian_du_kien_xong = ?, ghi_chu = ?, ket_qua_xu_ly = ?, hai_long_sau_tranh_chap = ?, dang_cho_nguoi_xu_ly = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(next.trang_thai_xu_ly, next.thoi_gian_du_kien_xong, next.ghi_chu, next.ket_qua_xu_ly, next.hai_long_sau_tranh_chap, next.dang_cho_nguoi_xu_ly || null, nowVN(), id)
    .run();

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
      return [
        db
          .prepare("INSERT INTO tranh_chap_tien_trinh (id, case_id, phan_loai_tranh_chap, muc_do, nguoi_tao, ngay_tao) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(tienTrinhId, r.id, r.phanLoai, r.mucDo, user.email, now),
        db
          .prepare(
            `INSERT INTO tranh_chap_log (tien_trinh_id, nguoi_xu_ly, ngay_xu_ly, trang_thai_xu_ly, thoi_gian_du_kien_xong)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(tienTrinhId, user.email, now, "Giam sat chua xu ly", nextDayVN()),
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
