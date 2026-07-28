/**
 * Xuat mang du lieu ra file .xlsx that (thay the stub exportExcel() cua mockup).
 * Import dong (dynamic import) de xlsx (~1MB) chi tai khi nguoi dung thuc su xuat file,
 * khong lam nang bundle chinh cua ung dung.
 *
 * headerLabels (tuy chon): map "field key -> nhan tieng Viet" de doi ten cot tren Excel giong het
 * cot hien thi tren man hinh (thay vi khoa noi bo nhu "khach_hang", "thoi_gian_cskh_tiep_nhan").
 * Key khong co trong map van giu nguyen ten khoa goc (khong am tham mat cot nao).
 */
export async function exportRowsToExcel<T extends object>(rows: T[], filename: string, sheetName = "Data", headerLabels?: Record<string, string>) {
  const XLSX = await import("xlsx");
  const exportRows = headerLabels ? rows.map((row) => remapKeys(row, headerLabels)) : rows;
  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

function remapKeys<T extends object>(row: T, headerLabels: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    out[headerLabels[key] ?? key] = value;
  }
  return out;
}
