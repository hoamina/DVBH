-- "Only sua chua" (chi_sua_chua) - linh kien danh dau true se KHONG chon duoc trong picker tao
-- don o module "Dat mua linh kien" (chi dung de tra cuu/giai trinh sua chua, khong dat mua). CHOT
-- 2026-08-17.
ALTER TABLE linh_kien ADD COLUMN chi_sua_chua INTEGER NOT NULL DEFAULT 0;
