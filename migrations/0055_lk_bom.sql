-- ============================================================
-- Module "Dat mua linh kien" - BOM (bill of material) tra cuu only.
-- ~39k dong, import 1 lan qua POST /api/lk-settings/bom/import (chunk 500).
-- ============================================================

CREATE TABLE lk_bom (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ma_model    TEXT NOT NULL,
    ma_lk       TEXT NOT NULL,
    ten_lk      TEXT,
    so_luong    REAL NOT NULL DEFAULT 1,
    ngay_import TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_bom_model ON lk_bom(ma_model);
CREATE INDEX idx_bom_ma_lk ON lk_bom(ma_lk);
