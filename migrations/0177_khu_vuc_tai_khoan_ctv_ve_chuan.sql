-- 2026-11-19 (chu he thong chon "gop vao khu vuc chuan"): CRM/Odoo ghi TAI KHOAN CTV/TEST vao cot khu vuc -> bang "Tỷ lệ giải trình
-- theo ngày" (Quan ly ton) hien dong khu vuc la. Chuyen ve khu vuc chuan: CTV Bac Ninh / Hai Duong -> MB3 (tinh cua cac ca deu thuoc
-- MB3), "(gskv.test) GS Khu Vực-TEST" -> "(teamkdbl.krf) Kinh doanh bán lẻ KRF" (du lieu TEST, an khoi bao cao - giong 0141).
-- Danh dau nhu Admin sua tay (migration 0133): khu_vuc_crm giu gia tri cu ("Khoi phuc theo CRM" van dung duoc).
-- Ca moi ve sau: lib/khuVucTheoKtv.ts khuVucChuanTuTaiKhoan ap dung luc import.
UPDATE case_dvbh
SET khu_vuc_crm = CASE WHEN khu_vuc_sua_at IS NULL THEN khu_vuc ELSE khu_vuc_crm END,
    khu_vuc = '(qldvbh.mb3) Quản lý khu vực MB3',
    khu_vuc_sua_by = 'Quy tắc hệ thống: tài khoản CTV ghi vào cột khu vực',
    khu_vuc_sua_at = datetime('now', '+7 hours'),
    updated_at = datetime('now', '+7 hours')
WHERE khu_vuc LIKE '(huydg.bn-mb)%' OR khu_vuc LIKE '(hoant.hd-mb)%';

UPDATE case_dvbh
SET khu_vuc_crm = CASE WHEN khu_vuc_sua_at IS NULL THEN khu_vuc ELSE khu_vuc_crm END,
    khu_vuc = '(teamkdbl.krf) Kinh doanh bán lẻ KRF',
    khu_vuc_sua_by = 'Quy tắc hệ thống: tài khoản TEST ghi vào cột khu vực',
    khu_vuc_sua_at = datetime('now', '+7 hours'),
    updated_at = datetime('now', '+7 hours')
WHERE khu_vuc LIKE '(gskv.test)%';

UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'cases';
