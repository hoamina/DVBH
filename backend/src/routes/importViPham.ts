import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { scopeByKhuVuc } from "../middleware/scopeByKhuVuc";
import { csvTemplateResponse } from "../lib/csvTemplate";
import { parseSheetDateTime } from "../lib/sheetDateParser";
import { loadKetQuaCap1ValidValues, isGhiChuBatBuocForKetQuaCap1 } from "../lib/ketQuaCap1";
import { reserveSequentialIds } from "../lib/idCounter";
import { runBatched, logImportHistory } from "../lib/backfillImportProcessor";
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
const importViPham = new Hono<{ Bindings: Env }>();
importViPham.use("*", verifySessionMiddleware, loadUser, requireRole("Admin", "QC", "CSKH", "TN CSKH", "TBP CSKH"));

// "KSNB" co CHU DICH KHONG co trong danh sach nay - danh rieng cho dong bo Google Sheet tu dong
// (xem migration 0114), import tay khong duoc nhan danh nguon do.
const LOAI_LOI_IMPORT_VALUES = new Set(["Loi 120 phut", "Hen qua 24h", "Loi lo ke hoach", "KH hen lai", "Khac"]);

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

const TEMPLATE_CSV =
  "ID CASE,ID KTV,NGÀY GHI NHẬN,LOẠI LỖI,KẾT QUẢ CẤP 1,GHI CHÚ\n" +
  "1234567,,01/09/2026,Khac,Lỗi khác,Có ID case - anh_xa vao case nay\n" +
  ",truongnx.ctv24h,02/09/2026,Khac,Lỗi khác,Khong co ID case - gan thang vao KTV theo ma\n";

// GET /api/import/vi-pham/template
importViPham.get("/template", (c) => csvTemplateResponse(c, TEMPLATE_CSV, "mau_import_vi_pham.csv"));

interface ParsedRow {
  lineNo: number;
  caseId: string;
  ktvId: string;
  loaiLoi: string;
  ketQuaCap1: string;
  ghiChu: string | null;
  ngayGhiNhan: string;
}

async function processRows(db: D1Database, rows: ImportRow[], commit: boolean, scope: string[] | null, actorEmail: string) {
  const summary = { thanhCong: 0, loi: 0, errors: [] as string[] };
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
    const ngayGhiNhan = parseSheetDateTime(ngayRaw);
    if (!/^\d{4}-\d{2}-\d{2}/.test(ngayGhiNhan)) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: "Ngay ghi nhan" = "${ngayRaw}" khong dung dinh dang (dd/mm/yyyy hoac yyyy-mm-dd)`);
      continue;
    }

    const loaiLoiRaw = String(row.loai_loi ?? "").trim();
    const loaiLoi = loaiLoiRaw || "Khac";
    if (!LOAI_LOI_IMPORT_VALUES.has(loaiLoi)) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: "Loai loi" = "${loaiLoiRaw}" khong hop le (chi nhan: ${[...LOAI_LOI_IMPORT_VALUES].join(", ")}, de trong = "Khac")`);
      continue;
    }

    const ketQuaCap1 = String(row.ket_qua_cap_1 ?? "").trim();
    if (!ketQuaCap1) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: thieu "Ket qua cap 1"`);
      continue;
    }
    if (ketQuaCap1 === "Khong loi") {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: khong duoc import "Khong loi" - day la kenh GHI NHAN vi pham`);
      continue;
    }
    if (!validValues.has(ketQuaCap1)) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: "Ket qua cap 1" = "${ketQuaCap1}" khong co trong danh muc "Loai vi pham" (Settings)`);
      continue;
    }
    if ((await ghiChuBatBuoc(ketQuaCap1)) && !String(row.ghi_chu ?? "").trim()) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: "${ketQuaCap1}" bat buoc phai co "Ghi chu"`);
      continue;
    }

    const parsed: ParsedRow = { lineNo, caseId, ktvId, loaiLoi, ketQuaCap1, ghiChu: String(row.ghi_chu ?? "").trim() || null, ngayGhiNhan };
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

  if (commit) {
    if (validCaseRows.length > 0) {
      const ids = await reserveSequentialIds(db, "vi_pham", "L", 6, validCaseRows.length);
      const statements = validCaseRows.map((r, i) =>
        db
          .prepare(
            `INSERT INTO vi_pham (id, ket_qua_goi_id, case_id, loai_loi, ket_qua_cap_1, ghi_chu, nguoi_ghi_nhan, ngay_ghi_nhan)
             VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(case_id, loai_loi, ket_qua_cap_1) DO NOTHING`,
          )
          .bind(ids[i], r.caseId, r.loaiLoi, r.ketQuaCap1, r.ghiChu, actorEmail, r.ngayGhiNhan),
      );
      await runBatched(db, statements);
    }
    if (validKtvRows.length > 0) {
      const ids = await reserveSequentialIds(db, "vi_pham_ktv", "LK", 6, validKtvRows.length);
      const statements = validKtvRows.map((r, i) =>
        db
          .prepare(
            `INSERT INTO vi_pham_ktv (id, ky_thuat_vien, khu_vuc, loai_loi, ket_qua_cap_1, ghi_chu, nguoi_ghi_nhan, ngay_ghi_nhan)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(ky_thuat_vien, ngay_ghi_nhan, loai_loi, ket_qua_cap_1) DO NOTHING`,
          )
          .bind(ids[i], r.info.kyThuatVienFull, r.info.khuVuc, r.loaiLoi, r.ketQuaCap1, r.ghiChu, actorEmail, r.ngayGhiNhan),
      );
      await runBatched(db, statements);
    }
    if (validCaseRows.length > 0 || validKtvRows.length > 0) await bumpVersions(db, ["vi_pham"]);
  }

  return summary;
}

// POST /api/import/vi-pham/preview
importViPham.post("/preview", async (c) => {
  const body = await c.req.json<{ rows: ImportRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const scope = scopeByKhuVuc(c);
  const summary = await processRows(c.env.DB, body.rows, false, scope, c.get("user").email);
  return c.json(summary);
});

// POST /api/import/vi-pham/commit
importViPham.post("/commit", async (c) => {
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
