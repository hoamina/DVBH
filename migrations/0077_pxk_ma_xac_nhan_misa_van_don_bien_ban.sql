-- ============================================================
-- Dot 2 (C+D+E+F) - ke hoach ra soat luong chinh "Dat mua linh kien" (2026-08-15).
-- 4 cot moi tren phieu_xuat_kho, doc lap nhau, deu la ALTER TABLE ADD COLUMN (an toan, khong dung
-- recreate-table):
--   - ma_xuat_kho_xac_nhan: 0 = ma_xuat_kho dang la placeholder he thong tu dien luc tao (=id PXK,
--     xem POST /phieu-xuat-kho), 1 = TN da nhap ma that qua PATCH /:id/ma-xuat-kho. Cac PXK da ton
--     tai truoc migration nay deu da co ma that (nhap tay luc tao theo luong cu) -> backfill = 1.
--   - ma_misa: Ke toan dien tren CHINH PXK (khong con o tung dong dat_don_hang).
--   - ma_van_don: tach rieng khoi ghi_chu chung (truoc day Kho gop chung vao ghi_chu).
--   - anh_bien_ban_url: link Google Drive anh bien ban tiep nhan (KTV chup, khong bat buoc).
-- ============================================================

ALTER TABLE phieu_xuat_kho ADD COLUMN ma_xuat_kho_xac_nhan INTEGER NOT NULL DEFAULT 0;
ALTER TABLE phieu_xuat_kho ADD COLUMN ma_misa TEXT;
ALTER TABLE phieu_xuat_kho ADD COLUMN ma_van_don TEXT;
ALTER TABLE phieu_xuat_kho ADD COLUMN anh_bien_ban_url TEXT;

UPDATE phieu_xuat_kho SET ma_xuat_kho_xac_nhan = 1;
