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
const EXCLUDED_EXPORT_FIELDS = ["link_hinh_anh"];

export async function exportRowsToExcel<T extends object>(
  rows: T[],
  filename: string,
  sheetName = "Data",
  headerLabels?: Record<string, string>,
  options?: { includeFields?: string[] },
) {
  const XLSX = await import("xlsx");
  const cleanedRows = rows.map((row) => omitExcludedFields(row, options?.includeFields ?? []));
  const exportRows = headerLabels ? cleanedRows.map((row) => remapKeys(row, headerLabels)) : cleanedRows;
  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
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
