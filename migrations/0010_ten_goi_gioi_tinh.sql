-- Ten goi tuy chinh dung rieng cho loi chao (uu tien hon "ten" lay tu Google) + gioi tinh, dung de
-- chon nhom "cach goi" phu hop khi ghep loi chao. Ca 2 deu nullable - bo trong = dung ten Google /
-- khong xac dinh gioi tinh (chi dung nhom cach goi chung).
ALTER TABLE users ADD COLUMN ten_goi TEXT;
ALTER TABLE users ADD COLUMN gioi_tinh TEXT CHECK (gioi_tinh IN ('nam', 'nu'));
