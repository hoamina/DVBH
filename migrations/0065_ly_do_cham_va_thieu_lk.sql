-- Migration 0065: Sua luong "Cho hang" - dung dung nguoi bao (TN, khong phai Kho) + dung du lieu
-- that tu sheet "LY DO CHAM" cua file Excel goc.
--
-- Chot lai voi chu he thong 2026-08-14: khi TN xu ly 1 dong dang "Cho TN duyet", neu KHONG duyet thi
-- phai chon 1 "Ly do cham" tu danh sach co san (loc theo he_thong_su_dung chua "Mua hang"). Neu ly
-- do do co co "quan_ly_don_thieu_linh_kien" = true thi HE THONG TU DONG tao 1 ticket "Thieu linh
-- kien" gui sang Kho giai trinh (dong -> "Cho hang"); neu khong thi la tu choi thuong (dong -> "TN
-- tu choi"). TN KHONG tu tao thieu_lk truc tiep nua (khac thiet ke ban dau cua Giai doan 1).

-- Danh muc "Ly do cham" - dung chung cho quyet dinh Tu choi/Cho hang cua TN. he_thong_su_dung la
-- text tu do (co the nhieu gia tri cach nhau boi dau phay, vd "Mua hang, Sua chua") - loc bang LIKE
-- thay vi tach bang rieng vi so luong gia tri nho, khong can chuan hoa sau.
CREATE TABLE settings_ly_do_cham (
    id                           INTEGER PRIMARY KEY AUTOINCREMENT,
    ten_ly_do                    TEXT NOT NULL,
    he_thong_su_dung             TEXT NOT NULL,
    quan_ly_don_thieu_linh_kien  INTEGER NOT NULL DEFAULT 0,
    bat_tat                      INTEGER NOT NULL DEFAULT 1,
    stt                          INTEGER NOT NULL DEFAULT 0,
    nguoi_cap_nhat                TEXT REFERENCES users(email),
    ngay_cap_nhat                 TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed dung 12 dong that tu sheet "LY DO CHAM" (Data dat hang.xlsx).
INSERT INTO settings_ly_do_cham (ten_ly_do, he_thong_su_dung, quan_ly_don_thieu_linh_kien, stt) VALUES
    ('Do nhà máy hết hàng', 'Mua hàng', 1, 1),
    ('Do chờ hàng về kho', 'Mua hàng', 1, 2),
    ('Do KTV', 'Mua hàng', 0, 3),
    ('Do PBH', 'Mua hàng', 0, 4),
    ('Do App lỗi', 'Mua hàng', 0, 5),
    ('Do ĐMX', 'Mua hàng', 0, 6),
    ('Do Kho hết hàng', 'Mua hàng', 1, 7),
    ('Do chưa chuyển tiền', 'Mua hàng', 0, 8),
    ('Do nghỉ phép, lễ, cuối tuần', 'Mua hàng', 0, 9),
    ('Do chờ phê duyệt', 'Mua hàng', 0, 10),
    ('Do sửa chữa chậm', 'Sửa chữa', 1, 11),
    ('Không có linh kiện', 'Mua hàng, Sửa chữa', 1, 12);

-- thieu_lk: them lien ket toi ly do da chon (thay the viec TN tu go ly_do tu do) + ngay du kien co
-- hang (Kho nhap/cap nhat luc "Kho da tiep nhan" giai trinh, KHONG phai TN nhap luc tao).
ALTER TABLE thieu_lk ADD COLUMN ly_do_cham_id INTEGER REFERENCES settings_ly_do_cham(id);
ALTER TABLE thieu_lk ADD COLUMN ngay_du_kien_co_hang TEXT;
