-- Danh muc "Loai loi vi pham" (yeu cau chu he thong 2026-09-16, doi chieu "Danh sach quy loi vi
-- pham.xlsx") - quan ly duoc qua Settings (Admin them/sua/bat-tat), thay the 3 lua chon cung cung
-- trong SurveyCallWorkspace.tsx ("Loi khong lien he"/"Loi sai bao cao"/"Loi khac"). Cung pattern voi
-- settings_ly_do_cham (migration 0065): ten_loi la GIA TRI THUC SU duoc luu vao vi_pham.ket_qua_cap_1
-- (KHONG qua FK id). Cot ket_qua_cap_1 truoc day CO CHECK constraint cung 4 gia tri (migration 0005) -
-- phai bo CHECK nay o cuoi file (xem khoi "Bo CHECK(ket_qua_cap_1)" ben duoi), neu khong INSERT bat ky
-- gia tri moi nao tu danh muc nay se loi SQLITE_CONSTRAINT_CHECK ngay khi CSKH luu cuoc goi.
--
-- "bat_buoc_ghi_chu" thay the viec so sanh chuoi cung "ket_qua_cap_1 === 'Loi khac'" truoc day (fragile
-- neu Admin doi ten "Loi khac") - chi dong "Loi khac" seed ben duoi bat co nay, dung o FE de bat buoc
-- CSKH nhap Ghi chu khi chon 1 loi khong co mo ta ro rang.
--
-- 2 gia tri CU "Loi khong lien he"/"Loi sai bao cao" (con nguyen trong cac dong vi_pham lich su, xem
-- comment tai routes/survey.ts/importKhaoSat.ts) CO CHU DICH khong duoc seed lai o day - chu he thong
-- yeu cau khong con hien trong danh sach lua chon nua nhung KHONG doi du lieu cu.
CREATE TABLE settings_loai_vi_pham (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_loi           TEXT NOT NULL,
    nhom_loi          TEXT NOT NULL,
    diem_the          REAL NOT NULL DEFAULT 0,
    bat_buoc_ghi_chu  INTEGER NOT NULL DEFAULT 0,
    bat_tat           INTEGER NOT NULL DEFAULT 1,
    stt               INTEGER NOT NULL DEFAULT 0,
    nguoi_cap_nhat    TEXT REFERENCES users(email),
    ngay_cap_nhat     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed dung 14 dong that tu "Danh sach quy loi vi pham.xlsx" (chu he thong cung cap 2026-09-16).
INSERT INTO settings_loai_vi_pham (ten_loi, nhom_loi, diem_the, bat_buoc_ghi_chu, stt) VALUES
    ('KTV chưa liên hệ', 'Lỗi quy trình, sai hẹn, trang phục', 0.5, 0, 1),
    ('Không liên hệ hoặc sai hẹn với KH theo quy định', 'Lỗi quy trình, sai hẹn, trang phục', 0.5, 0, 2),
    ('Đã liên hệ nhưng chưa cập nhật giờ hẹn hoặc chưa hẹn', 'Lỗi quy trình, sai hẹn, trang phục', 0.5, 0, 3),
    ('Đã liên hệ và cập nhật thời gian hẹn nhưng sai giờ hẹn', 'Lỗi quy trình, sai hẹn, trang phục', 0.5, 0, 4),
    ('Thực hiện sai quy trình nghiệp vụ kỹ thuật viên', 'Lỗi quy trình, sai hẹn, trang phục', 0.5, 0, 5),
    ('Vi phạm quy chuẩn diện mạo khi tiếp xúc với KH', 'Lỗi quy trình, sai hẹn, trang phục', 0.5, 0, 6),
    ('Thực hiện sai quy chuẩn chuyên môn nghiệp vụ kỹ thuật', 'Lỗi chuyên môn', 1, 0, 7),
    ('Vi phạm quy chuẩn giao tiếp khi tiếp xúc trực tiếp KH', 'Lỗi tư vấn', 1, 0, 8),
    ('Lỗi báo cáo thông tin sai trên biên bản hoặc trên phần mềm', 'Lỗi báo cáo', 0.5, 0, 9),
    ('Không lập biên bản hoặc lập BB mà không có chữ ký hoặc không để lại bản lưu cho KH', 'Lỗi báo cáo', 0.5, 0, 10),
    ('Báo cáo sai thông tin doanh thu', 'Lỗi báo cáo', 0.5, 0, 11),
    ('Đóng ca khi chưa hoàn thành sự vụ bảo hành', 'Lỗi báo cáo', 0.5, 0, 12),
    ('Để lại thông tin cá nhân cho KH', 'Lỗi nghiêm trọng', 16, 0, 13),
    ('Lỗi khác', 'Lỗi khác', 0.25, 1, 14);

-- Mo rong CHECK(bang) cua settings_audit_log de logAudit() chap nhan bang moi nay (tien le migration
-- 0103/0104/0107) - an toan de recreate-table: settings_audit_log la bang log 1 chieu, khong bang nao
-- khac REFERENCES no.
CREATE TABLE settings_audit_log_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    bang             TEXT NOT NULL CHECK (bang IN ('settings_ly_do', 'settings_ly_do_cham', 'linh_kien', 'settings_phan_loai_tranh_chap', 'settings_ket_qua_xu_ly_tranh_chap', 'settings_loai_yeu_cau_bo_qua_lap', 'settings_loai_yeu_cau_doi_tra', 'settings_luu_y_loi_linh_kien_doi_tra', 'settings_ly_do_ton_tranh_chap', 'settings_loai_vi_pham')),
    ban_ghi_id       TEXT NOT NULL,
    nguoi_thay_doi   TEXT NOT NULL REFERENCES users(email),
    truong_thay_doi  TEXT NOT NULL,
    gia_tri_cu       TEXT,
    gia_tri_moi      TEXT,
    thoi_gian        TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO settings_audit_log_new (id, bang, ban_ghi_id, nguoi_thay_doi, truong_thay_doi, gia_tri_cu, gia_tri_moi, thoi_gian)
SELECT id, bang, ban_ghi_id, nguoi_thay_doi, truong_thay_doi, gia_tri_cu, gia_tri_moi, thoi_gian FROM settings_audit_log;

DROP TABLE settings_audit_log;
ALTER TABLE settings_audit_log_new RENAME TO settings_audit_log;

CREATE INDEX idx_settings_audit_log_bang ON settings_audit_log (bang, ban_ghi_id);

UPDATE sqlite_sequence SET name = 'settings_audit_log' WHERE name = 'settings_audit_log_new';

-- Bo CHECK(ket_qua_cap_1) tren vi_pham (dat tu migration 0005, gioi han cung 4 gia tri) - danh muc
-- "Loai loi vi pham" o tren cho phep Admin tu them dong moi bat ky luc nao, SQLite CHECK khong the
-- tham chieu du lieu bang khac (khong ho tro subquery trong CHECK) nen chi con cach bo han CHECK nay,
-- validate o app layer thay (loadKetQuaCap1ValidValues() trong routes/importKhaoSat.ts, FE chi cho
-- chon tu GET /settings/loai-vi-pham) - dung pattern voi settings_ly_do_cham.ten_ly_do (khong CHECK).
--
-- vi_pham co 1 bang con dang REFERENCES no (vi_pham_giai_trinh.vi_pham_id, migration 0108) nen KHONG
-- the DROP TABLE vi_pham truc tiep (D1 kiem tra referential-integrity voi bang con con song, xem
-- CLAUDE.md "D1 khong tat duoc FK giua migration") - phai sao luu + drop vi_pham_giai_trinh truoc,
-- recreate vi_pham, roi recreate + phuc hoi lai vi_pham_giai_trinh y het schema goc (migration 0108).
PRAGMA foreign_keys=OFF;

CREATE TABLE vi_pham_giai_trinh_backup AS SELECT * FROM vi_pham_giai_trinh;
DROP TABLE vi_pham_giai_trinh;

CREATE TABLE vi_pham_new (
    id                  TEXT PRIMARY KEY,
    ket_qua_goi_id       TEXT NOT NULL REFERENCES ket_qua_goi(id),
    case_id              TEXT NOT NULL REFERENCES case_dvbh(id),
    loai_loi             TEXT NOT NULL CHECK (loai_loi IN (
                            'Loi 120 phut', 'Hen qua 24h',
                            'Loi lo ke hoach', 'KH hen lai', 'Khac'
                        )),
    ket_qua_cap_1         TEXT,
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
