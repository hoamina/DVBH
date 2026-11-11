-- Menu "QL NSKX" (2026-11-11): bao cao rieng cac ca doi tac NSKX (VN).
-- 1) nskx_loi_loc: Giam sat khu vuc xac nhan loi loc THUC TE da thay cho 1 ca (de xuat tu linh_kien_loi co chu "lõi").
--    thay_loi: 1 = co thay (ds_loi = JSON [{ma_linh_kien, ten_linh_kien, so_luong}], ma bat buoc co trong bang linh_kien), 0 = khong thay.
-- 2) nskx_don_lk: ket qua dong bo thu cong tu linh-kien-app (POST /api/partner/v1/don-loi-loc) - ca da co don dat linh kien loai de xuat
--    "HỖ TRỢ NGOÀI BẢO HÀNH TG12…" con hieu luc (bo don huy/tu choi). co_don: 1 = da len don, 0 = chua len don. don = JSON cac don.
-- case_id la tham chieu mem (khong FK) giong cac bang phu khac cua case_dvbh.
CREATE TABLE IF NOT EXISTS nskx_loi_loc (
  case_id        TEXT PRIMARY KEY,
  thay_loi       INTEGER NOT NULL CHECK (thay_loi IN (0, 1)),
  ds_loi         TEXT,
  ghi_chu        TEXT,
  nguoi_xac_nhan TEXT NOT NULL,
  ngay_xac_nhan  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nskx_don_lk (
  case_id      TEXT PRIMARY KEY,
  co_don       INTEGER NOT NULL CHECK (co_don IN (0, 1)),
  don          TEXT,
  ngay_dong_bo TEXT NOT NULL
);

