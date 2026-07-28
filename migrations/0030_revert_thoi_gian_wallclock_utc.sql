-- Dao nguoc migration 0027: sau khi ban voi user, quyet dinh cuoi cung la GIU NGUYEN gio nhap tu
-- Excel/Google Sheet (da la gio VN dia phuong tu nguon, khong phai UTC) - KHONG quy doi ve UTC khi
-- luu. Thay vao do, logic SO SANH/TINH TOAN (AGE_ANCHOR o ageCalc.ts) va cac cot he thong tu sinh
-- (created_at, ngay_import...) se duoc dieu chinh de cung quy uoc "gio VN dia phuong" nhat quan toan
-- he thong, thay vi ep du lieu nhap ve UTC nhu migration 0027 da lam. Cong lai dung +7h da tru o 0027
-- (cung dieu kien LIKE '%:%' de chi tac dong len gia tri co gio that, giu nguyen gia tri chi co ngay).
UPDATE case_dvbh SET
  thoi_gian_cskh_tiep_nhan = CASE WHEN thoi_gian_cskh_tiep_nhan LIKE '%:%' THEN datetime(thoi_gian_cskh_tiep_nhan, '+7 hours') ELSE thoi_gian_cskh_tiep_nhan END,
  thoi_gian_hen_xu_ly = CASE WHEN thoi_gian_hen_xu_ly LIKE '%:%' THEN datetime(thoi_gian_hen_xu_ly, '+7 hours') ELSE thoi_gian_hen_xu_ly END,
  thoi_gian_hoan_thanh = CASE WHEN thoi_gian_hoan_thanh LIKE '%:%' THEN datetime(thoi_gian_hoan_thanh, '+7 hours') ELSE thoi_gian_hoan_thanh END,
  thoi_gian_goc_dong_ca = CASE WHEN thoi_gian_goc_dong_ca LIKE '%:%' THEN datetime(thoi_gian_goc_dong_ca, '+7 hours') ELSE thoi_gian_goc_dong_ca END,
  thoi_gian_tai_du_lieu_crm = CASE WHEN thoi_gian_tai_du_lieu_crm LIKE '%:%' THEN datetime(thoi_gian_tai_du_lieu_crm, '+7 hours') ELSE thoi_gian_tai_du_lieu_crm END
WHERE thoi_gian_cskh_tiep_nhan LIKE '%:%'
   OR thoi_gian_hen_xu_ly LIKE '%:%'
   OR thoi_gian_hoan_thanh LIKE '%:%'
   OR thoi_gian_goc_dong_ca LIKE '%:%'
   OR thoi_gian_tai_du_lieu_crm LIKE '%:%';
