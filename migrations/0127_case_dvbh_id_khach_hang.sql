-- "ID khách hàng" cua ca = cot "ID khách hàng" cua QuickSight CRM (Odoo OCRM chua co cot nay).
-- Dung de noi ca MOI mo de doi may cho KH voi ca GOC (bao cao vong doi doi tra, he theodoidoimay) -
-- chot 2026-10-08: CHI noi theo ID khach hang, KHONG tra theo SDT.
-- Cot tuy chon (lib/ratchet.ts OPTIONAL_FIELDS): chi ghi khi dong import co key, file Excel tay khong xoa.
ALTER TABLE case_dvbh ADD COLUMN id_khach_hang TEXT;
CREATE INDEX idx_case_id_khach_hang ON case_dvbh (id_khach_hang) WHERE id_khach_hang IS NOT NULL;
