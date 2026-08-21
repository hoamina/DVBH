-- Cho phep KTV ghi chu thong tin chuyen tien THAY THE anh (phan hoi 2026-08-19: "cho phép upload
-- ảnh hoặc ghi chú thông tin chuyển tiền") - cot rieng, khong doi y nghia bang_chung_chuyen_tien_url
-- (van la URL that khi co upload anh qua Google Drive).
ALTER TABLE phieu_xuat_kho ADD COLUMN bang_chung_chuyen_tien_ghi_chu TEXT;
