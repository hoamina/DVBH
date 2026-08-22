-- Cot trang thai "can khao sat" da tinh san tren case_dvbh, thay the viec quet + NOT EXISTS +
-- subquery tuong quan (NEED_SURVEY_CONDITION trong lib/surveyConditions.ts) o MOI lan doc. Duoc
-- duy tri boi lib/canKhaoSat.ts recomputeCanKhaoSatBatch(), goi tu 3 diem ghi (importProcessor.ts,
-- routes/survey.ts ghi ket qua goi, routes/importKhaoSat.ts) + 1 luoi an toan tu-heal hang ngay
-- (index.ts DAILY_SNAPSHOT_CRON). NULL = chua tinh (du lieu cu, can backfill qua
-- POST /api/import/backfill-can-khao-sat).
ALTER TABLE case_dvbh ADD COLUMN can_khao_sat INTEGER;

-- Partial index: chi index cac dong can_khao_sat = 1 (thieu so nho so voi toan bang), ket hop san
-- voi thoi_gian_cskh_tiep_nhan de GET /survey/candidates loc theo thang truc tiep tren index nay
-- (thay vi quet roi loc).
CREATE INDEX idx_case_can_khao_sat_thang ON case_dvbh(can_khao_sat, thoi_gian_cskh_tiep_nhan) WHERE can_khao_sat = 1;
