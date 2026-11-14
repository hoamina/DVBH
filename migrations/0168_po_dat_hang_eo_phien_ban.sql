-- 2026-11-14: GET /api/po-dat-hang chi gui dong THAY DOI (delta) thay vi ca bang (~9k dong, ~11MB) moi khi app EO day 1 dong.
-- phien_ban = version domain "po_dat_hang" tai lan ghi lam doi dong do (ghi trong CUNG batch voi lan tang version, xem
-- partnerApi.ts POST /sync/po-dat-hang). Dong cu = 0: client doi khoa cache (po-dat-hang-eo-v2) nen tai full 1 lan.
ALTER TABLE po_dat_hang_eo ADD COLUMN phien_ban INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_po_dat_hang_eo_phien_ban ON po_dat_hang_eo(phien_ban);
