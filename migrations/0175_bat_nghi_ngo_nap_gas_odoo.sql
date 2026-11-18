-- 2026-11-18: bat lai "Nghi ngờ nạp gas" cho ca Odoo VN da nhap (1 lan, thay cho viec chay lai pipeline).
-- Pipeline auto qs ep co nay = 0 cho moi ca Odoo tu 2026-10-04 -> danh sach "Danh gia nap gas" thang 11 = 0 ca.
-- Pipeline da sua (auto qs commit 06e37c5) dung chung luat CRM cho ca moi; migration nay ap DUNG luat do
-- (transform.py compute_nghi_ngo_nap_gas) len ca da co trong DB:
--   Hoàn thành XLSC VA (Lý do quá hạn = 'KTV/CTV/Trạm tự nạp gas, làm block'
--                       HOAC 'Cách thức xử lý' chua 'ga ' / ' ga' / 'nạp' / 'sạc' / 'nap' / 'sac' - PHAN BIET hoa thuong
--                       nhu FIND cua Excel, nen dung GLOB).
-- Chi ca Odoo VN (id 'SC…'), hoan thanh tu 2026-10-01, chua bi huy, dang = 0. Do truoc: 367 ca (T10 211, T11 156).
-- Co la ratchet 1 chieu (import khong ha ve 0). Bump domain nap_gas_danh_gia de 2 bao cao cache
-- (nap-gas/by-khu-vuc, notifications/count) tinh lai - khong bump "cases" (lam het han ~30 bao cao khac).
UPDATE case_dvbh
SET nghi_ngo_nap_gas = 1
WHERE id GLOB 'SC*'
  AND quoc_gia = 'VN'
  AND COALESCE(nghi_ngo_nap_gas, 0) <> 1
  AND tien_do_hoan_thanh = 'Hoàn thành XLSC'
  AND huy_bo_at IS NULL
  AND thoi_gian_hoan_thanh >= '2026-10-01'
  AND (
    TRIM(ly_do_qua_han) = 'KTV/CTV/Trạm tự nạp gas, làm block'
    OR cach_thuc_xu_ly GLOB '*ga *'
    OR cach_thuc_xu_ly GLOB '* ga*'
    OR cach_thuc_xu_ly GLOB '*nạp*'
    OR cach_thuc_xu_ly GLOB '*sạc*'
    OR cach_thuc_xu_ly GLOB '*nap*'
    OR cach_thuc_xu_ly GLOB '*sac*'
  );

INSERT INTO data_versions (domain, version, updated_at) VALUES ('nap_gas_danh_gia', 1, datetime('now'))
ON CONFLICT(domain) DO UPDATE SET version = data_versions.version + 1, updated_at = excluded.updated_at;
