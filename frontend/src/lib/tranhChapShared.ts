import type { BadgeTone } from "../components/ui/Badge";
import { ApiError } from "../api/client";
import type { AppUser } from "../auth/AuthContext";

/**
 * Type/hang so/ham dung CHUNG giua TranhChapModule.tsx (module "Tranh chap, khieu nai") va
 * CaseDetail.tsx (tab "Tranh chap, khieu nai" trong the chi tiet ca) - tach ra day de tranh
 * dinh nghia trung lap o 2 noi.
 */

export interface ChoXuLyCase {
  id: string;
  khach_hang: string | null;
  khu_vuc: string | null;
}

export interface TienTrinhRow {
  id: string;
  case_id: string;
  phan_loai_tranh_chap: string;
  muc_do: string;
  ngay_tao: string;
  khach_hang: string | null;
  khu_vuc: string | null;
  trang_thai_xu_ly: string | null;
  nguoi_xu_ly: string | null;
  ngay_xu_ly: string | null;
  thoi_gian_du_kien_xong: string | null;
  log_ghi_chu: string | null;
  so_ngay_ton: number;
}

export interface TranhChapLogRow {
  id: number;
  tien_trinh_id: string;
  nguoi_xu_ly: string;
  ngay_xu_ly: string;
  trang_thai_xu_ly: string;
  thoi_gian_du_kien_xong: string | null;
  ghi_chu: string | null;
  ket_qua_xu_ly: string | null;
  hai_long_sau_tranh_chap: string | null;
  created_at: string;
  updated_at: string;
}

export interface TienTrinhDetail {
  tienTrinh: {
    id: string;
    case_id: string;
    phan_loai_tranh_chap: string;
    muc_do: string;
    ngay_tao: string;
    khach_hang: string | null;
    khu_vuc: string | null;
    tien_do_hoan_thanh: string | null;
    thoi_gian_hoan_thanh: string | null;
  };
  logs: TranhChapLogRow[];
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

export const TRANG_THAI_LABELS: Record<string, string> = {
  "KSNB da tiep nhan": "KSNB đã tiếp nhận",
  "Giam sat dang xu ly": "Giám sát đang xử lý",
  "Da ket thuc tranh chap": "Đã kết thúc tranh chấp",
  "Da huy bo tranh chap": "Đã huỷ bỏ tranh chấp",
};
export const TRANG_THAI_TONE: Record<string, BadgeTone> = {
  "KSNB da tiep nhan": "ocean",
  "Giam sat dang xu ly": "amber",
  "Da ket thuc tranh chap": "teal",
  "Da huy bo tranh chap": "gray",
};
export const TRANG_THAI_LOG_OPTIONS = Object.entries(TRANG_THAI_LABELS).map(([value, label]) => ({ value, label }));
export const TRANG_THAI_DONG = ["Da ket thuc tranh chap", "Da huy bo tranh chap"];
// Trang thai bat buoc 2 truong "Ket qua xu ly"/"Hai long sau tranh chap" (chot 2026-07-29) - khop
// TRANG_THAI_CAN_KET_QUA trong backend/src/lib/tranhChapTienTrinh.ts.
export const TRANG_THAI_CAN_KET_QUA = "Da ket thuc tranh chap";

export const MUC_DO_OPTIONS = [
  { value: "Binh thuong", label: "Bình thường" },
  { value: "Cao", label: "Cao" },
  { value: "Rat nghiem trong", label: "Rất nghiêm trọng" },
];
export const MUC_DO_TONE: Record<string, BadgeTone> = { "Binh thuong": "gray", Cao: "amber", "Rat nghiem trong": "coral" };
export const MUC_DO_LABELS: Record<string, string> = Object.fromEntries(MUC_DO_OPTIONS.map((o) => [o.value, o.label]));

export const HAI_LONG_OPTIONS = [
  { value: "Khong xac dinh", label: "Không xác định" },
  { value: "Khong hai long", label: "Không hài lòng" },
  { value: "Binh thuong", label: "Bình thường" },
  { value: "Hai long", label: "Hài lòng" },
  { value: "Rat hai long", label: "Rất hài lòng" },
];

export const HAN_OPTIONS = [
  { value: "", label: "Tất cả hạn xử lý" },
  { value: "qua-han", label: "Quá hạn" },
  { value: "sap-den-han", label: "Sắp đến hạn (≤1 ngày)" },
];

/** Khop voi canWriteTranhChap() trong backend/src/lib/tranhChapTienTrinh.ts - chi dung de AN/HIEN
 * nut thao tac cho gon giao dien, backend van la noi kiem tra thuc su. */
export function canWriteTranhChap(user: AppUser, khuVucCa: string | null): boolean {
  if (user.la_ksnb_doi_tac) return true;
  if (user.vai_tro === "TBP DVBH" || user.vai_tro === "Admin") return true;
  if (user.vai_tro === "Giam sat") return !!khuVucCa && user.khu_vuc_phu_trach.includes(khuVucCa);
  return false;
}

/** Khop voi canEditTienTrinhMeta() trong backend - HEP HON canWriteTranhChap (khong gom Giam sat),
 * dung de AN/HIEN nut sua phan_loai_tranh_chap/muc_do. */
export function canEditTienTrinhMeta(user: AppUser): boolean {
  return !!user.la_ksnb_doi_tac || user.vai_tro === "TBP DVBH" || user.vai_tro === "Admin";
}

export function describeTranhChapError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "FORBIDDEN_ROLE") return "Bạn không có quyền thao tác trên ca/khu vực này.";
    if (err.code === "CASE_NOT_ELIGIBLE") return "Ca này không (còn) thuộc diện tranh chấp.";
    if (err.code === "TIEN_TRINH_DANG_MO") return "Ca này đang có 1 tiến trình chưa đóng — không thể tạo tiến trình mới.";
    if (err.code === "TIEN_TRINH_DA_DONG") return "Tiến trình đã đóng — không thể sửa phân loại/mức độ nữa.";
    if (err.code === "NOT_LATEST_LOG") return "Đã có log mới hơn được thêm — không thể sửa log này nữa.";
    if (err.code === "EDIT_WINDOW_EXPIRED") return "Đã quá 24h kể từ lúc tạo log — không thể sửa nữa.";
    if (err.code === "FORBIDDEN_NOT_AUTHOR") return "Chỉ người tạo log mới được sửa.";
    if (err.code === "MISSING_KET_QUA_XU_LY") return "Cần chọn Kết quả xử lý khi đóng tranh chấp.";
    if (err.code === "MISSING_HAI_LONG") return "Cần chọn Hài lòng sau tranh chấp khi đóng tranh chấp.";
  }
  return fallback;
}
