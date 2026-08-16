-- ============================================================
-- Log lich su "Canh bao ton danh cho QL" - chot 1 lan/ngay luc 08:00 gio VN (cung cron
-- DAILY_SNAPSHOT_CRON, xem index.ts + lib/canhBaoTon.ts generateCanhBaoTonSnapshot()). LICH SU
-- VINH VIEN (khong ghi de, khong co duong sua tay), mirror dung pattern giai_trinh_daily_log
-- (migration 0040) - phuc vu bang lich su theo ngay trong tab "Quan ly ton" (Bao cao).
--
-- 8 cot ung voi 8 chi tieu "Canh bao ton danh cho QL":
--   Cap 1 (TP DVBH): ton_14_ngay, vip_svip_5_ngay, loc_tong_3_ngay, tranh_chap_3_ngay
--   Cap 2 (CEO):     ton_20_ngay, vip_svip_7_ngay, loc_tong_5_ngay, tranh_chap_5_ngay
-- ============================================================

CREATE TABLE canh_bao_ton_daily_log (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay                TEXT NOT NULL,              -- 'YYYY-MM-DD' theo gio VN
    khu_vuc             TEXT NOT NULL,
    ton_14_ngay         INTEGER NOT NULL,
    vip_svip_5_ngay     INTEGER NOT NULL,
    loc_tong_3_ngay     INTEGER NOT NULL,
    tranh_chap_3_ngay   INTEGER NOT NULL,
    ton_20_ngay         INTEGER NOT NULL,
    vip_svip_7_ngay     INTEGER NOT NULL,
    loc_tong_5_ngay     INTEGER NOT NULL,
    tranh_chap_5_ngay   INTEGER NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (ngay, khu_vuc)
);
