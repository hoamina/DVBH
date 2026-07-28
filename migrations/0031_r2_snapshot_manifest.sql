-- Manifest hash cho cac snapshot R2 dang "1 file duy nhat" (khong chia theo ngay nhu
-- da_dong_chunk_manifest, migration 0029) - vd danh sach ung vien "can/qua han khao sat"
-- (xem lib/surveySnapshot.ts). CHI duoc ghi/cap nhat tu nhanh import commit/sync-sheet co
-- GHI_MOI+GHI_DE>0, giong het nguyen tac cua da_dong_chunk_manifest (xem memory
-- r2-json-write-trigger-rule.md).
CREATE TABLE r2_snapshot_manifest (
  snapshot_key TEXT PRIMARY KEY,      -- vd 'survey-candidates'
  hash TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
