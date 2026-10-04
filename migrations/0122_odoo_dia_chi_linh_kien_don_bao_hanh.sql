-- Nguon Odoo OCRM (ocrm.happinno.com) - pipeline auto qs (ocrm/) day qua external-import.
-- 1) 4 cot tuy chon tren case_dvbh, CHI ca Odoo co gia tri (ca QuickSight de NULL):
--    dia chi CU truoc sap nhap (tinh/quan_huyen hien co = Tinh MOI / Xa MOI) va danh sach
--    linh kien loi (JSON array, 1 phan tu/linh kien - xem lib/ratchet.ts OPTIONAL_FIELDS).
ALTER TABLE case_dvbh ADD COLUMN tinh_cu TEXT;
ALTER TABLE case_dvbh ADD COLUMN huyen_cu TEXT;
ALTER TABLE case_dvbh ADD COLUMN xa_cu TEXT;
ALTER TABLE case_dvbh ADD COLUMN linh_kien_loi TEXT;

-- 2) Danh sach don bao hanh tu Odoo (model technical.service.warranty) - 1 dong/don, khoa = id Odoo.
--    case_id = ma su vu (= case_dvbh.id), KHONG FK: don co the dong bo truoc khi ca ve dvbh.
--    Linh kien bao loi <-> don bao hanh noi theo (case_id, ma_linh_kien).
CREATE TABLE IF NOT EXISTS don_bao_hanh_odoo (
  odoo_id INTEGER PRIMARY KEY,
  ma_don TEXT,
  case_id TEXT,
  ma_linh_kien TEXT,
  ten_linh_kien TEXT,
  so_luong REAL,
  don_gia REAL,
  thanh_tien REAL,
  trang_thai TEXT,            -- new/repairing/repaired/done/cancelled/rejected (nhan: frontend)
  tinh_trang_loi TEXT,
  ghi_chu TEXT,
  ngay_tao TEXT,              -- gio VN
  ngay_hoan_thanh TEXT,       -- gio VN
  nguoi_tao TEXT,
  ngay_cap_nhat_odoo TEXT,    -- gio VN, dung de bo qua dong khong doi
  con_hieu_luc INTEGER NOT NULL DEFAULT 1, -- 0 = da luu tru (active=False) tren Odoo
  ngay_dong_bo TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_don_bao_hanh_odoo_case ON don_bao_hanh_odoo(case_id);
