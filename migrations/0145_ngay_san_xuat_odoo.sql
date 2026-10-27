-- "Ngày sản xuất" tu Odoo OCRM (technical.service.request.manufacturing_date, co san trong mau export
-- THAI V4) - pipeline auto qs gui dang YYYY-MM-DD (2026-10-27). Ca QuickSight de NULL.
ALTER TABLE case_dvbh ADD COLUMN ngay_san_xuat TEXT;
