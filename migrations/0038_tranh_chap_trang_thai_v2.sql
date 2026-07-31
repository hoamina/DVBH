-- ============================================================
-- Redesign trang thai tranh_chap_log: tach 2 giai doan Giam sat -> CSKH (xem yeu cau nguoi dung
-- 2026-07-31, muc "xu ly lai luong Tranh chap, KN"). Thay 4 gia tri cu (KSNB da tiep nhan, Giam sat
-- dang xu ly, Da ket thuc tranh chap, Da huy bo tranh chap) bang 9 gia tri moi:
--   Giam sat (5): Giam sat chua xu ly, Giam sat dang xu ly, Giam sat dong hoan thanh,
--                 Giam sat dong that bai, Giam sat chuyen CSKH
--   CSKH (4):     CSKH chua tiep nhan, CSKH dang xu ly, CSKH khong can xu ly, CSKH xu ly xong
-- Kien truc khong doi: trang thai 1 tien trinh van la trang thai cua log MOI NHAT (khong them cot
-- rieng) - chi mo rong CHECK cua tranh_chap_log.
--
-- Recreate-table an toan o day: tranh_chap_log KHONG bi bang nao khac tham chieu FK (da grep xac
-- nhan trong repo - chi co tranh_chap_log.tien_trinh_id REFERENCES tranh_chap_tien_trinh(id), chieu
-- nguoc lai khong co), khac voi canh bao ve bang "users" trong migration 0023_tranh_chap.sql.
--
-- Map du lieu cu (chi 6 dong that trong production tai thoi diem viet migration nay):
--   KSNB da tiep nhan (4 dong)      -> Giam sat chua xu ly
--   Giam sat dang xu ly (1 dong)    -> Giam sat dang xu ly (giu nguyen chuoi, da co san trong enum moi)
--   Da ket thuc tranh chap (1 dong) -> Giam sat dong hoan thanh (mac dinh trung tinh, du lieu cu
--                                      khong phan biet duoc thanh cong/that bai)
-- ============================================================

CREATE TABLE tranh_chap_log_new (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    tien_trinh_id               TEXT NOT NULL REFERENCES tranh_chap_tien_trinh(id),
    nguoi_xu_ly                 TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly                  TEXT NOT NULL,
    trang_thai_xu_ly            TEXT NOT NULL CHECK (trang_thai_xu_ly IN (
                                    'Giam sat chua xu ly', 'Giam sat dang xu ly',
                                    'Giam sat dong hoan thanh', 'Giam sat dong that bai',
                                    'Giam sat chuyen CSKH',
                                    'CSKH chua tiep nhan', 'CSKH dang xu ly',
                                    'CSKH khong can xu ly', 'CSKH xu ly xong'
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

INSERT INTO tranh_chap_log_new
    (id, tien_trinh_id, nguoi_xu_ly, ngay_xu_ly, trang_thai_xu_ly, thoi_gian_du_kien_xong, ghi_chu,
     ket_qua_xu_ly, hai_long_sau_tranh_chap, created_at, updated_at)
SELECT
    id, tien_trinh_id, nguoi_xu_ly, ngay_xu_ly,
    CASE trang_thai_xu_ly
        WHEN 'KSNB da tiep nhan' THEN 'Giam sat chua xu ly'
        WHEN 'Da ket thuc tranh chap' THEN 'Giam sat dong hoan thanh'
        ELSE trang_thai_xu_ly
    END,
    thoi_gian_du_kien_xong, ghi_chu, ket_qua_xu_ly, hai_long_sau_tranh_chap, created_at, updated_at
FROM tranh_chap_log;

DROP TABLE tranh_chap_log;
ALTER TABLE tranh_chap_log_new RENAME TO tranh_chap_log;

CREATE INDEX idx_tcl_tien_trinh_id ON tranh_chap_log (tien_trinh_id);
