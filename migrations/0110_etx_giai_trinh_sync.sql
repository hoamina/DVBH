-- Dong bo tu dong "Giai trinh ton B2B" tu API doi tac ETX (17h15 hang ngay, xem
-- backend/src/lib/etxGiaiTrinhSync.ts + index.ts scheduled()) - kheo id_truy_xuat (API) voi
-- case_dvbh.id, da xac minh khop that bang du lieu san xuat 2026-09-14 (vd id_truy_xuat "T23804"
-- = case_dvbh.id "T23804", khach "Chi Huyen", KTV "Tran Hoai Nam").

-- User "he thong" rieng cho luong nay (KHAC he-thong-tu-dong@dvbh.internal dung cho Sheet sync) -
-- de phan biet trong UI/bao cao dong nao la giai trinh tu dong tu ETX. Can vi giai_trinh.nguoi_giai_trinh
-- co FK REFERENCES users(email) (migration 0001).
INSERT INTO users (email, ten, vai_tro, khu_vuc_phu_trach, trang_thai_duyet)
VALUES ('giaitrinh_autolada@gmail.com', 'Giải trình tự động (ETX/Lada)', NULL, '[]', 'Da duyet')
ON CONFLICT(email) DO NOTHING;

-- Muc ly_do_cham "vet" (fallback) khi ly_do tra ve tu ETX KHONG trung ten voi bat ky dong nao dang
-- bat trong settings_ly_do (xem etxGiaiTrinhSync.ts - uu tien dung THANG ten trung khop de giu dung
-- thong ke, chi roi vao day khi khong khop). Noi dung ly_do/ghi_chu goc cua ETX van duoc giu nguyen
-- van trong giai_trinh.noi_dung, khong mat thong tin.
INSERT INTO settings_ly_do (ten_ly_do, bat_tat, thuoc_thieu_linh_kien)
VALUES ('Đối tác B2B (ETX) tự động', 1, 0)
ON CONFLICT(ten_ly_do) DO NOTHING;

-- Nhat ky moi lan goi API ETX (theo tung doi tac trong 1 dot chay cron/thu cong) - dung de:
--   (1) tra cuu thanh cong/that bai khi can (tab rieng trong Settings, Admin)
--   (2) cho 2 dot cron retry sau (17h20/17h25) tu kiem tra "hom nay da co dong tong ket ok=1 chua"
--       de quyet dinh bo qua, khong goi lai API neu dot truoc da xong (xem hasSucceededToday()).
-- doi_tac_ma = NULL danh cho dong TONG KET ca dot chay (tong so dong moi/loi cua tat ca doi tac).
CREATE TABLE etx_giai_trinh_sync_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    doi_tac_ma      TEXT,
    ok              INTEGER NOT NULL,
    so_dong_moi     INTEGER,
    http_status     INTEGER,
    error           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);
CREATE INDEX idx_etx_sync_log_created ON etx_giai_trinh_sync_log (created_at);
