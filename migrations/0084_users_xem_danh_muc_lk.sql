-- Quyen XEM module "Danh muc linh kien" - tach rieng khoi quan_ly_danh_muc_lk (quyen SUA, van
-- mac dinh false, Admin tu cap). Mac dinh TRUE cho toan bo user, TRU CSKH/TN CSKH/TBP CSKH (khong
-- lien quan nghiep vu linh kien). Ap dung ca cho user hien huu (UPDATE ben duoi) lan user moi
-- (DEFAULT 1 tren cot) - CHOT 2026-08-17.
ALTER TABLE users ADD COLUMN xem_danh_muc_lk INTEGER NOT NULL DEFAULT 1;
UPDATE users SET xem_danh_muc_lk = 0 WHERE vai_tro IN ('CSKH', 'TN CSKH', 'TBP CSKH');
