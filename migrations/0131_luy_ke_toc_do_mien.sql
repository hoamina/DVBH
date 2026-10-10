-- "Tốc độ xử lý theo tháng của DVBH theo miền" (tab moi trong Bao cao luy ke, yeu cau chu he thong
-- 2026-10-10). Cac cot so ca / dung han / duoi 24h tinh o client tu chunk luy ke (luy_ke R2) - bang nay
-- CHI chua 2 nhom so lieu chunk luy ke KHONG co:
--   1. RTAT (tong thoi gian xu ly) theo mien - can so gio tung ca, chunk chi co bucket toc do.
--   2. Toc do SLA / duoi 24h "cuoi tuan" = ca CSKH tiep nhan vao Thu 7 / Chu nhat.
-- 1 dong / thang. nguon = 'auto': cron 08:00 VN tu tinh tu case_dvbh (tu thang 2026-10, xem
-- lib/luyKeCompute.ts TOC_DO_MIEN_AUTO_TU_THANG); nguon = 'tay': Admin/TBP DVBH nhap so chot cho cac
-- thang truoc do (PUT /api/luy-ke/toc-do-mien/:thang).
CREATE TABLE luy_ke_toc_do_mien (
    thang              TEXT PRIMARY KEY,           -- 'YYYY-MM'
    rtat_mb_ngay       REAL,                       -- tong RTAT Mien Bac (ngay)
    rtat_mn_ngay       REAL,                       -- tong RTAT Mien Nam (ngay)
    so_ca_gio_mb       INTEGER,                    -- auto: so ca co so_gio_xu_ly (mau so TB RTAT); tay: NULL
    so_ca_gio_mn       INTEGER,
    cuoi_tuan_sla      REAL,                       -- ty le 0..1
    cuoi_tuan_24h      REAL,                       -- ty le 0..1
    cuoi_tuan_so_ca    INTEGER,                    -- auto: so ca CSKH tiep nhan T7/CN; tay: NULL
    nguon              TEXT NOT NULL CHECK (nguon IN ('auto', 'tay')),
    nguoi_cap_nhat     TEXT,
    updated_at         TEXT NOT NULL
);
