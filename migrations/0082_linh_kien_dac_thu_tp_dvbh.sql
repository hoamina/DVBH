-- ============================================================
-- "Linh kien dac thu" + vai tro "TP DVBH xac nhan" trong luong dat mua linh kien.
-- CHOT 2026-08-17 (chu he thong):
--  - linh_kien.dac_thu: co danh dau 1 ma LK thuoc nhom "dac thu". Khi tao/duyet 1 dong don hang
--    dung ma LK co dac_thu=1, them 1 buoc cho "TP DVBH xac nhan" NGAY TRUOC buoc Tac nghiep (TN)
--    (sau Tram, neu nguoi tao la Ve tinh) - xem datMuaLinhKien.ts.
--  - users.la_tp_dvbh: vai tro TAC NGHIEP MOI, DOC LAP khoi vai_tro="TBP DVBH" (dung PATTERN HET
--    voi la_tac_nghiep, migration 0081) - KHONG dung lai vai_tro chinh vi do la vai tro "phong ban"
--    dung cho ca he thong BC (bao cao/import/tranh chap/settings), con day la 1 quyen tac nghiep
--    rieng cho dung 1 buoc trong luong dat mua linh kien, co the giao cho nguoi khac ma khong can
--    thang cap ho len vai_tro TBP DVBH.
--  - users.quan_ly_danh_muc_lk: quyen xem+sua module "Danh muc linh kien" (tach ra khoi trang
--    Settings Admin-only ra module rieng tren sidebar) - thay the requireRole("Admin","TBP
--    DVBH","Giam sat") cu (da lech sau khi tach la_tac_nghiep khoi vai_tro o migration 0081).
--
-- KHONG backfill (dong nhat voi quyet dinh khong backfill la_tac_nghiep o migration 0081) - Admin
-- tu tick lai cho tung nguoi can sau khi deploy.
-- ============================================================

ALTER TABLE linh_kien ADD COLUMN dac_thu INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users ADD COLUMN la_tp_dvbh INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users ADD COLUMN quan_ly_danh_muc_lk INTEGER NOT NULL DEFAULT 0;
