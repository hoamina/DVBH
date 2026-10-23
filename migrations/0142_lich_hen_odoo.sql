-- "Lịch hẹn kỹ thuật" tu Odoo OCRM (model technical.service.appointment, pipeline auto qs
-- ocrm/appointment.py) - 1 phieu co the hen nhieu lan (hen lai/doi lich). Luu toan bo lich su
-- (JSON array, moi phan tu 1 lan hen: thoi_gian_hen, nguoi_hen_lich, trang_thai, ghi_chu, ngay_tao,
-- anh_bang_chung) vao 1 cot tuy chon tren case_dvbh, giong co che linh_kien_loi (migration 0122).
-- Ca QuickSight de NULL. "Thời gian hẹn xử lý" (thoi_gian_hen_xu_ly) hien co VAN la lan hen GAN NHAT,
-- khong doi - cot nay chi bo sung toan bo lich su de hien thi UI, khong thay the.
ALTER TABLE case_dvbh ADD COLUMN lich_hen TEXT;
