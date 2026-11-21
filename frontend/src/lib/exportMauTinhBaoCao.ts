import type * as XLSXNS from "xlsx";
import type { LinhKienLoiItem } from "../types";
import { parseJsonObject, type KtvOdoo, type PhiOdoo } from "./odooBoSung";
import { dauTien, f, kenhTiepNhan, taoSheetMau, trong, type CotMau } from "./exportMauTinhLuong";

/**
 * "Mẫu tính báo cáo" (CHOT 2026-11-21, chu he thong - file mau "Mẫu tính báo cáo.xlsx"): mau CO DINH thu 3 trong bang chon cot
 * khi tai danh sach CA (moi danh sach ca, nhu "Mẫu tính lương"). Ra dung 67 cot / thu tu / tieu de hang 1 cua file mau (= tieu de
 * file xuat CRM). Cac dong du lieu trong file mau bi lech cot so voi tieu de -> chi lay HANG TIEU DE lam chuan.
 * Quyet dinh cot (giong Mẫu tính lương khi trung):
 *  - Tỉnh / Quận-huyện / Phường-xã = dia gioi CU (tinh_cu/huyen_cu/xa_cu Odoo, khong co thi tinh/quan_huyen).
 *  - "Kênh tiếp nhận" = tien to [..] thu 2 cua Khách hàng; "KQ CS sơ bộ" = Nội dung xử lý (chu he thong 2026-11-11).
 *  - "Bộ phận xử lý" = Khu vực (TBP); "Thời gian xử lý" = so gio xu ly (SLA co loai tru).
 *  - "Tên linh kiện" / "Mã linh kiện" / "Nhóm lỗi" / "Nguyên nhân lỗi" = gop tu "Linh kiện lỗi" Odoo (cach nhau "; ", bo trung).
 *  - "Lý do không trả phí dịch vụ" = phi_odoo.ly_do_khong_thu_phi; "checkin_time" = lan check-in DAU TIEN (ktv_odoo).
 *  - "Tình trạng" = trang thai goc Odoo neu dong co (case_dvbh_mo_rong), khong thi trong.
 *  - App KHONG luu -> de trong: Yêu cầu, Điện thoại 1-3, Nhân viên CSKH tiếp nhận, Ảnh/URL ảnh/Link ảnh (ke ca Admin, nhu
 *    report_photo_url cua Mẫu tính lương), Kết quả hỗ trợ sơ bộ (+ cho khách hàng), BP xử lý khiếu nại, Loại hỗ trợ, Thời gian
 *    cập nhật, product_time, checkin/checkout location, checkout_time, Danh sách Đơn hàng bảo hành, Kết luận của KTV, Kết quả
 *    đồng bộ sang CoreDB, XLSC Km di chuyển, Thời gian KTV tiếp nhận, Trưởng BP bảo trì.
 * Tieu de GIU tieng Viet o moi ngon ngu (mau co dinh).
 */

type Row = Record<string, unknown>;

function linhKienLoi(r: Row): LinhKienLoiItem[] {
  if (typeof r.linh_kien_loi !== "string" || !r.linh_kien_loi) return [];
  try {
    const arr = JSON.parse(r.linh_kien_loi);
    return Array.isArray(arr) ? (arr as LinhKienLoiItem[]) : [];
  } catch {
    return [];
  }
}

const gopLk = (k: keyof LinhKienLoiItem) => (r: Row) => {
  const ds = [...new Set(linhKienLoi(r).map((it) => String(it[k] ?? "").trim()).filter(Boolean))];
  return ds.length ? ds.join("; ") : null;
};

export const MAU_TINH_BAO_CAO_COT: CotMau[] = [
  { tieuDe: "ID", lay: f("id"), kieu: "ma" },
  { tieuDe: "Yêu cầu", lay: trong },
  { tieuDe: "Khách hàng", lay: f("khach_hang") },
  { tieuDe: "ID khách hàng", lay: f("id_khach_hang") },
  { tieuDe: "Seri sản phẩm", lay: f("seri_san_pham") },
  { tieuDe: "Điện thoại", lay: trong },
  { tieuDe: "Điện thoại 2", lay: trong },
  { tieuDe: "Điện thoại 3", lay: trong },
  { tieuDe: "Cách thức xử lý", lay: f("cach_thuc_xu_ly") },
  { tieuDe: "Tỉnh", lay: dauTien("tinh_cu", "tinh") },
  { tieuDe: "Quận/ huyện", lay: dauTien("huyen_cu", "quan_huyen") },
  { tieuDe: "Phường / xã", lay: f("xa_cu") },
  { tieuDe: "Thời gian CSKH tiếp nhận", lay: f("thoi_gian_cskh_tiep_nhan"), kieu: "ngay_gio" },
  { tieuDe: "Kênh tiếp nhận", lay: (r) => kenhTiepNhan(r.khach_hang) || null },
  { tieuDe: "Mô tả tình trạng lỗi của sản phẩm", lay: f("mo_ta_loi") },
  { tieuDe: "Nhân viên CSKH tiếp nhận", lay: trong },
  { tieuDe: "Lý do không trả phí dịch vụ", lay: (r) => parseJsonObject<PhiOdoo>(r.phi_odoo as string)?.ly_do_khong_thu_phi ?? null },
  { tieuDe: "Bộ phận xử lý", lay: f("khu_vuc") },
  { tieuDe: "Thời gian hẹn xử lý", lay: f("thoi_gian_hen_xu_ly"), kieu: "ngay_gio" },
  { tieuDe: "Nhóm yêu cầu", lay: f("nhom_yeu_cau") },
  { tieuDe: "Loại yêu cầu", lay: f("loai_yeu_cau") },
  { tieuDe: "Độ ưu tiên", lay: f("muc_do") },
  { tieuDe: "Hãng", lay: f("hang") },
  { tieuDe: "Sản phẩm bảo hành", lay: f("san_pham_bao_hanh") },
  { tieuDe: "Tên linh kiện", lay: gopLk("ten_linh_kien") },
  { tieuDe: "Mã linh kiện", lay: gopLk("ma_linh_kien") },
  { tieuDe: "Ảnh hiện trạng sản phẩm", lay: trong },
  { tieuDe: "Nhóm lỗi", lay: gopLk("nhom_loi") },
  { tieuDe: "Nguyên nhân lỗi", lay: gopLk("nguyen_nhan_loi") },
  { tieuDe: "Kết quả hỗ trợ sơ bộ", lay: trong },
  { tieuDe: "KQ CS sơ bộ", lay: f("noi_dung_xu_ly") },
  { tieuDe: "Hình thức bảo hành", lay: f("hinh_thuc_bao_hanh") },
  { tieuDe: "BP xử lý khiếu nại", lay: trong },
  { tieuDe: "Kỹ thuật viên", lay: f("ky_thuat_vien") },
  { tieuDe: "Loại hỗ trợ", lay: trong },
  { tieuDe: "Tiến độ hoàn thành", lay: f("tien_do_hoan_thanh") },
  { tieuDe: "Thời gian cập nhật", lay: trong },
  { tieuDe: "Thời gian xử lý", lay: f("so_gio_xu_ly"), kieu: "so" },
  { tieuDe: "Thời gian hoàn thành", lay: f("thoi_gian_hoan_thanh"), kieu: "ngay_gio" },
  { tieuDe: "Tình trạng", lay: f("trang_thai_odoo") },
  { tieuDe: "Lưu ý thông tin lỗi linh kiện", lay: f("luu_y_loi_linh_kien") },
  { tieuDe: "Kết quả hỗ trợ sơ bộ cho khách hàng", lay: trong },
  { tieuDe: "Lý do hủy", lay: f("ly_do_huy") },
  { tieuDe: "Nội dung xử lý chi tiết", lay: f("noi_dung_xu_ly") },
  { tieuDe: "product_time", lay: trong },
  { tieuDe: "checkout_location", lay: trong },
  { tieuDe: "checkin_location", lay: trong },
  { tieuDe: "checkout_time", lay: trong },
  { tieuDe: "checkin_time", lay: (r) => parseJsonObject<KtvOdoo>(r.ktv_odoo as string)?.checkin?.find((x) => x.thoi_diem)?.thoi_diem ?? null, kieu: "ngay_gio" },
  { tieuDe: "report_photo_url", lay: trong },
  { tieuDe: "product_photo_url", lay: trong },
  { tieuDe: "Danh sách Đơn hàng bảo hành", lay: trong },
  { tieuDe: "Kết luận của KTV", lay: trong },
  { tieuDe: "URL Ảnh biên bản", lay: trong },
  { tieuDe: "URL Ảnh sản phẩm", lay: trong },
  { tieuDe: "Kết quả đồng bộ sang CoreDB", lay: trong },
  { tieuDe: "Link ảnh", lay: trong },
  { tieuDe: "XLSC Cách thức xử lý", lay: f("cach_thuc_xu_ly") },
  { tieuDe: "XLSC Lý do quá hạn", lay: f("ly_do_qua_han") },
  { tieuDe: "XLSC Km di chuyển", lay: trong },
  { tieuDe: "Ngày mua sản phẩm", lay: f("ngay_mua"), kieu: "ngay" },
  { tieuDe: "Thời gian KTV tiếp nhận", lay: trong },
  { tieuDe: "XLSC Doanh thu sản phẩm", lay: f("dt_san_pham"), kieu: "so" },
  { tieuDe: "ảnh biên bản", lay: trong },
  { tieuDe: "XLSC Doanh thu linh kiện", lay: f("dt_linh_kien"), kieu: "so" },
  { tieuDe: "Trưởng BP bảo trì", lay: trong },
  { tieuDe: "XLSC Doanh thu dịch vụ", lay: f("dt_dich_vu"), kieu: "so" },
];

/** Tao sheet "Mẫu tính báo cáo" tu cac dong ca tho. */
export function taoSheetMauTinhBaoCao(XLSX: typeof XLSXNS, rows: Row[]): XLSXNS.WorkSheet {
  return taoSheetMau(XLSX, rows, MAU_TINH_BAO_CAO_COT);
}
