-- "Ghi chú loại dịch vụ" tu Odoo (technical.service.request.implement_process_note, tab "Loại dịch vụ" tren phieu
-- Odoo, vd "Chờ máy về trạm ngày 5/11") - pipeline auto qs gui truong ghi_chu_loai_dv (2026-11-10). QuickSight de NULL.
ALTER TABLE case_dvbh ADD COLUMN ghi_chu_loai_dv TEXT;
