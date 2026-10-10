-- So chot RTAT + toc do cuoi tuan cho cac thang TRUOC khi cron tu tinh (TOC_DO_MIEN_AUTO_TU_THANG =
-- 2026-10, xem migration 0131 + lib/luyKeCompute.ts). Chu he thong yeu cau 2026-10-10 dien san tu sheet
-- "7. TỐC ĐỘ XỬ LÝ THEO THÁNG CỦA DVBH THEO MIỀN" (anh chup dong Thang 2504 -> 2607): cot "Tổng RTAT MB/MN
-- (ngày)" + "Tốc độ SLA/24h cuối tuần". Thang 2608/2609 khong co trong anh - de trong, nhap tay sau qua
-- nut ✎ (PUT /api/luy-ke/toc-do-mien/:thang). nguon = 'tay' -> sua lai duoc tren UI nhu so nhap tay.
INSERT INTO luy_ke_toc_do_mien (thang, rtat_mb_ngay, rtat_mn_ngay, cuoi_tuan_sla, cuoi_tuan_24h, nguon, nguoi_cap_nhat, updated_at) VALUES
  ('2025-04', 5777, 14025, 0.910, 0.833, 'tay', 'meomeo3101@gmail.com', '2026-10-10 18:00:00'),
  ('2025-05', 7190, 15884, 0.892, 0.813, 'tay', 'meomeo3101@gmail.com', '2026-10-10 18:00:00'),
  ('2025-06', 8217, 12621, 0.914, 0.828, 'tay', 'meomeo3101@gmail.com', '2026-10-10 18:00:00'),
  ('2025-07', 7781, 12007, 0.917, 0.876, 'tay', 'meomeo3101@gmail.com', '2026-10-10 18:00:00'),
  ('2025-08', 9678, 12948, 0.898, 0.849, 'tay', 'meomeo3101@gmail.com', '2026-10-10 18:00:00'),
  ('2025-09', 7627, 16502, 0.874, 0.823, 'tay', 'meomeo3101@gmail.com', '2026-10-10 18:00:00'),
  ('2025-10', 9100, 13635, 0.901, 0.845, 'tay', 'meomeo3101@gmail.com', '2026-10-10 18:00:00'),
  ('2025-11', 8187, 13695, 0.878, 0.821, 'tay', 'meomeo3101@gmail.com', '2026-10-10 18:00:00'),
  ('2025-12', 6084, 29556, 0.879, 0.843, 'tay', 'meomeo3101@gmail.com', '2026-10-10 18:00:00'),
  ('2026-01', 5785, 18141, 0.891, 0.854, 'tay', 'meomeo3101@gmail.com', '2026-10-10 18:00:00'),
  ('2026-02', 5482, 10297, 0.888, 0.839, 'tay', 'meomeo3101@gmail.com', '2026-10-10 18:00:00'),
  ('2026-03', 6559, 16101, 0.881, 0.839, 'tay', 'meomeo3101@gmail.com', '2026-10-10 18:00:00'),
  ('2026-04', 7711, 14428, 0.880, 0.835, 'tay', 'meomeo3101@gmail.com', '2026-10-10 18:00:00'),
  ('2026-05', 7294, 16559, 0.883, 0.833, 'tay', 'meomeo3101@gmail.com', '2026-10-10 18:00:00'),
  ('2026-06', 8511, 16403, 0.903, 0.852, 'tay', 'meomeo3101@gmail.com', '2026-10-10 18:00:00'),
  ('2026-07', 8268, 17587, 0.898, 0.831, 'tay', 'meomeo3101@gmail.com', '2026-10-10 18:00:00')
ON CONFLICT(thang) DO UPDATE SET rtat_mb_ngay = excluded.rtat_mb_ngay, rtat_mn_ngay = excluded.rtat_mn_ngay,
  cuoi_tuan_sla = excluded.cuoi_tuan_sla, cuoi_tuan_24h = excluded.cuoi_tuan_24h, nguon = 'tay',
  nguoi_cap_nhat = excluded.nguoi_cap_nhat, updated_at = excluded.updated_at;
