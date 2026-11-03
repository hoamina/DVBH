import { api } from "../api/client";
import { veTiengViet } from "../i18n/tr";
import type { LinhKienLoiItem } from "../types";
import { pickExportColumns } from "../components/ExportColumnPicker";
import { exportTemplateKey } from "./exportTemplate";
import { taoSheetMauTinhLuong } from "./exportMauTinhLuong";
import { taoSheetTuDong } from "./excelChung";
import { tr } from "../i18n/tr";
import { DiaGioiIndex, NHAN_CAP_1, NHAN_CAP_2, coTienTo, diaGioiModeHienTai, khoaTen, type QuyDoiRow } from "./diaGioi";

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
// "_dg" = khoa noi bo cua dong bao cao gom theo dia gioi (lib/diaGioi.ts gopBangTheoTinh), khong xuat.
const EXCLUDED_EXPORT_FIELDS = ["link_hinh_anh", "_dg"];

export async function exportRowsToExcel<T extends object>(
  rows: T[],
  filename: string,
  sheetName = "Data",
  headerLabels?: Record<string, string>,
  options?: { includeFields?: string[]; skipColumnPicker?: boolean },
) {
  const XLSX = await import("xlsx");
  // "Mẫu tính lương" (2026-10-28) doc tu dong THO (truoc khi loai cot/doi nhan) - chi danh sach CA moi co.
  const laDanhSachCa = laDongCa(rows[0] as Record<string, unknown> | undefined);
  let cleanedRows = rows.map((row) => omitExcludedFields(row, options?.includeFields ?? []));
  let labels = headerLabels;
  // Danh sach CA (dong co id + tinh + quan_huyen): them 2 cot dia gioi theo nut Cũ/Mới (lib/diaGioi.ts), dat ten
  // tieng Viet cho cac cot dia chi tho - 1 diem chung cho moi file xuat danh sach ca.
  if (laDanhSachCa) {
    const dg = await themCotDiaGioi(cleanedRows);
    cleanedRows = dg.rows;
    labels = { ...(headerLabels ?? {}), ...dg.labels };
  }
  // Ke ca khi moi dong deu NULL (file chi co ca khong phai Odoo) -> van doi nhan "Số linh kiện lỗi", khong lo ten cot tho.
  if (cleanedRows.some((r) => "linh_kien_loi" in r)) {
    const lk = tachLinhKienLoi(cleanedRows);
    cleanedRows = lk.rows;
    labels = { ...(labels ?? {}), ...lk.labels };
  }
  // Cot NOI BO luon la nhan tieng Viet (nhan lay tu cot tren man hinh co the da duoc dich - doi nguoc) de "mau tai file"
  // da luu khong lech khi doi ngon ngu; tieu de that tren Excel dich theo ngon ngu dang chon LUC GHI FILE (taoSheetTuDong
  // -> tieuDeExcel, CHOT 2026-11-03 - thay quyet dinh cu "Excel luon tieng Viet"). Rieng "Mẫu tính lương" giu tieng Viet.
  if (labels) labels = Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, veTiengViet(v)]));
  const exportRows = cleanedRows.map((row) => remapKeys(row, labels ?? {}));
  // "Mau tai file" ca nhan (2026-10-23): hien bang chon cot (bat/tat, keo doi vi tri, luu localStorage) truoc khi tai -
  // components/ExportColumnPicker.tsx + lib/exportTemplate.ts. Cot = hop tieu de theo thu tu xuat hien (nhu json_to_sheet).
  const allCols: string[] = [];
  const seen = new Set<string>();
  for (const r of exportRows) for (const k of Object.keys(r)) if (!seen.has(k)) (seen.add(k), allCols.push(k));
  let header = allCols;
  if (allCols.length > 0 && !options?.skipColumnPicker) {
    const presets = laDanhSachCa ? [{ key: "tinh-luong", label: tr("Mẫu tính lương"), moTa: tr("Tải ngay theo đúng cột, thứ tự, tiêu đề file mẫu tính lương") }] : [];
    const picked = await pickExportColumns(filename, allCols, exportTemplateKey(filename), presets);
    if (!picked) return; // nguoi dung huy - khong tai
    if ("preset" in picked) {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, taoSheetMauTinhLuong(XLSX, rows as Record<string, unknown>[]), "Sheet1");
      XLSX.writeFile(wb, filename.replace(/(\.xlsx)?$/i, "_mau_tinh_luong.xlsx"));
      return;
    }
    header = picked.cols;
  }
  const worksheet = taoSheetTuDong(XLSX, exportRows, header);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

// Cac truong cua 1 linh kien loi (chuoi JSON case_dvbh.linh_kien_loi, nguon Odoo - xem types.ts LinhKienLoiItem) theo
// thu tu cot tren Excel. Nhan khop tab "Lỗi linh kiện" (components/LoiLinhKienPanel.tsx).
const LK_LOI_COT: [keyof LinhKienLoiItem, string][] = [
  ["ma_linh_kien", "Mã linh kiện"],
  ["ten_linh_kien", "Tên linh kiện"],
  ["nhom_linh_kien", "Nhóm linh kiện"],
  ["nguon_goc_loi", "Nguồn gốc lỗi"],
  ["hien_tuong_loi", "Hiện tượng lỗi"],
  ["mo_ta_hien_tuong", "Mô tả hiện tượng"],
  ["nhom_loi", "Nhóm lỗi"],
  ["nguyen_nhan_loi", "Nguyên nhân lỗi"],
  ["mo_ta_nguyen_nhan", "Mô tả nguyên nhân"],
  ["cach_thuc_xu_ly", "Cách thức xử lý"],
  ["mo_ta_cach_xu_ly", "Mô tả cách xử lý"],
  ["ghi_chu", "Ghi chú"],
];

/** CHOT 2026-10-22: tach cot JSON "linh_kien_loi" thanh cac cot doc duoc o CUOI file - moi linh kien loi 12 cot
 * "LK lỗi N - <trường>", N = 1..(so linh kien loi nhieu nhat trong file); ca it linh kien hon de trong. Cot JSON goc
 * doi thanh "Số linh kiện lỗi" (dem). Moi dong deu co du bo cot de thu tu cot tren Excel on dinh. */
function tachLinhKienLoi(rows: Record<string, unknown>[]): { rows: Record<string, unknown>[]; labels: Record<string, string> } {
  const parsed = rows.map((r) => {
    if (typeof r.linh_kien_loi !== "string" || !r.linh_kien_loi) return [] as LinhKienLoiItem[];
    try {
      const arr = JSON.parse(r.linh_kien_loi);
      return Array.isArray(arr) ? (arr as LinhKienLoiItem[]) : [];
    } catch {
      return [];
    }
  });
  const maxN = Math.max(0, ...parsed.map((p) => p.length));
  const labels: Record<string, string> = { linh_kien_loi: "Số linh kiện lỗi" };
  for (let n = 1; n <= maxN; n++) for (const [f, nhan] of LK_LOI_COT) labels[`__lk${n}_${f}`] = `LK lỗi ${n} - ${nhan}`;
  const out = rows.map((r, i) => {
    const items = parsed[i];
    const o: Record<string, unknown> = { ...r, linh_kien_loi: items.length || "" };
    for (let n = 1; n <= maxN; n++) {
      const it = items[n - 1];
      for (const [f] of LK_LOI_COT) o[`__lk${n}_${f}`] = it ? (it[f] ?? "") : "";
    }
    return o;
  });
  return { rows: out, labels };
}

function laDongCa(row: Record<string, unknown> | undefined): boolean {
  return !!row && "id" in row && "tinh" in row && "quan_huyen" in row;
}

const COT_DG_1 = "__dg_cap1";
const COT_DG_2 = "__dg_cap2";
// Cot dia chi THO giu lai de doi chieu (ten khac 2 cot theo che do de khong trung tieu de).
const NHAN_COT_THO: Record<string, string> = {
  tinh: "Tỉnh (gốc)",
  quan_huyen: "Quận/Huyện (gốc)",
  tinh_moi: "Tỉnh mới (Odoo)",
  xa_moi: "Xã mới (Odoo)",
  tinh_cu: "Tỉnh cũ (Odoo)",
  huyen_cu: "Huyện cũ (Odoo)",
  xa_cu: "Xã cũ (Odoo)",
};

/** Them "Tỉnh cũ" + "Quận/Huyện" (che do Cũ) hoac "Tỉnh mới" + "Xã/Phường mới" (che do Mới) - CUNG cach chuan hoa + quy
 * doi voi bang bao cao (DiaGioiIndex, bang "Quy đổi tỉnh"). Chen ngay truoc cot "tinh". */
export async function themCotDiaGioi(rows: Record<string, unknown>[]): Promise<{ rows: Record<string, unknown>[]; labels: Record<string, string> }> {
  const mode = diaGioiModeHienTai();
  let quyDoi: QuyDoiRow[] = [];
  try {
    quyDoi = (await api.get<{ rows: QuyDoiRow[] }>("/dia-gioi/quy-doi")).rows;
  } catch {
    /* khong tai duoc bang quy doi -> van xuat, tinh cu chua quy doi se ghi "(chưa quy đổi)" */
  }
  const idx = new DiaGioiIndex(quyDoi);
  const s = (v: unknown) => (typeof v === "string" ? v : v == null ? null : String(v));
  // Cap 2: gop bien the co/khong tien to ("Huyện X" / "X") ve 1 ten - uu tien ten co tien to xuat hien trong file.
  const tenCap2 = new Map<string, string>();
  for (const r of rows) {
    const raw = s(mode === "moi" ? r.xa_moi : r.quan_huyen)?.trim();
    if (!raw) continue;
    const k = khoaTen(raw);
    const co = tenCap2.get(k);
    if (!co || (!coTienTo(co) && coTienTo(raw))) tenCap2.set(k, raw.replace(/\s+/g, " "));
  }
  const out = rows.map((r) => {
    const cap1 = idx.tinh(mode, { tinh: s(r.tinh), tinh_moi: s(r.tinh_moi) });
    const raw2 = s(mode === "moi" ? r.xa_moi : r.quan_huyen)?.trim();
    const cap2 = raw2 ? (tenCap2.get(khoaTen(raw2)) ?? raw2) : "";
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (k === "tinh") {
        o[COT_DG_1] = cap1;
        o[COT_DG_2] = cap2;
      }
      o[k] = v;
    }
    return o;
  });
  return { rows: out, labels: { ...NHAN_COT_THO, [COT_DG_1]: NHAN_CAP_1[mode], [COT_DG_2]: NHAN_CAP_2[mode] } };
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
    out[headerLabels[key] ?? veTiengViet(key)] = value;
  }
  return out;
}
