-- Tinh san ket qua phat hien "ca lap" (thay vi tinh lai window function LAG() moi request - xem
-- phan tich chi phi D1 rows-read). Cron Trigger (backend/src/index.ts) refresh dinh ky cac cot nay;
-- luc doc (CA_LAP_CTE trong caLap.ts) chi can loc WHERE ca_lap_prior_ht IS NOT NULL qua index thay
-- vi quet toan bo ~15.6 nghin dong moi lan - thuc te chi ~816 dong co "prior" that (~19 lan re hon).
ALTER TABLE case_dvbh ADD COLUMN ca_lap_prior_id TEXT;
ALTER TABLE case_dvbh ADD COLUMN ca_lap_prior_ht TEXT;
ALTER TABLE case_dvbh ADD COLUMN ca_lap_computed_at TEXT;

CREATE INDEX idx_case_ca_lap_prior_ht ON case_dvbh (ca_lap_prior_ht) WHERE ca_lap_prior_ht IS NOT NULL;
