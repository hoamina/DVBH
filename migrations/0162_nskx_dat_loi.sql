-- QL NSKX - DAT LOI LOC truc tiep sang linh-kien-app (2026-11-11, v1.571; API POST /api/partner/v1/dat-hang cua linh-kien-app v1.471).
-- Chu he thong chot: nguoi dat = tai khoan nguoi bam (gui email_nguoi_dat), moi GS khu vuc dat duoc, nguoi nhan = KTV trien khai (khong co
-- thi Tram trien khai = ky_thuat_vien), CHI dat loi (day / cut dat ngoai), loai de xuat "HỖ TRỢ NGOÀI BẢO HÀNH TG12-NSKX".

-- Khoa tam theo ca trong luc dang dat (2 nguoi bam cung luc khong dat trung). Dong cu hon 5 phut coi nhu het han (lib/nskxDatLoi.ts).
CREATE TABLE IF NOT EXISTS nskx_dat_loi_khoa (
  case_id TEXT PRIMARY KEY,
  nguoi   TEXT NOT NULL,
  luc     TEXT NOT NULL
);

-- Nhat ky moi lan goi dat (1 dong / 1 phieu gui sang linh-kien-app): truy lai ai dat, phieu nao, nhung ca nao, ket qua.
-- ma_yeu_cau = ma chong trung gui linh-kien-app (gui lai cung ma -> tra phieu cu). case_id tham chieu mem (JSON ds_ca).
CREATE TABLE IF NOT EXISTS nskx_dat_loi_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ma_yeu_cau  TEXT NOT NULL,
  phieu_id    TEXT,
  nguoi_dat   TEXT NOT NULL,
  ma_ktv      TEXT NOT NULL,
  ds_ca       TEXT NOT NULL,
  so_dong     INTEGER NOT NULL,
  ket_qua     TEXT,
  loi         TEXT,
  ngay        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nskx_dat_loi_log_ngay ON nskx_dat_loi_log(ngay);
