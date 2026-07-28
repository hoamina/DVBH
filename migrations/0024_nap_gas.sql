-- ============================================================
-- Cot "nghi ngo nap gas" (Nghi ngờ nạp gas) - them vao nhom "co nghi ngo vi pham" tra ve san tu
-- CRM trong file import hang ngay, dung CHUNG pattern ratchet 1 chieu voi 4 cot loi_* hien co
-- (xem VIOLATION_FIELDS trong backend/src/lib/ratchet.ts): DB dang true -> giu true bat ke import
-- gui gi; DB dang false, import true -> doi thanh true. ADD COLUMN don gian (co DEFAULT, khong
-- CHECK/FK moi) - an toan, khong dung recreate-table (xem giai thich chi tiet ve gioi han D1 FK o
-- migration 0023_tranh_chap.sql).
-- ============================================================
ALTER TABLE case_dvbh ADD COLUMN nghi_ngo_nap_gas INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_case_nghi_ngo_nap_gas ON case_dvbh (id) WHERE nghi_ngo_nap_gas = 1;
