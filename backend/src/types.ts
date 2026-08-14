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
  // Danh dau "KSNB Doi tac" cho tinh nang tranh chap - TACH KHOI vai_tro vi users.vai_tro CHECK
  // chua ho tro gia tri nay (xem migration 0035_tranh_chap_tien_trinh.sql). Nguoi dung van giu 1
  // vai_tro hop le (vd Viewer) de vao duoc module, co nay chi quyet dinh quyen GHI tranh chap.
  la_ksnb_doi_tac: boolean;
  // Danh sach module (sidebar) duoc tuy chinh rieng - CHOT 2026-08-01, xem migration
  // 0042_users_module_permissions.sql + lib/moduleAccess.ts. NULL = chua tuy chinh (dung mac dinh
  // theo vai_tro). Dung effectiveModules()/hasModule() (lib/moduleAccess.ts) de doc, KHONG doc
  // truc tiep field nay (Admin can bypass qua vai_tro).
  modules: string[] | null;
  // Khoa tai khoan - CHOT 2026-08-02, xem migration 0043_users_bi_khoa.sql. Tach khoi
  // trang_thai_duyet (khong tai su dung "Tu choi"): tu choi = chua tung duoc cap quyen, khoa = da
  // duoc cap quyen roi bi tam ngung. Chan tai loadUser.ts, khong lien quan hasModule()/vai_tro.
  bi_khoa: boolean;
  // Quyen import hang loat tranh chap theo ID (module "Tranh chap, KN") - CHOT 2026-08-12, xem
  // migration 0052_users_import_tranh_chap.sql. Tach khoi vai_tro (giong la_ksnb_doi_tac) - Admin
  // luon duoc phep (bypass co nay), cap tung tai khoan qua UsersModule.tsx.
  co_the_import_tranh_chap: boolean;
  // Cac co module "Dat mua linh kien" - CHOT 2026-08-13, xem migration
  // 0053_dat_mua_lk_users.sql. Tach khoi vai_tro (khong the mo rong CHECK vi users bi ~10 bang
  // FK tham chieu). Cap qua UsersModule.tsx.
  la_ktv_dvbh: boolean;        // KTV / CTV / Tram
  la_ve_tinh: boolean;         // Ve tinh (nhan vien noi bo Tram)
  la_kho: boolean;             // Nhan vien Kho
  la_ke_toan: boolean;         // Ke toan
  tram_cha: string | null;     // email Tram cha (chi khi la_ve_tinh=true)
  giam_sat_quan_ly: string | null; // email GS phu trach 1-1
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
  GEMINI_API_KEY: string;
  EXTERNAL_IMPORT_API_KEY: string;
}

// QC them vao 2026-07-29: HANDOFF.md ghi "QC (nhu Viewer + chot/bo vi pham cap 2)" - truoc do QC
// khong nam trong danh sach nay nen moi bao cao/danh sach co scope (dashboard, backlog...) bi gioi
// han theo khu_vuc_phu_trach cua QC, TRONG KHI 2 endpoint ghi cua QC (vi-pham/:id/cap2,
// ca-lap/:caseId/qc) lai khong kiem tra scope gi ca - mau thuan doc/ghi. Chot voi chu he thong: QC
// xem toan bo, khong gioi han khu vuc, dung nghia "nhu Viewer".
export const ROLES_XEM_TOAN_BO: VaiTro[] = ["Admin", "Viewer", "TBP DVBH", "TBP CSKH", "QC"];

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
  "Tinh luong kiem tra loi bao cao",
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
