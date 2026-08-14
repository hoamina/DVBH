-- ============================================================
-- Log kiem toan "ty le giai trinh trong ngay" theo khu vuc - chot 1 lan/ngay luc 17h30 gio VN (cron
-- rieng, xem index.ts DAILY_LOG_1730_CRON + lib/dailySnapshot.ts chotGiaiTrinhDailyLog()). Khac bang
-- daily_snapshot (migration 0039, bi GHI DE moi lan refresh) - bang nay la LICH SU vinh vien, khong
-- co duong ghi tay/sua lai, phuc vu bao cao "Ty le giai trinh theo ngay" (Quan ly ton).
-- ============================================================

CREATE TABLE giai_trinh_daily_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay            TEXT NOT NULL,              -- 'YYYY-MM-DD' theo gio VN
    khu_vuc         TEXT NOT NULL,
    can_giai_trinh  INTEGER NOT NULL,           -- baseline NEED_TONG cua khu vuc do, tu snapshot 08:00 cung ngay
    da_giai_trinh   INTEGER NOT NULL,           -- so ca trong baseline co log giai_trinh moi hon, tinh den 17h30
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (ngay, khu_vuc)
);
