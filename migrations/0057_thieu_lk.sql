-- ============================================================
-- Module "Dat mua linh kien" - nhanh "thieu linh kien" (state machine doc
-- lap voi dat_don_hang, khong chan luong don hang chinh).
-- ============================================================

CREATE TABLE thieu_lk (
    id              TEXT PRIMARY KEY,  -- vd: TLK-000001
    dat_don_hang_id TEXT NOT NULL REFERENCES dat_don_hang(id),
    ly_do           TEXT,
    nguoi_tao       TEXT NOT NULL REFERENCES users(email),
    ngay_tao        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE thieu_lk_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    thieu_lk_id  TEXT NOT NULL REFERENCES thieu_lk(id),
    trang_thai   TEXT NOT NULL CHECK (trang_thai IN (
                     'Cho kho xu ly', 'Kho da tiep nhan',
                     'Kho xac nhan hang da ve', 'Kho tu choi sai TT',
                     'Da huy bo', 'Da ket thuc'
                 )),
    nguoi_xu_ly  TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly   TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu      TEXT
);

CREATE INDEX idx_tlk_don  ON thieu_lk(dat_don_hang_id);
CREATE INDEX idx_tlkl_tlk ON thieu_lk_log(thieu_lk_id);

INSERT INTO id_counters (ten_bang, gia_tri_hien_tai) VALUES ('thieu_lk', 0);
