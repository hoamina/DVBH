-- 2026-11-14: Quan ly ton > Danh sach chi tiet - 4 cot PO "theo khu vuc" (Ngày hàng về dự kiến theo KV / Số lần lùi ngày DK /
-- Ngày về gần nhất theo KV / Ngày NM cam kết có hàng) chuyen tu tinh o trinh duyet sang tinh SAN o server de loc / sap xep kieu
-- Excel (bang phan trang server). 1 dong / (ma LK, mien): mien 'MB' | 'MN' | '*' (khu vuc khong ro mien -> PO moi kho).
-- Tinh tu po_dat_hang_eo bang lib/poHangVeMien.ts (cung logic lib/ngayHangVeTheoKv.ts cu cua frontend). Ngay dang YYYY-MM-DD.
CREATE TABLE IF NOT EXISTS po_hang_ve_mien (
    ma_lk        TEXT NOT NULL,
    mien         TEXT NOT NULL,
    du_kien      TEXT,
    ve_gan_nhat  TEXT,
    nm_cam_ket   TEXT,
    so_lan_lui   INTEGER,
    PRIMARY KEY (ma_lk, mien)
);
-- Cap nhat theo ma LK khi app EO day dong doi: can tim PO theo ca ma de xuat lan ma goc.
CREATE INDEX IF NOT EXISTS idx_po_dat_hang_eo_ma_lk_goc ON po_dat_hang_eo(ma_lk_goc) WHERE ma_lk_goc IS NOT NULL;
