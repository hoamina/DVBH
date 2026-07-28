-- Cot crm_hash: hash SHA-256 cua BUSINESS_FIELDS (xem lib/ratchet.ts computeCrmHash) - thay the
-- SELECT * + so sanh tung cot moi lan import (xem BAO_CAO_RAO_SOAT_IMPORT_CRM_CACHE_2026-07-28.md).
-- NULL o cac dong da co truoc khi trien khai tinh nang nay - se duoc dien khi dong do lan dau duoc
-- GHI_MOI/GHI_DE (tu hoi phuc dan), hoac qua POST /api/import/backfill-crm-hash (nen chay 1 lan
-- truoc lan import/sync-sheet dau tien sau khi deploy tinh nang nay, tranh 1 dot GHI_DE hang loat do
-- moi dong "chua co hash" bi coi la thay doi).
ALTER TABLE case_dvbh ADD COLUMN crm_hash TEXT;

-- Ghi lai loi (neu co) cua cac tac vu nen (waitUntil) sau import - xem scheduleCaLapRefreshIfChanged
-- trong routes/importRoute.ts. NULL = tat ca tac vu nen thanh cong (hoac import khong co GHI_MOI/
-- GHI_DE nen khong co tac vu nao chay). Khong phai bang job/queue day du - chi du de phat hien "co
-- loi ngam" thay vi hoan toan im lang nhu truoc.
ALTER TABLE import_history ADD COLUMN bg_error TEXT;
