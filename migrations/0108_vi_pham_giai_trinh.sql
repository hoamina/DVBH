-- Giai trinh (giai thich) cho tung vi_pham.id - buoc moi cho phep KTV tu giai trinh qua he ngoai
-- "vipham.dichvu3t.workers.dev" (chua xay dung, day la base chuan bi truoc phia DVBH) hoac Giam sat
-- nhap tay thay truc tiep trong app nay. KHONG lien quan bang "giai_trinh" (giai trinh ton/SLA cho
-- case, nghiep vu hoan toan khac) - dat ten rieng de tranh nham lan.
CREATE TABLE vi_pham_giai_trinh (
    id                  TEXT PRIMARY KEY,
    vi_pham_id          TEXT NOT NULL REFERENCES vi_pham(id),
    case_id             TEXT NOT NULL REFERENCES case_dvbh(id),
    nguon               TEXT NOT NULL CHECK (nguon IN ('ktv_qua_api', 'giam_sat_nhap_tay')),
    nguoi_giai_trinh    TEXT,
    ngay_giai_trinh     TEXT NOT NULL,
    noi_dung_giai_trinh TEXT,
    ghi_chu             TEXT,
    anh_urls            TEXT,
    nguoi_nhap          TEXT REFERENCES users(email),
    created_at          TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);
CREATE INDEX idx_vi_pham_giai_trinh_vi_pham ON vi_pham_giai_trinh (vi_pham_id);
CREATE INDEX idx_vi_pham_giai_trinh_case ON vi_pham_giai_trinh (case_id);
