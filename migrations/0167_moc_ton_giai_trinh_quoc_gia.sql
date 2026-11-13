-- "Mốc tồn cần giải trình" theo quoc gia (2026-11-13, chu he thong): ca CHUA giai trinh, ton >= so ngay nay thi tinh vao
-- "Tổng cần giải trình" (nhanh "Chưa GT >N ngày", lib/needGiaiTrinh.ts NEED_CHUA_GT_5_NGAY). VN giu 5 ngay nhu cu, PH = 1 ngay
-- (moi ca ton tu 1 ngay deu phai giai trinh). Admin sua o Cai dat > Quoc gia.
ALTER TABLE quoc_gia ADD COLUMN moc_ton_giai_trinh INTEGER NOT NULL DEFAULT 5;
UPDATE quoc_gia SET moc_ton_giai_trinh = 1 WHERE ma = 'PH';
