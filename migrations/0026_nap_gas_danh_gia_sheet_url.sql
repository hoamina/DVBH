-- Them 1 loai dong bo moi vao bang cau hinh dung chung settings_sheet_urls (xem 0008) - cho phep
-- Admin cau hinh link Google Sheet "publish to web" de dong bo hang loat danh gia nap gas cu (cac
-- ca da danh gia nap gas ngoai thuc te truoc khi bang nap_gas_danh_gia ra doi, xem migration 0025),
-- khop pattern giai_trinh_cu/giai_trinh_lap_cu/khao_sat_cu.
INSERT INTO settings_sheet_urls (loai_dong_bo, url) VALUES ('nap_gas_danh_gia_cu', NULL);
