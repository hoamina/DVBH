import { kenhTiepNhan } from "./exportMauTinhLuong";
import { NHAN_CAP_1, NHAN_CAP_2, diaGioiModeHienTai } from "./diaGioi";

/**
 * "Form tồn" (CHOT 2026-11-20, chu he thong - file mau "Form tồn.xlsx"): mau CO DINH thu 2 trong bang chon cot, CHI cho file
 * Quan ly ton > Danh sach chi tiet (quan_ly_ton.xlsx). 52 cot theo dung thu tu / tieu de file mau (32 cot dau = tieu de CRM nhu
 * "Mẫu tính lương", 20 cot sau = cot Quan ly ton). KHAC "Mẫu tính lương": cac cot he thong KHONG nam trong mau duoc NOI SAU cot
 * cuoi cua mau, theo thu tu + tich chon trong bang chon cot; khong tich cot nao -> noi TAT CA (lib/exportExcel.ts).
 * Quyet dinh cot khong co du lieu san (giong Mẫu tính lương): "Kênh tiếp nhận" = tien to [..] thu 2 cua Khách hàng; "KQ CS sơ bộ" =
 * Nội dung xử lý (chu he thong 2026-11-11); "Link video", "report_photo_url" de trong. "Tỉnh mới" / "Xã/Phường mới" = 2 cot dia gioi
 * theo nut Cũ / Mới (tieu de doi theo che do, nhu file tai thuong). "Tình trạng giao hàng cho KTV" = Trạng thái đơn hàng LK gan nhat.
 * Tieu de GIU tieng Viet o moi ngon ngu (mau co dinh).
 */

type Row = Record<string, unknown>;

export interface CotFormTon {
  tieuDe: string;
  /** Truong tho ma cot nay da thay the - cot he thong cung truong KHONG noi them lan nua. */
  nguon: string[];
  lay: (r: Row) => unknown;
}

const f = (k: string): Omit<CotFormTon, "tieuDe"> => ({ nguon: [k], lay: (r) => r[k] });
const trong: Omit<CotFormTon, "tieuDe"> = { nguon: [], lay: () => null };

/** Khoa noi bo 2 cot dia gioi (lib/exportExcel.ts themCotDiaGioi). */
export const COT_DG_1 = "__dg_cap1";
export const COT_DG_2 = "__dg_cap2";

export function cotFormTon(): CotFormTon[] {
  const mode = diaGioiModeHienTai();
  const ds: [string, Omit<CotFormTon, "tieuDe">][] = [
    ["Mã yêu cầu", f("id")],
    ["Kỹ thuật viên", f("ky_thuat_vien")],
    ["Khách hàng", f("khach_hang")],
    [NHAN_CAP_1[mode], f(COT_DG_1)],
    [NHAN_CAP_2[mode], f(COT_DG_2)],
    ["Tỉnh (gốc)", f("tinh")],
    ["Quận/Huyện (gốc)", f("quan_huyen")],
    ["Độ ưu tiên", f("muc_do")],
    ["Kênh tiếp nhận", { nguon: [], lay: (r) => kenhTiepNhan(r.khach_hang) || null }],
    ["Đối tác", f("doi_tac")],
    ["KQ CS sơ bộ", f("noi_dung_xu_ly")],
    ["Link video", trong],
    ["Hãng", f("hang")],
    ["Sản phẩm bảo hành", f("san_pham_bao_hanh")],
    ["Seri sản phẩm", f("seri_san_pham")],
    ["Nhóm yêu cầu", f("nhom_yeu_cau")],
    ["Loại yêu cầu", f("loai_yeu_cau")],
    ["Mô tả tình trạng lỗi của sản phẩm", f("mo_ta_loi")],
    ["Lưu ý thông tin lỗi linh kiện", f("luu_y_loi_linh_kien")],
    ["XLSC Cách thức xử lý", f("cach_thuc_xu_ly")],
    ["Tiến độ hoàn thành", f("tien_do_hoan_thanh")],
    ["Hình thức bảo hành", f("hinh_thuc_bao_hanh")],
    ["Thời gian CSKH tiếp nhận", f("thoi_gian_cskh_tiep_nhan")],
    ["Thời gian hẹn xử lý", f("thoi_gian_hen_xu_ly")],
    ["Thời gian hoàn thành", f("thoi_gian_hoan_thanh")],
    ["XLSC Lý do quá hạn", f("ly_do_qua_han")],
    ["Ngày sản xuất", f("ngay_san_xuat")],
    ["Ngày mua sản phẩm", f("ngay_mua")],
    ["report_photo_url", trong],
    ["XLSC Doanh thu sản phẩm", f("dt_san_pham")],
    ["XLSC Doanh thu linh kiện", f("dt_linh_kien")],
    ["XLSC Doanh thu dịch vụ", f("dt_dich_vu")],
    ["Khu vực", f("khu_vuc")],
    ["Số ngày tồn", f("tuoi_ton")],
    ["Khoảng tồn", f("khoang_ton")],
    ["Lý do tồn", f("last_ly_do_cham")],
    ["Giải trình gần nhất của GS", f("last_noi_dung_giai_trinh")],
    ["Mã linh kiện", f("last_ma_linh_kien_thieu")],
    ["Tên linh kiện thiếu gần nhất", f("last_ten_linh_kien_thieu")],
    ["Ngày hàng về dự kiến theo KV", f("ngay_hang_ve_du_kien_kv")],
    ["Ngày về gần nhất theo KV", f("ngay_ve_gan_nhat_kv")],
    ["Ngày NM cam kết có hàng", f("ngay_nm_cam_ket")],
    ["Số lần lùi ngày DK", f("so_lan_lui_dk")],
    ["Tồn kho MB", f("ton_kho_mb")],
    ["Tồn kho MN", f("ton_kho_mn")],
    ["Dự kiến HT", f("last_ngay_du_kien_hoan_thanh")],
    ["Ngày giải trình gần nhất", f("last_ngay_giai_trinh")],
    ["Còn bảo hành/ hết bảo hành", f("han_bh")],
    ["Tình trạng giao hàng cho KTV", f("don_lk_trang_thai")],
    ["Ngày đặt hàng", f("don_lk_ngay_dat")],
    ["Ngày duyệt đơn", f("don_lk_ngay_duyet")],
    ["Ngày xuất hàng", f("don_lk_ngay_xuat")],
  ];
  return ds.map(([tieuDe, c]) => ({ tieuDe, ...c }));
}

/** Ten file co mau "Form tồn" (khoa mau tai file - lib/exportTemplate.ts exportTemplateKey). */
export const FILE_CO_FORM_TON = "quan_ly_ton";
