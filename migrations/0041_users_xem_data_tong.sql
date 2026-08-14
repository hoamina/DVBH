-- ----------------------------------------------------------
-- users.duoc_xem_data_tong: co bat/tat rieng, TACH KHOI vai_tro (giong la_ksnb_doi_tac, xem
-- migration 0035_tranh_chap_tien_trinh.sql) - CHOT 2026-08-01: "Danh sach tong" (route
-- /cases/tong-hop) truoc day mo cho hau het vai_tro, nay chi con Admin (luon duoc, khong can co
-- nay) + user duoc Admin BAT co nay rieng. Mac dinh 0 (tat) cho MOI user hien co - Admin phai vao
-- "Quan ly User" bat lai thu cong cho tung nguoi can xem.
-- ----------------------------------------------------------
ALTER TABLE users ADD COLUMN duoc_xem_data_tong INTEGER NOT NULL DEFAULT 0;
