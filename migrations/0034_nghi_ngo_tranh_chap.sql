-- Cot "nghi ngo tranh chap" (Nghi ngờ tranh chấp) - them vao nhom "co nghi ngo vi pham" tra ve san
-- tu CRM trong file import hang ngay, dung CHUNG pattern ratchet 1 chieu voi 4 cot loi_* +
-- nghi_ngo_nap_gas hien co (xem VIOLATION_FIELDS trong backend/src/lib/ratchet.ts): DB dang true ->
-- giu true bat ke import gui gi; DB dang false, import true -> doi thanh true. ADD COLUMN don gian
-- (co DEFAULT, khong CHECK/FK moi) - an toan, khong dung recreate-table (xem giai thich chi tiet ve
-- gioi han D1 FK o migration 0023_tranh_chap.sql).
--
-- Chot 2026-07-29: logic loc "ca tranh chap" chuyen han sang doc truc tiep cot nay (c.nghi_ngo_
-- tranh_chap = 1), thay the hoan toan logic cu dua vao settings_ly_do.thuoc_tranh_chap (xem
-- routes/tranhChap.ts TRANH_CHAP_ELIGIBLE) - cot/toggle "Thuoc tranh chap" trong Settings van con
-- (chua xoa, xem migration 0023) nhung khong con duoc doc o dau nua, tro thanh du lieu chet cho
-- toi khi co quyet dinh rieng ve viec don dep no.
ALTER TABLE case_dvbh ADD COLUMN nghi_ngo_tranh_chap INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_case_nghi_ngo_tranh_chap ON case_dvbh (id) WHERE nghi_ngo_tranh_chap = 1;
