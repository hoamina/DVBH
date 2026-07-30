export interface CaseRow {
  id: string;
  khach_hang: string | null;
  link_crm: string | null;
  seri_san_pham: string | null;
  cach_thuc_xu_ly: string | null;
  tinh: string | null;
  quan_huyen: string | null;
  khu_vuc: string | null;
  hang: string | null;
  nhom_san_pham: string | null;
  nganh: string | null;
  loai_nganh: string | null;
  doi_tac: string | null;
  ky_thuat_vien: string | null;
  thoi_gian_cskh_tiep_nhan: string | null;
  mo_ta_loi: string | null;
  thoi_gian_hen_xu_ly: string | null;
  nhom_yeu_cau: string | null;
  loai_yeu_cau: string | null;
  san_pham_bao_hanh: string | null;
  hinh_thuc_bao_hanh: string | null;
  tien_do_hoan_thanh: string | null;
  thoi_gian_hoan_thanh: string | null;
  luu_y_loi_linh_kien: string | null;
  ly_do_huy: string | null;
  noi_dung_xu_ly: string | null;
  ly_do_qua_han: string | null;
  dt_san_pham: number | null;
  dt_linh_kien: number | null;
  dt_dich_vu: number | null;
  dung_han: string | null;
  xu_ly_24h_bucket: string | null;
  ngay_mua: string | null;
  nhom_kh: string | null;
  link_hinh_anh: string | null;
  ngay_import: string;
  ngay_cap_nhat_gan_nhat: string;
  assigned_to: string | null;
  archived_at: string | null;
  huy_bo_at: string | null;
  huy_bo_by: string | null;
  huy_bo_ly_do: string | null;
  loi_120p: number;
  loi_qua_han_24h: number;
  loi_lo_ke_hoach: number;
  loi_kh_hen_lai: number;
  nghi_ngo_nap_gas: number;
  nghi_ngo_tranh_chap: number;
  last_ly_do_cham?: string | null;
  last_ngay_giai_trinh?: string | null;
  last_ngay_du_kien_hoan_thanh?: string | null;
  // "Nhom ton" (BacklogModule.tsx Danh sach chi tiet) - chi co tren GET /cases (khong co tren
  // R2 snapshot "Ca da dong"), tinh san server-side tu NEED_GIAI_TRINH_CATEGORIES.
  need_lo_ke_hoach?: number;
  need_tai_giai_trinh?: number;
  need_chua_gt_3_ngay?: number;
  need_chua_gt_5_ngay?: number;
  need_dieu_hoa?: number;
  need_b2b?: number;
  need_nskx?: number;
}

export interface GiaiTrinhRow {
  id: string;
  case_id: string;
  ly_do_cham: string;
  noi_dung: string | null;
  linh_kien_thieu: string | null;
  ngay_du_kien_hoan_thanh: string | null;
  ngay_yeu_cau_co_hang: string | null;
  ma_xuat_hang_lien_quan: string | null;
  nguoi_giai_trinh: string;
  ngay_giai_trinh: string;
}

export interface KetQuaGoiRow {
  id: string;
  case_id: string;
  loai_khao_sat: string;
  doi_tuong_lien_he: string | null;
  ket_qua_cuoc_goi: string | null;
  nguoi_thuc_hien: string;
  ngay_gio_thuc_hien: string;
}

export interface ViPhamRow {
  id: string;
  case_id: string;
  ket_qua_goi_id: string;
  loai_loi: LoaiLoi;
  ket_qua_cap_1: string | null;
  chot_bo_cap_2: number | null;
  nguoi_ghi_nhan: string;
  ngay_ghi_nhan: string;
  nguoi_chot: string | null;
  ngay_chot: string | null;
  khach_hang?: string;
  khu_vuc?: string;
  ky_thuat_vien?: string | null;
}

export type LoaiLoi = "Loi 120 phut" | "Hen qua 24h" | "Loi lo ke hoach" | "KH hen lai";

export const LOAI_LOI_META: Record<LoaiLoi, { label: string; short: string }> = {
  "Loi 120 phut": { label: "Lỗi 120 phút", short: "120'" },
  "Hen qua 24h": { label: "Hẹn quá 24h", short: "24h hẹn" },
  "Loi lo ke hoach": { label: "Lỡ kế hoạch", short: "Lỡ KH" },
  "KH hen lai": { label: "KH hẹn lại", short: "KH hẹn lại" },
};
export const LOAI_LOI_KEYS: LoaiLoi[] = ["Loi 120 phut", "Hen qua 24h", "Loi lo ke hoach", "KH hen lai"];

export interface GiaiTrinhLapRow {
  id: string;
  case_id: string;
  chot_danh_gia_lap: CaLapLoai | null;
  chot_hinh_thuc_xu_ly: HinhThucXuLy | null;
  dien_giai_lap: string | null;
  nguoi_giai_trinh: string | null;
  ngay_giai_trinh: string | null;
  qc_chot: CaLapLoai | null;
  qc_ghi_chu: string | null;
  nguoi_qc: string | null;
  ngay_qc: string | null;
}

/** Ket qua GET /cases/:id truong "caLap" (mo rong tu getCaLapDetection() backend). */
export interface CaLapDetection {
  detection: { gapDays: number; priorId: string; priorHt: string } | null;
  giaiTrinhLap: GiaiTrinhLapRow | null;
  lichSu: { id: string; thoi_gian_hoan_thanh: string | null; ky_thuat_vien: string | null; tien_do_hoan_thanh: string | null; link_crm: string | null }[];
  serialBlacklisted: boolean;
}

/** 1 dong trong GET /ca-lap/danh-sach/list: phan ON DINH (cache theo hash /ca-lap/version), KHONG
 * gom trang thai xu ly - xem GiaiTrinhLapRow cho phan DONG (/ca-lap/danh-sach/status), FE gop 2
 * phan nay lai theo case_id (id) truoc khi render, xem CaLapModule.tsx. */
export interface CaLapStableRow extends CaseRow {
  gap_days: number;
  prior_id: string;
  prior_ht: string;
}

/** 1 dong trong GET /ca-lap/danh-sach (endpoint goc, van giu cho export/tuong thich cu): cac cot
 * case_dvbh + gap_days/prior_id/prior_ht (LAG) + giai_trinh_lap (LEFT JOIN, prefix gt_). */
export interface CaLapListRow extends CaseRow {
  gap_days: number;
  prior_id: string;
  prior_ht: string;
  gt_id: string | null;
  chot_danh_gia_lap: CaLapLoai | null;
  chot_hinh_thuc_xu_ly: HinhThucXuLy | null;
  dien_giai_lap: string | null;
  nguoi_giai_trinh: string | null;
  ngay_giai_trinh: string | null;
  qc_chot: CaLapLoai | null;
  qc_ghi_chu: string | null;
  nguoi_qc: string | null;
  ngay_qc: string | null;
}

export interface BlacklistSerialRow {
  id: number;
  seri_san_pham: string;
  bat_tat: number;
  nguoi_them: string;
  ngay_them: string;
}

export type CaLapLoai =
  | "Bo qua"
  | "Lap do nghiep vu KTV"
  | "Lap do tay nghe KTV"
  | "Lap do chat luong linh kien"
  | "Lap do sai bao cao"
  | "Lap do trung su vu";

export const CA_LAP_META: Record<CaLapLoai, { label: string }> = {
  "Bo qua": { label: "Bỏ qua" },
  "Lap do nghiep vu KTV": { label: "Lặp do nghiệp vụ kỹ thuật viên" },
  "Lap do tay nghe KTV": { label: "Lặp do tay nghề kỹ thuật viên" },
  "Lap do chat luong linh kien": { label: "Lặp do chất lượng linh kiện" },
  "Lap do sai bao cao": { label: "Lặp do sai báo cáo" },
  "Lap do trung su vu": { label: "Lặp do trùng sự vụ" },
};
export const CA_LAP_KEYS: CaLapLoai[] = [
  "Bo qua",
  "Lap do nghiep vu KTV",
  "Lap do tay nghe KTV",
  "Lap do chat luong linh kien",
  "Lap do sai bao cao",
  "Lap do trung su vu",
];

export type HinhThucXuLy =
  | "Khong tinh lap khong tinh luong"
  | "Tinh lap khong tinh luong"
  | "Tinh luong"
  | "Tinh luong loi bao cao"
  | "Khong tinh luong loi bao cao";

export const HINH_THUC_XU_LY_META: Record<HinhThucXuLy, { label: string }> = {
  "Khong tinh lap khong tinh luong": { label: "KHÔNG TÍNH LẶP, KHÔNG TÍNH LƯƠNG" },
  "Tinh lap khong tinh luong": { label: "TÍNH LẶP, KHÔNG TÍNH LƯƠNG" },
  "Tinh luong": { label: "TÍNH LƯƠNG" },
  "Tinh luong loi bao cao": { label: "TÍNH LƯƠNG, LỖI BÁO CÁO" },
  "Khong tinh luong loi bao cao": { label: "KHÔNG TÍNH LƯƠNG, LỖI BÁO CÁO" },
};
export const HINH_THUC_XU_LY_KEYS: HinhThucXuLy[] = [
  "Khong tinh lap khong tinh luong",
  "Tinh lap khong tinh luong",
  "Tinh luong",
  "Tinh luong loi bao cao",
  "Khong tinh luong loi bao cao",
];

export type NapGasDanhGiaLoai = "Tu nap gas" | "Khong nap gas" | "Gui ve Hang nap gas" | "Tu nap gas thay Block" | "Sua chua khac" | "Kiem tra";

export const NAP_GAS_DANH_GIA_META: Record<NapGasDanhGiaLoai, { label: string }> = {
  "Tu nap gas": { label: "Tự nạp gas" },
  "Khong nap gas": { label: "Không nạp gas" },
  "Gui ve Hang nap gas": { label: "Gửi về Hãng nạp gas" },
  "Tu nap gas thay Block": { label: "Tự nạp gas + thay Block" },
  "Sua chua khac": { label: "Sửa chữa khác" },
  "Kiem tra": { label: "Kiểm tra" },
};
export const NAP_GAS_DANH_GIA_KEYS: NapGasDanhGiaLoai[] = [
  "Tu nap gas",
  "Khong nap gas",
  "Gui ve Hang nap gas",
  "Tu nap gas thay Block",
  "Sua chua khac",
  "Kiem tra",
];

export type NapGasPhiDichVuLoai = "Khong thu phi DV" | "Khong nap gas" | "Da thu phi DV" | "Loi khong thu phi DV";

export const NAP_GAS_PHI_DICH_VU_META: Record<NapGasPhiDichVuLoai, { label: string }> = {
  "Khong thu phi DV": { label: "Không thu phí DV" },
  "Khong nap gas": { label: "Không nạp gas" },
  "Da thu phi DV": { label: "Đã thu phí DV" },
  "Loi khong thu phi DV": { label: "Lỗi không thu phí DV" },
};
export const NAP_GAS_PHI_DICH_VU_KEYS: NapGasPhiDichVuLoai[] = ["Khong thu phi DV", "Khong nap gas", "Da thu phi DV", "Loi khong thu phi DV"];

export interface NapGasDanhGiaRow {
  case_id: string;
  danh_gia_nap_gas: NapGasDanhGiaLoai;
  phi_dich_vu: NapGasPhiDichVuLoai;
  nguoi_chot: string;
  ngay_chot: string;
}

export interface LyDoRow {
  id: number;
  ten_ly_do: string;
  bat_tat: number;
  thuoc_thieu_linh_kien: number;
  thuoc_tranh_chap: number;
}

export interface PhanLoaiTranhChapRow {
  id: number;
  ten_phan_loai: string;
  bat_tat: number;
}

export interface KetQuaXuLyTranhChapRow {
  id: number;
  ten_ket_qua: string;
  bat_tat: number;
}

export interface LinhKienRow {
  ma_linh_kien: string;
  ten_linh_kien: string;
  gia_ban: number | null;
  anh_demo: string | null;
  nguoi_cap_nhat: string | null;
  ngay_cap_nhat: string;
  bat_tat: number;
}

export interface UserRow {
  email: string;
  ten: string | null;
  vai_tro: string | null;
  khu_vuc_phu_trach: string[];
  trang_thai_duyet: "Cho duyet" | "Da duyet" | "Tu choi";
  la_ksnb_doi_tac: number;
}

export interface Paged<T> {
  rows: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function fmtVND(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("vi-VN") + "đ";
}
// Moi chuoi datetime tra ve tu API (dang "YYYY-MM-DD HH:MM:SS", KHONG co timezone) deu la gio VN
// dia phuong tren thuc te (toan he thong quy uoc luu gio VN, ca du lieu nhap Excel/Sheet giu nguyen
// lan cot he thong tu sinh - xem backend/src/lib/vnTime.ts, ratchet.ts) - phai tu them "+07:00"
// truoc khi parse, neu khong JS se hieu nham la gio dia phuong CUA TRINH DUYET (co the khac VN) hoac
// UTC. Dung ham nay o moi noi can Date object chinh xac (epoch dung) tu chuoi co gio.
// LUU Y: mot so gia tri (vd "cachedAt" sinh boi new Date().toISOString() o client) da la ISO day
// du kem "Z"/offset that (UTC that, khong phai VN) - phai kiem tra truoc, khong duoc cong them
// "+07:00" nua (se ra sai lech hoac chuoi invalid, gay "Invalid Date" o CacheBanner).
export function parseDbDateTime(d: string): Date {
  const withT = d.replace(" ", "T");
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(withT);
  return new Date(hasTimezone ? withT : `${withT}+07:00`);
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  // Mot so ca (import backfill thang 7/2026) chi co ngay thuan, khong gio - "2026-07-01" bi JS
  // hieu la nua dem UTC (khac voi chuoi co gio, hieu la gio dia phuong), hien thi o may VN (UTC+7)
  // se luon bi cong them thanh "07:00" gia - khong co that. Khi khong co gio thi chi hien ngay,
  // khong bay ra 1 gio khong ton tai.
  if (!/\d{2}:\d{2}/.test(d)) return fmtDate(d);
  return parseDbDateTime(d).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}
export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d.replace(" ", "T")).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
}
