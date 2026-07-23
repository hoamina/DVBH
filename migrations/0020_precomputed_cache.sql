-- Bang cache JSON tinh san cho cac endpoint doc nhieu, gia tri nguon chi doi khi import ghi
-- case_dvbh (xem KE_HOACH_TOI_UU_D1.md Giai doan 2 - R2). Dung cho GET /api/dashboard/filters
-- (7 SELECT DISTINCT tren case_dvbh) va GET /api/dashboard/months (SELECT DISTINCT strftime
-- thang tren case_dvbh) - hai truy van nay truoc day quet toan bo case_dvbh moi request du
-- gia tri hau nhu khong doi giua 2 lan import. Khac content_versions (chi luu hash ngan de
-- client tu quyet dinh tai lai), bang nay luu THANG payload JSON de server doc thang, khong
-- can tinh lai tu bang goc moi lan GET.
CREATE TABLE precomputed_cache (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
