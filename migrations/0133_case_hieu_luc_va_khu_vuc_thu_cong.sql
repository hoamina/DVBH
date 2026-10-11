-- ============================================================
-- 1. VIEW case_hieu_luc - ca KHONG bi Admin "huy bo" (huy_bo_at IS NULL, migration 0037)
-- ============================================================
-- CHOT 2026-10-11 voi chu he thong: ca da huy bo KHONG duoc tinh trong BAT KY bao cao nao, khong hien
-- trong danh sach / bo loc / lua chon (truoc day chi ~22 file tu loc "huy_bo_at IS NULL" rieng le, phan
-- con lai van dem). Moi truy van DOC cho bao cao/danh sach/dropdown doc tu view nay thay vi case_dvbh;
-- chi giu case_dvbh cho: luong GHI (import, huy/bo huy, cap nhat cot), tra cuu 1 ca theo id (chi tiet
-- ca van mo duoc ca da huy bo), va cac truy van co "INDEXED BY" (SQLite khong cho INDEXED BY tren view -
-- cac cho do tu them "huy_bo_at IS NULL"). SQLite tu "flatten" view don gian nay vao truy van ngoai nen
-- van dung index cua case_dvbh binh thuong. "SELECT *" trong view duoc mo rong luc prepare -> cot them
-- vao case_dvbh ve sau tu dong co trong view.
CREATE VIEW case_hieu_luc AS SELECT * FROM case_dvbh WHERE huy_bo_at IS NULL;

-- ============================================================
-- 2. Admin sua tay khu vuc cua 1 ca (CaseDetail) - song sot qua import CRM
-- ============================================================
-- khu_vuc van la gia tri HIEU LUC (moi bao cao/scope doc thang cot nay, khong doi). Khi Admin sua:
-- khu_vuc = gia tri moi, khu_vuc_crm = gia tri CRM truoc do, khu_vuc_sua_by/_at danh dau. Import CRM
-- (importProcessor buildFullOverwrite + "cap nhat 1 cot") KHONG ghi de khu_vuc khi khu_vuc_sua_at IS
-- NOT NULL, chi cap nhat khu_vuc_crm. "Khoi phuc theo CRM" = khu_vuc = khu_vuc_crm + xoa 3 cot danh dau.
-- Chi ap dung cho DUNG 1 ca (CHOT 2026-10-11), khong lan sang ca khac cua cung KTV.
ALTER TABLE case_dvbh ADD COLUMN khu_vuc_crm TEXT;
ALTER TABLE case_dvbh ADD COLUMN khu_vuc_sua_by TEXT;
ALTER TABLE case_dvbh ADD COLUMN khu_vuc_sua_at TEXT;

-- ============================================================
-- 3. Lam moi cache bao cao (cache KHONG tu het han khi deploy code doi logic compute)
-- ============================================================
UPDATE data_versions SET version = version + 1, updated_at = datetime('now');
DELETE FROM precomputed_cache;
