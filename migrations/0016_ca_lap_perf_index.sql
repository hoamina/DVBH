-- Index phu cho window function LAG() OVER (PARTITION BY seri_san_pham ORDER BY thoi_gian_hoan_thanh)
-- dung trong CA_LAP_CTE (backend/src/routes/caLap.ts) - idx_case_seri cu (chi 1 cot) khong du de
-- SQLite tranh buoc SORT rieng cho tung partition. Index nay khop dung ca dieu kien WHERE
-- (thoi_gian_hoan_thanh IS NOT NULL) lan thu tu PARTITION BY/ORDER BY cua window function.
CREATE INDEX idx_case_seri_hoan_thanh ON case_dvbh (seri_san_pham, thoi_gian_hoan_thanh)
  WHERE thoi_gian_hoan_thanh IS NOT NULL;
