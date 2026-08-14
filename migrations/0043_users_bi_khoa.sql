-- Chuc nang "khoa tai khoan" - tai khoan bi khoa khong the vao he thong (chan o loadUser.ts) du
-- trang_thai_duyet van la "Da duyet". Tach rieng khoi trang_thai_duyet (khong dung lai "Tu choi")
-- vi 2 khai niem khac nhau: tu choi = chua tung duoc cap quyen, khoa = da duoc cap quyen roi bi
-- tam ngung. ALTER TABLE ADD COLUMN don gian, khong vuong gioi han "recreate table" cua users
-- (bang bi ~10 bang khac tham chieu FK - xem CLAUDE.md).
ALTER TABLE users ADD COLUMN bi_khoa INTEGER NOT NULL DEFAULT 0;
