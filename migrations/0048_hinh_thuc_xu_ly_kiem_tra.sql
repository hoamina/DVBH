-- ============================================================
-- Them 1 gia tri moi vao CHECK cua giai_trinh_lap.chot_hinh_thuc_xu_ly: "Tinh luong kiem tra loi bao
-- cao" (TINH LUONG KIEM TRA, LOI BAO CAO) - CHOT 2026-08-05, danh cho truong hop QC xac dinh co loi
-- bao cao nhung van tinh luong cho cong doan kiem tra. giai_trinh_lap KHONG bi bang nao khac tham
-- chieu FK (da grep xac nhan) nen an toan dung pattern recreate-table chuan cua repo (xem CLAUDE.md
-- "D1 migration constraint: FK-referenced tables can't use the recreate table pattern").
-- ============================================================

CREATE TABLE giai_trinh_lap_new (
    id                      TEXT PRIMARY KEY,
    case_id                 TEXT NOT NULL UNIQUE REFERENCES case_dvbh(id),
    chot_danh_gia_lap       TEXT CHECK (chot_danh_gia_lap IN (
                                'Bo qua', 'Lap do nghiep vu KTV', 'Lap do tay nghe KTV',
                                'Lap do chat luong linh kien', 'Lap do sai bao cao', 'Lap do trung su vu')),
    chot_hinh_thuc_xu_ly    TEXT CHECK (chot_hinh_thuc_xu_ly IN (
                                'Khong tinh lap khong tinh luong', 'Tinh lap khong tinh luong',
                                'Tinh luong', 'Tinh luong loi bao cao', 'Khong tinh luong loi bao cao',
                                'Tinh luong kiem tra loi bao cao')),
    dien_giai_lap           TEXT,
    nguoi_giai_trinh        TEXT REFERENCES users(email),
    ngay_giai_trinh         TEXT,
    qc_chot                 TEXT CHECK (qc_chot IN (
                                'Bo qua', 'Lap do nghiep vu KTV', 'Lap do tay nghe KTV',
                                'Lap do chat luong linh kien', 'Lap do sai bao cao', 'Lap do trung su vu')),
    qc_ghi_chu              TEXT,
    nguoi_qc                TEXT REFERENCES users(email),
    ngay_qc                 TEXT
);

INSERT INTO giai_trinh_lap_new SELECT * FROM giai_trinh_lap;

DROP TABLE giai_trinh_lap;
ALTER TABLE giai_trinh_lap_new RENAME TO giai_trinh_lap;

CREATE INDEX idx_giai_trinh_lap_case ON giai_trinh_lap (case_id);
