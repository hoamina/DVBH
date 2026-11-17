-- 2026-11-17: bảng mở rộng 1-1 cho trường IMPORT mới khi case_dvbh đã hết ngân sách cột (99/100, quy tắc ≤ 95 - xem CLAUDE.md
-- "column budget of case_dvbh" bước 3). Pipeline auto qs gửi thêm trường nào chưa có chỗ trong case_dvbh thì thêm cột vào ĐÂY.
-- Import (lib/importProcessor.ts) ghi bảng này bằng lệnh riêng, so khác biệt bằng hash_mo_rong RIÊNG (không gộp vào crm_hash) -
-- đổi riêng trường mở rộng (vd trạng thái con Odoo Đã gửi -> Đã gọi) vẫn được ghi dù crm_hash không đổi.
-- 1 dòng / ca CÓ dữ liệu mở rộng; KHÔNG FK tới case_dvbh (giữ khả năng recreate-table, giống case_dt_sua/case_hd_bh).
CREATE TABLE IF NOT EXISTS case_dvbh_mo_rong (
  case_id          TEXT PRIMARY KEY,   -- = case_dvbh.id
  -- Trạng thái GỐC của Odoo (Đã gửi, Đã gọi / Đã hẹn, Đang triển khai, Đã đóng ca, Hoàn thành, Thất bại...) trước khi pipeline
  -- quy về 3 trạng thái chung (tien_do_hoan_thanh). QuickSight không có -> không có dòng.
  trang_thai_odoo  TEXT,
  hash_mo_rong     TEXT,
  updated_at       TEXT
);
-- Báo cáo nhanh tiến độ con của ca tồn: GROUP BY trang_thai_odoo.
CREATE INDEX IF NOT EXISTS idx_case_mo_rong_trang_thai ON case_dvbh_mo_rong (trang_thai_odoo);
