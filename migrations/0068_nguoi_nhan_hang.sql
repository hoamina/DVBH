-- Migration 0068: "Nguoi nhan hang" cap PHIEU (Giai doan 4b) - chot 2026-08-14: gan 1 phieu = 1
-- nguoi nhan duy nhat, REFERENCES users(email) truc tiep (khong phai danh_sach_ktv/ktv_lien_he -
-- can 1 tai khoan dang nhap that de loc scope "don cua toi"). Mac dinh = nguoi_tao khi tu tao; TN/GS
-- chon nguoi khac khi tao ho, dropdown lay tu ktv_lien_he (email_dang_nhap khong null) - xem route
-- moi GET /dat-mua-lk/nguoi-nhan-hang-kha-dung.
--
-- De NULLable o DB (khong ep NOT NULL - ALTER TABLE ADD COLUMN NOT NULL can default co dinh, khong
-- hop vi moi phieu khac nhau); backend luon set gia tri khi tao moi.

ALTER TABLE phieu_dat ADD COLUMN nguoi_nhan_hang TEXT REFERENCES users(email);
