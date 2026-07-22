-- ============================================================
-- Dot mo rong 3: chuan bi index + bang dung chung cho:
--   1. Tab "Ca da dong" (Backlog/MissingParts) loc theo thang - can index rieng
--      cho nhanh thoi_gian_hoan_thanh IS NOT NULL (index cu idx_case_ton chi
--      phu hop nhanh IS NULL, khong dung duoc cho range query ben nay).
--   2. Cache tinh co hash cho danh muc lich_su it doi (settings_ly_do, linh_kien).
-- ============================================================

CREATE INDEX idx_case_hoan_thanh_not_null ON case_dvbh (thoi_gian_hoan_thanh) WHERE thoi_gian_hoan_thanh IS NOT NULL;

CREATE TABLE content_versions (
    ten_bang   TEXT PRIMARY KEY,
    hash       TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
