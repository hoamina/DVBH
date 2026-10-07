-- Dia chi MOI sau sap nhap (chi ca Odoo OCRM co gia tri, ca QuickSight de NULL) - chot 2026-10-07:
-- tinh/quan_huyen hien co GIU NGHIA DIA CHI CU cho MOI nguon (bao cao dang tinh theo tinh/huyen cu, khong
-- doi vi tri/logic); ca Odoo khong nhap dia chi cu -> tinh/quan_huyen trong. 2 cot moi nay de san sang
-- cho cac bao cao loc theo dia gioi moi. Cot tuy chon: xem lib/ratchet.ts OPTIONAL_FIELDS.
ALTER TABLE case_dvbh ADD COLUMN tinh_moi TEXT;
ALTER TABLE case_dvbh ADD COLUMN xa_moi TEXT;
