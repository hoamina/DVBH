// Dong bo hang ngay 03:00 gio VN (xem index.ts VI_PHAM_SHEET_SYNC_CRON) tu 1 Google Sheet QC tu quan
// ly ben ngoai he thong (yeu cau chu he thong 2026-09-16) - sheet co 4 cot: "ID sự vụ" (case_id),
// "Ngày thực hiện", "Vi phạm" (ten loai loi - CHOT: nhan nguyen van, KHONG bat buoc phai khop tuyet
// doi voi settings_loai_vi_pham vi kiem tra thuc te cho thay co gia tri lech chu vd "Liên hệ chậm
// hoặc sai hẹn với KH theo quy định" khac "Không liên hệ hoặc sai hẹn..." da seed - ep khop se lam
// mat du lieu that), "Nội dung 3T cần giải trình" (-> vi_pham.ghi_chu).
//
// Moi dong tao 1 vi_pham voi loai_loi='Khac' (xem migration 0113), KHONG co ket_qua_goi dung sau (Sheet
// nay khong xuat phat tu cuoc goi CSKH) - vao "cho QC" nhu binh thuong (CHOT voi chu he thong: khong
// tu dong chot, de QC van kiem tra lai truoc khi tinh la vi pham chinh thuc, phong truong hop
// case_id/noi dung ghi sai trong Sheet).
import type { Env } from "../types";
import { fetchSheetText, getSheetUrl, parseBackfillTsv } from "./backfillSheetSync";
import { logImportHistory } from "./backfillImportProcessor";
import { nowVN } from "./vnTime";
import { reserveSequentialIds } from "./idCounter";
import { bumpVersions } from "./dataVersions";
import { pushViPhamToVipham } from "./viPhamBenNgoai";

const SHEET_COLUMN_MAP: Record<string, string> = {
  "ID sự vụ": "case_id",
  "Ngày thực hiện": "ngay_thuc_hien",
  "Vi phạm": "vi_pham",
  "Nội dung 3T cần giải trình": "noi_dung",
};

interface SheetRow {
  case_id: string;
  ngay_thuc_hien: string | null;
  vi_pham: string | null;
  noi_dung: string | null;
}

export type ViPhamSheetSyncResult =
  | { ok: true; summary: { thanhCong: number; boQua: number; loi: number; errors: string[] } }
  | { ok: false; reason: "MISSING_SHEET_URL" }
  | { ok: false; reason: "FETCH_FAILED"; message: string };

const TEN_FILE_SYNC = "Đồng bộ vi phạm QC (Sheet ngoài)";
const LOAI_IMPORT_HISTORY = "vi_pham_ngoai";

export async function syncViPhamFromSheet(env: Env, actorEmail: string): Promise<ViPhamSheetSyncResult> {
  const db = env.DB;
  const url = await getSheetUrl(db, "vi_pham_ngoai");
  if (!url) {
    await logImportHistory(db, {
      loai: LOAI_IMPORT_HISTORY,
      tenFile: TEN_FILE_SYNC,
      nguoiImport: actorEmail,
      thanhCong: 0,
      loi: 0,
      bgError: "Chưa cấu hình link Google Sheet (xem Settings > Đường dẫn đồng bộ).",
    });
    return { ok: false, reason: "MISSING_SHEET_URL" };
  }

  let sheetRows: SheetRow[];
  try {
    const text = await fetchSheetText(url);
    sheetRows = parseBackfillTsv(text, new Set(), new Set(["ngay_thuc_hien"]), SHEET_COLUMN_MAP) as unknown as SheetRow[];
  } catch (err) {
    const message = (err as Error).message;
    await logImportHistory(db, {
      loai: LOAI_IMPORT_HISTORY,
      tenFile: TEN_FILE_SYNC,
      nguoiImport: actorEmail,
      thanhCong: 0,
      loi: 0,
      bgError: `Không tải được Google Sheet: ${message}`,
    });
    return { ok: false, reason: "FETCH_FAILED", message };
  }

  const errors: string[] = [];
  const validRows = sheetRows.filter((r) => {
    if (!r.vi_pham?.trim()) {
      errors.push(`Ca ${r.case_id}: bỏ qua vì cột "Vi phạm" trống`);
      return false;
    }
    return true;
  });

  // Kiem tra case_id thuc su ton tai (1 lan IN query, tranh N+1) - loi FK neu insert thang case_id sai.
  const caseIds = [...new Set(validRows.map((r) => r.case_id))];
  const existingCaseIds = new Set<string>();
  if (caseIds.length > 0) {
    const CHUNK = 100;
    for (let i = 0; i < caseIds.length; i += CHUNK) {
      const chunk = caseIds.slice(i, i + CHUNK);
      const { results } = await db
        .prepare(`SELECT id FROM case_dvbh WHERE id IN (${chunk.map(() => "?").join(",")})`)
        .bind(...chunk)
        .all<{ id: string }>();
      results.forEach((r) => existingCaseIds.add(r.id));
    }
  }

  const rowsToInsert = validRows.filter((r) => {
    if (!existingCaseIds.has(r.case_id)) {
      errors.push(`Ca ${r.case_id}: không tìm thấy trong hệ thống, bỏ qua`);
      return false;
    }
    return true;
  });

  if (rowsToInsert.length === 0) {
    await logImportHistory(db, {
      loai: LOAI_IMPORT_HISTORY,
      tenFile: TEN_FILE_SYNC,
      nguoiImport: actorEmail,
      thanhCong: 0,
      loi: errors.length,
      bgError: errors.length > 0 ? errors.join("\n") : null,
    });
    return { ok: true, summary: { thanhCong: 0, boQua: 0, loi: errors.length, errors } };
  }

  // Can case_dvbh cho payload bao sang vipham (khach_hang/khu_vuc/ky_thuat_vien/seri_san_pham) - 1
  // lan IN query cho ca batch, giong buoc kiem tra ton tai o tren.
  const caseInfoMap = new Map<string, { khach_hang: string | null; khu_vuc: string | null; ky_thuat_vien: string | null; seri_san_pham: string | null }>();
  const insertCaseIds = [...new Set(rowsToInsert.map((r) => r.case_id))];
  {
    const CHUNK = 100;
    for (let i = 0; i < insertCaseIds.length; i += CHUNK) {
      const chunk = insertCaseIds.slice(i, i + CHUNK);
      const { results } = await db
        .prepare(`SELECT id, khach_hang, khu_vuc, ky_thuat_vien, seri_san_pham FROM case_dvbh WHERE id IN (${chunk.map(() => "?").join(",")})`)
        .bind(...chunk)
        .all<{ id: string; khach_hang: string | null; khu_vuc: string | null; ky_thuat_vien: string | null; seri_san_pham: string | null }>();
      results.forEach((r) => caseInfoMap.set(r.id, r));
    }
  }

  const ids = await reserveSequentialIds(db, "vi_pham", "L", 6, rowsToInsert.length);
  const ngayGhiNhanMac = nowVN();
  const statements = rowsToInsert.map((r, i) =>
    db
      .prepare(
        // ON CONFLICT: khoa UNIQUE(case_id, loai_loi, ket_qua_cap_1) - dong bo lai dung 1 dong da co
        // tu lan chay truoc thi bo qua (idempotency tu nhien cho cron hang ngay doc lai TOAN BO sheet).
        `INSERT INTO vi_pham (id, ket_qua_goi_id, case_id, loai_loi, ket_qua_cap_1, ghi_chu, nguoi_ghi_nhan, ngay_ghi_nhan)
         VALUES (?, NULL, ?, 'Khac', ?, ?, ?, ?)
         ON CONFLICT(case_id, loai_loi, ket_qua_cap_1) DO NOTHING`,
      )
      .bind(ids[i], r.case_id, r.vi_pham!.trim(), r.noi_dung?.trim() || null, actorEmail, r.ngay_thuc_hien || ngayGhiNhanMac),
  );
  const batchResults = await db.batch(statements);

  let thanhCong = 0;
  let boQua = 0;
  // Thu gom promise push sang app vipham vao mang, await CHUNG o cuoi (khong dung waitUntil - ham nay
  // duoc goi tu ca route thu cong (co ExecutionContext) lan scheduled() (khong truyen ctx xuong day) -
  // await truc tiep la du vi ca 2 noi goi deu da await/return ham nay truoc khi ket thuc request/cron).
  const pushPromises: Promise<void>[] = [];
  rowsToInsert.forEach((r, i) => {
    if (batchResults[i]?.meta.changes) {
      thanhCong++;
      const caseInfo = caseInfoMap.get(r.case_id);
      // Bao sang app vipham nhu 1 "nghi ngo moi" (giong luong CSKH ghi nhan qua dien thoai, xem
      // routes/survey.ts POST /calls).
      pushPromises.push(
        pushViPhamToVipham(env, {
          loai_su_kien: "nghi_ngo_moi",
          vi_pham_id: ids[i],
          case_id: r.case_id,
          loai_loi: "Khac",
          ket_qua_cap_1: r.vi_pham!.trim(),
          khach_hang: caseInfo?.khach_hang ?? null,
          khu_vuc: caseInfo?.khu_vuc ?? null,
          ky_thuat_vien: caseInfo?.ky_thuat_vien ?? null,
          seri_san_pham: caseInfo?.seri_san_pham ?? null,
          ngay_ghi_nhan: r.ngay_thuc_hien || ngayGhiNhanMac,
          nguoi_ghi_nhan: actorEmail,
          ghi_chu: r.noi_dung?.trim() || null,
        }),
      );
    } else {
      boQua++;
    }
  });
  await Promise.all(pushPromises);

  if (thanhCong > 0) await bumpVersions(db, ["vi_pham"]);

  await logImportHistory(db, {
    loai: LOAI_IMPORT_HISTORY,
    tenFile: TEN_FILE_SYNC,
    nguoiImport: actorEmail,
    thanhCong,
    loi: errors.length,
    bgError: errors.length > 0 ? errors.join("\n") : null,
  });

  return { ok: true, summary: { thanhCong, boQua, loi: errors.length, errors } };
}
