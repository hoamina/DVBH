-- ============================================================
-- BO SUNG CHU DONG (khong co trong schema.sql goc, can cho UI/luong nghiep vu day du)
-- ============================================================

-- Phan cong khao sat cho 1 CSKH cu the; NULL = mo cho tat ca CSKH
ALTER TABLE case_dvbh ADD COLUMN assigned_to TEXT REFERENCES users(email);

-- Danh dau case da archive (thay vi xoa/chuyen bang, giu nguyen quan he FK
-- voi giai_trinh/ket_qua_goi/vi_pham vi log phai luu vinh vien)
ALTER TABLE case_dvbh ADD COLUMN archived_at TEXT;

CREATE INDEX idx_case_assigned_to ON case_dvbh (assigned_to);
CREATE INDEX idx_case_archived_at ON case_dvbh (archived_at);

-- Nhat ky thay doi Settings (ly_do / linh_kien) - Admin only nhung can truy vet
CREATE TABLE settings_audit_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    bang             TEXT NOT NULL CHECK (bang IN ('settings_ly_do', 'linh_kien')),
    ban_ghi_id       TEXT NOT NULL,
    nguoi_thay_doi   TEXT NOT NULL REFERENCES users(email),
    truong_thay_doi  TEXT NOT NULL,
    gia_tri_cu       TEXT,
    gia_tri_moi      TEXT,
    thoi_gian        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_settings_audit_log_bang ON settings_audit_log (bang, ban_ghi_id);

-- Lich su import (hien thi trong module Import data)
CREATE TABLE import_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_file         TEXT NOT NULL,
    nguoi_import     TEXT NOT NULL REFERENCES users(email),
    ghi_moi          INTEGER NOT NULL DEFAULT 0,
    ghi_de           INTEGER NOT NULL DEFAULT 0,
    bo_qua           INTEGER NOT NULL DEFAULT 0,
    loi              INTEGER NOT NULL DEFAULT 0,
    thoi_gian        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_import_history_thoi_gian ON import_history (thoi_gian);
