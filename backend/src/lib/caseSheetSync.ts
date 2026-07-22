/**
 * Dong bo ca moi tu Google Sheet publish dang TSV - tuong tu linhKienSync.ts nhung
 * cho case_dvbh. Header cua sheet trung khop 1-1 voi COLUMN_MAP (cung dinh dang voi
 * file Excel import thu cong hang ngay), nen dung lai COLUMN_MAP de anh xa cot theo
 * vi tri thay vi phai dinh nghia lai. Sau khi parse, rows duoc dua qua processImport()
 * dung chung voi luong import thu cong (giu nguyen logic ratchet/4 nhanh).
 */

import { COLUMN_MAP, VIOLATION_FIELDS } from "./ratchet";
import { parseSheetDateTime, parseSheetDateOnly } from "./sheetDateParser";

const DATE_TIME_FIELDS = new Set([
  "thoi_gian_cskh_tiep_nhan",
  "thoi_gian_hen_xu_ly",
  "thoi_gian_hoan_thanh",
  "thoi_gian_goc_dong_ca",
  "thoi_gian_tai_du_lieu_crm",
]);
const DATE_ONLY_FIELDS = new Set(["ngay_mua"]);
const NUMERIC_FIELDS = new Set(["dt_san_pham", "dt_linh_kien", "dt_dich_vu", "so_phut_xu_ly"]);
const BOOLEAN_FIELDS = new Set<string>(VIOLATION_FIELDS);

function toBoolFlag(raw: string): boolean {
  const v = raw.trim().toUpperCase();
  return v === "TRUE" || v === "1" || v === "X" || v === "CO" || v === "CÓ";
}

export function parseCaseTsv(tsvText: string): Record<string, unknown>[] {
  const lines = tsvText.split(/\r?\n/).filter((l) => l.length > 0);

  const headers = lines[0]?.split("\t").map((h) => h.trim()) ?? [];
  const dbFields = headers.map((h) => COLUMN_MAP[h] ?? null);

  // Google Sheet "publish to web" thinh thoang tra ve 200 OK nhung noi dung khong phai TSV that
  // (trang loi/rate-limit tam thoi cua Google, cache chua kip cap nhat...) - truoc day cac truong
  // hop nay bi coi la "dong bo thanh cong 0 dong" mot cach am tham (xem import_history: nhieu lan
  // lien tiep ghi_moi/ghi_de/bo_qua/loi deu = 0 xen giua cac lan dong bo that thanh cong hang chuc
  // nghin dong). Neu header khong nhan dien duoc cot "ID" thi coi la fetch that bai, nem loi de
  // route tra ve FETCH_FAILED (502) thay vi ghi nhan mot dong lich su "thanh cong" gia.
  if (!dbFields.includes("id")) {
    throw new Error("Noi dung Google Sheet khong dung dinh dang (khong tim thay cot ID) - co the do loi tam thoi tu Google, thu dong bo lai.");
  }
  if (lines.length <= 1) return [];

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const row: Record<string, unknown> = {};
    let hasId = false;

    dbFields.forEach((field, idx) => {
      if (!field) return; // cot khong nam trong COLUMN_MAP - bo qua
      const raw = (cols[idx] ?? "").trim();

      if (field === "id") {
        row.id = raw;
        hasId = !!raw;
        return;
      }
      if (BOOLEAN_FIELDS.has(field)) {
        row[field] = toBoolFlag(raw);
        return;
      }
      if (NUMERIC_FIELDS.has(field)) {
        const n = Number(raw.replace(/,/g, ""));
        row[field] = raw === "" ? null : Number.isFinite(n) ? n : null;
        return;
      }
      if (DATE_TIME_FIELDS.has(field)) {
        const parsed = parseSheetDateTime(raw);
        row[field] = parsed || null;
        return;
      }
      if (DATE_ONLY_FIELDS.has(field)) {
        row[field] = parseSheetDateOnly(raw);
        return;
      }
      row[field] = raw || null;
    });

    if (hasId) rows.push(row);
  }
  return rows;
}

export async function fetchCaseSheetRows(sheetUrl: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(sheetUrl);
  if (!res.ok) throw new Error(`Khong tai duoc Google Sheet (HTTP ${res.status})`);
  const tsvText = await res.text();
  return parseCaseTsv(tsvText);
}
