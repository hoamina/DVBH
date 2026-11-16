-- 2026-11-16: tab "Hạn bảo hành" (module Sửa DT · HĐ · BH) chỉ liệt kê ca đã sửa tay hạn BH -> đọc qua partial index này
-- (giống idx_case_hd_bh_hd cho hóa đơn), không quét case_dvbh theo tháng.
CREATE INDEX IF NOT EXISTS idx_case_hd_bh_bh ON case_hd_bh (bh_sua_at) WHERE con_bao_hanh IS NOT NULL;
