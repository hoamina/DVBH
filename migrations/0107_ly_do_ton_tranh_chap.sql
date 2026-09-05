-- Migration 0107: "Ly do ton tranh chap" - truong bat buoc (tru khi dong tien trinh) khi ghi log
-- CHINH trong Tranh chap, KN (POST /:caseId/tiep-nhan, POST /tien-trinh/:id/log, PATCH /log/:id).
-- Danh muc gia tri quan ly trong Settings (them/bat/tat, mirror settings_phan_loai_tranh_chap).
CREATE TABLE settings_ly_do_ton_tranh_chap (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_ly_do       TEXT NOT NULL UNIQUE,
    bat_tat         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO settings_ly_do_ton_tranh_chap (ten_ly_do) VALUES
    ('Do KTV cần bổ sung thông tin'),
    ('Do GS chưa chốt phương án'),
    ('Do CSKH chưa phản hồi'),
    ('Do QC chưa phản hồi'),
    ('Do GĐ chưa phê duyệt'),
    ('Do KH/ĐL/NPP'),
    ('Do các bộ phận khác của 3T'),
    ('Do các bộ phận khác của KRF'),
    ('Do chờ linh kiện (chờ lâu hoặc không có)'),
    ('Khác (yếu tố khách quan: thời tiết, địa hình,...)');

-- Cot luu tren tung log CHINH (khong ap dung cho log con) - bat buoc khi trang_thai_xu_ly la trang
-- thai DANG MO (xem isTrangThaiDangMo() trong lib/tranhChapTienTrinh.ts), khong bat buoc khi dong.
ALTER TABLE tranh_chap_log ADD COLUMN ly_do_ton_tranh_chap TEXT;

-- Cache tren case_dvbh: ly do cua LOG GAN NHAT tren toan bo case (moi tien trinh, xem
-- routes/tranhChap.ts) - cap nhat dong bo tai ca 3 diem ghi log CHINH o tren. Hien trong bang
-- "Quan ly ton" (BacklogModule.tsx).
ALTER TABLE case_dvbh ADD COLUMN ly_do_ton_tranh_chap_gan_nhat TEXT;

-- Mo rong CHECK(bang) cua settings_audit_log de logAudit() chap nhan bang moi nay (tien le migration
-- 0103/0104) - an toan de recreate-table: settings_audit_log la bang log 1 chieu, khong bang nao khac
-- REFERENCES no.
CREATE TABLE settings_audit_log_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    bang             TEXT NOT NULL CHECK (bang IN ('settings_ly_do', 'settings_ly_do_cham', 'linh_kien', 'settings_phan_loai_tranh_chap', 'settings_ket_qua_xu_ly_tranh_chap', 'settings_loai_yeu_cau_bo_qua_lap', 'settings_loai_yeu_cau_doi_tra', 'settings_luu_y_loi_linh_kien_doi_tra', 'settings_ly_do_ton_tranh_chap')),
    ban_ghi_id       TEXT NOT NULL,
    nguoi_thay_doi   TEXT NOT NULL REFERENCES users(email),
    truong_thay_doi  TEXT NOT NULL,
    gia_tri_cu       TEXT,
    gia_tri_moi      TEXT,
    thoi_gian        TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO settings_audit_log_new (id, bang, ban_ghi_id, nguoi_thay_doi, truong_thay_doi, gia_tri_cu, gia_tri_moi, thoi_gian)
SELECT id, bang, ban_ghi_id, nguoi_thay_doi, truong_thay_doi, gia_tri_cu, gia_tri_moi, thoi_gian FROM settings_audit_log;

DROP TABLE settings_audit_log;
ALTER TABLE settings_audit_log_new RENAME TO settings_audit_log;

CREATE INDEX idx_settings_audit_log_bang ON settings_audit_log (bang, ban_ghi_id);

UPDATE sqlite_sequence SET name = 'settings_audit_log' WHERE name = 'settings_audit_log_new';
