-- 2026-11-07: tao lai index theo ngay goi khao sat. idx_ket_qua_goi_ngay (migration 0019) da bi MAT tren production khi
-- migration 0022 dung lai bang ket_qua_goi (CREATE ket_qua_goi_new -> DROP -> RENAME chi tao lai idx_ket_qua_goi_case).
-- Moi truy van loc ket_qua_goi theo khoang ngay_gio_thuc_hien (Lich su khao sat, bao cao khao sat khoi 4, vi pham...) phai
-- quet toan bang ~5,5s/lan va chan hang doi D1 (tim kiem ca bi treo theo). IF NOT EXISTS: an toan voi DB local da co index.
CREATE INDEX IF NOT EXISTS idx_ket_qua_goi_ngay ON ket_qua_goi (ngay_gio_thuc_hien);
