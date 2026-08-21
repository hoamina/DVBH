-- RA SOAT BAO MAT/LOGIC 2026-08-18 (phan hoi Codex #8): dat_don_hang/phieu_xuat_kho suy trang thai
-- hien tai bang cach doc dong log MOI NHAT (correlated subquery "ORDER BY id DESC LIMIT 1") moi lan
-- can biet - 2 request chuyen trang thai dong thoi deu doc thay "trang thai cu", deu ghi log, co the
-- tao 2 quyet dinh mau thuan (vd 1 nguoi duyet, 1 nguoi tu choi cung 1 dong o cung 1 thoi diem). Them
-- cot trang_thai_hien_tai + version tren CHINH bang cha de UPDATE co dieu kien (optimistic
-- concurrency: UPDATE ... WHERE trang_thai_hien_tai = ? AND version = ?, rows_written=0 nghia la co
-- request khac da doi truoc) - ap dung cho applyDonHangLog/applyTraHangLog (dung chung 1 bang
-- dat_don_hang) va POST /phieu-xuat-kho/:id/log. Khong dong voi thieu_lk (bang rieng, khong nam
-- trong pham vi ra soat lan nay).
--
-- dat_don_hang.trang_thai_hien_tai backfill CAN xet loai_don vi 2 loai don doc 2 bang log khac nhau
-- (dat_don_hang_log cho mua/cong_no, tra_hang_log cho tra_hang - xem latestDonHangStatusExpr vs
-- latestTraHangStatusExprLocal trong datMuaLinhKien.ts).
ALTER TABLE dat_don_hang ADD COLUMN trang_thai_hien_tai TEXT;
ALTER TABLE dat_don_hang ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

UPDATE dat_don_hang SET trang_thai_hien_tai = (
  SELECT trang_thai FROM dat_don_hang_log WHERE dat_don_hang_id = dat_don_hang.id ORDER BY id DESC LIMIT 1
) WHERE loai_don != 'tra_hang';

UPDATE dat_don_hang SET trang_thai_hien_tai = COALESCE(
  (SELECT trang_thai FROM tra_hang_log WHERE dat_don_hang_id = dat_don_hang.id ORDER BY id DESC LIMIT 1),
  'Cho ke toan duyet mem'
) WHERE loai_don = 'tra_hang';

ALTER TABLE phieu_xuat_kho ADD COLUMN trang_thai_hien_tai TEXT;
ALTER TABLE phieu_xuat_kho ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

UPDATE phieu_xuat_kho SET trang_thai_hien_tai = COALESCE(
  (SELECT trang_thai FROM phieu_xuat_kho_log WHERE phieu_xuat_kho_id = phieu_xuat_kho.id ORDER BY id DESC LIMIT 1),
  'Dang tao phieu'
);
