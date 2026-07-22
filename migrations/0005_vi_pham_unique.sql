-- ============================================================
-- Chan rui ro rang buoc: 2 CSKH cung khao sat 1 ca cung luc co the tao ra
-- 2 dong vi_pham cho cung (case_id, loai_loi) - vi luong doc "can khao sat"
-- (NOT EXISTS) va luong ghi khong atomic voi nhau (check-then-write race).
-- Them UNIQUE(case_id, loai_loi) de DB tu chan trung lap that su (dung
-- ban chat 1 luot chot vi pham/loai loi cho 1 ca), ket hop voi
-- "ON CONFLICT DO NOTHING" o code ghi (xem survey.ts) de nguoi den sau
-- khong bi loi cung, chi duoc bao la da co nguoi ghi nhan truoc.
-- ============================================================

PRAGMA foreign_keys=OFF;

CREATE TABLE vi_pham_new (
    id                  TEXT PRIMARY KEY,
    ket_qua_goi_id       TEXT NOT NULL REFERENCES ket_qua_goi(id),
    case_id              TEXT NOT NULL REFERENCES case_dvbh(id),
    loai_loi             TEXT NOT NULL CHECK (loai_loi IN (
                            'Loi 120 phut', 'Hen qua 24h',
                            'Loi lo ke hoach', 'KH hen lai', 'Khac'
                        )),
    ket_qua_cap_1         TEXT CHECK (ket_qua_cap_1 IN (
                            'Khong loi', 'Loi khong lien he',
                            'Loi sai bao cao', 'Loi khac'
                        )),
    nguoi_ghi_nhan        TEXT NOT NULL REFERENCES users(email),
    ngay_ghi_nhan          TEXT NOT NULL DEFAULT (datetime('now')),
    chot_bo_cap_2          INTEGER,
    nguoi_chot             TEXT REFERENCES users(email),
    ngay_chot               TEXT,

    CONSTRAINT chk_cap2_sau_cap1 CHECK (
        chot_bo_cap_2 IS NULL OR ket_qua_cap_1 IS NOT NULL
    ),
    UNIQUE (case_id, loai_loi)
);

INSERT INTO vi_pham_new SELECT * FROM vi_pham;

DROP TABLE vi_pham;
ALTER TABLE vi_pham_new RENAME TO vi_pham;

CREATE INDEX idx_vi_pham_case ON vi_pham (case_id);
CREATE INDEX idx_vi_pham_ket_qua_goi ON vi_pham (ket_qua_goi_id);
CREATE INDEX idx_vi_pham_cho_qc ON vi_pham (id) WHERE chot_bo_cap_2 IS NULL AND ket_qua_cap_1 IS NOT NULL;

PRAGMA foreign_keys=ON;
