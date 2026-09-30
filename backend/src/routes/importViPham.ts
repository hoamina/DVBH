import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { scopeByKhuVuc } from "../middleware/scopeByKhuVuc";
import { excelTemplateResponse } from "../lib/excelTemplate";
import { parseSheetDateTime } from "../lib/sheetDateParser";
import { loadKetQuaCap1ValidValues, isGhiChuBatBuocForKetQuaCap1, normalizeKetQuaCap1 } from "../lib/ketQuaCap1";
import { nowVN } from "../lib/vnTime";
import { reserveSequentialIds } from "../lib/idCounter";
import { logImportHistory, CHUNK_SIZE_BATCH } from "../lib/backfillImportProcessor";
import { bumpVersions } from "../lib/dataVersions";

// Import vi pham hang loat tu Excel (yeu cau chu he thong 2026-09-22), cho CSKH/TN CSKH/TBP CSKH/
// QC/Admin - xem chu thich day du o migrations/0115_vi_pham_ktv_import.sql cho ly do phai tach 2
// nhanh (co/khong ID case) thanh 2 bang khac nhau.
//
// GIOI HAN CO CHU DICH cua v1 (CHOT voi chu he thong khi thuc hien): vi pham import (ca 2 nhanh)
// KHONG duoc day sang app "vi pham" ngoai qua pushViPhamToVipham() nhu luong tao thu cong tung ca
// (POST /vi-pham/case/:caseId) - nhanh "khong ID case" khong co du du lieu de day (thieu case_id/
// khach_hang/seri_san_pham ma payload "nghi_ngo_moi" yeu cau), nen ca 2 nhanh deu bo qua buoc nay
// de nhat quan hanh vi giua 2 nhanh thay vi chi 1 nhanh co con 1 nhanh khong. KTV se KHONG giai
// trinh duoc vi pham import qua app ngoai - GS/QC xem va chot/bo truc tiep tren DVBH (tab "Tat ca
// vi pham" cua module Bao cao vi pham), dung "Ghi chu" nguoi import dien nhu noi dung giai trinh
// thay the.
//
// 2026-09-30: dong co "Ket qua cap 1" = "Không có lỗi" (quy ve sentinel "Khong loi", xem
// normalizeKetQuaCap1) VAN duoc ghi nhan, nhung tu dong chot QC bo loi (chot_bo_cap_2 = 0) luc insert.
const importViPham = new Hono<{ Bindings: Env }>();
importViPham.use("*", verifySessionMiddleware, loadUser);
// requireRole chi ap cho /preview + /commit (doc/ghi du lieu that) - KHONG ap cho /template va
// /column-map (chi la file mau/metadata tinh, khong nhay cam, giong pattern cac router import khac
// nhu importGiaiTrinh.ts/importKhaoSat.ts). Truoc day requireRole nam o middleware "*" chung nen
// nguoi dung thay duoc tab "Nhap Excel" (frontend gate canImportViPham trung 5 vai tro nay) nhung
// vao thoi diem bam "Tai mau file" lai bi 403 neu vai_tro cua ho lech (vd bi doi vai tro sau khi tab
// da mo san trong localStorage) - tach rieng de tai mau khong con phu thuoc dung 5 vai tro nay nua.
const requireImportRole = requireRole("Admin", "QC", "CSKH", "TN CSKH", "TBP CSKH");

// "KSNB" co CHU DICH KHONG co trong danh sach nay - danh rieng cho dong bo Google Sheet tu dong
// (xem migration 0114), import tay khong duoc nhan danh nguon do.
const LOAI_LOI_IMPORT_VALUES = new Set(["Loi 120 phut", "Hen qua 24h", "Loi lo ke hoach", "KH hen lai", "Khac"]);

// Cot "LOAI LOI" (CHOT chu he thong 2026-09-30): PHAN LOAI TU DO cua nguoi import (vd "GQKN - Vi pham
// co khieu nai"), khong phai du lieu cung. Trung (khong phan biet dau/hoa thuong) 1 trong 5 nguon co
// dinh -> luu vao loai_loi nhu truoc; gia tri khac -> loai_loi = 'Khac' + luu NGUYEN VAN vao
// loai_loi_chi_tiet (migration 0118). "Ket qua cap 1" van kiem theo danh muc "Loai loi vi pham".
function boDau(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0111/g, "d").replace(/\u0110/g, "D").toLowerCase().replace(/\s+/g, " ").trim();
}
const LOAI_LOI_BY_BO_DAU = new Map([...LOAI_LOI_IMPORT_VALUES].map((v) => [boDau(v), v]));

// O ngay kieu Date trong Excel: ImportUploader (SheetJS cellDates) -> Date -> JSON = ISO UTC
// ("2026-09-25T10:55:46.000Z", da tru 7h tu gio VN tren file). parseSheetDateTime khong nhan dang nay nen
// truoc day luu NGUYEN chuoi UTC (lech -7h, sai dinh dang) - bug 2026-09-30, du lieu cu sua o migration 0120.
// Quy ve gio VN dia phuong "YYYY-MM-DD HH:MM:SS" theo quy uoc toan he thong. CHI ap dung cho import vi
// pham (khong sua chung parseSheetDateTime/ImportUploader - import CRM dang luu nguyen gia tri, doi dinh
// dang o do se lam lech crm_hash hang loat).
function isoUtcToVnLocal(raw: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(raw)) return raw;
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return raw;
  return new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

// Khoa chong trung (migration 0119) - 1 ID co the co NHIEU vi pham: dong nguon 'Khac' (gom moi "Loai loi"
// tu do) khoa theo "loai loi tu do | ngay | ghi chu" -> nhieu dong / ca, import lai dung file cu van khong
// nhan doi. Nguon co dinh khac 'Khac' giu khoa '' (gop voi luong khao sat CSKH nhu truoc). PHAI khop cong
// thuc backfill SQL trong migrations/0119_vi_pham_khoa_trung.sql.
function khoaTrungImport(loaiLoi: string, loaiLoiChiTiet: string | null, ngayGhiNhan: string, ghiChu: string | null): string {
  if (loaiLoi !== "Khac") return "";
  return `${loaiLoiChiTiet ?? ""}|${ngayGhiNhan.slice(0, 10)}|${ghiChu ?? ""}`;
}

interface ImportRow {
  case_id?: string;
  ktv_id?: string;
  ngay_ghi_nhan?: string;
  loai_loi?: string;
  ket_qua_cap_1?: string;
  ghi_chu?: string;
}

export const COLUMN_MAP: Record<string, string> = {
  "ID CASE": "case_id",
  "ID KTV": "ktv_id",
  "NGÀY GHI NHẬN": "ngay_ghi_nhan",
  "LOẠI LỖI": "loai_loi",
  "KẾT QUẢ CẤP 1": "ket_qua_cap_1",
  "GHI CHÚ": "ghi_chu",
};

importViPham.get("/column-map", (c) => c.json({ columnMap: COLUMN_MAP }));

const TEMPLATE_ROWS = [
  ["ID CASE", "ID KTV", "NGÀY GHI NHẬN", "LOẠI LỖI", "KẾT QUẢ CẤP 1", "GHI CHÚ"],
  ["1234567", "", "01/09/2026", "GQKN - Vi phạm có khiếu nại", "Lỗi khác", "Có ID case - ánh xạ vào case này. LOẠI LỖI: nhập tự do; KẾT QUẢ CẤP 1: theo danh mục Loại lỗi vi phạm"],
  ["", "truongnx.ctv24h", "02/09/2026", "", "Lỗi khác", "Không có ID case - gắn thẳng vào KTV theo mã"],
];

// GET /api/import/vi-pham/template
importViPham.get("/template", (c) => excelTemplateResponse(c, TEMPLATE_ROWS, "mau_import_vi_pham.xlsx"));

interface ParsedRow {
  lineNo: number;
  caseId: string;
  ktvId: string;
  loaiLoi: string;
  loaiLoiChiTiet: string | null;
  khoaTrung: string;
  ketQuaCap1: string;
  ghiChu: string | null;
  ngayGhiNhan: string;
}

// Nhu runBatched() nhung tra ve tong so dong THUC SU ghi (meta.changes) - ON CONFLICT DO NOTHING bo qua
// dong trung thi changes = 0, de bao dung "X moi / Y da co" thay vi dem ca dong bi bo qua.
async function runBatchedCountChanges(db: D1Database, statements: D1PreparedStatement[]): Promise<number> {
  let total = 0;
  for (let i = 0; i < statements.length; i += CHUNK_SIZE_BATCH) {
    const results = await db.batch(statements.slice(i, i + CHUNK_SIZE_BATCH));
    for (const r of results) total += r.meta?.changes ?? 0;
  }
  return total;
}

async function processRows(db: D1Database, rows: ImportRow[], commit: boolean, scope: string[] | null, actorEmail: string) {
  // boQuaTrung: dong hop le nhung DA CO san (khoa trung, vd import lai dung file) - chi dem luc commit.
  const summary = { thanhCong: 0, loi: 0, boQuaTrung: 0, errors: [] as string[] };
  const validValues = await loadKetQuaCap1ValidValues(db);
  const ghiChuBatBuocCache = new Map<string, boolean>();
  async function ghiChuBatBuoc(tenLoi: string): Promise<boolean> {
    if (!ghiChuBatBuocCache.has(tenLoi)) ghiChuBatBuocCache.set(tenLoi, await isGhiChuBatBuocForKetQuaCap1(db, tenLoi));
    return ghiChuBatBuocCache.get(tenLoi)!;
  }

  const caseRows: ParsedRow[] = [];
  const ktvRows: ParsedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNo = i + 1;
    const caseId = String(row.case_id ?? "").trim();
    const ktvId = String(row.ktv_id ?? "").trim();
    if (!caseId && !ktvId) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: phai co "ID case" hoac "ID KTV"`);
      continue;
    }

    const ngayRaw = String(row.ngay_ghi_nhan ?? "").trim();
    if (!ngayRaw) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: thieu "Ngay ghi nhan"`);
      continue;
    }
    const ngayGhiNhan = parseSheetDateTime(isoUtcToVnLocal(ngayRaw));
    if (!/^\d{4}-\d{2}-\d{2}/.test(ngayGhiNhan)) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: "Ngay ghi nhan" = "${ngayRaw}" khong dung dinh dang (dd/mm/yyyy hoac yyyy-mm-dd)`);
      continue;
    }

    const loaiLoiRaw = String(row.loai_loi ?? "").trim();
    const loaiLoiCoDinh = loaiLoiRaw ? LOAI_LOI_BY_BO_DAU.get(boDau(loaiLoiRaw)) : undefined;
    const loaiLoi = loaiLoiCoDinh ?? "Khac";
    const loaiLoiChiTiet = loaiLoiRaw && !loaiLoiCoDinh ? loaiLoiRaw.slice(0, 200) : null;

    const ketQuaCap1 = normalizeKetQuaCap1(String(row.ket_qua_cap_1 ?? ""));
    if (!ketQuaCap1) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: thieu "Ket qua cap 1"`);
      continue;
    }
    // "Khong loi" (2026-09-30): van ghi nhan, nhung tu dong chot QC bo loi luc commit (xem duoi).
    if (!validValues.has(ketQuaCap1)) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: "Ket qua cap 1" = "${ketQuaCap1}" khong co trong danh muc "Loai loi vi pham" (Settings)`);
      continue;
    }
    if ((await ghiChuBatBuoc(ketQuaCap1)) && !String(row.ghi_chu ?? "").trim()) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: "${ketQuaCap1}" bat buoc phai co "Ghi chu"`);
      continue;
    }

    const ghiChu = String(row.ghi_chu ?? "").trim() || null;
    const parsed: ParsedRow = { lineNo, caseId, ktvId, loaiLoi, loaiLoiChiTiet, khoaTrung: khoaTrungImport(loaiLoi, loaiLoiChiTiet, ngayGhiNhan, ghiChu), ketQuaCap1, ghiChu, ngayGhiNhan };
    if (caseId) caseRows.push(parsed);
    else ktvRows.push(parsed);
  }

  // Nhanh A: co ID case -> ghi vao vi_pham (bang hien co), giong het luong tao thu cong 1 ca
  // (POST /vi-pham/case/:caseId) chi khac la bulk + loai_loi doc tu file thay vi hardcode 'Khac'.
  const caseIds = [...new Set(caseRows.map((r) => r.caseId))];
  const caseInfo = new Map<string, { khu_vuc: string | null }>();
  for (let i = 0; i < caseIds.length; i += 100) {
    const chunk = caseIds.slice(i, i + 100);
    const placeholders = chunk.map(() => "?").join(", ");
    const { results } = await db.prepare(`SELECT id, khu_vuc FROM case_dvbh WHERE id IN (${placeholders})`).bind(...chunk).all<{ id: string; khu_vuc: string | null }>();
    for (const row of results) caseInfo.set(row.id, { khu_vuc: row.khu_vuc });
  }
  const validCaseRows: ParsedRow[] = [];
  for (const r of caseRows) {
    const info = caseInfo.get(r.caseId);
    if (!info) {
      summary.loi++;
      summary.errors.push(`Dong ${r.lineNo}: khong tim thay case "${r.caseId}"`);
      continue;
    }
    if (scope !== null && !scope.includes(String(info.khu_vuc))) {
      summary.loi++;
      summary.errors.push(`Dong ${r.lineNo}: case "${r.caseId}" ngoai khu vuc phu trach`);
      continue;
    }
    validCaseRows.push(r);
  }

  // Nhanh B: khong co ID case -> ghi vao vi_pham_ktv (bang moi, migration 0115), suy khu_vuc/ten day
  // du cua KTV tu case GAN NHAT ma KTV do tung xu ly (yeu cau chu he thong 2026-09-22) - KHONG tim
  // thay nghia la KTV chua tung co ca nao trong he thong, tu choi dong do (khong doan duoc khu vuc).
  const ktvIds = [...new Set(ktvRows.map((r) => r.ktvId))];
  const ktvInfo = new Map<string, { kyThuatVienFull: string; khuVuc: string | null }>();
  for (const ktvId of ktvIds) {
    const row = await db
      .prepare(`SELECT ky_thuat_vien, khu_vuc FROM case_dvbh WHERE ky_thuat_vien LIKE ? ORDER BY thoi_gian_cskh_tiep_nhan DESC LIMIT 1`)
      .bind(`(${ktvId})%`)
      .first<{ ky_thuat_vien: string; khu_vuc: string | null }>();
    if (row) ktvInfo.set(ktvId, { kyThuatVienFull: row.ky_thuat_vien, khuVuc: row.khu_vuc });
  }
  const validKtvRows: (ParsedRow & { info: { kyThuatVienFull: string; khuVuc: string | null } })[] = [];
  for (const r of ktvRows) {
    const info = ktvInfo.get(r.ktvId);
    if (!info) {
      summary.loi++;
      summary.errors.push(`Dong ${r.lineNo}: khong tim thay KTV co ma "${r.ktvId}" trong he thong (chua tung co ca nao dung ma nay)`);
      continue;
    }
    if (scope !== null && !scope.includes(String(info.khuVuc))) {
      summary.loi++;
      summary.errors.push(`Dong ${r.lineNo}: KTV "${r.ktvId}" ngoai khu vuc phu trach`);
      continue;
    }
    validKtvRows.push({ ...r, info });
  }

  summary.thanhCong = validCaseRows.length + validKtvRows.length;

  if (!commit) {
    // Preview: dem truoc dong DA CO (cung khoa UNIQUE voi dong da ghi, hoac trung dong khac trong chinh
    // file) de nguoi dung thay "se bo qua" TRUOC khi bam xac nhan - vd import lai dung file cu.
    const seen = new Set<string>();
    const caseIdList = [...new Set(validCaseRows.map((r) => r.caseId))];
    for (let i = 0; i < caseIdList.length; i += 100) {
      const chunk = caseIdList.slice(i, i + 100);
      const { results } = await db
        .prepare(`SELECT case_id, loai_loi, ket_qua_cap_1, khoa_trung FROM vi_pham WHERE case_id IN (${chunk.map(() => "?").join(", ")})`)
        .bind(...chunk)
        .all<{ case_id: string; loai_loi: string; ket_qua_cap_1: string | null; khoa_trung: string }>();
      for (const e of results) seen.add(`c|${e.case_id}|${e.loai_loi}|${e.ket_qua_cap_1}|${e.khoa_trung}`);
    }
    const ktvList = [...new Set(validKtvRows.map((r) => r.info.kyThuatVienFull))];
    for (let i = 0; i < ktvList.length; i += 100) {
      const chunk = ktvList.slice(i, i + 100);
      const { results } = await db
        .prepare(`SELECT ky_thuat_vien, ngay_ghi_nhan, loai_loi, ket_qua_cap_1, khoa_trung FROM vi_pham_ktv WHERE ky_thuat_vien IN (${chunk.map(() => "?").join(", ")})`)
        .bind(...chunk)
        .all<{ ky_thuat_vien: string; ngay_ghi_nhan: string; loai_loi: string; ket_qua_cap_1: string; khoa_trung: string }>();
      for (const e of results) seen.add(`k|${e.ky_thuat_vien}|${e.ngay_ghi_nhan}|${e.loai_loi}|${e.ket_qua_cap_1}|${e.khoa_trung}`);
    }
    const keys = [
      ...validCaseRows.map((r) => `c|${r.caseId}|${r.loaiLoi}|${r.ketQuaCap1}|${r.khoaTrung}`),
      ...validKtvRows.map((r) => `k|${r.info.kyThuatVienFull}|${r.ngayGhiNhan}|${r.loaiLoi}|${r.ketQuaCap1}|${r.khoaTrung}`),
    ];
    let trung = 0;
    for (const k of keys) {
      if (seen.has(k)) trung++;
      else seen.add(k);
    }
    summary.boQuaTrung = trung;
    summary.thanhCong -= trung;
  }

  if (commit) {
    // KQ cap 1 = "Khong loi" (yeu cau chu he thong 2026-09-30): van ghi nhan nhung tu dong chot QC BO
    // loi ngay luc insert (chot_bo_cap_2 = 0, nguoi_chot = nguoi import) - khong vao hang doi "cho QC".
    // Luong import von khong push sang app vipham (xem chu thich dau file) nen khong can chan them.
    const ngayChotAuto = nowVN();
    let inserted = 0;
    const autoBoLoi = (kq: string): [number | null, string | null, string | null] =>
      kq === "Khong loi" ? [0, actorEmail, ngayChotAuto] : [null, null, null];
    if (validCaseRows.length > 0) {
      const ids = await reserveSequentialIds(db, "vi_pham", "L", 6, validCaseRows.length);
      const statements = validCaseRows.map((r, i) =>
        db
          .prepare(
            `INSERT INTO vi_pham (id, ket_qua_goi_id, case_id, loai_loi, loai_loi_chi_tiet, khoa_trung, ket_qua_cap_1, ghi_chu, nguoi_ghi_nhan, ngay_ghi_nhan, chot_bo_cap_2, nguoi_chot, ngay_chot)
             VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(case_id, loai_loi, ket_qua_cap_1, khoa_trung) DO NOTHING`,
          )
          .bind(ids[i], r.caseId, r.loaiLoi, r.loaiLoiChiTiet, r.khoaTrung, r.ketQuaCap1, r.ghiChu, actorEmail, r.ngayGhiNhan, ...autoBoLoi(r.ketQuaCap1)),
      );
      inserted += await runBatchedCountChanges(db, statements);
    }
    if (validKtvRows.length > 0) {
      const ids = await reserveSequentialIds(db, "vi_pham_ktv", "LK", 6, validKtvRows.length);
      const statements = validKtvRows.map((r, i) =>
        db
          .prepare(
            `INSERT INTO vi_pham_ktv (id, ky_thuat_vien, khu_vuc, loai_loi, loai_loi_chi_tiet, khoa_trung, ket_qua_cap_1, ghi_chu, nguoi_ghi_nhan, ngay_ghi_nhan, chot_bo_cap_2, nguoi_chot, ngay_chot)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(ky_thuat_vien, ngay_ghi_nhan, loai_loi, ket_qua_cap_1, khoa_trung) DO NOTHING`,
          )
          .bind(ids[i], r.info.kyThuatVienFull, r.info.khuVuc, r.loaiLoi, r.loaiLoiChiTiet, r.khoaTrung, r.ketQuaCap1, r.ghiChu, actorEmail, r.ngayGhiNhan, ...autoBoLoi(r.ketQuaCap1)),
      );
      inserted += await runBatchedCountChanges(db, statements);
    }
    summary.boQuaTrung = summary.thanhCong - inserted;
    summary.thanhCong = inserted;
    if (inserted > 0) await bumpVersions(db, ["vi_pham"]);
  }

  return summary;
}

// POST /api/import/vi-pham/preview
importViPham.post("/preview", requireImportRole, async (c) => {
  const body = await c.req.json<{ rows: ImportRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const scope = scopeByKhuVuc(c);
  const summary = await processRows(c.env.DB, body.rows, false, scope, c.get("user").email);
  return c.json(summary);
});

// POST /api/import/vi-pham/commit
importViPham.post("/commit", requireImportRole, async (c) => {
  const body = await c.req.json<{ rows: ImportRow[]; filename?: string }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const scope = scopeByKhuVuc(c);
  const user = c.get("user");
  const summary = await processRows(c.env.DB, body.rows, true, scope, user.email);
  c.executionCtx.waitUntil(
    logImportHistory(c.env.DB, {
      loai: "vi_pham_import",
      tenFile: body.filename || "(không rõ tên file)",
      nguoiImport: user.email,
      thanhCong: summary.thanhCong,
      loi: summary.loi,
    }),
  );
  return c.json(summary);
});

export default importViPham;
