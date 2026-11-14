-- "Sửa doanh thu · Xuất hóa đơn · Hạn bảo hành" (2026-11-14, yêu cầu chủ hệ thống - module sua-doanh-thu).
--
-- 1) DOANH THU CHUẨN: GS (khu vực mình) / CSKH / TN CSKH / TBP / Admin sửa lại 3 thành phần doanh thu thực tế của 1 ca (tay hoặc
--    import Excel). Giá trị sửa GHI THẲNG vào dt_san_pham/dt_linh_kien/dt_dich_vu (=> mọi báo cáo doanh thu dùng số sửa - chốt chủ hệ
--    thống "thay thế trong báo cáo"); giá trị CRM gốc giữ ở dt_*_crm. Import CRM sau đó KHÔNG ghi đè 3 cột này khi dt_sua_at IS NOT NULL,
--    chỉ cập nhật dt_*_crm (importProcessor buildFullOverwrite - cùng cơ chế khu_vuc_sua_at, migration 0133).
ALTER TABLE case_dvbh ADD COLUMN dt_san_pham_crm REAL;
ALTER TABLE case_dvbh ADD COLUMN dt_linh_kien_crm REAL;
ALTER TABLE case_dvbh ADD COLUMN dt_dich_vu_crm REAL;
ALTER TABLE case_dvbh ADD COLUMN dt_sua_at TEXT;
ALTER TABLE case_dvbh ADD COLUMN dt_sua_by TEXT;
ALTER TABLE case_dvbh ADD COLUMN dt_sua_ly_do TEXT;
-- Bảng "Ca đã sửa doanh thu": quét đúng số ca đã sửa.
CREATE INDEX IF NOT EXISTS idx_case_dt_sua ON case_dvbh (dt_sua_at) WHERE dt_sua_at IS NOT NULL;

-- 2) + 3) Đánh giá TAY "đơn xuất hóa đơn" và "còn / hết bảo hành" (NULL = theo tự động). Bảng riêng, 1 dòng / ca, chỉ ca đã được
--    đánh giá tay mới có dòng. Không FK tới case_dvbh (tránh khoá recreate-table về sau).
CREATE TABLE IF NOT EXISTS case_hd_bh (
    case_id         TEXT PRIMARY KEY,
    xuat_hoa_don    INTEGER,            -- 1 = có xuất HĐ, 0 = không, NULL = theo app linh kiện
    hd_sua_by       TEXT,
    hd_sua_at       TEXT,
    con_bao_hanh    INTEGER,            -- 1 = còn BH, 0 = hết BH, NULL = theo tính tự động (ngày mua +24T / ngày SX +36T)
    bh_sua_by       TEXT,
    bh_sua_at       TEXT,
    ghi_chu         TEXT
);
CREATE INDEX IF NOT EXISTS idx_case_hd_bh_hd ON case_hd_bh (hd_sua_at) WHERE xuat_hoa_don IS NOT NULL;

-- Đơn có yêu cầu xuất hóa đơn từ app Đặt mua linh kiện (linh-kien-app): đẩy sang khi Kế toán chốt phiếu xuất kho
-- (POST /api/partner/sync/don-hoa-don) + kéo thủ công (GET /api/partner/v1/don-hoa-don bên đó). 1 dòng / (đơn, ca khớp).
-- case_id = '' khi chưa khớp được ca nào (mã ca trên đơn không có trong DVBH, ID Lada chưa liên kết).
CREATE TABLE IF NOT EXISTS don_hoa_don_lk (
    don_id              TEXT NOT NULL,      -- dat_don_hang.id bên linh-kien-app
    case_id             TEXT NOT NULL DEFAULT '',
    ma_ca_tren_don      TEXT,               -- mã ca ghi trên đơn (dat_don_case / ma_yeu_cau_su_co), có thể nhiều, phẩy
    ma_lada             TEXT,
    pxk_id              TEXT,
    ma_misa             TEXT,
    chot_ke_toan_luc    TEXT,               -- lúc Kế toán chốt phiếu (giờ VN)
    trang_thai_pxk      TEXT,
    trang_thai_don      TEXT,
    da_huy              INTEGER NOT NULL DEFAULT 0,
    yeu_cau_hoa_don     TEXT,
    ma_lk               TEXT,
    ten_lk              TEXT,
    so_luong            REAL,
    loai_de_xuat        TEXT,
    nguoi_nhan_hang     TEXT,
    row_hash            TEXT NOT NULL,
    nguon               TEXT,               -- 'push' | 'pull'
    dong_bo_luc         TEXT NOT NULL,
    PRIMARY KEY (don_id, case_id)
);
CREATE INDEX IF NOT EXISTS idx_don_hd_lk_case ON don_hoa_don_lk (case_id);
CREATE INDEX IF NOT EXISTS idx_don_hd_lk_chot ON don_hoa_don_lk (chot_ke_toan_luc);

-- Nhật ký mọi lần sửa (tay / Excel / khôi phục). loai: 'dt' | 'hd' | 'bh'.
CREATE TABLE IF NOT EXISTS case_sua_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id     TEXT NOT NULL,
    loai        TEXT NOT NULL,
    gia_tri_cu  TEXT,
    gia_tri_moi TEXT,
    ly_do       TEXT,
    nguon       TEXT NOT NULL,      -- 'tay' | 'excel' | 'khoi_phuc'
    nguoi       TEXT NOT NULL,
    luc         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_case_sua_log_case ON case_sua_log (case_id, id);
