/**
 * Parse ngay/gio tu Google Sheet TSV - dung chung cho moi luong dong bo (ca moi, linh kien,
 * giai trinh cu, khao sat cu). Nhan dang "YYYY-MM-DD[ HH:MM[:SS]]" co san, hoac
 * "DD/MM/YYYY[ HH:MM[:SS]]" pho bien tu Google Sheet. Khong nhan dang duoc thi giu nguyen
 * chuoi goc thay vi ep null, tranh mat du lieu that.
 */

export function parseSheetDateTime(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(trimmed)) return trimmed.replace("T", " ");
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return trimmed;
  const [, dd, mm, yyyy, hh, min, ss] = m;
  if (hh === undefined) return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")} ${hh.padStart(2, "0")}:${min}:${ss ?? "00"}`;
}

export function parseSheetDateOnly(raw: string): string | null {
  const full = parseSheetDateTime(raw);
  return full ? full.slice(0, 10) : null;
}
