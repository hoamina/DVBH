-- 2026-11-27 (chu he thong chon "Gop vao MM"): CRM PH ghi tai khoan KTV "(denverym.svph) Denver Y. Maniclang" vao cot khu vuc
-- -> "Bao cao ton theo khu vuc" (Quan ly ton) hien dong khu vuc la. Chuyen ve "MM" (cung kieu migration 0177).
-- Danh dau nhu Admin sua tay (migration 0133): khu_vuc_crm giu gia tri cu ("Khoi phuc theo CRM" van dung duoc).
-- Ca moi ve sau: lib/khuVucTheoKtv.ts khuVucChuanTuTaiKhoan ap dung luc import.
UPDATE case_dvbh
SET khu_vuc_crm = CASE WHEN khu_vuc_sua_at IS NULL THEN khu_vuc ELSE khu_vuc_crm END,
    khu_vuc = 'MM',
    khu_vuc_sua_by = 'Quy tắc hệ thống: tài khoản KTV ghi vào cột khu vực',
    khu_vuc_sua_at = datetime('now', '+7 hours'),
    updated_at = datetime('now', '+7 hours')
WHERE khu_vuc LIKE '(denverym.svph)%';

UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'cases';
