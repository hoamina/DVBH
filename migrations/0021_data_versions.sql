-- Bang phien ban theo domain du lieu (cases, giai_trinh, vi_pham, ket_qua_goi, giai_trinh_lap,
-- blacklist, settings, users - xem YEU_CAU_BAO_CAO_TINH_SAN.md) - dung cho co che cache bao cao
-- "rpt:%" (xem lib/dataVersions.ts, lib/reportCache.ts). Moi domain 1 dong, version tang dan +1
-- moi khi co GHI THAT vao domain do (bump ngay tai duong ghi, xem cac routes/lib da wire). Endpoint
-- bao cao so sanh version-tag hien tai cua cac domain minh phu thuoc voi version-tag luu trong
-- precomputed_cache.payload (migration 0020, key prefix "rpt:") de biet co can tinh lai hay khong,
-- thay vi tinh lai toan bo moi request.
CREATE TABLE data_versions (
  domain TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
