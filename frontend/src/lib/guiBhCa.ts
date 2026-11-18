/**
 * Gửi bảo hành theo ca (2026-11-18) - Quản lý tồn > Danh sách chi tiết. Server trả số THÔ (backend lib/guiBhCa.ts, bảng gui_bh_ca do app
 * suachua đẩy 15 phút/lần); nhãn, diễn giải, số ngày tồn và hạn BH tính ở đây, trên máy người dùng.
 * Nhãn giai đoạn chép từ suachua backend/src/lib/partnerCaseLabels.ts GIAI_DOAN_VI - đổi bên đó thì sửa cả đây.
 * Thứ tự = suachua lib/tomTatCa.ts THU_TU (giai đoạn thấp nhất đứng trước).
 */
import { tr } from "../i18n/tr";
import { NHAN_BH, tinhHanBaoHanh, trangThaiBhCuoi, type TrangThaiBh } from "./hanBaoHanh";

export const GIAI_DOAN_BH: [string, string][] = [
  ["thung_nhap", "Thùng nháp — KTV chưa gửi"],
  ["thung_tu_choi", "Admin từ chối thùng — chờ Kho / KTV phản hồi"],
  ["thung_dang_gui", "Đang gửi về Kho"],
  ["thung_cho_admin_nhan", "Kho đã nhận — chờ Admin nhận"],
  ["cho_xac_nhan_so_luong", "Chờ xác nhận SL"],
  ["cho_phan_loai", "Chờ phân loại"],
  ["admin_can_xem_lai", "Admin cần xem lại"],
  ["cho_bo_sung_tt", "Chờ KTV bổ sung"],
  ["cho_chan_doan", "Đang sửa chữa (NV)"],
  ["cho_admin_xac_nhan", "Chờ Admin xác nhận"],
  ["san_sang_gom_phieu_tra", "Chờ tạo phiếu trả"],
  ["tra_nhap", "Phiếu trả nháp (Admin)"],
  ["tra_cho_ke_toan_duyet", "Chờ Kế toán duyệt"],
  ["tra_da_duyet_ke_toan", "Chờ Kho đóng gói / gửi"],
  ["tra_da_gui", "Đang gửi trả KTV"],
  ["tra_khieu_nai_van_chuyen", "KTV báo không nhận được"],
  ["tra_gui_that_bai", "Gửi thất bại (thất lạc)"],
  ["tra_ktv_da_nhan", "Hoàn tất (KTV đã nhận)"],
  ["tra_ket_thuc_khong_gui", "Kết thúc, không gửi"],
  ["ket_thuc_chuyen_kho", "Đã chuyển kho"],
];
const NHAN = new Map(GIAI_DOAN_BH);
const THU_TU = new Map(GIAI_DOAN_BH.map(([k], i) => [k, i]));

export function nhanGiaiDoanBh(gd: string | null | undefined): string {
  if (!gd) return "";
  const n = NHAN.get(gd);
  return n ? tr(n) : gd;
}

export interface DongGuiBh {
  gui_bh_gd_json?: string | null;
  gui_bh_ngay_gui_cuoi?: string | null;
  gui_bh_hoan_tat?: number | null;
  gui_bh_xu_ly_max_ngay?: number | null;
}

/** "2 LK Hoàn tất (KTV đã nhận), 1 LK Thùng nháp — KTV chưa gửi" - giai đoạn thấp nhất đứng trước. */
export function dienGiaiGuiBh(r: DongGuiBh): string {
  if (!r.gui_bh_gd_json) return "";
  let gd: Record<string, number>;
  try {
    gd = JSON.parse(r.gui_bh_gd_json) as Record<string, number>;
  } catch {
    return "";
  }
  return Object.entries(gd)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => (THU_TU.get(a) ?? -1) - (THU_TU.get(b) ?? -1))
    .map(([k, n]) => tr("{0} LK {1}", String(n), nhanGiaiDoanBh(k)))
    .join(", ");
}

/** Tốc độ tồn đổi trả (ngày): xong hết -> thời gian xử lý lâu nhất; chưa xong -> 0h hôm nay - lần gửi xe cuối (cùng quy tắc tuổi tồn,
 * khớp backend GUI_BH_TON_NGAY_EXPR). Giờ lưu là giờ VN "thô" -> so theo ngày lịch, không quy đổi múi giờ. */
export function tonDoiTraNgay(r: DongGuiBh, homNay = ngayHomNayVN()): number | null {
  if (r.gui_bh_hoan_tat === 1) return r.gui_bh_xu_ly_max_ngay ?? null;
  const s = r.gui_bh_ngay_gui_cuoi;
  if (!s) return null;
  const t = Date.parse(s.slice(0, 19).replace(" ", "T") + "Z");
  const moc = Date.parse(homNay + "T00:00:00Z");
  if (!Number.isFinite(t)) return null;
  return Math.trunc((moc - t) / 86_400_000);
}

function ngayHomNayVN(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

export interface DongHanBh {
  ngay_mua?: string | null;
  ngay_san_xuat?: string | null;
  thoi_gian_cskh_tiep_nhan?: string | null;
  han_bh_tay?: number | null;
}

/** Hạn BH của ca (giá trị sửa tay thắng) - mã khớp backend HAN_BH_EXPR để lọc. */
export function hanBhCa(r: DongHanBh): { ma: TrangThaiBh; han: string | null } {
  const kq = tinhHanBaoHanh(r.ngay_mua, r.ngay_san_xuat, r.thoi_gian_cskh_tiep_nhan);
  return { ma: trangThaiBhCuoi(r.han_bh_tay, kq.tu_dong), han: kq.han };
}

export function nhanHanBh(ma: string): string {
  return tr(NHAN_BH[ma as TrangThaiBh] ?? ma);
}
