-- Nhat ky SUA TAY so "da giai trinh" trong so chot 17h30 (giai_trinh_daily_log*) - 2026-11-25, v1.659, chu he thong: "trực tiếp trên
-- giao diện cho phép admin click vào ngày để sửa số ca giải trình ví dụ 27/28 => sửa thành 28/28 (vì 1 số trường hợp GS xin đánh giá muộn)".
-- So chot truoc day la "lich su vinh vien, khong co duong sua tay"; nay Admin sua duoc da_giai_trinh (0..can_giai_trinh) cua 1 dong
-- (ngay, khu_vuc) trong DUNG pham vi dang xem. Moi lan sua 1 dong o day (truoc/sau, ai, luc nao, ly do) - khong xoa.
-- pham_vi = hau to bang cua pham vi (lib/phamVi.ts hauToPhamVi: '' = goc, 'vn', 'vn_nskx', 'vn_khong_nskx', 'ph'...). Bang nay KHONG nam
-- trong BANG_THEO_PHAM_VI (1 bang chung, phan biet bang cot pham_vi).
CREATE TABLE giai_trinh_daily_log_sua (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    pham_vi       TEXT NOT NULL,
    ngay          TEXT NOT NULL,
    khu_vuc       TEXT NOT NULL,
    can_giai_trinh INTEGER NOT NULL,
    da_cu         INTEGER NOT NULL,
    da_moi        INTEGER NOT NULL,
    ly_do         TEXT NOT NULL,
    nguoi_sua     TEXT NOT NULL,
    sua_luc       TEXT NOT NULL
);
CREATE INDEX idx_gt_daily_log_sua_pv_ngay ON giai_trinh_daily_log_sua (pham_vi, ngay);
