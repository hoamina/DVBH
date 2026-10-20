-- Ly do giai trinh he thong "Giải trình qua tranh chấp" (CHOT 2026-10-20) - backend/src/lib/canhBaoCap2GiaiTrinh.ts tu ghi
-- 1 dong giai_trinh voi ly do nay khi ca thuoc "Canh bao ton cap 2 (CEO)" (da cong vao "Tong can giai trinh" chot 08:00)
-- duoc Giam sat cap nhat tien trinh / log con tranh chap TRONG NGAY sau moc chot -> ca tinh "da giai trinh" (chu he
-- thong chot: chap nhan ca log giai trinh ton LAN log giai trinh tranh chap). Nguoi ghi = nguoi viet log tranh chap.
-- bat_tat = 0: khong hien trong dropdown nhap giai trinh tay, nhung van hop le cho FK giai_trinh.ly_do_cham.
INSERT INTO settings_ly_do (ten_ly_do, bat_tat, thuoc_thieu_linh_kien, thuoc_tranh_chap)
VALUES ('Giải trình qua tranh chấp', 0, 0, 0)
ON CONFLICT(ten_ly_do) DO NOTHING;
