-- ============================================================
-- "Log con" trong tien trinh xu ly tranh chap - CHOT 2026-08-20: cac ghi chu tien do PHU trong luc 1
-- log CHINH (tranh_chap_log) dang mo, KHONG doi trang_thai_xu_ly cua tien trinh (trang_thai van chi
-- suy tu log CHINH moi nhat nhu cu, xem tranhChapTienTrinh.ts). Vi du: log chinh "Giam sat dang xu ly"
-- co the co nhieu log con ghi lai tung buoc lien he/kiem tra trong qua trinh xu ly, truoc khi tao 1
-- log chinh moi de dong/chuyen giai doan.
-- ============================================================
CREATE TABLE tranh_chap_log_con (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    tranh_chap_log_id   INTEGER NOT NULL REFERENCES tranh_chap_log(id),
    nguoi_ghi           TEXT NOT NULL REFERENCES users(email),
    noi_dung            TEXT NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tclc_tranh_chap_log_id ON tranh_chap_log_con (tranh_chap_log_id);
