-- ----------------------------------------------------------
-- users.modules: danh sach module (sidebar) duoc phep xem, tuy chinh HOAN TOAN theo TUNG tai
-- khoan - CHOT 2026-08-01, thay the hoan toan duoc_xem_data_tong (chi 1 module) bang co che chung
-- cho MOI module. JSON array string (giong khu_vuc_phu_trach) hoac NULL.
-- NULL = chua tuy chinh, fallback ve danh sach mac dinh theo vai_tro (xem
-- backend/src/lib/moduleAccess.ts DEFAULT_MODULES_BY_ROLE + frontend/src/layout/navConfig.ts
-- ROLE_MODULES) - AN TOAN cho moi user hien co, khong can backfill.
-- Khong ap dung cho vai_tro=Admin (luon full access, khong hien checklist o UI) va khong gom 3
-- module "He thong" (import/settings/users) - 3 module do LUON gan voi vai_tro=Admin, khong nam
-- trong danh sach tuy chinh duoc.
-- ----------------------------------------------------------
ALTER TABLE users ADD COLUMN modules TEXT;
ALTER TABLE users DROP COLUMN duoc_xem_data_tong;
