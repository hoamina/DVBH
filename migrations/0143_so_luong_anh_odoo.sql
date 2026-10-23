-- "Số lượng ảnh" tu Odoo OCRM (model technical.service.request, 5 truong one2many image_in_ids/
-- image_out_ids/image_report_ids/image_serial_ids/image_cancel_ids - pipeline auto qs
-- ocrm/image_counts.py). CHI dem SO LUONG (object JSON {ben_trong, ben_ngoai, bao_cao, tem_serial,
-- bang_chung_huy}), KHONG phai link anh: anh goc tren Odoo can dang nhap, link cong khai (redirect
-- 303 -> URL ky so) chi song ~15 phut roi het han nen khong luu lau dai duoc (xac nhan 2026-10-23).
-- Dem de nguoi dung dvbh biet nhanh case co anh gi ma khong can mo Odoo. Ca QuickSight de NULL.
ALTER TABLE case_dvbh ADD COLUMN so_luong_anh TEXT;
