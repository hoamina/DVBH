-- 2026-11-18 (Quản lý tồn > Danh sách chi tiết): tóm tắt gửi bảo hành THEO CA từ app suachua (repo gui-bao-hanh-linh-kien,
-- lib/tomTatCa.ts). suachua đẩy kèm field "ca" trong POST /api/partner/sync/sua-chua-trang-thai sẵn có (cron 15 phút, chỉ ca có thay đổi).
-- Bảng dùng chung cho mọi màn cần số liệu gửi BH theo ca. 1 dòng / ca có đơn còn hiệu lực (bỏ đơn huỷ / từ chối); không FK.
CREATE TABLE IF NOT EXISTS gui_bh_ca (
  case_id        TEXT PRIMARY KEY,
  so_lk          INTEGER NOT NULL,   -- số LK thực tế đã gửi (đơn chưa tách đơn vị = số lượng KTV khai)
  gd_json        TEXT NOT NULL,      -- {"<mã giai đoạn>": số LK} - frontend đổi nhãn + diễn giải
  gd_thap_nhat   TEXT NOT NULL,      -- giai đoạn thấp nhất (trạng thái đổi trả BH của ca)
  ngay_gui_cuoi  TEXT,               -- lần KTV bấm gửi xe muộn nhất (giờ VN)
  hoan_tat       INTEGER NOT NULL DEFAULT 0, -- 1 = mọi LK đã kết thúc đổi trả
  xu_ly_max_ngay REAL,               -- khi hoan_tat: thời gian xử lý lâu nhất (ngày, gửi xe -> kết thúc)
  cap_nhat_nguon TEXT NOT NULL,      -- thời điểm suachua tính (bỏ bản tin cũ đến muộn)
  nhan_luc       TEXT NOT NULL
);
