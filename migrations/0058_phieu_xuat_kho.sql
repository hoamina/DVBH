-- ============================================================
-- Module "Dat mua linh kien" - phieu xuat kho/giao hang + phieu so tien.
-- Pattern header+log giong phieu_dat (migration 0056).
-- ============================================================

CREATE TABLE phieu_xuat_kho (
    id          TEXT PRIMARY KEY,  -- vd: PXK-000001
    ma_xuat_kho TEXT NOT NULL UNIQUE,
    nguoi_tao   TEXT NOT NULL REFERENCES users(email),
    ngay_tao    TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu     TEXT
);

-- Dong don hang duoc gop vao 1 phieu xuat kho (nhieu dong don hang -> 1 lan giao).
CREATE TABLE phieu_xuat_kho_dong (
    phieu_xuat_kho_id TEXT NOT NULL REFERENCES phieu_xuat_kho(id),
    dat_don_hang_id   TEXT NOT NULL REFERENCES dat_don_hang(id),
    PRIMARY KEY (phieu_xuat_kho_id, dat_don_hang_id)
);

-- Trang thai: KT xac nhan / Kho xac nhan / Dang gui / KTV da nhan / KT huy
CREATE TABLE phieu_xuat_kho_log (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_xuat_kho_id TEXT NOT NULL REFERENCES phieu_xuat_kho(id),
    trang_thai        TEXT NOT NULL CHECK (trang_thai IN (
                          'KT xac nhan', 'Kho xac nhan', 'Dang gui', 'KTV da nhan', 'KT huy'
                      )),
    nguoi_xu_ly       TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly        TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu           TEXT
);

-- Phieu so tien KTV can chuyen - tao TRUOC buoc gan ma_xuat_kho. Luong 5 buoc tuyen tinh don gian
-- nen dung cot trang_thai truc tiep, khong can bang log rieng.
CREATE TABLE phieu_so_tien (
    id              TEXT PRIMARY KEY,  -- vd: PST-000001
    phieu_dat_id    TEXT NOT NULL REFERENCES phieu_dat(id),
    so_tien         REAL NOT NULL,
    ghi_chu         TEXT,
    trang_thai      TEXT NOT NULL DEFAULT 'Cho KTV chuyen' CHECK (trang_thai IN (
                        'Cho KTV chuyen', 'KTV da chuyen', 'TN da duyet', 'TN tu choi', 'Da huy'
                    )),
    bang_chung_url  TEXT,
    ngay_ktv_chuyen TEXT,
    nguoi_tao       TEXT NOT NULL REFERENCES users(email),
    ngay_tao        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_pxk_ma  ON phieu_xuat_kho(ma_xuat_kho);
CREATE INDEX idx_pxkl_id ON phieu_xuat_kho_log(phieu_xuat_kho_id);
CREATE INDEX idx_pst_pd  ON phieu_so_tien(phieu_dat_id);

INSERT INTO id_counters (ten_bang, gia_tri_hien_tai) VALUES
    ('phieu_xuat_kho', 0),
    ('phieu_so_tien', 0);
