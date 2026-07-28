-- ============================================================
-- Nen tang cho tinh nang "Quan ly tranh chap" (dispute management), tuong tu
-- "Ca thieu linh kien" (missingParts.ts): loc case theo giai_trinh moi nhat co
-- ly_do_cham thuoc nhom danh dau thuoc_tranh_chap = 1 trong settings_ly_do.
--
-- ============================================================
-- QUAN TRONG - users.vai_tro CHECK KHONG duoc mo rong trong migration nay:
-- ============================================================
-- Da THU va XAC NHAN bang thuc nghiem (local D1 that + vanilla SQLite qua
-- node:sqlite doc lap) rang pattern "recreate table" chuan cua repo nay
-- (PRAGMA foreign_keys=OFF ... CREATE x_new ... DROP x ... RENAME, dung o
-- 0005/0022) KHONG THE dung cho bang `users`, khac voi vi_pham/giai_trinh/
-- ket_qua_goi (cac bang do khong co du lieu "song" bi tham chieu FK tai
-- thoi diem DROP nen enforcement bat hay tat khong quan trong). `users` thi
-- khac: co toi thieu 10 bang con dang co du lieu that tham chieu FK truc
-- tiep den users(email) (case_dvbh.assigned_to, giai_trinh.nguoi_giai_trinh,
-- ket_qua_goi.nguoi_thuc_hien, vi_pham.nguoi_ghi_nhan/nguoi_chot,
-- settings_sheet_urls.updated_by, settings_audit_log.nguoi_thay_doi,
-- import_history.nguoi_import, blacklist_serial.nguoi_them,
-- giai_trinh_lap.nguoi_giai_trinh/nguoi_qc, login_log.email), va D1 KHONG
-- HE THUC SU tat duoc FK enforcement: D1 boc moi lenh/file trong 1
-- transaction ngam, ma theo dung tai lieu SQLite thi "PRAGMA foreign_keys"
-- la no-op khi dang trong 1 transaction dang mo - da kiem chung: chay
-- "PRAGMA foreign_keys=OFF;" xong doc lai "PRAGMA foreign_keys;" trong CUNG
-- 1 lan thuc thi wrangler d1 execute --file van tra ve 1 (ON). Thu
-- "PRAGMA defer_foreign_keys=ON;" (co san trong D1, xem
-- https://github.com/cloudflare/workers-sdk/issues/8512) cung KHONG giai
-- quyet duoc: counter vi pham FK hoan tac (deferred) chi giam khi co DML
-- THAT tren dung bang dang bi tham chieu de "sua" vi pham - CREATE bang moi
-- + INSERT + RENAME KHONG lam giam counter nay (da kiem chung that bai
-- giong het tren ca local D1 that lan node:sqlite doc lap thuan SQLite,
-- khong lien quan gi D1). PRAGMA writable_schema (chinh truc tiep sqlite_master
-- de sua CHECK ma khong dong den du lieu) cung bi D1 chan cung
-- ("not authorized: SQLITE_AUTH").
--
-- => De mo rong CHECK(vai_tro) mot cach an toan, BAT BUOC phai recreate
-- CA CHUOI ~10-11 bang phu thuoc (ke ca case_dvbh - bang trung tam, lon,
-- va chinh no lai la cha cua giai_trinh/ket_qua_goi/vi_pham/giai_trinh_lap
-- nen keo theo day chuyen tiep). Day la thay doi VUOT xa pham vi "chi sua
-- users, giu nguyen moi thu khac" cua task nay, rui ro cao (sai sot khi
-- chep lai constraint/index cua nhieu bang, D1 co gioi han ngan sach doc/
-- ghi - xem MEMORY d1-read-budget-optimization.md), nen KHONG thuc hien
-- don phuong trong migration nay. Can quyet dinh rieng: hoac (a) chi dua
-- vao kiem tra tang ung dung (VAI_TRO_VALUES o backend/src/types.ts, da
-- them 'KSNB Doi tac' - nhung LUU Y: backend/src/routes/users.ts dang GHI
-- thang vai_tro xuong DB sau khi qua kiem tra nay, nen PATCH /users/:email
-- voi vai_tro='KSNB Doi tac' se LOI SQLITE_CONSTRAINT_CHECK cho toi khi
-- CHECK duoc mo rong that su), hoac (b) lam 1 migration rieng, duoc ra
-- soat ky, recreate toan bo chuoi bang lien quan (xem bao cao cua task
-- nay de biet danh sach chinh xac).
-- ============================================================

-- ----------------------------------------------------------
-- settings_ly_do: them cot thuoc_tranh_chap (giong thuoc_thieu_linh_kien).
-- Dung ALTER TABLE ADD COLUMN (KHONG can recreate-table) vi day chi la them
-- 1 cot moi co DEFAULT, khong doi/them CHECK hay UNIQUE nao - ADD COLUMN
-- khong kich hoat kiem tra FK (khong DROP/xoa dong nao), an toan voi
-- giai_trinh.ly_do_cham dang tham chieu FK toi settings_ly_do(ten_ly_do)
-- (da kiem chung: dung pattern recreate-table cho bang nay cung se loi FK
-- giong het truong hop users, vi giai_trinh dang co du lieu that).
-- ----------------------------------------------------------
ALTER TABLE settings_ly_do ADD COLUMN thuoc_tranh_chap INTEGER NOT NULL DEFAULT 0;

-- ----------------------------------------------------------
-- Seed 2 ly do cham thuoc nhom tranh chap (an toan neu da ton tai tu truoc)
-- ----------------------------------------------------------
INSERT INTO settings_ly_do (ten_ly_do, bat_tat, thuoc_tranh_chap) VALUES
    ('Chưa thống nhất phương án xử lý', 1, 1),
    ('Khách hàng chưa đồng ý với báo giá', 1, 1)
ON CONFLICT(ten_ly_do) DO UPDATE SET thuoc_tranh_chap = 1;
