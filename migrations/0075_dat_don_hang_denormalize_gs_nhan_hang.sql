-- Chot nghiep vu 2026-08-15 (rong soat luong chinh): bo khai niem "phieu dat" khoi trai nghiem nguoi
-- dung. KHONG the xoa bang phieu_dat hay cot phieu_dat_id NOT NULL tren dat_don_hang bang
-- recreate-table (D1 chan khi co bang con dang giu dong FK song tro vao dat_don_hang: dat_don_case,
-- thieu_lk, tra_hang_log, phieu_xuat_kho_dong, dat_don_hang_log - xem CLAUDE.md). Thay vao do,
-- denormalize 2 cot tu phieu_dat xuong THANG tren dat_don_hang de moi truy van doc di thang, khong
-- can join qua phieu_dat nua. phieu_dat van duoc tao ngam khi POST (de thoa FK), nhung tu day khong
-- con route/query nao doc lai no - thuan tuy la chi tiet trien khai noi bo.
ALTER TABLE dat_don_hang ADD COLUMN email_gs TEXT REFERENCES users(email);
ALTER TABLE dat_don_hang ADD COLUMN nguoi_nhan_hang TEXT REFERENCES users(email);

UPDATE dat_don_hang SET
  email_gs = (SELECT email_gs FROM phieu_dat WHERE id = dat_don_hang.phieu_dat_id),
  nguoi_nhan_hang = (SELECT nguoi_nhan_hang FROM phieu_dat WHERE id = dat_don_hang.phieu_dat_id);

CREATE INDEX idx_ddh_nguoi_nhan_hang ON dat_don_hang(nguoi_nhan_hang);
CREATE INDEX idx_ddh_email_gs ON dat_don_hang(email_gs);
