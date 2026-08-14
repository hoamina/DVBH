-- ============================================================
-- Migration 0051: Bo sung cot masked_key de hien thi an danh key khi da duoc hash
-- ============================================================

ALTER TABLE partner_api_keys ADD COLUMN masked_key TEXT;
