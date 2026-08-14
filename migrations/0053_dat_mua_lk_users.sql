-- ============================================================
-- Module "Dat mua linh kien" - mo rong users cho cac vai tro moi.
-- Pattern: tach khoi users.vai_tro CHECK (khong the ALTER CHECK
-- vi users bi ~10 bang FK tham chieu - xem CLAUDE.md + migration
-- 0035_tranh_chap_tien_trinh.sql la_ksnb_doi_tac).
-- ============================================================

-- KTV/CTV/Tram trong module dat mua linh kien.
-- Tram duoc phan biet runtime: la_ktv_dvbh=1 + co Ve tinh co tram_cha=email nay.
ALTER TABLE users ADD COLUMN la_ktv_dvbh INTEGER NOT NULL DEFAULT 0;

-- Ve tinh: nhan vien noi bo cua 1 Tram, co tai khoan dang nhap rieng.
-- Don cua Ve tinh phai qua Tram duyet truoc khi len Giam sat.
ALTER TABLE users ADD COLUMN la_ve_tinh INTEGER NOT NULL DEFAULT 0;

-- Nhan vien Kho (xu ly phieu xuat kho, xac nhan giao hang).
ALTER TABLE users ADD COLUMN la_kho INTEGER NOT NULL DEFAULT 0;

-- Ke toan (duyet AMIS, gan ma MISA, xac nhan ket thuc don tra hang).
ALTER TABLE users ADD COLUMN la_ke_toan INTEGER NOT NULL DEFAULT 0;

-- Email Tram cha - chi ap dung khi la_ve_tinh=1.
-- Dung TEXT (khong phai FK cung) vi FK users->users vong phuc tap,
-- va pattern TEXT REFERENCES da dung o ktv_lien_he (migration 0049).
ALTER TABLE users ADD COLUMN tram_cha TEXT REFERENCES users(email);

-- Email Giam sat phu trach 1-1 cho KTV/Tram/Ve tinh nay.
-- Ap dung khi la_ktv_dvbh=1 hoac la_ve_tinh=1.
-- Thay the co che duyet theo khu_vuc cu (moi KTV/Tram co dung 1 GS co dinh).
ALTER TABLE users ADD COLUMN giam_sat_quan_ly TEXT REFERENCES users(email);

CREATE INDEX idx_users_gs_ql  ON users(giam_sat_quan_ly) WHERE giam_sat_quan_ly IS NOT NULL;
CREATE INDEX idx_users_tram_c ON users(tram_cha) WHERE tram_cha IS NOT NULL;
