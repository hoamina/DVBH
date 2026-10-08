-- Ton kho linh kien keo tu linh-kien-app (2026-10-08, xem backend/src/lib/tonKhoLk.ts). Nguon = file MISA "ton kho
-- cong no" Ke toan import hang ngay ben linh-kien-app (GET /api/partner/v1/ton-kho). CHI giu 1 phien ban (ngay
-- gan nhat) - moi lan co phien ban moi XOA + GHI DE toan bo trong 1 batch, khong luu lich su.
--   nguon 'kho' = kho cong ty (kho_cong_ty_ton_kho ben kia), 'ktv' = kho KTV (ktv_ton_kho, ma_ktv NULL = ma kho
--   chua khop KTV nao).
CREATE TABLE ton_kho_lk (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nguon       TEXT NOT NULL CHECK (nguon IN ('kho', 'ktv')),
    ma_kho      TEXT NOT NULL,
    ten_kho     TEXT,
    ma_ktv      TEXT,
    ten_ktv     TEXT,
    khu_vuc_ma  TEXT,
    ma_hang     TEXT NOT NULL,
    ten_hang    TEXT,
    dvt         TEXT,
    cuoi_ky     REAL
);
CREATE INDEX idx_ton_kho_lk_ma_hang ON ton_kho_lk(ma_hang);

-- 1 dong duy nhat (id = 1): phien_ban = thoi diem import ben linh-kien-app (gio VN), dong_bo_luc = luc keo ve,
-- kiem_tra_luc/loi = lan hoi gan nhat (cron/nut dong bo) de hien trang thai tren UI.
CREATE TABLE ton_kho_lk_meta (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    phien_ban     TEXT,
    ky_tu_ngay    TEXT,
    ky_den_ngay   TEXT,
    so_dong       INTEGER,
    dong_bo_luc   TEXT,
    dong_bo_boi   TEXT,
    kiem_tra_luc  TEXT,
    loi           TEXT
);

-- Khai bao kho nao cong vao "Tồn kho MB"/"Tồn kho MN" (tab "Cấu hình kho" module Ca thieu linh kien). Kho khong co
-- dong o day = khong tinh. Gia tri ban dau = cach linh-kien-app dang gan kho dang bat vao MB1-3/MN1-3
-- (kho_cong_ty_khu_vuc, migration 0025 ben do).
CREATE TABLE ton_kho_nhom_kho (
    ma_kho          TEXT PRIMARY KEY,
    nhom            TEXT NOT NULL CHECK (nhom IN ('MB', 'MN')),
    nguoi_cap_nhat  TEXT,
    ngay_cap_nhat   TEXT
);
INSERT INTO ton_kho_nhom_kho (ma_kho, nhom, nguoi_cap_nhat, ngay_cap_nhat) VALUES
    ('6804-MB', 'MB', 'migration', datetime('now', '+7 hours')),
    ('GLMB', 'MB', 'migration', datetime('now', '+7 hours')),
    ('SNKMB', 'MB', 'migration', datetime('now', '+7 hours')),
    ('VGMB', 'MB', 'migration', datetime('now', '+7 hours')),
    ('MMMB', 'MB', 'migration', datetime('now', '+7 hours')),
    ('6803', 'MN', 'migration', datetime('now', '+7 hours')),
    ('VGMN', 'MN', 'migration', datetime('now', '+7 hours'));
