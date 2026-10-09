-- ID import cua don bao hanh Odoo (External ID, vd "__export__.technical_service_warranty_1474_44be8b5d")
-- = cot "ID" khi xuat "tuong thich nhap" tren Odoo. Pipeline auto qs lay qua export_data(['id']) va gui
-- kem; dvbh chuyen tiep cho he "Sua chua bao hanh" (GET /api/partner/don-bao-hanh-odoo) de he do xuat
-- file ket qua (ID, Trang thai, Ngay hoan thanh, Ghi chu) import nguoc lai Odoo (chot 09/10/2026).
ALTER TABLE don_bao_hanh_odoo ADD COLUMN ma_import_odoo TEXT;
