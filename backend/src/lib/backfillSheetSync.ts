/**
 * Dong bo du lieu lich su (giai trinh cu, khao sat cu) tu Google Sheet publish TSV -
 * header cua sheet PHAI trung ten cot DB (giong het file mau CSV cua tung loai import,
 * xem TEMPLATE_CSV trong importGiaiTrinh.ts/importKhaoSat.ts), nen khong can COLUMN_MAP
 * nhu case_id/CRM - chi can parse ngay/gio dung dinh dang truoc khi dua qua processRows()
 * dung chung voi luong upload file thu cong.
 */

import { parseSheetDateTime, parseSheetDateOnly } from "./sheetDateParser";

// "columnMap" (optional): anh xa ten cot Sheet (vd tieng Viet co dau nguoi dung quen go, giong
// COLUMN_MAP cua CRM/nap-gas) -> ten cot chuan hoa dung trong DB - ap dung TRUOC khi so voi
// dateTimeFields/dateOnlyFields (2 Set nay luon dung ten chuan hoa). Khong truyen thi giu nguyen
// header goc (hanh vi cu, dung cho giai_trinh_cu/giai_trinh_lap_cu/khao_sat_cu - cac sheet nay yeu
// cau header da la snake_case tu truoc gio). BUG DA SUA (2026-07-24): truoc day nap-gas sync-sheet
// KHONG dung columnMap nen sheet header tieng Viet (dung dinh dang huong dan cho nguoi dung) bi doc
// thanh 0 dong ma KHONG BAO LOI GI (hasCaseId luon false vi khong co header nao ten dung "case_id"),
// import "thanh cong 0 dong" trong im lang - rat de gay hieu nham da import xong.
export function parseBackfillTsv(
  tsvText: string,
  dateTimeFields: Set<string>,
  dateOnlyFields: Set<string> = new Set(),
  columnMap?: Record<string, string>,
): Record<string, unknown>[] {
  const lines = tsvText.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length <= 1) return [];

  const headers = lines[0].split("\t").map((h) => columnMap?.[h.trim()] ?? h.trim());

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const row: Record<string, unknown> = {};
    let hasCaseId = false;

    headers.forEach((field, idx) => {
      if (!field) return;
      const raw = (cols[idx] ?? "").trim();
      if (field === "case_id") hasCaseId = hasCaseId || !!raw;

      if (dateTimeFields.has(field)) {
        row[field] = parseSheetDateTime(raw) || null;
      } else if (dateOnlyFields.has(field)) {
        row[field] = parseSheetDateOnly(raw);
      } else {
        row[field] = raw || null;
      }
    });

    if (hasCaseId) rows.push(row);
  }
  return rows;
}

export async function fetchSheetText(sheetUrl: string): Promise<string> {
  const res = await fetch(sheetUrl);
  if (!res.ok) throw new Error(`Khong tai duoc Google Sheet (HTTP ${res.status})`);
  return res.text();
}

export async function getSheetUrl(db: D1Database, loaiDongBo: string): Promise<string | null> {
  const row = await db.prepare("SELECT url FROM settings_sheet_urls WHERE loai_dong_bo = ?").bind(loaiDongBo).first<{ url: string | null }>();
  return row?.url ?? null;
}
