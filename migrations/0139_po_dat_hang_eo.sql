-- ============================================================
-- PO dat hang day tu app "EO Mua hang" (Worker muahang, repo ../EO MUA HANG/eomua) qua
-- POST /api/partner/sync/po-dat-hang. Dung SONG SONG voi Google Sheet "po-dat-hang" cu (chot
-- 2026-10-20: chay ca 2 nguon ~1 thang den khi chu he thong tat sheet) - frontend gop 2 nguon,
-- dong trung id_dat_lk lay ban app EO (lib/purchaseWarrantySync.ts).
-- 1 dong = 1 dong linh kien tren EO. payload = JSON day du app EO gui (ke hoach hang ve, phieu nhap
-- AMIS...), cac cot rieng chi de tra cuu/index. row_hash: bo qua ghi khi noi dung khong doi.
-- ============================================================
CREATE TABLE po_dat_hang_eo (
    id_dat_lk     TEXT PRIMARY KEY,          -- 'LK-...' (dong cu) | 'EOI-<id>' (dong tao tren app EO)
    eo_item_id    INTEGER,
    eo_id         INTEGER,
    ma_phe_duyet  TEXT,                      -- 3TDO-...
    ma_lk         TEXT,
    ma_lk_goc     TEXT,                      -- ma da duyet truoc khi thay ma tuong duong
    id_crm        TEXT,                      -- ma ca (tuy chon)
    trang_thai    TEXT,
    ngay_cap_nhat_nguon TEXT,                -- gio VN ben app EO
    payload       TEXT NOT NULL,
    row_hash      TEXT NOT NULL,
    nguon         TEXT NOT NULL DEFAULT 'muahang',
    synced_at     TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);
CREATE INDEX idx_po_dat_hang_eo_ma_lk ON po_dat_hang_eo(ma_lk);
CREATE INDEX idx_po_dat_hang_eo_id_crm ON po_dat_hang_eo(id_crm) WHERE id_crm IS NOT NULL;
