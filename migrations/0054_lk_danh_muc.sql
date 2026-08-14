-- ============================================================
-- Module "Dat mua linh kien" - danh muc linh kien + nhom thay the.
-- Khong dung bang "linh_kien" hien co (migration 0001) vi bang do
-- danh cho dropdown giai trinh, khong co gia tham chieu/nhom thay the.
-- ============================================================

CREATE TABLE lk_danh_muc (
    ma_lk           TEXT PRIMARY KEY,
    ten_lk          TEXT NOT NULL,
    gia_tham_chieu  REAL,
    don_vi          TEXT,
    ghi_chu         TEXT,
    bat_tat         INTEGER NOT NULL DEFAULT 1,
    nguoi_cap_nhat  TEXT REFERENCES users(email),
    ngay_cap_nhat   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE lk_nhom_thay_the (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_nhom        TEXT NOT NULL,
    ghi_chu         TEXT,
    nguoi_cap_nhat  TEXT REFERENCES users(email),
    ngay_cap_nhat   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cac ma LK thuoc cung 1 nhom duoc coi la thay the duoc cho nhau (goi y khi tao don).
CREATE TABLE lk_nhom_thay_the_ct (
    nhom_id  INTEGER NOT NULL REFERENCES lk_nhom_thay_the(id),
    ma_lk    TEXT    NOT NULL REFERENCES lk_danh_muc(ma_lk),
    PRIMARY KEY (nhom_id, ma_lk)
);
CREATE INDEX idx_lk_nhom_ct_ma ON lk_nhom_thay_the_ct(ma_lk);
