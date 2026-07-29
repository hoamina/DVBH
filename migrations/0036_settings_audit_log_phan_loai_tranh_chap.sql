-- ============================================================
-- Mo rong CHECK(bang) cua settings_audit_log de logAudit() chap nhan
-- "settings_phan_loai_tranh_chap" + "settings_ket_qua_xu_ly_tranh_chap" (2
-- danh muc moi cho tinh nang tranh chap, xem migration 0035 +
-- routes/settings.ts POST/PATCH /phan-loai-tranh-chap, /ket-qua-xu-ly-tranh-chap).
--
-- An toan de recreate-table (khac users/case_dvbh...): KHONG co bang nao
-- khac REFERENCES settings_audit_log(...) - day la bang log 1 chieu, chi no
-- REFERENCES users(email) (nguoi_thay_doi), khong bi ai tham chieu NGUOC lai.
-- ============================================================
CREATE TABLE settings_audit_log_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    bang             TEXT NOT NULL CHECK (bang IN ('settings_ly_do', 'linh_kien', 'settings_phan_loai_tranh_chap', 'settings_ket_qua_xu_ly_tranh_chap')),
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
