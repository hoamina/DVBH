-- 2026-11-17 (chủ hệ thống): ưu tiên chỗ trong case_dvbh (trần D1 100 cột) cho dữ liệu IMPORT -> tách 6 cột "Sửa doanh thu chuẩn"
-- (migration 0170: dt_san_pham_crm, dt_linh_kien_crm, dt_dich_vu_crm, dt_sua_at, dt_sua_by, dt_sua_ly_do) ra bảng 1-1 riêng.
-- 1 dòng / ca ĐANG có doanh thu sửa tay; "Khôi phục theo CRM" = xoá dòng. dt_san_pham/dt_linh_kien/dt_dich_vu trong case_dvbh vẫn là
-- giá trị HIỆU LỰC (báo cáo không đổi). Bước 1/2: tạo + chép dữ liệu (code cũ vẫn chạy). Bước 2 (0173, sau deploy code mới): xoá 6 cột.
CREATE TABLE IF NOT EXISTS case_dt_sua (
  case_id          TEXT PRIMARY KEY,   -- = case_dvbh.id; KHÔNG FK (giống case_hd_bh: tránh khoá recreate-table case_dvbh)
  dt_san_pham_crm  REAL,
  dt_linh_kien_crm REAL,
  dt_dich_vu_crm   REAL,
  sua_at           TEXT NOT NULL,
  sua_by           TEXT,
  ly_do            TEXT
);
CREATE INDEX IF NOT EXISTS idx_case_dt_sua_at ON case_dt_sua (sua_at);

INSERT OR IGNORE INTO case_dt_sua (case_id, dt_san_pham_crm, dt_linh_kien_crm, dt_dich_vu_crm, sua_at, sua_by, ly_do)
SELECT id, dt_san_pham_crm, dt_linh_kien_crm, dt_dich_vu_crm, dt_sua_at, dt_sua_by, dt_sua_ly_do
FROM case_dvbh WHERE dt_sua_at IS NOT NULL;
