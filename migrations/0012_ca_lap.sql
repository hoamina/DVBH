-- He thong "Ca lap" (serial tai phat trong 45 ngay): thay the hoan toan quy trinh thu cong
-- (Google Sheet "Radar Lap" + sheet "Ca lap 2 thang" loc tay) bang phat hien tren toan bo lich su
-- case_dvbh co san trong D1, dung LAG() window function thay vi gioi han "2 thang truoc" thu cong.
-- Enum dung khoa ASCII (khop convention cua vi_pham.ket_qua_cap_1/loai_loi) - nhan tieng Viet co
-- dau hien thi o frontend qua map rieng (khong luu trong DB).

CREATE TABLE blacklist_serial (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    seri_san_pham   TEXT NOT NULL UNIQUE,          -- luu dang da chuan hoa: TRIM + UPPER
    bat_tat         INTEGER NOT NULL DEFAULT 1,    -- 1 = dang loai serial nay khoi phat hien lap
    nguoi_them      TEXT NOT NULL REFERENCES users(email),
    ngay_them       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_blacklist_serial_seri ON blacklist_serial (seri_san_pham);

CREATE TABLE giai_trinh_lap (
    id                      TEXT PRIMARY KEY,       -- "CL-000001" qua nextSequentialId
    case_id                 TEXT NOT NULL UNIQUE REFERENCES case_dvbh(id),
    chot_danh_gia_lap       TEXT CHECK (chot_danh_gia_lap IN (
                                'Bo qua', 'Lap do nghiep vu KTV', 'Lap do tay nghe KTV',
                                'Lap do chat luong linh kien', 'Lap do sai bao cao', 'Lap do trung su vu')),
    chot_hinh_thuc_xu_ly    TEXT CHECK (chot_hinh_thuc_xu_ly IN (
                                'Khong tinh lap khong tinh luong', 'Tinh lap khong tinh luong',
                                'Tinh luong', 'Tinh luong loi bao cao', 'Khong tinh luong loi bao cao')),
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
CREATE INDEX idx_giai_trinh_lap_case ON giai_trinh_lap (case_id);

INSERT INTO id_counters (ten_bang, gia_tri_hien_tai) VALUES ('giai_trinh_lap', 0);
