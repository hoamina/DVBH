-- 2026-10-22 (chu he thong): ca cua tai khoan "(kdloctong.krf) KD KRF Lọc tổng", "(TEST.ER) Trạm Hưng Yên- Dữ liệu TEST" va
-- 2 ten cu khong ma "KD KRF Lọc tổng" / "Trạm Hưng Yên- Dữ liệu TEST" -> khu vuc "(teamkdbl.krf) Kinh doanh bán lẻ KRF"
-- (nam trong KHU_VUC_AN_KHOI_BAO_CAO -> khong tinh bao cao). Truoc: "(cxk.ktv3t) Chưa xác định khu vực" / MB2 / MB3.
-- Danh dau nhu Admin sua tay (migration 0133): import CRM sau KHONG ghi de, khu_vuc_crm giu gia tri cu ("Khoi phuc theo CRM").
-- updated_at doi -> cron self-heal tao lai snapshot R2 "da dong" cua cac ngay lien quan (duong ghi R2 san co).
-- Ca moi ve sau: lib/khuVucTheoKtv.ts ap dung luc import.
UPDATE case_dvbh
SET khu_vuc_crm = CASE WHEN khu_vuc_sua_at IS NULL THEN khu_vuc ELSE khu_vuc_crm END,
    khu_vuc = '(teamkdbl.krf) Kinh doanh bán lẻ KRF',
    khu_vuc_sua_by = 'Quy tắc hệ thống: KTV KD KRF lọc tổng / dữ liệu TEST',
    khu_vuc_sua_at = datetime('now', '+7 hours'),
    updated_at = datetime('now', '+7 hours')
WHERE (ky_thuat_vien LIKE '(kdloctong.krf)%' OR ky_thuat_vien LIKE '(TEST.ER)%'
       OR ky_thuat_vien IN ('KD KRF Lọc tổng', 'Trạm Hưng Yên- Dữ liệu TEST'))
  AND khu_vuc IS NOT '(teamkdbl.krf) Kinh doanh bán lẻ KRF';

-- Bao cao cache theo domain "cases" -> tinh lai voi khu vuc moi.
UPDATE data_versions SET version = version + 1, updated_at = datetime('now') WHERE domain = 'cases';
