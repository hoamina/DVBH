-- ============================================================
-- SCHEMA POSTGRESQL - HE THONG QUAN LY GIAI TRINH TON DVBH
-- ============================================================

-- ============================================================
-- BANG: users
-- ============================================================
CREATE TABLE users (
    email               TEXT PRIMARY KEY,
    ten                 TEXT,
    vai_tro             TEXT NOT NULL CHECK (vai_tro IN (
                            'Admin', 'Viewer', 'QC', 'Giam sat',
                            'TBP DVBH', 'CSKH', 'TN CSKH', 'TBP CSKH'
                        )),
    khu_vuc_phu_trach   TEXT[],
    trang_thai_duyet    TEXT NOT NULL DEFAULT 'Cho duyet' CHECK (trang_thai_duyet IN (
                            'Cho duyet', 'Da duyet', 'Tu choi'
                        )),
    created_at          TIMESTAMP NOT NULL DEFAULT now(),
    updated_at          TIMESTAMP NOT NULL DEFAULT now()
);

-- ============================================================
-- BANG: settings_ly_do
-- ============================================================
CREATE TABLE settings_ly_do (
    id                      SERIAL PRIMARY KEY,
    ten_ly_do               TEXT NOT NULL UNIQUE,
    bat_tat                 BOOLEAN NOT NULL DEFAULT true,
    thuoc_thieu_linh_kien   BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMP NOT NULL DEFAULT now(),
    updated_at              TIMESTAMP NOT NULL DEFAULT now()
);

-- ============================================================
-- BANG: linh_kien (danh muc linh kien dung khi giai trinh)
-- ============================================================
CREATE TABLE linh_kien (
    ma_linh_kien    TEXT PRIMARY KEY,
    ten_linh_kien   TEXT NOT NULL,
    gia_ban         NUMERIC,
    anh_demo        TEXT,
    nguoi_cap_nhat  TEXT REFERENCES users(email),
    ngay_cap_nhat   TIMESTAMP NOT NULL DEFAULT now(),
    bat_tat         BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================
-- BANG: case_dvbh (bang trung tam)
-- ============================================================
CREATE TABLE case_dvbh (
    id                          BIGINT PRIMARY KEY,

    -- Thong tin nghiep vu tu CRM
    khach_hang                  TEXT,
    link_crm                    TEXT,
    seri_san_pham               TEXT,
    cach_thuc_xu_ly             TEXT,
    tinh                        TEXT,
    quan_huyen                  TEXT,
    thoi_gian_cskh_tiep_nhan    TIMESTAMP,
    mo_ta_loi                   TEXT,
    thoi_gian_hen_xu_ly         TIMESTAMP,
    nhom_yeu_cau                TEXT,
    loai_yeu_cau                TEXT,
    hang                        TEXT,
    san_pham_bao_hanh           TEXT,
    hinh_thuc_bao_hanh          TEXT,
    ky_thuat_vien               TEXT,
    tien_do_hoan_thanh          TEXT,
    thoi_gian_hoan_thanh        TIMESTAMP,
    luu_y_loi_linh_kien         TEXT,
    ly_do_huy                   TEXT,
    noi_dung_xu_ly               TEXT,
    ly_do_qua_han                TEXT,
    dt_san_pham                 NUMERIC,
    dt_linh_kien                NUMERIC,
    dt_dich_vu                  NUMERIC,
    khu_vuc                     TEXT,
    thoi_gian_goc_dong_ca       TIMESTAMP,
    so_phut_xu_ly                NUMERIC,
    dung_han                    TEXT,
    xu_ly_24h_bucket             TEXT,
    doi_tac                     TEXT,
    ngay_mua                    DATE,
    nhom_kh                     TEXT,
    nganh                       TEXT,
    loai_nganh                  TEXT,
    nhom_san_pham                TEXT,
    thoi_gian_tai_du_lieu_crm    TIMESTAMP,

    -- Co nghi ngo vi pham (tra ve san tu CRM, ap dung ratchet 1 chieu)
    loi_120p                    BOOLEAN NOT NULL DEFAULT false,
    loi_qua_han_24h              BOOLEAN NOT NULL DEFAULT false,
    loi_lo_ke_hoach              BOOLEAN NOT NULL DEFAULT false,
    loi_kh_hen_lai                BOOLEAN NOT NULL DEFAULT false,

    -- Truong he thong
    ngay_import                  TIMESTAMP NOT NULL DEFAULT now(),
    ngay_cap_nhat_gan_nhat        TIMESTAMP NOT NULL DEFAULT now(),
    created_at                   TIMESTAMP NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMP NOT NULL DEFAULT now()
);

-- Index phuc vu tra cuu / bao cao / khao sat
CREATE INDEX idx_case_seri ON case_dvbh (seri_san_pham);
CREATE INDEX idx_case_ton ON case_dvbh (thoi_gian_hoan_thanh) WHERE thoi_gian_hoan_thanh IS NULL;
CREATE INDEX idx_case_khu_vuc ON case_dvbh (khu_vuc);
CREATE INDEX idx_case_loi_120p ON case_dvbh (id) WHERE loi_120p = true;
CREATE INDEX idx_case_loi_qua_han_24h ON case_dvbh (id) WHERE loi_qua_han_24h = true;
CREATE INDEX idx_case_loi_lo_ke_hoach ON case_dvbh (id) WHERE loi_lo_ke_hoach = true;
CREATE INDEX idx_case_loi_kh_hen_lai ON case_dvbh (id) WHERE loi_kh_hen_lai = true;

-- ============================================================
-- BANG: giai_trinh
-- ============================================================
CREATE TABLE giai_trinh (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id                     BIGINT NOT NULL REFERENCES case_dvbh(id),
    ly_do_cham                  TEXT NOT NULL REFERENCES settings_ly_do(ten_ly_do),
    noi_dung                    TEXT,
    linh_kien_thieu              TEXT REFERENCES linh_kien(ma_linh_kien),
    ngay_du_kien_hoan_thanh       DATE,
    ngay_yeu_cau_co_hang          DATE,
    ma_xuat_hang_lien_quan         TEXT,
    nguoi_giai_trinh              TEXT NOT NULL REFERENCES users(email),
    ngay_giai_trinh               TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_giai_trinh_case ON giai_trinh (case_id);
CREATE INDEX idx_giai_trinh_ngay ON giai_trinh (ngay_giai_trinh);

-- ============================================================
-- BANG: ket_qua_goi
-- ============================================================
CREATE TABLE ket_qua_goi (
    id                     TEXT PRIMARY KEY,       -- vd: CG-000001
    case_id                BIGINT NOT NULL REFERENCES case_dvbh(id),
    loai_khao_sat          TEXT[] NOT NULL,         -- vd: {'Loi 120 phut','Hen qua 24h'}
    doi_tuong_lien_he       TEXT,
    ket_qua_cuoc_goi        TEXT,
    dien_giai               TEXT,
    ghi_chu                 TEXT,
    ly_do_that_bai           TEXT,
    can_goi_lai              BOOLEAN,
    nguoi_thuc_hien          TEXT NOT NULL REFERENCES users(email),
    ngay_gio_thuc_hien       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_ket_qua_goi_case ON ket_qua_goi (case_id);

-- ============================================================
-- BANG: vi_pham
-- ============================================================
CREATE TABLE vi_pham (
    id                  TEXT PRIMARY KEY,          -- vd: L-000001
    ket_qua_goi_id       TEXT NOT NULL REFERENCES ket_qua_goi(id),
    case_id              BIGINT NOT NULL REFERENCES case_dvbh(id),  -- denormalize
    loai_loi             TEXT NOT NULL CHECK (loai_loi IN (
                            'Loi 120 phut', 'Hen qua 24h',
                            'Loi lo ke hoach', 'KH hen lai', 'Khac'
                        )),
    ket_qua_cap_1         TEXT CHECK (ket_qua_cap_1 IN (
                            'Khong loi', 'Loi khong lien he',
                            'Loi sai bao cao', 'Loi khac'
                        )),
    nguoi_ghi_nhan        TEXT NOT NULL REFERENCES users(email),
    ngay_ghi_nhan          TIMESTAMP NOT NULL DEFAULT now(),
    chot_bo_cap_2          BOOLEAN,                  -- NULL = chua QC xet
    nguoi_chot             TEXT REFERENCES users(email),
    ngay_chot               TIMESTAMP,

    CONSTRAINT chk_cap2_sau_cap1 CHECK (
        chot_bo_cap_2 IS NULL OR ket_qua_cap_1 IS NOT NULL
    )
);

CREATE INDEX idx_vi_pham_case ON vi_pham (case_id);
CREATE INDEX idx_vi_pham_ket_qua_goi ON vi_pham (ket_qua_goi_id);
CREATE INDEX idx_vi_pham_cho_qc ON vi_pham (id) WHERE chot_bo_cap_2 IS NULL AND ket_qua_cap_1 IS NOT NULL;
