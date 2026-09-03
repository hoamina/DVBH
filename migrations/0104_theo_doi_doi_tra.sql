-- Migration 0104: "Theo doi doi tra" (tab moi trong module Tranh chap, KN) - tu dong phat hien case
-- thuoc dien doi tra/doi may qua 2 dieu kien AND: loai_yeu_cau nam trong settings_loai_yeu_cau_doi_tra
-- (bat_tat=1) VA luu_y_loi_linh_kien nam trong settings_luu_y_loi_linh_kien_doi_tra (bat_tat=1). Tinh
-- TAI CHO (importProcessor.ts) - KHONG can AI/pipeline ngoai gui cot danh gia san nhu nghi_ngo_tranh_
-- chap (migration 0034/0096), vi day la so khop chuoi xac dinh tren 2 cot da co san trong file import,
-- khong can suy luan ngu nghia.
--
-- Cung mo hinh 4 trang thai voi nghi_ngo_tranh_chap: 0 = khong khop dieu kien; 2 = khop, dang cho
-- danh gia thu cong (tab "Theo doi doi tra", bang "Nghi ngo cho xac nhan"); 1 = da xac nhan dung, day
-- sang tranh_chap_tien_trinh xu ly nhu 1 khieu nai binh thuong (bang "Da xac nhan", chia theo thang);
-- 3 = da xac nhan "Bo qua" - khoa vinh vien, khong bao gio tu dong danh gia lai (xem lib/theoDoiDoiTra.ts).
--
-- CHOT 2026-09-03 (nguoi dung xac nhan qua AskUserQuestion): CHI ap dung cho case co GHI_MOI/GHI_DE
-- THAT SU tu thoi diem deploy tinh nang tro di - khong backfill hang loat case cu da dong/khong doi du
-- lieu (importProcessor.ts von da BO_QUA cac dong khong doi crm_hash, xem comment o do - hanh vi nay tu
-- nhien dat duoc yeu cau "khong quet lai lich su" ma khong can code rieng).
ALTER TABLE case_dvbh ADD COLUMN theo_doi_doi_tra INTEGER NOT NULL DEFAULT 0;
ALTER TABLE case_dvbh ADD COLUMN theo_doi_doi_tra_xac_nhan_boi TEXT REFERENCES users(email);
ALTER TABLE case_dvbh ADD COLUMN theo_doi_doi_tra_xac_nhan_luc TEXT;

-- Index rieng cho truy van danh sach "cho danh gia" (theo_doi_doi_tra = 2), mirror
-- idx_case_nghi_ngo_tranh_chap_2 (migration 0096).
CREATE INDEX idx_case_theo_doi_doi_tra_2 ON case_dvbh (id) WHERE theo_doi_doi_tra = 2;

-- 2 danh muc Settings (Admin bat/tat tung dong rieng le trong UI) - dieu kien AND ca 2 danh muc moi
-- tinh la khop, mirror settings_loai_yeu_cau_bo_qua_lap (migration 0103). Seed san danh sach nguoi
-- dung yeu cau (2026-09-03).
CREATE TABLE settings_loai_yeu_cau_doi_tra (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    loai_yeu_cau    TEXT NOT NULL UNIQUE,
    bat_tat         INTEGER NOT NULL DEFAULT 1,
    nguoi_cap_nhat  TEXT REFERENCES users(email),
    ngay_cap_nhat   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE settings_luu_y_loi_linh_kien_doi_tra (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    luu_y_loi_linh_kien   TEXT NOT NULL UNIQUE,
    bat_tat               INTEGER NOT NULL DEFAULT 1,
    nguoi_cap_nhat        TEXT REFERENCES users(email),
    ngay_cap_nhat         TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO settings_loai_yeu_cau_doi_tra (loai_yeu_cau) VALUES
    ('Đổi trả sản phẩm'),
    ('NSKX-Lắp máy đổi trả NSKX'),
    ('NSKX- Lấy máy đổi trả tại kho NSKX'),
    ('Lắp máy đổi trả');

INSERT INTO settings_luu_y_loi_linh_kien_doi_tra (luu_y_loi_linh_kien) VALUES
    ('[Các nghiệp vụ khác] Lắp máy mới đổi máy cũ'),
    ('[Lắp đặt] Chỉ đổi máy'),
    ('[Lắp máy] [CNL] Lắp máy mới đổi máy cũ'),
    ('[Lắp máy] [ĐH] Lắp máy mới đổi máy cũ'),
    ('[Lắp máy] [GD] Lắp máy mới đổi máy cũ'),
    ('[Lắp máy] [MNL] Lắp máy mới đổi máy cũ'),
    ('[Thu hồi] [CNL] Thu máy có vận chuyển'),
    ('[Thu hồi] [ĐH] Thu máy có vận chuyển'),
    ('[Thu hồi] [ĐH] Thu máy không vận chuyển'),
    ('[Thu hồi] [MLN] Thu máy có vận chuyển'),
    ('[Thu hồi] [MLN] Thu máy không vận chuyển'),
    ('[Thu hồi] [MNL] Thu máy có vận chuyển'),
    ('[Thu hồi] [MNL] Thu máy không vận chuyển');

-- Mo rong CHECK(bang) cua settings_audit_log de logAudit() chap nhan 2 bang moi (tien le migration
-- 0103) - an toan de recreate-table: settings_audit_log la bang log 1 chieu, khong bang nao khac
-- REFERENCES no (xem CLAUDE.md "D1 migration constraint: FK-referenced tables...").
CREATE TABLE settings_audit_log_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    bang             TEXT NOT NULL CHECK (bang IN ('settings_ly_do', 'settings_ly_do_cham', 'linh_kien', 'settings_phan_loai_tranh_chap', 'settings_ket_qua_xu_ly_tranh_chap', 'settings_loai_yeu_cau_bo_qua_lap', 'settings_loai_yeu_cau_doi_tra', 'settings_luu_y_loi_linh_kien_doi_tra')),
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
