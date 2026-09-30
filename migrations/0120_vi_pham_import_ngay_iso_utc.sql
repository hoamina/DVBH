-- Migration 0120: sua ngay_ghi_nhan cua vi pham IMPORT EXCEL bi luu dang ISO UTC (bug 2026-09-30).
-- O ngay kieu Date trong file Excel -> ImportUploader gui len "2026-09-25T10:55:46.000Z" (gio VN - 7h),
-- importViPham luu nguyen chuoi. Code da sua (isoUtcToVnLocal trong routes/importViPham.ts); o day quy
-- doi du lieu da ghi ve gio VN dia phuong "YYYY-MM-DD HH:MM:SS" (+7h) theo quy uoc toan he thong.
-- Chi cham dong co dang ISO co 'T' - luong khao sat/Sheet/tao tay luu "YYYY-MM-DD HH:MM:SS" nen khong khop.
-- khoa_trung (migration 0119) tinh tu ngay -> tinh lai cung cong thuc cho dong import nguon 'Khac'.
UPDATE vi_pham
SET ngay_ghi_nhan = datetime(ngay_ghi_nhan, '+7 hours')
WHERE ngay_ghi_nhan LIKE '____-__-__T%' AND datetime(ngay_ghi_nhan) IS NOT NULL;

UPDATE vi_pham
SET khoa_trung = COALESCE(loai_loi_chi_tiet, '') || '|' || substr(ngay_ghi_nhan, 1, 10) || '|' || COALESCE(ghi_chu, '')
WHERE loai_loi = 'Khac' AND khoa_trung != '';

UPDATE vi_pham_ktv
SET ngay_ghi_nhan = datetime(ngay_ghi_nhan, '+7 hours')
WHERE ngay_ghi_nhan LIKE '____-__-__T%' AND datetime(ngay_ghi_nhan) IS NOT NULL;

UPDATE vi_pham_ktv
SET khoa_trung = COALESCE(loai_loi_chi_tiet, '') || '|' || substr(ngay_ghi_nhan, 1, 10) || '|' || COALESCE(ghi_chu, '')
WHERE loai_loi = 'Khac' AND khoa_trung != '';
