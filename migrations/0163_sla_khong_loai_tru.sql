-- SLA KHONG loai tru (pipeline auto qs, 2026-11-11): gio tu thoi diem tiep nhan den luc hoan thanh, KHONG bo ngoai le
-- "KH hen lai lich" (ca chua xong = tam tinh toi 0h ngay chay) + Dung han/Qua han tuong ung (QuickSight: SLA_MATRIX;
-- Odoo: so voi "SLA (gio)" cua Odoo, khong co SLA thi SLA_MATRIX). Pipeline gui so_gio_xu_ly_klt / dung_han_klt khi bat
-- SEND_SLA_KHONG_LOAI_TRU. Cot dung_han / so_gio_xu_ly (co loai tru) giu nguyen.
ALTER TABLE case_dvbh ADD COLUMN so_gio_xu_ly_klt REAL;
ALTER TABLE case_dvbh ADD COLUMN dung_han_klt TEXT;
