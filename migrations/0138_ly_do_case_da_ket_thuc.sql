-- Ly do giai trinh he thong "Case đã được kết thúc" (CHOT 2026-10-19) - backend/src/lib/autoLogCaKetThuc.ts tu ghi 1
-- dong giai_trinh voi ly do nay cho ca nam trong danh sach "can giai trinh" chot 08:00 nhung duoc dong (Hoàn thành /
-- Không hoàn thành) ngay trong ngay, de ca do khong con tinh la "con lai can giai trinh". bat_tat = 0: khong hien trong
-- dropdown nhap giai trinh tay (POST giai-trinh chi nhan ly do bat_tat = 1), nhung van la muc hop le cho FK
-- giai_trinh.ly_do_cham. Nguoi ghi = user he thong 'he-thong-tu-dong@dvbh.internal' (migration 0033).
INSERT INTO settings_ly_do (ten_ly_do, bat_tat, thuoc_thieu_linh_kien, thuoc_tranh_chap)
VALUES ('Case đã được kết thúc', 0, 0, 0)
ON CONFLICT(ten_ly_do) DO NOTHING;
