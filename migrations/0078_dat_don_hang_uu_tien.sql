-- Danh dau 1 dong dat_don_hang la "uu tien" (chot 2026-08-16, dot 3 gop y module Dat mua linh kien).
-- Nguoi tao tu tich chon TUNG DONG rieng le luc tao don - khong anh huong thu tu sap xep, chi de
-- hien thi/to mau noi bat (chu he thong chot: "chi can them cot Uu tien la duoc").
ALTER TABLE dat_don_hang ADD COLUMN uu_tien INTEGER NOT NULL DEFAULT 0;
