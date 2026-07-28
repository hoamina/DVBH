-- 5 cot gio nhap tu Excel/Google Sheet (thoi_gian_cskh_tiep_nhan, thoi_gian_hen_xu_ly,
-- thoi_gian_hoan_thanh, thoi_gian_goc_dong_ca, thoi_gian_tai_du_lieu_crm) tu truoc den nay duoc luu
-- NGUYEN VAN gio VN dia phuong (Excel/Sheet khong co timezone that), nhung ca AGE_ANCHOR
-- (backend/src/lib/ageCalc.ts) lan fmtDateTime (frontend/src/types.ts) deu gia dinh cot nay la UTC
-- that -> hien thi va tinh tuoi ca bi cong du +7h (vd "Dong bo den" hien 14:44 trong khi thuc te ca
-- moi nhat tiep nhan luc 07:44). Tu code moi (xem ratchet.ts businessFieldValue + vnLocalToUtc),
-- gio nhap moi da duoc quy doi dung -7h truoc khi luu; migration nay backfill lai du lieu cu cho
-- khop. CHI tru gio voi gia tri co thanh phan gio that su (chua ':') - gia tri chi co ngay thuan
-- (khong gio, tu du lieu backfill cu) giu nguyen, tranh lam sai lech ngay khi khong co gio that de quy doi.
UPDATE case_dvbh SET
  thoi_gian_cskh_tiep_nhan = CASE WHEN thoi_gian_cskh_tiep_nhan LIKE '%:%' THEN datetime(thoi_gian_cskh_tiep_nhan, '-7 hours') ELSE thoi_gian_cskh_tiep_nhan END,
  thoi_gian_hen_xu_ly = CASE WHEN thoi_gian_hen_xu_ly LIKE '%:%' THEN datetime(thoi_gian_hen_xu_ly, '-7 hours') ELSE thoi_gian_hen_xu_ly END,
  thoi_gian_hoan_thanh = CASE WHEN thoi_gian_hoan_thanh LIKE '%:%' THEN datetime(thoi_gian_hoan_thanh, '-7 hours') ELSE thoi_gian_hoan_thanh END,
  thoi_gian_goc_dong_ca = CASE WHEN thoi_gian_goc_dong_ca LIKE '%:%' THEN datetime(thoi_gian_goc_dong_ca, '-7 hours') ELSE thoi_gian_goc_dong_ca END,
  thoi_gian_tai_du_lieu_crm = CASE WHEN thoi_gian_tai_du_lieu_crm LIKE '%:%' THEN datetime(thoi_gian_tai_du_lieu_crm, '-7 hours') ELSE thoi_gian_tai_du_lieu_crm END
WHERE thoi_gian_cskh_tiep_nhan LIKE '%:%'
   OR thoi_gian_hen_xu_ly LIKE '%:%'
   OR thoi_gian_hoan_thanh LIKE '%:%'
   OR thoi_gian_goc_dong_ca LIKE '%:%'
   OR thoi_gian_tai_du_lieu_crm LIKE '%:%';
