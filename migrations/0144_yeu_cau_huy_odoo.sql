-- "Yêu cầu hủy" tu Odoo OCRM (model technical.service.request, cac truong cancel_* - pipeline auto qs
-- ocrm/transform_odoo.py cancel_request_value()). Odoo CHI luu 1 trang thai xin huy HIEN TAI (xin lai
-- thi ghi de, khong co lich su nhieu lan nhu lich_hen) - van luu dang mang JSON 1 phan tu (object:
-- dang_cho_duyet, nguoi_xin_huy, thoi_diem_xin_huy, ly_do_xin_huy, ghi_chu_xin_huy - phia KTV/CTV de
-- nghi; ly_do_quyet_dinh_cskh, ghi_chu_quyet_dinh_cskh, ghi_chu_ktv_xin_huy, ly_do_huy_cuoi,
-- ghi_chu_huy_cuoi - phia CSKH quyet dinh) de dong nhat cach luu/hien thi voi lich_hen. Ca QuickSight
-- de NULL.
ALTER TABLE case_dvbh ADD COLUMN yeu_cau_huy TEXT;
