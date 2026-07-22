-- ============================================================
-- Index cho thoi_gian_cskh_tiep_nhan de /api/dashboard/sync-status
-- (MAX(thoi_gian_cskh_tiep_nhan), poll moi 5 phut tren TopBar) tra loi
-- bang cach doc dinh cuoi index (O(1)) thay vi quet toan bang case_dvbh
-- moi lan - tranh lap lai kieu lang phi rows-read da sua o phien truoc.
-- ============================================================

CREATE INDEX idx_case_thoi_gian_tiep_nhan ON case_dvbh (thoi_gian_cskh_tiep_nhan);
