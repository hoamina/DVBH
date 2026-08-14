// "KSNB Doi tac" KHONG nam trong danh sach nay - gia tri do khong the luu duoc (users.vai_tro CHECK
// trong DB chua bao gio duoc mo rong de nhan gia tri nay, xem migration 0035_tranh_chap_tien_trinh.sql).
// Quyen "KSNB Doi tac" thuc te duoc gan qua co rieng "La KSNB Doi tac" trong modal Phan quyen
// (UsersModule.tsx), doc lap voi Vai tro - khong dung Select nay.
export const ROLES = ["Admin", "Viewer", "QC", "Giam sat", "TBP DVBH", "CSKH", "TN CSKH", "TBP CSKH"];

/** Gia tri ao dai dien nhom "tat ca khu vuc co chua 'qldvbh'" trong FilterBar */
export const QLDVBH_FILTER_VALUE = "__QLDVBH__";
/** Gia tri dai dien "thang hien tai" (hoan thanh thang nay + ca ton) trong filter thang */
export const CURRENT_MONTH_VALUE = "CURRENT";

// CHOT 2026-08-01 (mo rong 2026-08-13): khop dung KHU_VUC_AN_KHOI_BAO_CAO o
// backend/src/lib/filterParams.ts - cac khu_vuc nay bi an khoi MOI bao cao/thong ke, chi con hien
// trong "Danh sach tong". Hau het endpoint da tu loc server-side; dung hang so nay CHI cho cac truong
// hop client PHAI tu loc them (du lieu R2 doc thang, khong qua endpoint co loc san): BacklogModule.tsx
// tab "Ca da dong".
export const KHU_VUC_AN_KHOI_BAO_CAO = ["(teamkdbl.krf) Kinh doanh bán lẻ KRF", "Quản lý ĐMX CSKH", "Bản nháp đẩy lên drive truy vấn NSKX"];
