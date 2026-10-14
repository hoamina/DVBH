import { api } from "../api/client";
import { DiaGioiIndex, NHAN_CAP_1, NHAN_CAP_2, coTienTo, diaGioiModeHienTai, khoaTen, type QuyDoiRow } from "./diaGioi";

/**
 * Xuat mang du lieu ra file .xlsx that (thay the stub exportExcel() cua mockup).
 * Import dong (dynamic import) de xlsx (~1MB) chi tai khi nguoi dung thuc su xuat file,
 * khong lam nang bundle chinh cua ung dung.
 *
 * headerLabels (tuy chon): map "field key -> nhan tieng Viet" de doi ten cot tren Excel giong het
 * cot hien thi tren man hinh (thay vi khoa noi bo nhu "khach_hang", "thoi_gian_cskh_tiep_nhan").
 * Key khong co trong map van giu nguyen ten khoa goc (khong am tham mat cot nao).
 */
// Truong KHONG duoc xuat ra Excel o bat ky dau trong app theo mac dinh (url anh tho, khong phai du
// lieu bao cao) - loai bo ngay tai day (1 diem duy nhat) thay vi phai sua tung noi goi
// exportRowsToExcel. CHOT 2026-08-03: rieng "Danh sach tong" cho Admin van duoc xuat cot nay (can
// tra cuu anh khi xu ly khieu nai/doi soat) - noi goi truyen includeFields: ["link_hinh_anh"] de bo
// qua loai tru CHI cho lan xuat do, khong doi mac dinh cho moi noi khac.
// "_dg" = khoa noi bo cua dong bao cao gom theo dia gioi (lib/diaGioi.ts gopBangTheoTinh), khong xuat.
const EXCLUDED_EXPORT_FIELDS = ["link_hinh_anh", "_dg"];

export async function exportRowsToExcel<T extends object>(
  rows: T[],
  filename: string,
  sheetName = "Data",
  headerLabels?: Record<string, string>,
  options?: { includeFields?: string[] },
) {
  const XLSX = await import("xlsx");
  let cleanedRows = rows.map((row) => omitExcludedFields(row, options?.includeFields ?? []));
  let labels = headerLabels;
  // Danh sach CA (dong co id + tinh + quan_huyen): them 2 cot dia gioi theo nut Cũ/Mới (lib/diaGioi.ts), dat ten
  // tieng Viet cho cac cot dia chi tho - 1 diem chung cho moi file xuat danh sach ca.
  if (laDongCa(cleanedRows[0])) {
    const dg = await themCotDiaGioi(cleanedRows);
    cleanedRows = dg.rows;
    labels = { ...(headerLabels ?? {}), ...dg.labels };
  }
  const exportRows = labels ? cleanedRows.map((row) => remapKeys(row, labels!)) : cleanedRows;
  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

function laDongCa(row: Record<string, unknown> | undefined): boolean {
  return !!row && "id" in row && "tinh" in row && "quan_huyen" in row;
}

const COT_DG_1 = "__dg_cap1";
const COT_DG_2 = "__dg_cap2";
// Cot dia chi THO giu lai de doi chieu (ten khac 2 cot theo che do de khong trung tieu de).
const NHAN_COT_THO: Record<string, string> = {
  tinh: "Tỉnh (gốc)",
  quan_huyen: "Quận/Huyện (gốc)",
  tinh_moi: "Tỉnh mới (Odoo)",
  xa_moi: "Xã mới (Odoo)",
  tinh_cu: "Tỉnh cũ (Odoo)",
  huyen_cu: "Huyện cũ (Odoo)",
  xa_cu: "Xã cũ (Odoo)",
};

/** Them "Tỉnh cũ" + "Quận/Huyện" (che do Cũ) hoac "Tỉnh mới" + "Xã/Phường mới" (che do Mới) - CUNG cach chuan hoa + quy
 * doi voi bang bao cao (DiaGioiIndex, bang "Quy đổi tỉnh"). Chen ngay truoc cot "tinh". */
export async function themCotDiaGioi(rows: Record<string, unknown>[]): Promise<{ rows: Record<string, unknown>[]; labels: Record<string, string> }> {
  const mode = diaGioiModeHienTai();
  let quyDoi: QuyDoiRow[] = [];
  try {
    quyDoi = (await api.get<{ rows: QuyDoiRow[] }>("/dia-gioi/quy-doi")).rows;
  } catch {
    /* khong tai duoc bang quy doi -> van xuat, tinh cu chua quy doi se ghi "(chưa quy đổi)" */
  }
  const idx = new DiaGioiIndex(quyDoi);
  const s = (v: unknown) => (typeof v === "string" ? v : v == null ? null : String(v));
  // Cap 2: gop bien the co/khong tien to ("Huyện X" / "X") ve 1 ten - uu tien ten co tien to xuat hien trong file.
  const tenCap2 = new Map<string, string>();
  for (const r of rows) {
    const raw = s(mode === "moi" ? r.xa_moi : r.quan_huyen)?.trim();
    if (!raw) continue;
    const k = khoaTen(raw);
    const co = tenCap2.get(k);
    if (!co || (!coTienTo(co) && coTienTo(raw))) tenCap2.set(k, raw.replace(/\s+/g, " "));
  }
  const out = rows.map((r) => {
    const cap1 = idx.tinh(mode, { tinh: s(r.tinh), tinh_moi: s(r.tinh_moi) });
    const raw2 = s(mode === "moi" ? r.xa_moi : r.quan_huyen)?.trim();
    const cap2 = raw2 ? (tenCap2.get(khoaTen(raw2)) ?? raw2) : "";
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (k === "tinh") {
        o[COT_DG_1] = cap1;
        o[COT_DG_2] = cap2;
      }
      o[k] = v;
    }
    return o;
  });
  return { rows: out, labels: { ...NHAN_COT_THO, [COT_DG_1]: NHAN_CAP_1[mode], [COT_DG_2]: NHAN_CAP_2[mode] } };
}

function omitExcludedFields<T extends object>(row: T, includeFields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(row as unknown as Record<string, unknown>) };
  for (const field of EXCLUDED_EXPORT_FIELDS) {
    if (!includeFields.includes(field)) delete out[field];
  }
  return out;
}

function remapKeys(row: Record<string, unknown>, headerLabels: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[headerLabels[key] ?? key] = value;
  }
  return out;
}
