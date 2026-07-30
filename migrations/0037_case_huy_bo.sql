-- ============================================================
-- Ca "huy bo" (Admin) - cach ly khoi moi hang doi can xu ly + KPI, co the dao nguoc
-- ============================================================

-- Ten "huy_bo_*" (khong phai "huy_*") de tranh nham voi cot CRM co san "ly_do_huy" (BUSINESS_FIELDS,
-- y nghia khac hoan toan - ly do CRM-side huy yeu cau, khong phai co "loai bo khoi bao cao" cua he
-- thong). 3 cot nay KHONG duoc dua vao ratchet.ts/BUSINESS_FIELDS, khong xuat hien trong
-- importProcessor.ts's buildInsertStatement/buildFullOverwrite - nen song sot qua moi lan import CRM,
-- giong assigned_to/archived_at (migration 0002).
ALTER TABLE case_dvbh ADD COLUMN huy_bo_at TEXT;
ALTER TABLE case_dvbh ADD COLUMN huy_bo_by TEXT REFERENCES users(email);
ALTER TABLE case_dvbh ADD COLUMN huy_bo_ly_do TEXT;

CREATE INDEX idx_case_huy_bo_at ON case_dvbh (huy_bo_at);
