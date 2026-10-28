-- 2026-10-28 (chu he thong): da ngon ngu giao dien VI / EN / ID cho toan web - luu THEO TAI KHOAN (dang nhap may nao cung
-- dung ngon ngu da chon). Chi dich giao dien; du lieu nghiep vu (CRM/Odoo/nguoi nhap), file xuat Excel, anh Telegram, thong
-- bao loi server giu tieng Viet. Doi qua PATCH /api/auth/me { ngon_ngu }.
ALTER TABLE users ADD COLUMN ngon_ngu TEXT NOT NULL DEFAULT 'vi' CHECK (ngon_ngu IN ('vi', 'en', 'id'));
