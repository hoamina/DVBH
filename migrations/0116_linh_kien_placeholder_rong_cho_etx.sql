-- Sua loi dong bo "Giai trinh ton B2B" tu ETX (lib/etxGiaiTrinhSync.ts) that bai HOAN TOAN tu
-- 2026-09-16, khong ghi duoc dong log nao (nguoi dung bam "Chay ngay" bao loi nhung bang
-- etx_giai_trinh_sync_log trong trơn).
--
-- Nguyen nhan: sua 2026-09-16 doi giai_trinh.linh_kien_thieu tu NULL sang chuoi rong '' (de
-- ON CONFLICT DO NOTHING bat dung trung lap - SQLite coi 2 gia tri NULL la "khac nhau moi lan" nen
-- truoc do moi lan dong bo lai cung du lieu (cua so LOOKBACK_DAYS=3 ngay) deu tao dong trung). Nhung
-- linh_kien_thieu la FK toi linh_kien(ma_linh_kien) (migration 0001), va chua tung co dong nao trong
-- linh_kien voi ma_linh_kien = '' - nen MOI lan INSERT tu ETX deu vo pham FK constraint
-- (SQLITE_CONSTRAINT_FOREIGNKEY), ham syncGiaiTrinhTonB2B() crash NGAY TRONG vong lap insert, truoc
-- khi kip goi writeSummaryLog() o cuoi ham - vi vay khong co dong log nao duoc ghi du that bai lien
-- tuc (xac nhan qua wrangler tail: "D1_ERROR: FOREIGN KEY constraint failed").
--
-- Fix: them 1 dong placeholder ma_linh_kien = '' vao linh_kien de thoa man FK, tat bat_tat=0 de
-- KHONG hien trong danh sach chon linh kien cho nguoi dung (dropdown/picker deu loc bat_tat=1).
INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, bat_tat, ghi_chu)
VALUES ('', '(Không có – dùng nội bộ cho đồng bộ ETX, không hiển thị)', 0,
        'Placeholder de thoa man FK giai_trinh.linh_kien_thieu khi dong bo ETX ghi chuoi rong thay vi NULL')
ON CONFLICT(ma_linh_kien) DO NOTHING;
