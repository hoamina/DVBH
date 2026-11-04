import type * as XLSXNS from "xlsx";
import { NGON_NGU_TRANG, tr } from "../i18n/tr";

/**
 * Dung chung cho MOI file Excel tai ve (CHOT 2026-11-03, chu he thong): "cot ngay thang dinh dang dd/mm/yyyy hh:mm:ss,
 * khong co gio thi dd/mm/yyyy; tieu de theo ngon ngu nguoi dung". Tach file rieng (khong de trong exportExcel.ts) vi
 * ExportColumnPicker.tsx cung dung ma exportExcel.ts lai import file do.
 */

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
export const DINH_DANG_NGAY = "dd/mm/yyyy";
export const DINH_DANG_NGAY_GIO = "dd/mm/yyyy hh:mm:ss";

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

// Cot NGAY GIO cua file tai ve (CHOT 2026-11-04, chu he thong sua lai): CHI cot dang ghi "yyyy-mm-dd hh:mm[:ss]" moi doi
// dinh dang; cot chi co ngay (yyyy-mm-dd), cot da la dd/mm/yyyy, ISO "T…Z" va moi cot khac giu NGUYEN nhu truoc.
const RE_NGAY_GIO = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/** "yyyy-mm-dd[ hh:mm[:ss]]" (gio VN luu nguyen, khong doi mui gio) -> o ngay that: co gio = dd/mm/yyyy hh:mm:ss, dong
 * khong co gio trong cot ngay gio = dd/mm/yyyy. Khong khop / ngay khong ton tai -> null. */
function oNgayGioExport(v: unknown): XLSXNS.CellObject | null {
  if (typeof v !== "string") return null;
  const m = RE_NGAY_GIO.exec(v.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, se] = [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)];
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, se);
  if (new Date(ms).getUTCDate() !== d) return null;
  return { t: "n", v: Math.round((ms - EXCEL_EPOCH) / 1000) / 86400, z: m[4] != null ? DINH_DANG_NGAY_GIO : DINH_DANG_NGAY };
}

/** Dung sheet tu cac dong (khoa = cot noi bo): dong 1 = tieu de da dich. Cot ngay gio = MOI gia tri khac rong deu dang
 * "yyyy-mm-dd[ hh:mm[:ss]]" VA co it nhat 1 gia tri co gio -> o ngay that. Cac o khac giu kieu nhu json_to_sheet truoc
 * day (so/bool/chuoi, khong doi gia tri). */
export function taoSheetTuDong(XLSX: typeof XLSXNS, rows: Record<string, unknown>[], cols: string[]): XLSXNS.WorkSheet {
  const ws: XLSXNS.WorkSheet = {};
  const laCotNgay = cols.map((c) => {
    let coGio = false;
    for (const r of rows) {
      const v = r[c];
      if (v == null || v === "") continue;
      const o = oNgayGioExport(v);
      if (!o) return false;
      if (o.z === DINH_DANG_NGAY_GIO) coGio = true;
    }
    return coGio;
  });
  cols.forEach((c, ci) => {
    ws[XLSX.utils.encode_cell({ r: 0, c: ci })] = { t: "s", v: tieuDeExcel(c) };
  });
  rows.forEach((r, ri) => {
    cols.forEach((c, ci) => {
      const v = r[c];
      if (v == null || v === "") return;
      let o: XLSXNS.CellObject | null = null;
      if (laCotNgay[ci]) o = oNgayGioExport(v);
      else if (typeof v === "number") o = Number.isFinite(v) ? { t: "n", v } : { t: "s", v: String(v) };
      else if (typeof v === "boolean") o = { t: "b", v };
      else o = { t: "s", v: typeof v === "object" ? JSON.stringify(v) : String(v) };
      if (o) ws[XLSX.utils.encode_cell({ r: ri + 1, c: ci })] = o;
    });
  });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: Math.max(0, cols.length - 1) } });
  ws["!cols"] = cols.map((_, ci) => (laCotNgay[ci] ? { wch: 19 } : {}));
  return ws;
}
