-- Migration 0062: Fix dat_don_hang.ma_lk FK dang tro toi bang da bi xoa.
--
-- Migration 0060 (unify_linh_kien) gop lk_danh_muc vao linh_kien roi DROP TABLE lk_danh_muc, nhung
-- quen cap nhat dat_don_hang.ma_lk (dinh nghia tu migration 0056) van con "REFERENCES
-- lk_danh_muc(ma_lk)". Ket qua: MOI INSERT vao dat_don_hang (tuc la MOI lan tao phieu dat co it nhat
-- 1 dong don hang - luong chinh cua module "Dat mua linh kien") deu loi "no such table:
-- main.lk_danh_muc" -> bi app.onError (backend/src/index.ts) nuot thanh INTERNAL_ERROR chung chung.
-- Da xac nhan bang cach tai hien chinh xac cau INSERT cua POST /api/dat-mua-lk/phieu-dat tren D1
-- local. Vi loi xay ra tu 0060 (truoc khi ai tao duoc phieu dat thanh cong), dat_don_hang - va ca 2
-- bang con (dat_don_case, phieu_xuat_kho_dong) tham chieu FK toi no - chac chan dang co 0 dong, nen
-- recreate-table an toan (xem canh bao pattern nay trong CLAUDE.md - chi an toan khi khong co bang
-- nao dang giu dong FK-tham-chieu song vao bang bi recreate).
--
-- Sua: doi ma_lk sang REFERENCES linh_kien(ma_linh_kien) - dung bang hop nhat hien tai.

CREATE TABLE dat_don_hang_new (
    id                  TEXT PRIMARY KEY,
    phieu_dat_id        TEXT NOT NULL REFERENCES phieu_dat(id),
    loai_don            TEXT NOT NULL CHECK (loai_don IN ('mua', 'cong_no', 'tra_hang')),
    ma_lk               TEXT NOT NULL REFERENCES linh_kien(ma_linh_kien),
    ten_lk_snapshot     TEXT,
    loai_de_xuat        TEXT,
    so_luong_de_xuat    INTEGER NOT NULL DEFAULT 1,
    so_luong_thuc_xuat  INTEGER,
    gia_de_xuat         REAL,
    gia_chot            REAL,
    ly_do_cham          TEXT,
    ma_xuat_kho         TEXT,
    ma_misa             TEXT,
    so_tien_cong_no     REAL,
    nguoi_tao           TEXT NOT NULL REFERENCES users(email),
    ngay_tao            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO dat_don_hang_new
    (id, phieu_dat_id, loai_don, ma_lk, ten_lk_snapshot, loai_de_xuat, so_luong_de_xuat,
     so_luong_thuc_xuat, gia_de_xuat, gia_chot, ly_do_cham, ma_xuat_kho, ma_misa, so_tien_cong_no,
     nguoi_tao, ngay_tao, updated_at)
SELECT
    id, phieu_dat_id, loai_don, ma_lk, ten_lk_snapshot, loai_de_xuat, so_luong_de_xuat,
    so_luong_thuc_xuat, gia_de_xuat, gia_chot, ly_do_cham, ma_xuat_kho, ma_misa, so_tien_cong_no,
    nguoi_tao, ngay_tao, updated_at
FROM dat_don_hang;

DROP TABLE dat_don_hang;
ALTER TABLE dat_don_hang_new RENAME TO dat_don_hang;

CREATE INDEX idx_ddh_phieu_dat   ON dat_don_hang(phieu_dat_id);
CREATE INDEX idx_ddh_ma_xuat_kho ON dat_don_hang(ma_xuat_kho) WHERE ma_xuat_kho IS NOT NULL;
