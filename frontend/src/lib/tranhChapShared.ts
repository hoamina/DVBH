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

// Redesign 2026-07-31: 2 giai doan xu ly tranh chap - Giam sat TRUOC (5 trang thai), "Giam sat
// chuyen CSKH" ban giao sang CSKH (4 trang thai rieng). Khop CHINH XAC voi
// backend/src/lib/tranhChapTienTrinh.ts (GIAM_SAT_STATUSES/CSKH_STATUSES/phaseOfStatus).
export const GIAM_SAT_STATUS_VALUES = [
  "Giam sat chua xu ly",
  "Giam sat dang xu ly",
  "Giam sat dong hoan thanh",
  "Giam sat dong that bai",
  "Giam sat chuyen CSKH",
] as const;
export const CSKH_STATUS_VALUES = ["CSKH chua tiep nhan", "CSKH dang xu ly", "CSKH khong can xu ly", "CSKH xu ly xong"] as const;

export const TRANG_THAI_LABELS: Record<string, string> = {
  "Giam sat chua xu ly": "Giám sát chưa xử lý",
  "Giam sat dang xu ly": "Giám sát đang xử lý",
  "Giam sat dong hoan thanh": "Giám sát đóng hoàn thành",
  "Giam sat dong that bai": "Giám sát đóng thất bại",
  "Giam sat chuyen CSKH": "Giám sát chuyển CSKH",
  "CSKH chua tiep nhan": "CSKH chưa tiếp nhận",
  "CSKH dang xu ly": "CSKH đang xử lý",
  "CSKH khong can xu ly": "CSKH không cần xử lý",
  "CSKH xu ly xong": "CSKH xử lý xong",
};
export const TRANG_THAI_TONE: Record<string, BadgeTone> = {
  "Giam sat chua xu ly": "gray",
  "Giam sat dang xu ly": "amber",
  "Giam sat dong hoan thanh": "teal",
  "Giam sat dong that bai": "coral",
  "Giam sat chuyen CSKH": "ocean",
  "CSKH chua tiep nhan": "gray",
  "CSKH dang xu ly": "ocean",
  "CSKH khong can xu ly": "gray",
  "CSKH xu ly xong": "teal",
};
export const GIAM_SAT_STATUS_OPTIONS = GIAM_SAT_STATUS_VALUES.map((value) => ({ value, label: TRANG_THAI_LABELS[value] }));
export const CSKH_STATUS_OPTIONS = CSKH_STATUS_VALUES.map((value) => ({ value, label: TRANG_THAI_LABELS[value] }));
export const TRANG_THAI_LOG_OPTIONS = [...GIAM_SAT_STATUS_OPTIONS, ...CSKH_STATUS_OPTIONS];
export const TRANG_THAI_DONG = ["Giam sat dong hoan thanh", "Giam sat dong that bai", "CSKH khong can xu ly", "CSKH xu ly xong"];
// 2 trang thai KSNB (la_ksnb_doi_tac) can theo doi - diem ban giao Giam sat -> CSKH (chot 2026-07-31
// diem 4) - khop KSNB_WATCH_STATUSES backend.
export const KSNB_WATCH_STATUSES = ["Giam sat chuyen CSKH", "CSKH dang xu ly"];
// Chi 2 trang thai "thanh cong" bat buoc "Ket qua xu ly"/"Hai long sau tranh chap" (chot 2026-07-31) -
// khop TRANG_THAI_CAN_KET_QUA trong backend/src/lib/tranhChapTienTrinh.ts.
export const TRANG_THAI_CAN_KET_QUA = ["Giam sat dong hoan thanh", "CSKH xu ly xong"];

/** Giai doan hien tai cua 1 tien trinh, tinh tu trang thai log MOI NHAT - dung de gioi han dropdown
 * chon trang thai o log TIEP THEO chi trong dung giai doan (khong quay lai duoc Giam sat sau khi da
 * chuyen CSKH). Mirror dung logic backend phaseOfStatus(). */
export function phaseOfStatus(status: string | null): "giam-sat" | "cskh" {
  if (status === "Giam sat chuyen CSKH") return "cskh";
  if ((CSKH_STATUS_VALUES as readonly string[]).includes(status ?? "")) return "cskh";
  return "giam-sat";
}

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
