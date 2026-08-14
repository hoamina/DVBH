-- Migration 0060: Gộp lk_danh_muc vào linh_kien - toàn hệ thống dùng chung 1 bảng "Danh mục linh kiện"
-- Lý do: Ban đầu tách riêng vì linh_kien thiếu gia_tham_chieu/don_vi/ghi_chu (migration 0054),
-- nhưng user yêu cầu gộp lại thành 1 bảng chung cho cả giải trình thiếu LK và module đặt mua.

-- Bước 1: Thêm 3 cột mới vào linh_kien (giữ nguyên các cột cũ, không đổi tên gia_ban)
ALTER TABLE linh_kien ADD COLUMN gia_tham_chieu REAL;
ALTER TABLE linh_kien ADD COLUMN don_vi TEXT;
ALTER TABLE linh_kien ADD COLUMN ghi_chu TEXT;

-- Bước 2: Migrate dữ liệu từ lk_danh_muc sang linh_kien
-- Chỉ insert các mã chưa tồn tại trong linh_kien (tránh conflict PK)
INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, gia_tham_chieu, don_vi, ghi_chu, bat_tat, nguoi_cap_nhat, ngay_cap_nhat)
SELECT
    ma_lk,
    ten_lk,
    gia_tham_chieu,
    don_vi,
    ghi_chu,
    bat_tat,
    nguoi_cap_nhat,
    ngay_cap_nhat
FROM lk_danh_muc
WHERE ma_lk NOT IN (SELECT ma_linh_kien FROM linh_kien);

-- Bước 3: Với các mã trùng (đã có trong linh_kien), cập nhật thêm thông tin từ lk_danh_muc
UPDATE linh_kien SET
    gia_tham_chieu = (SELECT gia_tham_chieu FROM lk_danh_muc WHERE ma_lk = linh_kien.ma_linh_kien),
    don_vi = (SELECT don_vi FROM lk_danh_muc WHERE ma_lk = linh_kien.ma_linh_kien),
    ghi_chu = (SELECT ghi_chu FROM lk_danh_muc WHERE ma_lk = linh_kien.ma_linh_kien)
WHERE ma_linh_kien IN (SELECT ma_lk FROM lk_danh_muc);

-- Bước 4: Xóa bảng lk_danh_muc (không còn dùng nữa)
DROP TABLE lk_danh_muc;
