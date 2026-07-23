-- ============================================================
-- Chan rui ro trung lap du lieu: cau INSERT trong importGiaiTrinh.ts
-- va importKhaoSat.ts (processRows) khong kiem tra trung truoc khi ghi,
-- moi lan import/dong bo lai cung du lieu (file cu hoac Google Sheet
-- chua lai du lieu lich su da import truoc do) se tao dong MOI trung
-- y het dong cu vi giai_trinh.id / ket_qua_goi.id la UUID/ma ngau nhien,
-- khong co UNIQUE nao tren cac cot nghiep vu de chan. Do tren DB that:
-- giai_trinh co 8101 dong, 7868 dong (97%) la trung lap hoan toan.
--
-- Buoc A: DEDUP du lieu giai_trinh da trung TRUOC khi them UNIQUE moi
-- (bat buoc, neu khong migration se loi vi du lieu hien co vi pham
-- UNIQUE moi). Khoa trung lap = tat ca cac cot nghiep vu giong nhau
-- (case_id, ly_do_cham, nguoi_giai_trinh, ngay_giai_trinh va cac cot
-- optional duoc COALESCE ve '' de so sanh). Voi moi nhom trung, giu lai
-- dung 1 dong (id nho nhat theo alphabet - id la UUID ngau nhien khong
-- co y nghia thoi gian nen giu dong nao cung duoc, chi can giu dung 1).
--
-- Buoc B: Them UNIQUE constraint cho giai_trinh bang pattern
-- recreate-table (giong migration 0005_vi_pham_unique.sql).
-- Luu y: UNIQUE constraint cua SQLite coi NULL la "khac nhau moi lan"
-- (2 dong cung NULL o 1 cot khong vi pham UNIQUE). Buoc A dedup dua tren
-- COALESCE(...,'') nen du lieu hien co da sach, nhung UNIQUE constraint
-- that su ap tren gia tri THO (NULL that, khong COALESCE) - chap nhan
-- duoc vi rui ro thap: 2 dong co cung case_id/ly_do_cham/nguoi_giai_trinh/
-- ngay_giai_trinh nhung khac nhau it nhat 1 trong cac cot con lai bang
-- NULL (thay vi chuoi rong) van co the lot qua UNIQUE - truong hop hiem,
-- chi xay ra khi import lai chinh xac 1 dong co NULL that (khong phai
-- chuoi rong) o 1 trong cac cot optional; ON CONFLICT DO NOTHING o code
-- van chan duoc phan lon cac lan dong bo lai vi cung 1 nguon du lieu
-- (Excel/Sheet) luon sinh ra gia tri giong nhau (rong hoac co gia tri).
--
-- Buoc C: Them UNIQUE constraint cho ket_qua_goi (dang rong nen KHONG
-- can buoc dedup) bang cung pattern recreate-table.
-- ============================================================

-- ----------------------------------------------------------
-- BUOC A: DEDUP giai_trinh (giu 1 dong/nhom trung, xoa phan con lai)
-- ----------------------------------------------------------
DELETE FROM giai_trinh
WHERE id NOT IN (
    SELECT MIN(id) FROM giai_trinh
    GROUP BY
        case_id,
        ly_do_cham,
        nguoi_giai_trinh,
        ngay_giai_trinh,
        COALESCE(noi_dung, ''),
        COALESCE(linh_kien_thieu, ''),
        COALESCE(ngay_du_kien_hoan_thanh, ''),
        COALESCE(ngay_yeu_cau_co_hang, ''),
        COALESCE(ma_xuat_hang_lien_quan, '')
);

-- ----------------------------------------------------------
-- BUOC B: Them UNIQUE cho giai_trinh (recreate-table)
-- ----------------------------------------------------------
PRAGMA foreign_keys=OFF;

CREATE TABLE giai_trinh_new (
    id                          TEXT PRIMARY KEY,
    case_id                     TEXT NOT NULL REFERENCES case_dvbh(id),
    ly_do_cham                  TEXT NOT NULL REFERENCES settings_ly_do(ten_ly_do),
    noi_dung                    TEXT,
    linh_kien_thieu             TEXT REFERENCES linh_kien(ma_linh_kien),
    ngay_du_kien_hoan_thanh      TEXT,
    ngay_yeu_cau_co_hang         TEXT,
    ma_xuat_hang_lien_quan       TEXT,
    nguoi_giai_trinh             TEXT NOT NULL REFERENCES users(email),
    ngay_giai_trinh               TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (case_id, ly_do_cham, nguoi_giai_trinh, ngay_giai_trinh, noi_dung,
            linh_kien_thieu, ngay_du_kien_hoan_thanh, ngay_yeu_cau_co_hang,
            ma_xuat_hang_lien_quan)
);

INSERT INTO giai_trinh_new SELECT * FROM giai_trinh;

DROP TABLE giai_trinh;
ALTER TABLE giai_trinh_new RENAME TO giai_trinh;

CREATE INDEX idx_giai_trinh_case ON giai_trinh (case_id);
CREATE INDEX idx_giai_trinh_ngay ON giai_trinh (ngay_giai_trinh);

PRAGMA foreign_keys=ON;

-- ----------------------------------------------------------
-- BUOC C: Them UNIQUE cho ket_qua_goi (dang rong, khong can dedup)
-- ----------------------------------------------------------
PRAGMA foreign_keys=OFF;

CREATE TABLE ket_qua_goi_new (
    id                     TEXT PRIMARY KEY,
    case_id                TEXT NOT NULL REFERENCES case_dvbh(id),
    loai_khao_sat          TEXT NOT NULL,
    doi_tuong_lien_he       TEXT,
    ket_qua_cuoc_goi        TEXT,
    dien_giai               TEXT,
    ghi_chu                 TEXT,
    ly_do_that_bai           TEXT,
    can_goi_lai              INTEGER,
    nguoi_thuc_hien          TEXT NOT NULL REFERENCES users(email),
    ngay_gio_thuc_hien       TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (case_id, loai_khao_sat, nguoi_thuc_hien, ngay_gio_thuc_hien,
            ket_qua_cuoc_goi, dien_giai)
);

INSERT INTO ket_qua_goi_new SELECT * FROM ket_qua_goi;

DROP TABLE ket_qua_goi;
ALTER TABLE ket_qua_goi_new RENAME TO ket_qua_goi;

CREATE INDEX idx_ket_qua_goi_case ON ket_qua_goi (case_id);

PRAGMA foreign_keys=ON;
