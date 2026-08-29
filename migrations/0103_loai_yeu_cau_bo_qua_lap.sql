-- Migration 0103: danh muc "Loai yeu cau bo qua danh gia lap" (Settings chung) - cho phep Admin khai
-- bao cac gia tri case_dvbh.loai_yeu_cau se duoc LOAI KHOI toan bo pham vi xet "Ca lap": ca dem "can
-- ra soat" lan buoc LAG() tinh "ca truoc cung serial" deu doc qua eligibleClause() (xem
-- lib/caLapEligible.ts) - dieu kien moi nay cong THEM vao dieu kien hinh_thuc_bao_hanh != 'Goi dien tu
-- van' co san, cung 1 co che NOT EXISTS. Vi du: "Dan tem, poster sieu thi" khong phai 1 lan xu ly bao
-- hanh thuc su nen khong tinh lap. bat_tat = 1 nghia la dieu kien bo qua DANG duoc ap dung (giong
-- ngu nghia bat_tat cua blacklist_serial), khac voi settings_ly_do o cho bat_tat=1 la "dang bat".
CREATE TABLE settings_loai_yeu_cau_bo_qua_lap (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    loai_yeu_cau    TEXT NOT NULL UNIQUE,
    bat_tat         INTEGER NOT NULL DEFAULT 1,
    nguoi_cap_nhat  TEXT REFERENCES users(email),
    ngay_cap_nhat   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Mo rong CHECK(bang) cua settings_audit_log de logAudit() chap nhan bang moi nay (tien le migration
-- 0090) - an toan de recreate-table: settings_audit_log la bang log 1 chieu, khong bang nao khac
-- REFERENCES no.
CREATE TABLE settings_audit_log_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    bang             TEXT NOT NULL CHECK (bang IN ('settings_ly_do', 'settings_ly_do_cham', 'linh_kien', 'settings_phan_loai_tranh_chap', 'settings_ket_qua_xu_ly_tranh_chap', 'settings_loai_yeu_cau_bo_qua_lap')),
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
