-- "ID đặt hàng gần nhất" cua ca dang ton thieu linh kien (2026-11-12, Quan ly ton > Danh sach chi tiet) - xem lib/donLkGanNhat.ts.
-- 1 dong / ca, keo tu linh-kien-app POST /api/partner/v1/don-gan-nhat-theo-ca. Thong tin co dinh (ID don, ngay dat) + ghi 1 lan
-- (ngay duyet, ngay xuat, KTV nhan) + thay doi lien tuc (trang thai). Chi ghi khi co cot doi. Khong FK sang case_dvbh (giu
-- duong recreate-table cua case_dvbh). Gio = gio VN "YYYY-MM-DD HH:MM:SS".
CREATE TABLE IF NOT EXISTS don_lk_gan_nhat (
  case_id        TEXT PRIMARY KEY,
  ma_lk_thieu    TEXT,             -- ma LK thieu cua giai trinh gan nhat luc dong bo
  don_id         TEXT,             -- dat_don_hang.id (DDH-xxxxxx); NULL = ca chua co don nao
  nguon          TEXT,             -- lien_ket (don ghi ma ca) | lada (khop ID Lada) | giai_trinh (ma ghi trong giai trinh)
  khop_ma_lk     INTEGER NOT NULL DEFAULT 0, -- don dung ma LK thieu (ke ca ma thay the)
  ma_lk_don      TEXT,
  ten_lk         TEXT,
  loai_de_xuat   TEXT,
  trang_thai     TEXT,             -- nhan hien thi (tieng Viet)
  trang_thai_don TEXT,             -- ma trang thai don ben linh-kien-app
  trang_thai_pxk TEXT,             -- ma trang thai phieu xuat kho cua don
  ngay_dat       TEXT,
  ngay_duyet     TEXT,
  ngay_xuat      TEXT,
  ngay_ktv_nhan  TEXT,
  so_don         INTEGER NOT NULL DEFAULT 0,
  ket_thuc       INTEGER NOT NULL DEFAULT 0, -- KTV da nhan / tru kho / kho ket thuc -> chi kiem lai 1 lan/ngay
  cap_nhat_luc   TEXT NOT NULL     -- lan cuoi dong nay THAY DOI
);
