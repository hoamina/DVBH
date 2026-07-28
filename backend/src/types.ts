import type { ThemeConfig } from "./lib/theme";

export const VAI_TRO_VALUES = ["Admin", "Viewer", "QC", "Giam sat", "TBP DVBH", "CSKH", "TN CSKH", "TBP CSKH", "KSNB Doi tac"] as const;
export type VaiTro = (typeof VAI_TRO_VALUES)[number];

export type TrangThaiDuyet = "Cho duyet" | "Da duyet" | "Tu choi";
export type GioiTinh = "nam" | "nu";

export interface AppUser {
  email: string;
  ten: string | null;
  ten_goi: string | null;
  gioi_tinh: GioiTinh | null;
  vai_tro: VaiTro | null;
  khu_vuc_phu_trach: string[];
  trang_thai_duyet: TrangThaiDuyet;
  theme_config: ThemeConfig | null;
}

export interface Env {
  DB: D1Database;
  REPORTS: R2Bucket;
  ASSETS: Fetcher;
  BOOTSTRAP_ADMIN_EMAIL: string;
  GOOGLE_REDIRECT_URI: string;
  FRONTEND_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SESSION_SECRET: string;
}

export const ROLES_XEM_TOAN_BO: VaiTro[] = ["Admin", "Viewer", "TBP DVBH", "TBP CSKH"];

export const LOAI_LOI_KEYS = [
  "Loi 120 phut",
  "Hen qua 24h",
  "Loi lo ke hoach",
  "KH hen lai",
] as const;
export type LoaiLoi = (typeof LOAI_LOI_KEYS)[number];

export const CA_LAP_LOAI_KEYS = [
  "Bo qua",
  "Lap do nghiep vu KTV",
  "Lap do tay nghe KTV",
  "Lap do chat luong linh kien",
  "Lap do sai bao cao",
  "Lap do trung su vu",
] as const;
export type CaLapLoai = (typeof CA_LAP_LOAI_KEYS)[number];

export const HINH_THUC_XU_LY_KEYS = [
  "Khong tinh lap khong tinh luong",
  "Tinh lap khong tinh luong",
  "Tinh luong",
  "Tinh luong loi bao cao",
  "Khong tinh luong loi bao cao",
] as const;
export type HinhThucXuLy = (typeof HINH_THUC_XU_LY_KEYS)[number];

export const NAP_GAS_DANH_GIA_KEYS = [
  "Tu nap gas",
  "Khong nap gas",
  "Gui ve Hang nap gas",
  "Tu nap gas thay Block",
  "Sua chua khac",
  "Kiem tra",
] as const;
export type NapGasDanhGia = (typeof NAP_GAS_DANH_GIA_KEYS)[number];

export const NAP_GAS_PHI_DICH_VU_KEYS = [
  "Khong thu phi DV",
  "Khong nap gas",
  "Da thu phi DV",
  "Loi khong thu phi DV",
] as const;
export type NapGasPhiDichVu = (typeof NAP_GAS_PHI_DICH_VU_KEYS)[number];

declare module "hono" {
  interface ContextVariableMap {
    email: string;
    user: AppUser;
  }
}
