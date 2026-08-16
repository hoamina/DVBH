-- Migration 0064: Bo sung du 6 buoc luong tra hang - da chot truoc day (file "2. Giai dap va cai
-- tien.txt" diem 4: "...Tac nghiep se duyet tong don => dong y hoac tu choi... => ke toan xac nhan
-- ket thuc va dong y nhap kho => kho xac nhan nhap kho => ket thuc luong quy trinh tra hang"), nhung
-- migration 0059 (luc trien khai) chi lam 4 buoc dau, KET THUC luon o "Cho TN duyet tong" - thieu 2
-- buoc cuoi. Xac nhan lai voi chu he thong 2026-08-14: them lai du 2 buoc con thieu.
--
-- Chuoi moi: Cho ke toan duyet mem -> Cho kho xac nhan -> Cho QC xac nhan -> Cho TN duyet tong ->
-- Cho ke toan xac nhan nhap kho -> Cho kho xac nhan nhap kho -> Da hoan thanh (hoac Tu choi/Da huy
-- o bat ky buoc nao truoc do).
--
-- Recreate-table an toan o day: khong co bang nao tham chieu FK vao tra_hang_log (da grep xac nhan),
-- giong dung pattern migration 0038_tranh_chap_trang_thai_v2.sql.

CREATE TABLE tra_hang_log_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    dat_don_hang_id TEXT NOT NULL REFERENCES dat_don_hang(id),
    trang_thai      TEXT NOT NULL CHECK (trang_thai IN (
                        'Cho ke toan duyet mem', 'Cho kho xac nhan', 'Cho QC xac nhan',
                        'Cho TN duyet tong', 'Cho ke toan xac nhan nhap kho', 'Cho kho xac nhan nhap kho',
                        'Da hoan thanh', 'Tu choi', 'Da huy'
                    )),
    nguoi_xu_ly     TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly      TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu         TEXT
);

INSERT INTO tra_hang_log_new (id, dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu)
SELECT id, dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu FROM tra_hang_log;

DROP TABLE tra_hang_log;
ALTER TABLE tra_hang_log_new RENAME TO tra_hang_log;

CREATE INDEX idx_thl_don_hang ON tra_hang_log(dat_don_hang_id);
