-- 0174 (2026-11-17, v1.621): "ten KTV/tram moi nhat theo ma".
-- case_dvbh.ky_thuat_vien / ktv_trien_khai la chuoi "(ma) Loai - Khu vuc - Ten" chep nguyen tu CRM/Odoo tung luc import. Khi
-- doi ten tram/KTV ben Odoo, chi ca duoc pipeline gui lai moi mang ten moi -> cung 1 ma co nhieu ten -> bao cao gom theo
-- nguyen chuoi bi tach 1 KTV thanh nhieu dong. Bang nay giu 1 ten hien thi / ma = ten cua ca tiep nhan MOI NHAT (moc =
-- thoi_gian_cskh_tiep_nhan cua ca do). Import cap nhat (lib/ktvTen.ts capNhatTenKtvTuImport), bao cao gom dong theo ma roi
-- hien ten nay (lib/ktvTen.ts). Khong FK toi case_dvbh.
CREATE TABLE IF NOT EXISTS ktv_ten_moi_nhat (
  ma        TEXT PRIMARY KEY,
  ten       TEXT NOT NULL,
  moc       TEXT NOT NULL,
  cap_nhat  TEXT NOT NULL
);

-- Khoi tao tu du lieu hien co: SQLite tra cot "tran" (ten) cua dong co MAX(moc) trong nhom.
INSERT OR REPLACE INTO ktv_ten_moi_nhat (ma, ten, moc, cap_nhat)
SELECT ma, ten, MAX(moc), datetime('now', '+7 hours') FROM (
  SELECT trim(substr(ky_thuat_vien, 2, instr(ky_thuat_vien, ')') - 2)) AS ma, trim(ky_thuat_vien) AS ten, thoi_gian_cskh_tiep_nhan AS moc
  FROM case_dvbh
  WHERE substr(ky_thuat_vien, 1, 1) = '(' AND instr(ky_thuat_vien, ')') > 2 AND thoi_gian_cskh_tiep_nhan GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
  UNION ALL
  SELECT trim(substr(ktv_trien_khai, 2, instr(ktv_trien_khai, ')') - 2)), trim(ktv_trien_khai), thoi_gian_cskh_tiep_nhan
  FROM case_dvbh
  WHERE substr(ktv_trien_khai, 1, 1) = '(' AND instr(ktv_trien_khai, ')') > 2 AND thoi_gian_cskh_tiep_nhan GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
)
WHERE ma <> ''
GROUP BY ma;
