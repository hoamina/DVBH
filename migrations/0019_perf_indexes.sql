-- 3 index hieu nang bo sung (xem KE_HOACH_TOI_UU_D1.md Giai doan 1 - R1). Ca 3 deu la partial/
-- composite index khop dung dieu kien WHERE cua truy van nong nhat, tranh SQLite phai quet toan
-- bang moi lan chay.

-- Cron archive (backend/src/index.ts scheduled()): moi gio quet tim ca DA DONG nhung CHUA archive
-- de danh dau archived_at. Neu khong co index rieng, SQLite phai quet toan bo case_dvbh (bao gom
-- ca da archive tu lau) chi de loc ra tap nho con lai. Partial index nay chi chua cac dong
-- archived_at IS NULL - tap nay nho va KHONG phinh to theo thoi gian (dong nao archive xong se tu
-- rot khoi index), nguoc voi bang chinh cang ngay cang lon.
CREATE INDEX idx_case_archive_pending ON case_dvbh (thoi_gian_hoan_thanh) WHERE archived_at IS NULL;

-- survey.ts /trend (va cac truy van khac loc/sap xep theo ngay goi khao sat): thieu index nen
-- SQLite phai quet toan bo ket_qua_goi (~25k dong) roi moi loc/sap theo ngay.
CREATE INDEX idx_ket_qua_goi_ngay ON ket_qua_goi (ngay_gio_thuc_hien);

-- KPI_ELIGIBLE_CLAUSE (backend/src/lib/kpiEligible.ts) - dieu kien dung chung cho dashboard.ts
-- (/kpis, /pivot), revenue.ts, dailyReport.ts: tien_do_hoan_thanh = 'Hoan thanh XLSC' AND
-- tinh_vao_kpi = 1, luon di kem thoi_gian_hoan_thanh IS NOT NULL (ca da dong). Composite index
-- theo dung thu tu cot loc + partial WHERE khop dieu kien "da dong" giup SQLite tra loi bang index
-- seek thay vi full table scan case_dvbh moi lan vao Dashboard/Doanh thu.
CREATE INDEX idx_case_kpi_eligible ON case_dvbh (tien_do_hoan_thanh, tinh_vao_kpi) WHERE thoi_gian_hoan_thanh IS NOT NULL;
