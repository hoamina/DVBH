// Cac interface/type dung chung cho module "Dat mua linh kien" (tach ra tu DatMuaLinhKienModule.tsx
// khi chia nho file - UI redesign Phase 3, phan hoi Codex 2026-08-19).

// Khop response cua POST /dat-mua-lk/don-hang/import/preview|commit (them 2026-08-15, tieu chi UX
// #4) - xem processDatDonHangImportRows o backend/src/routes/datMuaLinhKien.ts.
export interface DatDonHangImportSummary {
  thanhCong: number;
  loi: number;
  errors: string[];
  soPhieu: number;
  ktvList: string[];
  phieuIds?: string[];
}

export interface LkDanhMucRow {
  ma_linh_kien: string;
  ten_linh_kien: string;
  // CHOT 2026-08-16 (dot 3 gop y): "Gia de xuat" lay tu gia_ban (gia ban dang quan ly chu dong),
  // KHONG con dung gia_tham_chieu.
  gia_ban: number | null;
  don_vi: string | null;
  bat_tat: number;
  // "Only sua chua" - loai khoi picker chon linh kien khi tao don, xem migration 0083.
  chi_sua_chua?: number;
  // Da co san tren API (SELECT * FROM linh_kien) va trong cache IndexedDB (linhKienCache.ts) - chi
  // thieu trong TYPE nay, khong thieu trong DU LIEU THAT (ra soat "Tao Don Linh Kien 2.0" #3, dung
  // cho LinhKienPicker).
  anh_demo?: string | null;
  // Them cho LinhKienDetailModal (nut "xem chi tiet linh kien") - cung ly do nhu anh_demo, du lieu
  // da co san tu SELECT *, chi bo sung TYPE.
  ghi_chu?: string | null;
  gia_tham_chieu?: number | null;
}

// Trang thai 1 DONG don hang - null cho dong loai_don='tra_hang' (dung tra_hang_log rieng, xem
// TraHangTab). Log dinh kem la lich su rieng cua dong do (dat_don_hang_log).
export interface DonHangLogRow {
  id: number;
  dat_don_hang_id: string;
  trang_thai: string;
  nguoi_xu_ly: string;
  ngay_xu_ly: string;
  ghi_chu: string | null;
}

export interface DonHangRow {
  id: string;
  phieu_dat_id: string;
  loai_don: "mua" | "cong_no" | "tra_hang";
  ma_lk: string;
  ten_lk_snapshot: string | null;
  loai_de_xuat: string | null;
  so_luong_de_xuat: number;
  so_luong_thuc_xuat: number | null;
  gia_de_xuat: number | null;
  gia_chot: number | null;
  ly_do_cham: string | null;
  ma_xuat_kho: string | null;
  ma_misa: string | null;
  so_tien_cong_no: number | null;
  nguoi_tao: string;
  // Denormalize xuong tan dong (CHOT 2026-08-15, bo khai niem "phieu dat" - migration 0075).
  nguoi_nhan_hang: string | null;
  email_gs: string | null;
  ngay_tao: string;
  // 6 truong bo sung 2026-08-14 (doi chieu Excel goc, xem migration 0070) - nguoi tao dien luc tao.
  ghi_chu: string | null;
  yeu_cau_hoa_don: string | null;
  tt_mail_duyet: string | null;
  tt_khach_hang: string | null;
  chinh_sach: string | null;
  ma_yeu_cau_su_co: string | null;
  uu_tien: number;
  trang_thai?: string | null;
  // Tu linh_kien.dac_thu qua LEFT JOIN (khong luu tren dat_don_hang) - true khi can qua buoc "Cho TBP
  // xac nhan" truoc TN, xem migration 0082.
  dac_thu?: number | null;
  logs?: DonHangLogRow[];
  cases?: { id: string; khach_hang: string | null; khu_vuc: string | null }[];
  // Chi co tren GET /phieu-dat/:id va GET /phieu-xuat-kho/:id (tinh server-side, khong luu DB) - true
  // khi dong ton qua 24h ke tu "Cho TN duyet" ma chua duoc dien ly_do_cham (xem lib/hanLyDoCham.ts).
  qua_han_ly_do_cham?: boolean;
}

// PXK - "chuyen tien" la 1 dieu kien chan rieng tren chinh PXK (thay the bang phieu_so_tien cu, xem
// migration 0066), khong phai 1 buoc trong chuoi trang_thai chinh.
export interface PhieuXuatKhoRow {
  id: string;
  ma_xuat_kho: string;
  // Dot 2 (muc C/D/E/F, migration 0077).
  ma_xuat_kho_xac_nhan: number;
  ma_misa: string | null;
  ma_van_don: string | null;
  anh_bien_ban_url: string | null;
  nguoi_tao: string;
  nguoi_nhan_hang: string | null;
  // Dot 3 gop y #8 (migration 0079) - denormalize tu dong con, null cho PXK cu truoc khi chot quy tac.
  loai_don: "mua" | "cong_no" | "tra_hang" | null;
  ngay_tao: string;
  ghi_chu: string | null;
  trang_thai: string;
  so_dong: number;
  so_tien_can_chuyen: number | null;
  trang_thai_chuyen_tien: string | null;
  bang_chung_chuyen_tien_url?: string | null;
  bang_chung_chuyen_tien_ghi_chu?: string | null;
  ngay_ktv_chuyen?: string | null;
  // Co it nhat 1 dong dat_don_hang ben trong dang uu_tien=1 - danh dau ca PXK de nguoi xu ly biet
  // TRUOC KHI mo chi tiet (phan hoi 2026-08-19: "tất cả các phiếu... có liên quan đến đơn ưu tiên
  // bên trong, cũng tự động tô màu").
  co_don_uu_tien?: boolean;
}

export interface DonHangKhaDungRow {
  id: string;
  ma_lk: string;
  ten_lk_snapshot: string | null;
  so_luong_de_xuat: number;
  gia_chot: number | null;
  gia_de_xuat: number | null;
  updated_at: string;
  nguoi_nhan_hang: string | null;
}

export interface ThieuLkRow {
  id: string;
  dat_don_hang_id: string;
  ly_do_cham_id: number | null;
  ten_ly_do: string | null;
  ngay_du_kien_co_hang: string | null;
  nguoi_tao: string;
  ngay_tao: string;
  trang_thai: string;
  // CHOT (ra soat module #11) - JOIN tu dat_don_hang, thong tin Kho can doc DAU TIEN de xu ly ticket.
  ma_lk?: string | null;
  ten_lk_snapshot?: string | null;
}

export interface LyDoChamRow {
  id: number;
  ten_ly_do: string;
  he_thong_su_dung: string;
  quan_ly_don_thieu_linh_kien: number;
  bat_tat: number;
}

// Dong dat_don_hang (loai_don='tra_hang'), kem trang thai rieng luong tra hang - xem
// backend/src/routes/traHang.ts (buoc 3 ke hoach "Luong tao don mua hang").
export interface TraHangRow extends DonHangRow {
  trang_thai_tra_hang: string;
}

export type KtvDisplayMap = Map<string, { ma_ktv: string; ten_hien_thi: string | null }>;

export interface NguoiNhanHangKhaDungRow {
  ma_ktv: string;
  ten_hien_thi: string | null;
  email_dang_nhap: string;
  ten_gs?: string | null;
}
export interface LuongQuyTrinhStep {
  key: string;
  label: string;
  count: number;
  roleKeys: string[];
  tab: string;
  filter: string;
}
export interface JumpTarget {
  tab: string;
  filter: string;
  // Loc them theo "nguoi nhan hang" (KTV) khi nhay tu 1 dong trong tab "Bao cao" (phan hoi UX
  // 2026-08-15, dot nang cap tab rieng) - undefined = khong loc theo KTV.
  nguoiNhanHang?: string;
}
export interface BaoCaoRow {
  email: string;
  ten: string | null;
  slDon: number;
  slDeXuat: number;
  slTuChoi: number;
  slDuyet: number;
  slThucDuyet: number;
  tongTienThucTe: number;
  tongTienDatMua: number;
  tongChoChuyen: number;
  slChoKeToan: number;
  slChoKhoGui: number;
  slDaGui: number;
  slDaXacNhan: number;
}

export interface DonHangDraft {
  ma_lk: string;
  loai_de_xuat: string;
  so_luong_de_xuat: number;
  // 6 truong bo sung 2026-08-14 (doi chieu Excel goc, xem migration 0070) - deu do nguoi tao dien
  // luc tao, khong sua duoc sau do. KHONG con ly_do_cham o day (chuyen sang TAC NGHIEP dien qua PATCH
  // /don-hang/:id khi dong ton qua 24h - xem PxkDetailModal). KHONG con so_tien_cong_no (chot
  // 2026-08-15: bo o nhap tay, thay bang "Gia de xuat uoc tinh" tu tinh tu gia_ban*so_luong,
  // xem cho render duoi).
  ghi_chu: string;
  yeu_cau_hoa_don: string;
  tt_mail_duyet: string;
  tt_khach_hang: string;
  chinh_sach: string;
  ma_yeu_cau_su_co: string;
  // Danh dau don uu tien (chot 2026-08-16, dot 3 gop y) - tich rieng TUNG dong, khong anh huong sap
  // xep, chi de hien thi/to mau noi bat.
  uu_tien: boolean;
}

export interface XepHangLinhKienRow {
  ma_lk: string;
  so_lan: number;
}

export interface MaYeuCauSuCoPreview {
  khach_hang: string | null;
  seri_san_pham: string | null;
  khu_vuc: string | null;
  tinh: string | null;
  quan_huyen: string | null;
  hang: string | null;
  san_pham_bao_hanh: string | null;
  tien_do_hoan_thanh: string | null;
  ky_thuat_vien: string | null;
}

// Muc tieu chung cho panel "can nhap truoc khi xac nhan" (tu choi CAN chon Ly do cham, huy CAN nhap
// ly do tu do - phan hoi UX muc 1, 2026-08-15) - dung chung cho PhieuDatDetailModal va
// DonCuaToiTab/PhieuDongBang. id = "bulk" khi ap dung cho ca tap `selected` dang chon.
export type ActionTarget = { id: string | "bulk"; action: "tu_choi" | "cho_hang" | "huy" };
