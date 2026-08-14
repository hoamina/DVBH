-- ============================================================
-- API doi tac ngoai: quet dinh ky lay du lieu ca su co + lich su giai trinh (file .xlsx)
-- Xem PARTNER_API_GUIDE.md - moi doi tac 1 key, gioi han 30 lan goi/ngay (VN), toi thieu 1 phut/lan,
-- toi da 20.000 dong/lan. api_key luu THANG (khong hash) - dong bo voi cach EXTERNAL_IMPORT_API_KEY
-- (routes/externalImport.ts) duoc so sanh truc tiep, khong co tien le hash key nao trong repo nay.
-- ============================================================

CREATE TABLE partner_api_keys (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_doi_tac     TEXT NOT NULL,
    api_key         TEXT NOT NULL UNIQUE,
    active          INTEGER NOT NULL DEFAULT 1,
    ghi_chu         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', '+7 hours')),
    created_by      TEXT REFERENCES users(email),
    revoked_at      TEXT
);

-- Nhat ky moi lan goi API - phuc vu ca rate limit (giai doan/dem so lan trong ngay) lan audit sau nay.
CREATE TABLE partner_api_call_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key_id      INTEGER NOT NULL REFERENCES partner_api_keys(id),
    mode            TEXT NOT NULL,
    so_dong         INTEGER,
    called_at       TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);

-- Phuc vu ca 2 truy van rate-limit: "lan goi gan nhat" (ORDER BY called_at DESC LIMIT 1) va "dem so
-- lan trong ngay VN hom nay" (WHERE api_key_id = ? AND date(called_at) = date('now','+7 hours')).
CREATE INDEX idx_partner_api_call_log_key_time ON partner_api_call_log (api_key_id, called_at DESC);
