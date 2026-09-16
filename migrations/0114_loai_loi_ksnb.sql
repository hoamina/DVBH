-- Tach rieng loai_loi cho dong bo Google Sheet KSNB (yeu cau chu he thong 2026-09-16, tiep noi
-- migration 0113) - truoc day CA dong bo Sheet lan tao thu cong trong app deu dung chung
-- loai_loi='Khac', nhan hien thi (LOAI_LOI_META) se KHONG phan biet duoc nguon goc. Them gia tri
-- 'KSNB' RIENG cho dong tu dong bo Sheet (hien "Vi phạm ghi nhận từ KSNB" o FE) - 'Khac' gio CHI con
-- danh cho vi_pham tao thu cong trong app (boi bat ky vai tro nao, khong chi KSNB, xem POST
-- /vi-pham/case/:caseId), giu nguyen 2 nhan khac nhau dung nguon.
--
-- Tai thoi diem migration nay, CHUA co dong vi_pham nao voi loai_loi='Khac' tren production (da xac
-- minh truc tiep - cron dong bo Sheet 03:00 VN chua tung chay, chua co ai tao thu cong) nen KHONG can
-- UPDATE du lieu cu, chi can mo rong CHECK.
--
-- vi_pham co 1 bang con dang REFERENCES no (vi_pham_giai_trinh.vi_pham_id, migration 0108) nen KHONG
-- the DROP TABLE vi_pham truc tiep (xem CLAUDE.md "D1 khong tat duoc FK giua migration") - phai sao
-- luu + drop vi_pham_giai_trinh truoc, recreate vi_pham, roi recreate + phuc hoi lai vi_pham_giai_trinh
-- y het schema goc - cung ky thuat da dung o migration 0112/0113.
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

    CONSTRAINT chk_cap2_sau_cap1 CHECK (
        chot_bo_cap_2 IS NULL OR ket_qua_cap_1 IS NOT NULL
    ),
    UNIQUE (case_id, loai_loi, ket_qua_cap_1)
);

INSERT INTO vi_pham_new (id, ket_qua_goi_id, case_id, loai_loi, ket_qua_cap_1, ghi_chu, nguoi_ghi_nhan, ngay_ghi_nhan, chot_bo_cap_2, nguoi_chot, ngay_chot)
SELECT id, ket_qua_goi_id, case_id, loai_loi, ket_qua_cap_1, ghi_chu, nguoi_ghi_nhan, ngay_ghi_nhan, chot_bo_cap_2, nguoi_chot, ngay_chot FROM vi_pham;

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

PRAGMA foreign_keys=ON;
