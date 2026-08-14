-- ============================================================
-- Module "Dat mua linh kien" - phieu dat (header) + dong don hang + join case.
-- Pattern header+log giong tranh_chap_tien_trinh/tranh_chap_log (migration 0035):
-- trang thai LUON suy tu log MOI NHAT, khong luu cot rieng.
--
-- CHOT 2026-08-13: GS KHONG co buoc duyet trong luong phieu_dat - don tao xong
-- di thang den Tac nghiep (TN = TBP DVBH/Admin), khac ban dau du kien (co buoc
-- GS duyet giua Ve tinh va TN). email_gs (o phieu_dat) van duoc dien tu
-- users.giam_sat_quan_ly de GS xem/theo doi (khong gate duyet).
-- Trang thai phieu_dat: Cho Ve tinh duyet / Cho TN duyet / TN da duyet / TN tu choi / Da huy
-- ============================================================

CREATE TABLE phieu_dat (
    id          TEXT PRIMARY KEY,  -- vd: PD-000001
    nguoi_tao   TEXT NOT NULL REFERENCES users(email),
    ngay_tao    TEXT NOT NULL DEFAULT (datetime('now')),
    email_gs    TEXT REFERENCES users(email),  -- tu dien tu users.giam_sat_quan_ly, chi de theo doi
    ghi_chu     TEXT,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE phieu_dat_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_dat_id TEXT NOT NULL REFERENCES phieu_dat(id),
    trang_thai   TEXT NOT NULL CHECK (trang_thai IN (
                     'Cho Ve tinh duyet', 'Cho TN duyet', 'TN da duyet', 'TN tu choi', 'Da huy'
                 )),
    nguoi_xu_ly  TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly   TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu      TEXT
);

CREATE TABLE dat_don_hang (
    id                  TEXT PRIMARY KEY,  -- vd: DDH-000001
    phieu_dat_id        TEXT NOT NULL REFERENCES phieu_dat(id),
    loai_don            TEXT NOT NULL CHECK (loai_don IN ('mua', 'cong_no', 'tra_hang')),
    ma_lk               TEXT NOT NULL REFERENCES lk_danh_muc(ma_lk),
    ten_lk_snapshot     TEXT,  -- snapshot ten LK tai thoi diem dat (danh muc co the doi sau)
    loai_de_xuat        TEXT,
    so_luong_de_xuat    INTEGER NOT NULL DEFAULT 1,
    so_luong_thuc_xuat  INTEGER,
    gia_de_xuat         REAL,  -- snapshot tu lk_danh_muc.gia_tham_chieu luc tao
    gia_chot            REAL,  -- TN sua cuoi cung
    ly_do_cham          TEXT,
    ma_xuat_kho         TEXT,
    ma_misa             TEXT,
    so_tien_cong_no     REAL,  -- chi dung khi loai_don='cong_no'
    nguoi_tao           TEXT NOT NULL REFERENCES users(email),
    ngay_tao            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- N-N: 1 dong don hang co the gan 0, 1, hoac nhieu case_dvbh.
CREATE TABLE dat_don_case (
    dat_don_hang_id TEXT NOT NULL REFERENCES dat_don_hang(id),
    case_id         TEXT NOT NULL REFERENCES case_dvbh(id),
    PRIMARY KEY (dat_don_hang_id, case_id)
);

CREATE INDEX idx_phieu_dat_nguoi_tao ON phieu_dat(nguoi_tao);
CREATE INDEX idx_phieu_dat_gs        ON phieu_dat(email_gs);
CREATE INDEX idx_pdl_phieu_dat_id    ON phieu_dat_log(phieu_dat_id);
CREATE INDEX idx_ddh_phieu_dat       ON dat_don_hang(phieu_dat_id);
CREATE INDEX idx_ddh_ma_xuat_kho     ON dat_don_hang(ma_xuat_kho) WHERE ma_xuat_kho IS NOT NULL;
CREATE INDEX idx_ddc_case_id         ON dat_don_case(case_id);

INSERT INTO id_counters (ten_bang, gia_tri_hien_tai) VALUES
    ('phieu_dat', 0),
    ('dat_don_hang', 0);
