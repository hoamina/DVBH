-- Migration 0063: Chuyen trang thai duyet tu cap PHIEU (phieu_dat_log) xuong cap DONG don hang.
-- Chot voi chu he thong: 1 phieu co nhieu dong linh kien khac nhau, Tram/TN phai xu ly duoc tung
-- dong doc lap (duyet/tu choi/cho hang rieng tung dong) thay vi 1 hanh dong ap dung ca phieu.
--
-- "Cho hang" dung chung co che voi nhanh "Thieu linh kien" (thieu_lk) da co - khong phai trang thai
-- rieng: khi dong chuyen "Cho hang", 1 ca thieu_lk duoc mo (do TN chon luc duyet, hoac do Kho bao
-- thieu sau nay deu duoc) - xem logic trong routes/datMuaLinhKien.ts.
--
-- phieu_dat_log khong con nguon nao doc/ghi sau thay doi nay (da grep xac nhan chi con 1 dong
-- comment nhac ten bang o traHang.ts, khong phai FK/query that) - an toan DROP bat ke so dong.

CREATE TABLE dat_don_hang_log (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    dat_don_hang_id   TEXT NOT NULL REFERENCES dat_don_hang(id),
    trang_thai        TEXT NOT NULL CHECK (trang_thai IN (
                          'Cho Tram duyet', 'Cho TN duyet', 'TN da duyet', 'TN tu choi',
                          'Cho hang', 'Da huy'
                      )),
    nguoi_xu_ly       TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly        TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu           TEXT
);

CREATE INDEX idx_ddhl_dat_don_hang ON dat_don_hang_log(dat_don_hang_id);

DROP TABLE phieu_dat_log;
