-- Index tung phan (partial) rieng cho tung co loi_* cua "Phau xu ly vi pham" (/vi-pham/funnel,
-- xem computeViPhamFunnel() trong backend/src/routes/viPham.ts). Truoc migration nay, WHERE OR ca 4
-- cot loi_* buoc D1 quet gan toan bo case_dvbh (~76.5k/80k dong do tren production) vi khong index
-- nao phu duoc OR-4-cot. Moi index chi chua cac dong loi_x=1 (thieu so so voi ca bang) VA index luon
-- ca thoi_gian_cskh_tiep_nhan lam cot dau (truoc id) de query loc theo dung 1 thang co the range-seek
-- thang do thay vi doc lai het lich su loi_x=1 tu truoc gio - "phu theo thang" theo yeu cau chu he
-- thong 2026-08-03. Query phia backend phai viet lai tu OR sang UNION cac nhanh rieng (xem
-- computeViPhamFunnel) thi planner moi dung duoc cac index nay.
CREATE INDEX idx_case_loi_120p_thang ON case_dvbh (thoi_gian_cskh_tiep_nhan, id)
    WHERE archived_at IS NULL AND huy_bo_at IS NULL AND loi_120p = 1;
CREATE INDEX idx_case_loi_qua_han_24h_thang ON case_dvbh (thoi_gian_cskh_tiep_nhan, id)
    WHERE archived_at IS NULL AND huy_bo_at IS NULL AND loi_qua_han_24h = 1;
CREATE INDEX idx_case_loi_lo_ke_hoach_thang ON case_dvbh (thoi_gian_cskh_tiep_nhan, id)
    WHERE archived_at IS NULL AND huy_bo_at IS NULL AND loi_lo_ke_hoach = 1;
CREATE INDEX idx_case_loi_kh_hen_lai_thang ON case_dvbh (thoi_gian_cskh_tiep_nhan, id)
    WHERE archived_at IS NULL AND huy_bo_at IS NULL AND loi_kh_hen_lai = 1;

-- BAT BUOC: da xac nhan thuc te (local D1) khong co ANALYZE, planner uu tien idx_case_huy_bo_at
-- (index don, khong dieu kien) hon 4 index tung phan o tren du chung khop truc tiep WHERE cua query -
-- vi D1/SQLite thieu sqlite_stat1 cho bang nay se dung uoc luong mac dinh, khong "biet" cac index
-- tung phan trên rat nho. Chay ANALYZE ngay sau khi tao index thi planner moi chon dung.
ANALYZE case_dvbh;
