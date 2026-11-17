-- 2026-11-17 bước 2/2 (chạy SAU khi code đọc/ghi case_dt_sua đã deploy - xem 0172): xoá 6 cột "sửa doanh thu" khỏi case_dvbh
-- (99 -> 93 cột) để dành chỗ cho dữ liệu import. Chép bù trước: ca sửa DT trong lúc chờ deploy (code cũ vẫn ghi vào case_dvbh).
INSERT OR IGNORE INTO case_dt_sua (case_id, dt_san_pham_crm, dt_linh_kien_crm, dt_dich_vu_crm, sua_at, sua_by, ly_do)
SELECT id, dt_san_pham_crm, dt_linh_kien_crm, dt_dich_vu_crm, dt_sua_at, dt_sua_by, dt_sua_ly_do
FROM case_dvbh WHERE dt_sua_at IS NOT NULL;

DROP INDEX IF EXISTS idx_case_dt_sua;
ALTER TABLE case_dvbh DROP COLUMN dt_san_pham_crm;
ALTER TABLE case_dvbh DROP COLUMN dt_linh_kien_crm;
ALTER TABLE case_dvbh DROP COLUMN dt_dich_vu_crm;
ALTER TABLE case_dvbh DROP COLUMN dt_sua_at;
ALTER TABLE case_dvbh DROP COLUMN dt_sua_by;
ALTER TABLE case_dvbh DROP COLUMN dt_sua_ly_do;
