-- Nhom linh kien thay the / tuong duong keo tu linh-kien-app GET /api/partner/v1/lk-thay-the (2026-11-12, lib/lkThayThe.ts).
-- "Ho so linh kien" > tab "Linh kiện tương đương". Chi giu 1 phien ban: phien_ban doi -> xoa + ghi lai toan bo (vai tram dong).
-- Trang thai dong bo luu o cai_dat_he_thong khoa 'lk_thay_the_dong_bo'.
CREATE TABLE IF NOT EXISTS lk_thay_the (
  nhom_id           INTEGER NOT NULL,
  ten_nhom          TEXT,
  ghi_chu_nhom      TEXT,
  ma_lk             TEXT NOT NULL,
  ten_lk            TEXT,
  bat_tat           INTEGER,          -- trang thai bat/tat trong danh muc linh-kien-app (NULL = khong co trong danh muc)
  co_trong_danh_muc INTEGER NOT NULL DEFAULT 1,
  ghi_chu           TEXT,
  stt               INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (nhom_id, ma_lk)
);
CREATE INDEX IF NOT EXISTS idx_lk_thay_the_ma ON lk_thay_the(ma_lk);
