-- He "Sua chua bao hanh" (suachua.dichvu3t.workers.dev) keo don bao hanh Odoo ve (GET
-- /api/partner/don-bao-hanh-odoo, con tro tang dan theo (ngay_dong_bo, odoo_id)) va DAY NGUOC trang
-- thai gui sua ve day (POST /api/partner/sync/sua-chua-trang-thai). Trang thai gui sua luu o CAC COT
-- RIENG sc_*, KHONG ghi de trang_thai cua Odoo (chot 04/10/2026) - va KHONG doi ngay_dong_bo (neu doi
-- se lam suachua keo lai chinh dong nay vo han).
ALTER TABLE don_bao_hanh_odoo ADD COLUMN sc_trang_thai TEXT;  -- cho_gui/dang_gui/kho_da_nhan/dang_xu_ly/cho_tra/dang_tra/hoan_tat/tu_choi (NULL = chua dua vao thung)
ALTER TABLE don_bao_hanh_odoo ADD COLUMN sc_ma_phieu TEXT;    -- ma don cha ben suachua (DH-xxxxxx) + phieu gui (BH-xxxxxx)
ALTER TABLE don_bao_hanh_odoo ADD COLUMN sc_chi_tiet TEXT;    -- mo ta ngan, vd "2/3 hoan tat"
ALTER TABLE don_bao_hanh_odoo ADD COLUMN sc_cap_nhat TEXT;    -- thoi diem thay doi ben suachua (gio VN) - bo qua ban tin cu den muon
ALTER TABLE don_bao_hanh_odoo ADD COLUMN sc_ngay_nhan TEXT;   -- thoi diem dvbh nhan (gio VN)
CREATE INDEX IF NOT EXISTS idx_don_bao_hanh_odoo_dong_bo ON don_bao_hanh_odoo(ngay_dong_bo, odoo_id);
