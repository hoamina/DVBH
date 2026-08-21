-- "nghi_ngo_tranh_chap" (case_dvbh) chuyen tu boolean 0/1 sang 4 trang thai (0/1/2/3) - CHOT
-- 2026-08-20: "2" = AI phat hien, dang cho xac nhan thu cong; "3" = da tu choi ("Khong phai tranh
-- chap"), khoa vinh vien - xem ratchetNghiNgoTranhChap() trong backend/src/lib/ratchet.ts. Khong doi
-- kieu cot (van la INTEGER, khong CHECK) nen khong can migrate du lieu cu - moi dong dang la 0/1 van
-- giu nguyen y nghia (1 = da xac nhan/tu CRM that, giu ratchet 1 chieu nhu truoc).
--
-- Them 2 cot audit: ai xac nhan (dung/khong phai) va luc nao - dung cho tab "Cho xac nhan AI" trong
-- module Tranh chap, KN (routes/tranhChap.ts POST /:caseId/xac-nhan-ai).
ALTER TABLE case_dvbh ADD COLUMN nghi_ngo_tranh_chap_xac_nhan_boi TEXT REFERENCES users(email);
ALTER TABLE case_dvbh ADD COLUMN nghi_ngo_tranh_chap_xac_nhan_luc TEXT;

-- Index rieng cho truy van danh sach "cho xac nhan AI" (nghi_ngo_tranh_chap = 2) - mirror
-- idx_case_nghi_ngo_tranh_chap (migration 0034) von chi phu = 1.
CREATE INDEX idx_case_nghi_ngo_tranh_chap_2 ON case_dvbh (id) WHERE nghi_ngo_tranh_chap = 2;
