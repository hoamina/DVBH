-- ============================================================
-- Luong "Don tra hang" tach hoan toan khoi mua/cong no - buoc 3 ke hoach "Luong tao don mua
-- hang" (diem 4, 8 file "2. Giai dap va cai tien.txt"). KHONG dung chung phieu_dat_log (state
-- machine 5-trang-thai mua/cong no) - dung_don_hang van la dat_don_hang co loai_don='tra_hang',
-- nhung buoc xu ly rieng bang bang nay, 1 dong = 1 dat_don_hang.
--
-- 5 buoc tuyen tinh: Cho ke toan duyet mem -> Cho kho xac nhan -> Cho QC xac nhan ->
-- Cho TN duyet tong -> Da hoan thanh (hoac Tu choi/Da huy o bat ky buoc nao).
-- ============================================================

CREATE TABLE tra_hang_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    dat_don_hang_id TEXT NOT NULL REFERENCES dat_don_hang(id),
    trang_thai      TEXT NOT NULL CHECK (trang_thai IN (
                        'Cho ke toan duyet mem', 'Cho kho xac nhan', 'Cho QC xac nhan',
                        'Cho TN duyet tong', 'Da hoan thanh', 'Tu choi', 'Da huy'
                    )),
    nguoi_xu_ly     TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly      TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu         TEXT
);

CREATE INDEX idx_thl_don_hang ON tra_hang_log(dat_don_hang_id);
