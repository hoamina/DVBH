-- Index MOT PHAN (partial) theo tung nuoc ngoai VN tren case_dvbh (2026-11-10). Truoc day khong co index nao co
-- quoc_gia -> moi truy van pham vi 1 nuoc ("(SELECT * FROM case_dvbh WHERE quoc_gia = 'PH')", lib/phamVi.ts) quet
-- TOAN BO ~155k ca; mo trang Tong quat cua PH (cache chua co, ~10 truy van cung luc) lam D1 bao "overloaded" cho
-- MOI nguoi dung. Dieu kien index TRUNG KHOP chu voi dieuKienPhamVi ("quoc_gia = 'PH'") de SQLite dung duoc; truy van
-- VN ("quoc_gia = 'VN'") khong khop dieu kien -> khong bao gio chon index nay (giu nguyen cach chay cua VN). Nuoc them
-- sau: tu tao trong lib/quocGiaKichHoat.ts (lenhTaoPhamVi).
CREATE INDEX IF NOT EXISTS idx_case_dvbh_qg_ph ON case_dvbh(quoc_gia, thoi_gian_hoan_thanh) WHERE quoc_gia = 'PH';
CREATE INDEX IF NOT EXISTS idx_case_dvbh_qg_id ON case_dvbh(quoc_gia, thoi_gian_hoan_thanh) WHERE quoc_gia = 'ID';
