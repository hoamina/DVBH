import type { Context } from "hono";
import * as XLSX from "xlsx";

/**
 * Tra ve file mau .xlsx (khac csvTemplate.ts la .csv) - dung khi nguoi dung yeu cau ro file mau phai
 * mo duoc truc tiep bang Excel dung dinh dang .xlsx (khong phai .csv doi ten). XLSX.write({type:
 * "array"}) tra ve Uint8Array, an toan trong Workers runtime (khong dung nodejs fs).
 */
export function excelTemplateResponse(c: Context, rows: (string | number)[][], filename: string) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Mau");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as Uint8Array;
  return c.body(buffer as unknown as ArrayBuffer, 200, {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename=${filename}`,
  });
}
