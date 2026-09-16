-- Migration 0113: Cho phep tao vi_pham KHONG qua cuoc goi CSKH - 2 nguon moi (yeu cau chu he thong
-- 2026-09-16): (a) tao thu cong ngay trong tab "Vi pham" cua CaseDetail.tsx, moi vai tro tru Viewer;
-- (b) dong bo tu dong hang ngay 03:00 gio VN tu 1 Google Sheet QC tu quan ly ben ngoai he thong (xem
-- lib/viPhamSheetSync.ts). Ca 2 nguon nay deu vao "cho QC" nhu binh thuong (khong tu chot), giong
-- luong CSKH ghi nhan hien co.
--
-- 1. ket_qua_goi_id: NOT NULL -> NULLABLE. Ca 2 nguon tren KHONG co 1 cuoc goi CSKH that dung sau -
--    neu giu NOT NULL se phai tao 1 dong ket_qua_goi "gia" cho moi dong, lam sai lech so lieu
--    "Da goi/Chua goi" o Phau xu ly vi pham (computeViPhamFunnel doc bang ket_qua_goi de tinh
--    khongCanGoi/daGoi) - KHONG chap nhan duoc, chon nullable thay vi gia lap cuoc goi.
-- 2. loai_loi = 'Khac' (da co san trong CHECK tu migration 0005, chua tung dung o dau) - danh rieng
--    cho 2 nguon nay, KHAC 4 gia tri con lai (dan xuat tu 4 co SLA tu dong tren case_dvbh, khong ap
--    dung o day vi khong co "cuoc goi" dung du dieu kien nhu luong CSKH).
-- 3. UNIQUE(case_id, loai_loi) -> UNIQUE(case_id, loai_loi, ket_qua_cap_1): voi loai_loi='Khac' dung
--    CHUNG cho moi vi pham thu cong/dong bo Sheet cua 1 ca, UNIQUE cu se chan 1 ca co 2 vi pham
--    "Khac" khac nhau (vd 1 loi bao cao + 1 loi khong lap bien ban, thuc te co that trong du lieu
--    Sheet mau) - mo rong them ket_qua_cap_1 vao khoa UNIQUE de cho phep nhieu dong "Khac" khac nhau
--    tren cung 1 ca, dong thoi VAN la khoa idempotency tu nhien cho dong bo Sheet hang ngay (ON
--    CONFLICT DO NOTHING, tranh tao trung khi sheet tra ve lai dung 1 dong da dong bo truoc do).
-- 4. Them cot "ghi_chu" - vi_pham truoc day KHONG co cot ghi chu rieng (chi ket_qua_goi.ghi_chu tu
--    cuoc goi, ap dung CHUNG cho ca cuoc goi, khong tach duoc theo tung vi_pham) - CAN cho ca 2
--    nguon moi vi hop dong PARTNER_API_GUIDE.md muc 9.1.1 bat buoc co ghi_chu khi bao "nghi_ngo_moi"
--    sang app vipham voi ket_qua_cap_1 = "Loi khac" (rat thuong gap o Sheet mau: 9/49 dong la
--    "Loi khac").
--
-- vi_pham co 1 bang con dang REFERENCES no (vi_pham_giai_trinh.vi_pham_id, migration 0108) nen KHONG
-- the DROP TABLE vi_pham truc tiep (xem CLAUDE.md "D1 khong tat duoc FK giua migration") - phai sao
-- luu + drop vi_pham_giai_trinh truoc, recreate vi_pham, roi recreate + phuc hoi lai vi_pham_giai_trinh
-- y het schema goc (migration 0108) - cung ky thuat da dung o migration 0112.
PRAGMA foreign_keys=OFF;

CREATE TABLE vi_pham_giai_trinh_backup AS SELECT * FROM vi_pham_giai_trinh;
DROP TABLE vi_pham_giai_trinh;

CREATE TABLE vi_pham_new (
    id                  TEXT PRIMARY KEY,
    ket_qua_goi_id       TEXT REFERENCES ket_qua_goi(id),
    case_id              TEXT NOT NULL REFERENCES case_dvbh(id),
    loai_loi             TEXT NOT NULL CHECK (loai_loi IN (
                            'Loi 120 phut', 'Hen qua 24h',
                            'Loi lo ke hoach', 'KH hen lai', 'Khac'
                        )),
    ket_qua_cap_1         TEXT,
    ghi_chu               TEXT,
    nguoi_ghi_nhan        TEXT NOT NULL REFERENCES users(email),
    ngay_ghi_nhan          TEXT NOT NULL DEFAULT (datetime('now')),
    chot_bo_cap_2          INTEGER,
    nguoi_chot             TEXT REFERENCES users(email),
    ngay_chot               TEXT,

    CONSTRAINT chk_cap2_sau_cap1 CHECK (
        chot_bo_cap_2 IS NULL OR ket_qua_cap_1 IS NOT NULL
    ),
    UNIQUE (case_id, loai_loi, ket_qua_cap_1)
);

INSERT INTO vi_pham_new (id, ket_qua_goi_id, case_id, loai_loi, ket_qua_cap_1, nguoi_ghi_nhan, ngay_ghi_nhan, chot_bo_cap_2, nguoi_chot, ngay_chot)
SELECT id, ket_qua_goi_id, case_id, loai_loi, ket_qua_cap_1, nguoi_ghi_nhan, ngay_ghi_nhan, chot_bo_cap_2, nguoi_chot, ngay_chot FROM vi_pham;

DROP TABLE vi_pham;
ALTER TABLE vi_pham_new RENAME TO vi_pham;

CREATE INDEX idx_vi_pham_case ON vi_pham (case_id);
CREATE INDEX idx_vi_pham_ket_qua_goi ON vi_pham (ket_qua_goi_id);
CREATE INDEX idx_vi_pham_cho_qc ON vi_pham (id) WHERE chot_bo_cap_2 IS NULL AND ket_qua_cap_1 IS NOT NULL;

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

INSERT INTO vi_pham_giai_trinh SELECT * FROM vi_pham_giai_trinh_backup;
DROP TABLE vi_pham_giai_trinh_backup;

PRAGMA foreign_keys=ON;

-- Nguon dong bo Google Sheet (moi loai_dong_bo = 'vi_pham_ngoai') - dung CHUNG bang settings_sheet_urls
-- voi 4 sheet cu (giai_trinh/giai_trinh_lap/khao_sat/nap_gas_danh_gia, xem lib/backfillSheetSync.ts),
-- tranh tao them 1 bang cau hinh rieng. URL luu dang "pub?...&output=tsv" (KHONG phai "pubhtml" -
-- pubhtml tra ve trang JS rong, khong doc duoc qua fetch() don gian - da xac minh thuc te khi kiem
-- tra link chu he thong cung cap 2026-09-16).
INSERT INTO settings_sheet_urls (loai_dong_bo, url) VALUES
    ('vi_pham_ngoai', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTiJdEzR_K77EgQd2FZ8B6zhI_CQ4W79LlOQ2aaeTPlPrgw2Iei_9iBfP0Qj7n8yz83c2LNj6bYsDir/pub?gid=929838039&single=true&output=tsv');
