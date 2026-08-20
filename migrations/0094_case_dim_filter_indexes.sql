-- ============================================================
-- CHOT 2026-08-20 (rao soat lag - Nhom 3): index cho 7 cot dim dung boi computeDashboardFilters()
-- (routes/dashboard.ts, dropdown loc GET /dashboard/filters) + backlog-by-khu-vuc/danh sach chi tiet
-- (REPORT_DIMS trong lib/filterParams.ts) - truoc day MOI SELECT DISTINCT tren cac cot nay phai quet
-- TOAN BO case_dvbh (khong co index nao tren cac cot nay, xem KE_HOACH_TOI_UU_D1.md Giai doan 2).
-- D1 Insights do duoc moi cau ~179k-197k rows doc/lan (gan bang tong so dong bang), 30-60 lan/ngay
-- moi cot rieng le. Partial index "WHERE col IS NOT NULL" khop dung dieu kien WHERE that su cua tung
-- cau distinctOf() - khong index du lieu khong can loc, giong nguyen tac cac index partial da co san
-- (vd idx_case_ca_lap_prior_ht, idx_users_giam_sat_active).
-- ============================================================
CREATE INDEX idx_case_hang ON case_dvbh (hang) WHERE hang IS NOT NULL;
CREATE INDEX idx_case_tinh ON case_dvbh (tinh) WHERE tinh IS NOT NULL;
CREATE INDEX idx_case_doi_tac ON case_dvbh (doi_tac) WHERE doi_tac IS NOT NULL;
CREATE INDEX idx_case_nhom_san_pham ON case_dvbh (nhom_san_pham) WHERE nhom_san_pham IS NOT NULL;
CREATE INDEX idx_case_nhom_kh ON case_dvbh (nhom_kh) WHERE nhom_kh IS NOT NULL;
CREATE INDEX idx_case_nganh ON case_dvbh (nganh) WHERE nganh IS NOT NULL;
CREATE INDEX idx_case_ky_thuat_vien ON case_dvbh (ky_thuat_vien) WHERE ky_thuat_vien IS NOT NULL;
-- Rieng cho SELECT DISTINCT tinh, quan_huyen (bang cascade Tinh -> Quan/huyen cua bao cao khao sat
-- theo khu vuc) - composite thay vi dua vao idx_case_tinh don le vi truy van loc CA HAI cot IS NOT NULL.
CREATE INDEX idx_case_tinh_quan_huyen ON case_dvbh (tinh, quan_huyen) WHERE tinh IS NOT NULL AND quan_huyen IS NOT NULL;
