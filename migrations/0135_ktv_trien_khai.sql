-- "KTV triển khai" (2026-10-13) - chi nguon Odoo OCRM (pipeline auto qs, ocrm/transform_odoo.py tinh san):
--   * "Kỹ thuật viên phụ trách/Đăng nhập" rong HOAC trung tai khoan trong "(...)" cua "Đội ngũ/Trạm" -> = "Đội ngũ/Trạm"
--   * nguoc lai (tram nhieu nguoi, ca do 1 nguoi khac xu ly) -> = "Kỹ thuật viên phụ trách" (neu da co "(tk)"),
--     hoac ghep "(<Đăng nhập>) <Kỹ thuật viên phụ trách>".
-- "Trạm triển khai" = ky_thuat_vien ("Đội ngũ/Trạm") - KHONG luu them cot. Ca QuickSight: NULL (= ky_thuat_vien).
-- Cot tuy chon (lib/ratchet.ts OPTIONAL_FIELDS): chi ghi khi dong import co key, file Excel tay khong xoa.
ALTER TABLE case_dvbh ADD COLUMN ktv_trien_khai TEXT;
