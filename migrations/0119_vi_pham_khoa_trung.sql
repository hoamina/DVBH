-- Migration 0119: cho phep 1 ID (case / KTV) co NHIEU vi pham tu import Excel (yeu cau chu he thong
-- 2026-09-30, noi tiep 0118). UNIQUE cu (case_id, loai_loi, ket_qua_cap_1) gop moi dong import cung ca +
-- cung KQ cap 1 thanh 1 (ca 2 deu loai_loi='Khac') -> mat vi pham. Them cot khoa_trung vao UNIQUE:
--   - ''  (mac dinh): luong khao sat CSKH / dong bo Sheet KSNB / tao tay / import nguon co dinh khac 'Khac'
--     -> GIU NGUYEN hanh vi cu (1 dong / ca / nguon / KQ cap 1).
--   - import nguon 'Khac': "<loai_loi_chi_tiet>|<ngay yyyy-mm-dd>|<ghi_chu>" (xem khoaTrungImport() trong
--     routes/importViPham.ts - PHAI khop cong thuc backfill ben duoi) -> nhieu vi pham / ca, nhung import
--     lai dung file cu van khong nhan doi.
-- Moi cau ON CONFLICT(case_id, loai_loi, ket_qua_cap_1) trong code doi thanh 4 cot (them khoa_trung).
--
-- vi_pham co bang con vi_pham_giai_trinh (FK) -> dung dung ky thuat migration 0114: sao luu + drop bang con,
-- recreate vi_pham, recreate + phuc hoi bang con y het schema goc. vi_pham_ktv khong co bang con.
PRAGMA foreign_keys=OFF;

CREATE TABLE vi_pham_giai_trinh_backup AS SELECT * FROM vi_pham_giai_trinh;
DROP TABLE vi_pham_giai_trinh;

CREATE TABLE vi_pham_new (
    id                  TEXT PRIMARY KEY,
    ket_qua_goi_id       TEXT REFERENCES ket_qua_goi(id),
    case_id              TEXT NOT NULL REFERENCES case_dvbh(id),
    loai_loi             TEXT NOT NULL CHECK (loai_loi IN (
                            'Loi 120 phut', 'Hen qua 24h',
                            'Loi lo ke hoach', 'KH hen lai', 'Khac', 'KSNB'
                        )),
    ket_qua_cap_1         TEXT,
    ghi_chu               TEXT,
    nguoi_ghi_nhan        TEXT NOT NULL REFERENCES users(email),
    ngay_ghi_nhan          TEXT NOT NULL DEFAULT (datetime('now')),
    chot_bo_cap_2          INTEGER,
    nguoi_chot             TEXT REFERENCES users(email),
    ngay_chot               TEXT,
    loai_loi_chi_tiet       TEXT,
    khoa_trung              TEXT NOT NULL DEFAULT '',

    CONSTRAINT chk_cap2_sau_cap1 CHECK (
        chot_bo_cap_2 IS NULL OR ket_qua_cap_1 IS NOT NULL
    ),
    UNIQUE (case_id, loai_loi, ket_qua_cap_1, khoa_trung)
);

INSERT INTO vi_pham_new (id, ket_qua_goi_id, case_id, loai_loi, ket_qua_cap_1, ghi_chu, nguoi_ghi_nhan, ngay_ghi_nhan, chot_bo_cap_2, nguoi_chot, ngay_chot, loai_loi_chi_tiet, khoa_trung)
SELECT id, ket_qua_goi_id, case_id, loai_loi, ket_qua_cap_1, ghi_chu, nguoi_ghi_nhan, ngay_ghi_nhan, chot_bo_cap_2, nguoi_chot, ngay_chot, loai_loi_chi_tiet,
       CASE WHEN loai_loi_chi_tiet IS NOT NULL AND loai_loi = 'Khac'
            THEN loai_loi_chi_tiet || '|' || substr(ngay_ghi_nhan, 1, 10) || '|' || COALESCE(ghi_chu, '')
            ELSE '' END
FROM vi_pham;

DROP TABLE vi_pham;
ALTER TABLE vi_pham_new RENAME TO vi_pham;

CREATE INDEX idx_vi_pham_case ON vi_pham (case_id);
CREATE INDEX idx_vi_pham_ket_qua_goi ON vi_pham (ket_qua_goi_id);
CREATE INDEX idx_vi_pham_cho_qc ON vi_pham (id) WHERE chot_bo_cap_2 IS NULL AND ket_qua_cap_1 IS NOT NULL;

CREATE TABLE vi_pham_giai_trinh (
    id                  TEXT PRIMARY KEY,
    vi_pham_id          TEXT NOT NULL REFERENCES vi_pham(id),
    case_id             TEXT NOT NULL REFERENCES case_dvbh(id),
    nguon               TEXT NOT NULL CHECK (nguon IN ('ktv_qua_api', 'giam_sat_nhap_tay')),
    nguoi_giai_trinh    TEXT,
    ngay_giai_trinh     TEXT NOT NULL,
    noi_dung_giai_trinh TEXT,
    ghi_chu             TEXT,
    anh_urls            TEXT,
    nguoi_nhap          TEXT REFERENCES users(email),
    created_at          TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);
CREATE INDEX idx_vi_pham_giai_trinh_vi_pham ON vi_pham_giai_trinh (vi_pham_id);
CREATE INDEX idx_vi_pham_giai_trinh_case ON vi_pham_giai_trinh (case_id);

INSERT INTO vi_pham_giai_trinh SELECT * FROM vi_pham_giai_trinh_backup;
DROP TABLE vi_pham_giai_trinh_backup;

-- vi_pham_ktv (khong co bang con)
CREATE TABLE vi_pham_ktv_new (
    id                  TEXT PRIMARY KEY,
    ky_thuat_vien       TEXT NOT NULL,
    khu_vuc             TEXT,
    loai_loi            TEXT NOT NULL DEFAULT 'Khac' CHECK (loai_loi IN (
                            'Loi 120 phut', 'Hen qua 24h',
                            'Loi lo ke hoach', 'KH hen lai', 'Khac'
                        )),
    ket_qua_cap_1       TEXT NOT NULL,
    ghi_chu             TEXT,
    nguoi_ghi_nhan      TEXT NOT NULL REFERENCES users(email),
    ngay_ghi_nhan       TEXT NOT NULL,
    chot_bo_cap_2       INTEGER,
    nguoi_chot          TEXT REFERENCES users(email),
    ngay_chot           TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    loai_loi_chi_tiet   TEXT,
    khoa_trung          TEXT NOT NULL DEFAULT '',

    CONSTRAINT chk_ktv_cap2_sau_cap1 CHECK (chot_bo_cap_2 IS NULL OR ket_qua_cap_1 IS NOT NULL),
    UNIQUE (ky_thuat_vien, ngay_ghi_nhan, loai_loi, ket_qua_cap_1, khoa_trung)
);

INSERT INTO vi_pham_ktv_new (id, ky_thuat_vien, khu_vuc, loai_loi, ket_qua_cap_1, ghi_chu, nguoi_ghi_nhan, ngay_ghi_nhan, chot_bo_cap_2, nguoi_chot, ngay_chot, created_at, loai_loi_chi_tiet, khoa_trung)
SELECT id, ky_thuat_vien, khu_vuc, loai_loi, ket_qua_cap_1, ghi_chu, nguoi_ghi_nhan, ngay_ghi_nhan, chot_bo_cap_2, nguoi_chot, ngay_chot, created_at, loai_loi_chi_tiet,
       CASE WHEN loai_loi_chi_tiet IS NOT NULL AND loai_loi = 'Khac'
            THEN loai_loi_chi_tiet || '|' || substr(ngay_ghi_nhan, 1, 10) || '|' || COALESCE(ghi_chu, '')
            ELSE '' END
FROM vi_pham_ktv;

DROP TABLE vi_pham_ktv;
ALTER TABLE vi_pham_ktv_new RENAME TO vi_pham_ktv;

CREATE INDEX idx_vi_pham_ktv_ky_thuat_vien ON vi_pham_ktv (ky_thuat_vien);
CREATE INDEX idx_vi_pham_ktv_ngay_ghi_nhan ON vi_pham_ktv (ngay_ghi_nhan);
CREATE INDEX idx_vi_pham_ktv_cho_qc ON vi_pham_ktv (id) WHERE chot_bo_cap_2 IS NULL;

PRAGMA foreign_keys=ON;
