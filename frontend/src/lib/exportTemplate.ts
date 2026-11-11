/**
 * "Mau tai file" ca nhan (CHOT 2026-10-23, chu he thong): moi lan bam tai Excel hien bang chon cot (bat/tat, keo doi vi
 * tri) - lua chon luu localStorage CUA TRINH DUYET NGUOI DUNG, khong goi server. Moi LOAI file 1 mau rieng, khoa = ten
 * file bo phan duoi + cac cum so (ngay/thang/ID) de "ca_lap_2026-10.xlsx" va "ca_lap_2026-11.xlsx" dung chung 1 mau.
 * Cot dinh danh bang NHAN TIENG VIET cua cot (tieu de tren Excel duoc dich luc ghi file - lib/excelChung.ts tieuDeExcel),
 * nen 1 mau dung duoc cho ca 3 ngon ngu.
 */

export interface ExportTemplate {
  /** Thu tu cot da luu (tieu de). */
  order: string[];
  /** Cot bi tat. */
  hidden: string[];
}

const PREFIX = "export-tpl:v1:";

export function exportTemplateKey(filename: string): string {
  return filename
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\d+([-_.]\d+)*/g, "#")
    .toLowerCase();
}

/** Nhan cot da doi ten -> nhan moi, de mau da luu truoc khi doi giu dung vi tri/bat-tat cua cot do.
 * 2026-11-11: Excel Quan ly ton / QL NSKX "Tiếp nhận" -> "Thời gian tiếp nhận". */
const NHAN_DOI_TEN: Record<string, string> = { "Tiếp nhận": "Thời gian tiếp nhận" };
const doiTen = (cols: string[]) => cols.map((c) => NHAN_DOI_TEN[c] ?? c);

export function loadExportTemplate(key: string): ExportTemplate | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const v = JSON.parse(raw) as ExportTemplate;
    if (!Array.isArray(v?.order) || !Array.isArray(v?.hidden)) return null;
    // Bo nhan cu neu mau da co ca nhan moi (tranh trung cot sau khi doi ten).
    const order = [...new Set(doiTen(v.order))];
    return { order, hidden: doiTen(v.hidden) };
  } catch {
    return null;
  }
}

export function saveExportTemplate(key: string, tpl: ExportTemplate): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(tpl));
  } catch {
    /* localStorage day/bi chan - bo qua, van tai file binh thuong */
  }
}

export function clearExportTemplate(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* bo qua */
  }
}

/** Ap mau da luu len danh sach cot hien co: giu thu tu da luu (bo cot khong con), cot MOI (chua co trong mau - vd
 * "LK lỗi 4 - ...") noi vao cuoi va mac dinh BAT. */
export function applyExportTemplate(columns: string[], tpl: ExportTemplate | null): { col: string; on: boolean }[] {
  if (!tpl) return columns.map((col) => ({ col, on: true }));
  const coSan = new Set(columns);
  const hidden = new Set(tpl.hidden);
  const daLuu = tpl.order.filter((c) => coSan.has(c));
  const daLuuSet = new Set(daLuu);
  const moi = columns.filter((c) => !daLuuSet.has(c));
  return [...daLuu, ...moi].map((col) => ({ col, on: !hidden.has(col) }));
}
