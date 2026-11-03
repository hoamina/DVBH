import type * as XLSXNS from "xlsx";
import { NGON_NGU_TRANG, tr } from "../i18n/tr";

/**
 * Dung chung cho MOI file Excel tai ve (CHOT 2026-11-03, chu he thong): "cot ngay thang dinh dang dd/mm/yyyy hh:mm:ss,
 * khong co gio thi dd/mm/yyyy; tieu de theo ngon ngu nguoi dung". Tach file rieng (khong de trong exportExcel.ts) vi
 * exportMauTinhLuong.ts + ExportColumnPicker.tsx cung dung ma exportExcel.ts lai import 2 file do.
 */

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const VN_OFFSET_MS = 7 * 3600 * 1000;
const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const RE_VN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

export const DINH_DANG_NGAY = "dd/mm/yyyy";
export const DINH_DANG_NGAY_GIO = "dd/mm/yyyy hh:mm:ss";

/** Chuoi ngay/gio -> so serial ngay Excel. Nhan "YYYY-MM-DD[ HH:MM[:SS]]" (thoi_gian_* = gio VN luu nguyen wall-clock,
 * KHONG doi mui gio) va "DD/MM/YYYY[ HH:MM[:SS]]" (cot da format san). Rieng ISO co "Z"/"+hh:mm" (vd created_at UTC)
 * moi quy ve gio VN. Khop CA chuoi (khong nhan "LK-2026-10-03", "2026-10", ma so...) + kiem ngay that ton tai. */
export function serialNgayExcel(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  let y: number, mo: number, d: number, h = 0, mi = 0, se = 0;
  let tz: string | undefined;
  let m = RE_ISO.exec(s);
  if (m) {
    [y, mo, d] = [+m[1], +m[2], +m[3]];
    if (m[4] != null) [h, mi, se] = [+m[4], +m[5], +(m[6] ?? 0)];
    tz = m[7];
  } else if ((m = RE_VN.exec(s))) {
    [d, mo, y] = [+m[1], +m[2], +m[3]];
    if (m[4] != null) [h, mi, se] = [+m[4], +m[5], +(m[6] ?? 0)];
  } else return null;
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
  let ms = Date.UTC(y, mo - 1, d, h, mi, se);
  if (new Date(ms).getUTCDate() !== d) return null; // 31/02...
  if (tz) {
    const off = tz === "Z" ? 0 : (tz[0] === "-" ? -1 : 1) * (+tz.slice(1, 3) * 60 + +tz.slice(-2)) * 60000;
    ms = ms - off + VN_OFFSET_MS;
  }
  return Math.round((ms - EXCEL_EPOCH) / 1000) / 86400;
}

/** O ngay that cua Excel. Gia tri 00:00:00 / chi co ngay -> "dd/mm/yyyy" (khong hien gio gia); chiNgay = ep chi ngay. */
export function oNgayExcel(v: unknown, chiNgay = false): XLSXNS.CellObject | null {
  const n = serialNgayExcel(v);
  if (n == null) return null;
  return { t: "n", v: n, z: chiNgay || Number.isInteger(n) ? DINH_DANG_NGAY : DINH_DANG_NGAY_GIO };
}

/** Tieu de cot tren Excel theo ngon ngu dang chon. Cot noi bo luon la nhan tieng Viet (mau chon cot luu theo nhan nay,
 * doi ngon ngu khong mat mau) - chi dich luc ghi file / hien bang chon cot. Nhan ghep "A - B" (vd "03/10 - Đã GT",
 * "LK lỗi 2 - Mã linh kiện") dich tung phan. Chua co trong tu dien -> giu tieng Viet. */
export function tieuDeExcel(col: string): string {
  const d = tr(col);
  if (d !== col || NGON_NGU_TRANG === "vi" || !col.includes(" - ")) return d;
  return col
    .split(" - ")
    .map((p) => {
      const lk = /^LK lỗi (\d+)$/.exec(p);
      return lk ? tr("LK lỗi {0}", lk[1]) : tr(p);
    })
    .join(" - ");
}

/** Dung sheet tu cac dong (khoa = cot noi bo): dong 1 = tieu de da dich, cot ma MOI gia tri khac rong deu la chuoi
 * ngay/gio -> o ngay that (serial + dinh dang). Cac o khac giu kieu nhu json_to_sheet truoc day (so/bool/chuoi). */
export function taoSheetTuDong(XLSX: typeof XLSXNS, rows: Record<string, unknown>[], cols: string[]): XLSXNS.WorkSheet {
  const ws: XLSXNS.WorkSheet = {};
  const laCotNgay = cols.map((c) => {
    let co = false;
    for (const r of rows) {
      const v = r[c];
      if (v == null || v === "") continue;
      if (serialNgayExcel(v) == null) return false;
      co = true;
    }
    return co;
  });
  const coGio = cols.map((c, ci) => laCotNgay[ci] && rows.some((r) => { const n = serialNgayExcel(r[c]); return n != null && !Number.isInteger(n); }));
  cols.forEach((c, ci) => {
    ws[XLSX.utils.encode_cell({ r: 0, c: ci })] = { t: "s", v: tieuDeExcel(c) };
  });
  rows.forEach((r, ri) => {
    cols.forEach((c, ci) => {
      const v = r[c];
      if (v == null || v === "") return;
      let o: XLSXNS.CellObject | null = null;
      if (laCotNgay[ci]) o = oNgayExcel(v);
      else if (typeof v === "number") o = Number.isFinite(v) ? { t: "n", v } : { t: "s", v: String(v) };
      else if (typeof v === "boolean") o = { t: "b", v };
      else if (v instanceof Date) o = { t: "n", v: (Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds()) - EXCEL_EPOCH) / 86400000, z: DINH_DANG_NGAY_GIO };
      else o = { t: "s", v: typeof v === "object" ? JSON.stringify(v) : String(v) };
      if (o) ws[XLSX.utils.encode_cell({ r: ri + 1, c: ci })] = o;
    });
  });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: Math.max(0, cols.length - 1) } });
  ws["!cols"] = cols.map((_, ci) => (laCotNgay[ci] ? { wch: coGio[ci] ? 19 : 11 } : {}));
  return ws;
}
