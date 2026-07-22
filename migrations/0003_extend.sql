-- ============================================================
-- Dot mo rong 2: bo FK linh_kien.nguoi_cap_nhat (de dong bo Google Sheet
-- voi email nguoi ngoai he thong) + bo sung 19 ly do cham thuc te
-- ============================================================

PRAGMA foreign_keys=OFF;

CREATE TABLE linh_kien_new (
    ma_linh_kien    TEXT PRIMARY KEY,
    ten_linh_kien   TEXT NOT NULL,
    gia_ban         REAL,
    anh_demo        TEXT,
    nguoi_cap_nhat  TEXT,                     -- bo REFERENCES users(email): co the la email ngoai he thong tu Google Sheet
    ngay_cap_nhat   TEXT NOT NULL DEFAULT (datetime('now')),
    bat_tat         INTEGER NOT NULL DEFAULT 1
);

INSERT INTO linh_kien_new (ma_linh_kien, ten_linh_kien, gia_ban, anh_demo, nguoi_cap_nhat, ngay_cap_nhat, bat_tat)
SELECT ma_linh_kien, ten_linh_kien, gia_ban, anh_demo, nguoi_cap_nhat, ngay_cap_nhat, bat_tat FROM linh_kien;

DROP TABLE linh_kien;
ALTER TABLE linh_kien_new RENAME TO linh_kien;

PRAGMA foreign_keys=ON;

-- Bo sung ly do cham thuc te tu khao sat hien truong (2026-07-17)
INSERT OR IGNORE INTO settings_ly_do (ten_ly_do, bat_tat, thuoc_thieu_linh_kien) VALUES
('Do KTV', 1, 0),
('Do thời tiết', 1, 0),
('Do Khách hàng', 1, 0),
('Do đối tác chưa giao máy, vật tư, linh kiện hoặc giao thiếu', 1, 0),
('Đã xong nhưng chưa đóng ca/đóng ca chậm', 1, 0),
('Do thủ tục nội bộ chậm', 1, 0),
('Chờ duyệt hủy ca', 1, 0),
('Thiếu linh kiện do công ty', 1, 1),
('Chờ sửa chữa ở phòng BH', 1, 0),
('Đang sửa máy tại nhà CTV/Trạm', 1, 0),
('Chờ xử lý đổi trả linh kiện từ phòng PBH', 1, 1),
('Thiếu linh kiện do không dự phòng', 1, 1),
('Do địa hình khó', 1, 0),
('Do điều phối', 1, 0),
('Do tiến độ công trình', 1, 0),
('Khác', 1, 0),
('Do kho gửi hàng chậm', 1, 0),
('Do đơn vị vận chuyển chậm', 1, 0),
('Do hàng đang chuyển từ 3T đến KTV', 1, 0);
