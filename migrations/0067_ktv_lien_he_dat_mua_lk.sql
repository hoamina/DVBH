-- Migration 0067: Mo rong ktv_lien_he (migration 0049, danh ba SDT KTV cho CSKH) them cac cot rieng
-- cho module "Dat mua linh kien" - CHOT 2026-08-14: dung CHUNG 1 danh sach "Ma KTV" cho ca 2 muc
-- dich (CSKH goi dien khao sat + Dat mua linh kien chon "nguoi nhan hang") thay vi tao bang moi
-- trung lap, vi ca 2 deu dung chung dinh nghia "ma_ktv" (trich tu tien to "(...)" trong
-- case_dvbh.ky_thuat_vien - xem backend/src/lib/ktvCode.ts).
--
-- 4 cot moi CHI Admin sua duoc (qua endpoint rieng, xem routes/settings.ts) - KHONG dung chung
-- ktvWriteRoles (Admin+CSKH) dang ap dung cho ten_hien_thi/sdt/ghi_chu, vi day la du lieu nghiep vu
-- rieng cua Dat mua linh kien, khong phai danh ba lien he don gian.
--   vai_tro_ktv: phan loai KTV/CTV/Tram/Ve tinh (chot yeu cau "tach rieng he thong quan ly KTV")
--   giam_sat_quan_ly, email_dang_nhap: THAM CHIEU/DANH BA - KHONG thay the users.tram_cha/
--     giam_sat_quan_ly hien dang la nguon that cho phan quyen duyet (chot 2026-08-14, xem
--     scopeDatMua.ts) - chi de tra cuu + lam nguon goi y luc Admin ghep tai khoan dang nhap.

ALTER TABLE ktv_lien_he ADD COLUMN gmail TEXT;
ALTER TABLE ktv_lien_he ADD COLUMN vai_tro_ktv TEXT CHECK (vai_tro_ktv IN ('KTV', 'CTV', 'Tram', 'Ve tinh'));
ALTER TABLE ktv_lien_he ADD COLUMN giam_sat_quan_ly TEXT REFERENCES users(email);
ALTER TABLE ktv_lien_he ADD COLUMN email_dang_nhap TEXT REFERENCES users(email);
