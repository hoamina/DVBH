-- RA SOAT BAO MAT/CHI PHI D1 2026-08-18 (phan hoi Codex #13): sau khi co trang_thai_hien_tai
-- (migration 0087, cot THAT tren dong, khong con la bieu thuc suy tu subquery) moi index duoc theo
-- cot nay - truoc do KHONG the index vi trang_thai chi ton tai duoi dang correlated subquery. Chon
-- dung 3 to hop khop cac bo loc dang dung nhieu nhat trong GET /don-hang, GET /phieu-xuat-kho, va
-- cac SELECT COUNT(*) trong GET /luong-quy-trinh + GET /loai-don-counts (loai_don + trang_thai_hien_tai
-- la cap loc pho bien nhat o ca 2 noi).
CREATE INDEX idx_ddh_loai_don_trang_thai   ON dat_don_hang(loai_don, trang_thai_hien_tai, ngay_tao);
CREATE INDEX idx_ddh_nhan_hang_trang_thai  ON dat_don_hang(nguoi_nhan_hang, trang_thai_hien_tai);
CREATE INDEX idx_pxk_trang_thai_nhan_hang  ON phieu_xuat_kho(trang_thai_hien_tai, nguoi_nhan_hang, ngay_tao);
