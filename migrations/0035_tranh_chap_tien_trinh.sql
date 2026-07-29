-- ============================================================
-- Tinh nang "Quan ly tranh chap" - tien trinh xu ly + log giua KSNB Doi tac va
-- Giam sat khu vuc (xem nhat_ky_lam_viec.md muc "Quan ly tranh chap" 2026-07-29).
-- ============================================================

-- ----------------------------------------------------------
-- users.la_ksnb_doi_tac: co danh dau "KSNB Doi tac" rieng, TACH KHOI vai_tro.
-- Ly do: users.vai_tro CHECK (xem migration 0001_init.sql) khong co gia tri
-- 'KSNB Doi tac' - VAI_TRO_VALUES trong types.ts co khai bao gia tri nay
-- nhung DB CHECK chua tung duoc mo rong (xem canh bao dai trong migration
-- 0023_tranh_chap.sql: mo rong CHECK cua users bat buoc phai recreate CA
-- CHUOI ~13 bang co FK REFERENCES users(email), ke ca case_dvbh - bang do lai
-- bi tham chieu tiep boi giai_trinh/ket_qua_goi/vi_pham/giai_trinh_lap/
-- nap_gas_danh_gia - qua rui ro cho du lieu production that de doi 1 CHECK).
-- Da xac nhan (2026-07-29): CHUA co user nao dang duoc gan vai_tro nay trong
-- thuc te (khong the gan duoc vi se loi SQLITE_CONSTRAINT_CHECK khi PATCH).
-- => Dung 1 cot co rieng, doc lap voi vai_tro, cho dung nghia "la KSNB Doi
-- tac" - nguoi dung van giu 1 vai_tro hop le trong CHECK hien tai (vd
-- Viewer) de duoc vao duoc module tranh-chap (xem ROLE_MODULES), + co nay
-- BAT (=1) de duoc quyen GHI log tien trinh tranh chap.
-- ----------------------------------------------------------
ALTER TABLE users ADD COLUMN la_ksnb_doi_tac INTEGER NOT NULL DEFAULT 0;

-- ----------------------------------------------------------
-- settings_phan_loai_tranh_chap: danh muc "Phan loai tranh chap" (Doi tra,
-- Khieu nai...), cung dang CRUD voi settings_ly_do.
-- ----------------------------------------------------------
CREATE TABLE settings_phan_loai_tranh_chap (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_phan_loai   TEXT NOT NULL UNIQUE,
    bat_tat         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO settings_phan_loai_tranh_chap (ten_phan_loai, bat_tat) VALUES
    ('Đổi trả', 1),
    ('Khiếu nại', 1);

-- ----------------------------------------------------------
-- settings_ket_qua_xu_ly_tranh_chap: danh muc "Ket qua xu ly" - bat buoc chon
-- khi dong 1 log voi trang_thai_xu_ly = 'Da ket thuc tranh chap' (xem
-- tranh_chap_log.ket_qua_xu_ly ben duoi + validate o routes/tranhChap.ts).
-- Them 2026-07-29 theo yeu cau bo sung sau khi thiet ke ban dau.
-- ----------------------------------------------------------
CREATE TABLE settings_ket_qua_xu_ly_tranh_chap (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_ket_qua     TEXT NOT NULL UNIQUE,
    bat_tat         INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO settings_ket_qua_xu_ly_tranh_chap (ten_ket_qua, bat_tat) VALUES
    ('Đã xử lý dứt điểm', 1),
    ('Đã tư vấn', 1),
    ('Không thể xử lý', 1);

-- ----------------------------------------------------------
-- tranh_chap_tien_trinh: tien trinh xu ly tranh chap MẸ (1 ca co the co
-- nhieu tien trinh, vd tranh chap cu da dong, phat sinh tranh chap moi).
-- Trang thai KHONG luu rieng - luon tinh tu log MOI NHAT (xem
-- tranh_chap_log ben duoi), tranh phai dong bo lai khi 1 log bi sua trong
-- 24h (xem PATCH /tranh-chap/log/:id).
-- "muc_do": bat buoc chon luc Tiep nhan, KSNB (hoac TBP DVBH/Admin) sua duoc
-- CHO DEN KHI tien trinh dong - cung quy tac voi phan_loai_tranh_chap (xem
-- PATCH /tranh-chap/tien-trinh/:id). Dung de to mau canh bao tren frontend.
-- ----------------------------------------------------------
CREATE TABLE tranh_chap_tien_trinh (
    id                      TEXT PRIMARY KEY,             -- vd: TC-000001
    case_id                 TEXT NOT NULL REFERENCES case_dvbh(id),
    phan_loai_tranh_chap    TEXT NOT NULL REFERENCES settings_phan_loai_tranh_chap(ten_phan_loai),
    muc_do                  TEXT NOT NULL DEFAULT 'Binh thuong' CHECK (muc_do IN (
                                'Binh thuong', 'Cao', 'Rat nghiem trong'
                            )),
    nguoi_tao               TEXT NOT NULL REFERENCES users(email),
    ngay_tao                TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tctt_case_id ON tranh_chap_tien_trinh (case_id);

-- ----------------------------------------------------------
-- tranh_chap_log: log xu ly con cua 1 tien trinh - nguoi xu ly, ngay xu ly,
-- trang thai, ngay du kien xong, ghi chu. Log moi nhat (theo created_at, id)
-- quyet dinh trang thai hien tai cua CA TIEN TRINH LAN CA (xem
-- TRANH_CHAP tien-trinh routes). KHONG co gia tri "Cho xu ly" trong CHECK -
-- trang thai "Cho xu ly" chi la trang thai NGAM khi 1 ca CHUA co tien trinh
-- nao (tinh, khong luu), tien trinh vua tao luon co log dau tien la "KSNB da
-- tiep nhan" (chot 2026-07-29, xem cau hoi C trong nhat_ky_lam_viec.md).
-- "ket_qua_xu_ly"/"hai_long_sau_tranh_chap": NULLABLE o tang DB (khong ap
-- dung cho log trung gian), nhung BAT BUOC ve nghiep vu khi log nay dong
-- tien trinh voi trang_thai_xu_ly = 'Da ket thuc tranh chap' - validate rieng
-- o routes/tranhChap.ts (khong dua vao CHECK vi CHECK khong "co dieu kien"
-- theo cot khac trong D1/SQLite mot cach de doc/de bao tri).
-- ----------------------------------------------------------
CREATE TABLE tranh_chap_log (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    tien_trinh_id               TEXT NOT NULL REFERENCES tranh_chap_tien_trinh(id),
    nguoi_xu_ly                 TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly                  TEXT NOT NULL,
    trang_thai_xu_ly            TEXT NOT NULL CHECK (trang_thai_xu_ly IN (
                                    'KSNB da tiep nhan', 'Giam sat dang xu ly',
                                    'Da ket thuc tranh chap', 'Da huy bo tranh chap'
                                )),
    thoi_gian_du_kien_xong      TEXT,
    ghi_chu                     TEXT,
    ket_qua_xu_ly               TEXT REFERENCES settings_ket_qua_xu_ly_tranh_chap(ten_ket_qua),
    hai_long_sau_tranh_chap     TEXT CHECK (hai_long_sau_tranh_chap IN (
                                    'Khong xac dinh', 'Khong hai long', 'Binh thuong', 'Hai long', 'Rat hai long'
                                )),
    created_at                  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tcl_tien_trinh_id ON tranh_chap_log (tien_trinh_id);

-- id_counters (xem lib/idCounter.ts) - "ten_bang" chi la 1 nhan tuy y, khong
-- can trung ten bang that (giong "giai_trinh_lap" dung chung prefix "CL").
INSERT INTO id_counters (ten_bang, gia_tri_hien_tai) VALUES ('tranh_chap_tien_trinh', 0);
