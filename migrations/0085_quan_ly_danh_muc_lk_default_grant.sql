-- Cap quyen SUA danh muc linh kien (quan_ly_danh_muc_lk) mac dinh cho Giam sat + Admin + Tac
-- nghiep (la_tac_nghiep=1) - yeu cau truc tiep 2026-08-17. Ap dung 1 LAN cho user hien huu (khong
-- phai logic mac dinh vinh vien - user moi/doi vai tro sau nay KHONG tu dong duoc cap, Admin tu
-- bat/tat tung nguoi qua UsersModule nhu binh thuong).
UPDATE users SET quan_ly_danh_muc_lk = 1 WHERE vai_tro IN ('Admin', 'Giam sat') OR la_tac_nghiep = 1;
