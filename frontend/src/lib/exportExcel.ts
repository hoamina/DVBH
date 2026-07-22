/**
 * Xuat mang du lieu ra file .xlsx that (thay the stub exportExcel() cua mockup).
 * Import dong (dynamic import) de xlsx (~1MB) chi tai khi nguoi dung thuc su xuat file,
 * khong lam nang bundle chinh cua ung dung.
 */
export async function exportRowsToExcel<T extends object>(rows: T[], filename: string, sheetName = "Data") {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}
