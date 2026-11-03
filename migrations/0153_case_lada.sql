-- ============================================================
-- Lien ket ca DVBH <-> ID Lada (don cua he ETX/Lada) - CHOT 2026-11-03, chu he thong: "Khi dong bo tu dong du lieu
-- tu lada ve, gan them ID lada lien quan vao ID case do (hien ID lada tren UI case khi click vao se xem duoc thong
-- tin ID case lada lien quan)".
--
-- Nguon: luong dong bo "Giai trinh ton B2B" (lib/etxGiaiTrinhSync.ts, cron 17h15 + nut "Chay ngay") - moi dong API
-- co order_id (= ID Lada, vd "B1420618") va id_truy_xuat (= case_dvbh.id). Do thuc te 2026-11-03 (60 doi tac, 1.347
-- dong): 1 order_id chi thuoc 1 ca, nhung 1 ca co the co NHIEU order_id (vd T25668 = B1427881 + B1431234, ca Lada
-- bi huy chuyen KTV roi tao don moi) -> bang noi rieng, khoa chinh order_id.
--
-- Luu kem "anh chup" don Lada o dong API moi nhat (trang thai don, loai lead, KTV, ngay...) de hien ngay trong Chi
-- tiet ca; bam ID Lada thi FE goi GET /api/cases/:id/lada/:orderId -> proxy API ETX (loc order_id, can ma_doi_tac)
-- lay nhat ky Lada day du (60 ngay gan nhat). Upsert CHI ghi khi co cot that su doi (ON CONFLICT ... WHERE).
-- Khong FK sang case_dvbh (giong canh_bao_ton_chuyen_cap_log) - khong chan archive/xoa ca.
-- ============================================================

CREATE TABLE case_lada (
    order_id            TEXT PRIMARY KEY,   -- ID Lada
    case_id             TEXT NOT NULL,      -- = case_dvbh.id (id_truy_xuat API)
    ma_doi_tac          TEXT NOT NULL,      -- ma doi tac ETX (bat buoc khi goi lai API theo order_id)
    ten_doi_tac         TEXT,
    trang_thai_don      TEXT,
    loai_lead           TEXT,
    ktv                 TEXT,
    tinh_thanh          TEXT,
    ten_khach           TEXT,
    ngay_khoi_tao       TEXT,               -- 'YYYY-MM-DD' (Lada)
    ngay_hen            TEXT,
    so_lan_giai_trinh   INTEGER,            -- truong "lan" cua dong moi nhat
    giai_trinh_cuoi_luc TEXT,               -- 'YYYY-MM-DD HH:MM:SS' gio VN, dong moi nhat
    created_at          TEXT NOT NULL,      -- nowVN()
    updated_at          TEXT NOT NULL
);
CREATE INDEX idx_case_lada_case ON case_lada (case_id);
