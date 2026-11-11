-- Ca lap theo thang (2026-11-11, ra soat tai du lieu): CTE "lap" (routes/caLap.ts CA_LAP_CTE_BODY) truoc di qua
-- idx_case_ca_lap_prior_ht -> moi cau KPI / dem / danh sach cua 1 thang doc HET ~18,7k ca lap moi thang roi moi loc thang
-- (~19k dong/cau, 3 cau moi lan mo). Index mot phan nay chi chua ca lap, sap theo ngay hoan thanh -> loc thang ngay trong
-- index (~1-2k dong). Chi phi ghi nho: chi dong co ca_lap_prior_ht moi co muc index.
CREATE INDEX IF NOT EXISTS idx_case_lap_ht ON case_dvbh(thoi_gian_hoan_thanh) WHERE ca_lap_prior_ht IS NOT NULL;
