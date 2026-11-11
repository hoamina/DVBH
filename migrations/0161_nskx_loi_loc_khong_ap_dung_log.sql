-- QL NSKX (2026-11-11, lan 2): xac nhan loi loc them lua chon "Khong ap dung" (thay_loi = 2) + lich su xac nhan.
-- nskx_loi_loc khong bi bang nao tham chieu FK -> recreate an toan (doi CHECK).
CREATE TABLE nskx_loi_loc_new (
  case_id        TEXT PRIMARY KEY,
  thay_loi       INTEGER NOT NULL CHECK (thay_loi IN (0, 1, 2)),
  ds_loi         TEXT,
  ghi_chu        TEXT,
  nguoi_xac_nhan TEXT NOT NULL,
  ngay_xac_nhan  TEXT NOT NULL
);
INSERT INTO nskx_loi_loc_new (case_id, thay_loi, ds_loi, ghi_chu, nguoi_xac_nhan, ngay_xac_nhan)
  SELECT case_id, thay_loi, ds_loi, ghi_chu, nguoi_xac_nhan, ngay_xac_nhan FROM nskx_loi_loc;
DROP TABLE nskx_loi_loc;
ALTER TABLE nskx_loi_loc_new RENAME TO nskx_loi_loc;

-- Moi lan luu xac nhan ghi 1 dong (khong sua/xoa) - hien o tab "NSKX" chi tiet ca.
CREATE TABLE IF NOT EXISTS nskx_loi_loc_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id        TEXT NOT NULL,
  thay_loi       INTEGER NOT NULL,
  ds_loi         TEXT,
  ghi_chu        TEXT,
  nguoi_xac_nhan TEXT NOT NULL,
  ngay_xac_nhan  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nskx_loi_loc_log_case ON nskx_loi_loc_log (case_id);
INSERT INTO nskx_loi_loc_log (case_id, thay_loi, ds_loi, ghi_chu, nguoi_xac_nhan, ngay_xac_nhan)
  SELECT case_id, thay_loi, ds_loi, ghi_chu, nguoi_xac_nhan, ngay_xac_nhan FROM nskx_loi_loc;
