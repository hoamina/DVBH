import type * as XLSXNS from "xlsx";

/**
 * "Mẫu tính lương" (CHOT 2026-10-28, chu he thong): mau CO DINH chon duoc trong bang chon cot khi tai danh sach CA
 * (components/ExportColumnPicker.tsx) - ra file dung 32 cot / thu tu / tieu de cua file mau "Mẫu tải file tính lương.xlsx"
 * (= tieu de file xuat CRM) + 2 cot dia gioi moi o cuoi. Doc tu dong ca THO (truoc khi exportExcel doi nhan/them cot).
 * Quyet dinh cot khong co du lieu san:
 *  - "Kênh tiếp nhận" = tien to [..] THU 2 cua Khách hàng ("[KH] [Hotline] Anh A" -> "Hotline").
 *  - "Link video": app khong luu -> de trong. (2026-11-11: "Nhân viên CSKH tiếp nhận" -> "KTV triển khai" = COALESCE(ktv_trien_khai,
 *    ky_thuat_vien); "KQ CS sơ bộ" -> "Nội dung xử lý".)
 *  - "report_photo_url": giu cot nhung de trong (ke ca Admin).
 *  - Tỉnh / Quận-huyện / Phường-xã = dia gioi CU (tinh_cu/huyen_cu/xa_cu cua Odoo, khong co thi tinh/quan_huyen; xa
 *    chi Odoo co), khong co thi trong; "Tỉnh mới" + "Phường / xã mới" (Odoo) noi CUOI file.
 *  - "Thời gian gốc của ca mở lại" = thoi_gian_goc_dong_ca.
 * Ngay/gio ghi thanh o ngay that cua Excel (so serial nhu file mau) kem dinh dang dd/mm/yyyy de doc duoc.
 * Tieu de GIU tieng Viet o moi ngon ngu (CHOT 2026-11-03: khop file mau CRM), khac cac file tai ve con lai.
 */

type Row = Record<string, unknown>;
type Kieu = "chu" | "so" | "ngay" | "ngay_gio" | "ma";

interface CotMau {
  tieuDe: string;
  lay: (r: Row) => unknown;
  kieu?: Kieu;
}

const f = (k: string) => (r: Row) => r[k];
const dauTien = (...ks: string[]) => (r: Row) => {
  for (const k of ks) {
    const v = r[k];
    if (v != null && String(v).trim() !== "") return v;
  }
  return null;
};
const trong = () => null;

/** "[KH] [Hotline] Anh Hùng" -> "Hotline"; ngoac long nhau giu nguyen ("[KH] [[B2B] ORRO HOME] X" -> "[B2B] ORRO HOME");
 * khong co tien to thu 2 -> rong. */
export function kenhTiepNhan(khachHang: unknown): string {
  if (typeof khachHang !== "string") return "";
  let i = 0;
  const docNhom = (): string | null => {
    while (khachHang[i] === " ") i++;
    if (khachHang[i] !== "[") return null;
    const batDau = ++i;
    for (let sau = 1; i < khachHang.length; i++) {
      if (khachHang[i] === "[") sau++;
      else if (khachHang[i] === "]" && --sau === 0) return khachHang.slice(batDau, i++);
    }
    return null;
  };
  if (docNhom() == null) return "";
  return docNhom()?.trim() ?? "";
}

export const MAU_TINH_LUONG_COT: CotMau[] = [
  { tieuDe: "Mã yêu cầu", lay: f("id"), kieu: "ma" },
  { tieuDe: "Kỹ thuật viên", lay: f("ky_thuat_vien") },
  { tieuDe: "Khách hàng", lay: f("khach_hang") },
  { tieuDe: "Tỉnh", lay: dauTien("tinh_cu", "tinh") },
  { tieuDe: "Quận/ huyện", lay: dauTien("huyen_cu", "quan_huyen") },
  { tieuDe: "Phường / xã", lay: f("xa_cu") },
  { tieuDe: "Độ ưu tiên", lay: f("muc_do") },
  { tieuDe: "Kênh tiếp nhận", lay: (r) => kenhTiepNhan(r.khach_hang) },
  // 2026-11-11 (chu he thong): thay "Nhân viên CSKH tiếp nhận" / "KQ CS sơ bộ" (app khong luu, truoc de trong).
  { tieuDe: "KTV triển khai", lay: dauTien("ktv_trien_khai", "ky_thuat_vien") },
  { tieuDe: "Nội dung xử lý", lay: f("noi_dung_xu_ly") },
  { tieuDe: "Link video", lay: trong },
  { tieuDe: "Hãng", lay: f("hang") },
  { tieuDe: "Sản phẩm bảo hành", lay: f("san_pham_bao_hanh") },
  { tieuDe: "Seri sản phẩm", lay: f("seri_san_pham") },
  { tieuDe: "Nhóm yêu cầu", lay: f("nhom_yeu_cau") },
  { tieuDe: "Loại yêu cầu", lay: f("loai_yeu_cau") },
  { tieuDe: "Mô tả tình trạng lỗi của sản phẩm", lay: f("mo_ta_loi") },
  { tieuDe: "Lưu ý thông tin lỗi linh kiện", lay: f("luu_y_loi_linh_kien") },
  { tieuDe: "XLSC Cách thức xử lý", lay: f("cach_thuc_xu_ly") },
  { tieuDe: "Tiến độ hoàn thành", lay: f("tien_do_hoan_thanh") },
  { tieuDe: "Hình thức bảo hành", lay: f("hinh_thuc_bao_hanh") },
  { tieuDe: "Thời gian CSKH tiếp nhận", lay: f("thoi_gian_cskh_tiep_nhan"), kieu: "ngay_gio" },
  { tieuDe: "Thời gian hẹn xử lý", lay: f("thoi_gian_hen_xu_ly"), kieu: "ngay_gio" },
  { tieuDe: "Thời gian hoàn thành", lay: f("thoi_gian_hoan_thanh"), kieu: "ngay_gio" },
  { tieuDe: "XLSC Lý do quá hạn", lay: f("ly_do_qua_han") },
  { tieuDe: "Ngày sản xuất", lay: f("ngay_san_xuat"), kieu: "ngay" },
  { tieuDe: "Ngày mua sản phẩm", lay: f("ngay_mua"), kieu: "ngay" },
  { tieuDe: "report_photo_url", lay: trong },
  { tieuDe: "XLSC Doanh thu sản phẩm", lay: f("dt_san_pham"), kieu: "so" },
  { tieuDe: "XLSC Doanh thu linh kiện", lay: f("dt_linh_kien"), kieu: "so" },
  { tieuDe: "XLSC Doanh thu dịch vụ", lay: f("dt_dich_vu"), kieu: "so" },
  { tieuDe: "Thời gian gốc của ca mở lại", lay: f("thoi_gian_goc_dong_ca"), kieu: "ngay_gio" },
  { tieuDe: "Tỉnh mới", lay: f("tinh_moi") },
  { tieuDe: "Phường / xã mới", lay: f("xa_moi") },
];

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** "YYYY-MM-DD[ HH:MM[:SS]]" (gio VN luu nguyen wall-clock, khong doi mui gio) -> so serial ngay Excel. */
function serialExcel(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(v.trim());
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return (ms - EXCEL_EPOCH) / 86400000;
}

function oExcel(v: unknown, kieu: Kieu): XLSXNS.CellObject | null {
  if (v == null || v === "") return null;
  if (kieu === "ngay" || kieu === "ngay_gio") {
    const n = serialExcel(v);
    // Gia tri chi co ngay (vd QuickSight "2026-07-16") -> khong hien " 00:00:00" gia.
    if (n != null) return { t: "n", v: n, z: kieu === "ngay" || Number.isInteger(n) ? "dd/mm/yyyy" : "dd/mm/yyyy hh:mm:ss" };
  }
  if (kieu === "so" || kieu === "ma") {
    const n = typeof v === "number" ? v : /^\d+(\.\d+)?$/.test(String(v).trim()) ? Number(v) : NaN;
    if (Number.isFinite(n)) return { t: "n", v: n };
  }
  return { t: "s", v: String(v) };
}

/** Tao sheet "Mẫu tính lương" tu cac dong ca tho. */
export function taoSheetMauTinhLuong(XLSX: typeof XLSXNS, rows: Row[]): XLSXNS.WorkSheet {
  const ws: XLSXNS.WorkSheet = {};
  MAU_TINH_LUONG_COT.forEach((c, ci) => {
    ws[XLSX.utils.encode_cell({ r: 0, c: ci })] = { t: "s", v: c.tieuDe };
  });
  rows.forEach((r, ri) => {
    MAU_TINH_LUONG_COT.forEach((c, ci) => {
      const o = oExcel(c.lay(r), c.kieu ?? "chu");
      if (o) ws[XLSX.utils.encode_cell({ r: ri + 1, c: ci })] = o;
    });
  });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: MAU_TINH_LUONG_COT.length - 1 } });
  ws["!cols"] = MAU_TINH_LUONG_COT.map((c) => ({ wch: c.kieu === "ngay_gio" ? 19 : c.kieu === "ngay" ? 11 : Math.min(30, Math.max(10, c.tieuDe.length + 2)) }));
  return ws;
}
