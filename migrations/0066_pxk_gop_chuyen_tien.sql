-- Migration 0066: Gop "chuyen tien" (phieu_so_tien) vao phieu_xuat_kho + doi trang thai PXK dung
-- theo 9 gia tri chuan trong sheet "Settings" cua file Excel goc (cot "3. Phieu tra").
--
-- Chot voi chu he thong 2026-08-14: "chuyen tien" la 1 DIEU KIEN CHAN (cot rieng tren
-- phieu_xuat_kho), khong phai 1 mat xich trong chuoi trang_thai chinh - chan buoc "Dang tao phieu"
-- -> "Cho ke toan": neu so_tien_can_chuyen khac null thi bat buoc trang_thai_chuyen_tien = 'TN da
-- duyet'. Gan theo PXK (1 so tien tong ca PXK), khong tach theo tung phieu dat goc du 1 PXK co the
-- gop dong tu nhieu phieu dat.
--
-- 9 trang thai chuan (xem sheet Settings, cot "3. Phieu tra"): Dang tao phieu -> Cho ke toan ->
-- Da chot xong don xuat -> [Dang gui KTV -> KTV da nhan] hoac [Hang tru kho] hoac [Kho da ket thuc],
-- + nhanh huy "Ke toan huy". Day la thay doi lon so voi 5 trang thai cu (KT xac nhan/Kho xac
-- nhan/Dang gui/KTV da nhan/KT huy) - kiem tra xac nhan local D1 dang co 0 dong o ca phieu_xuat_kho,
-- phieu_xuat_kho_log, phieu_so_tien (hop ly: tao PXK doi hoi dong da "TN da duyet", ma luong duyet
-- theo dong nay chi vua duoc fix o Giai doan 1 - truoc do khong ai tao duoc PXK thanh cong), nen
-- KHONG can migrate du lieu cu, chi can doi schema.

ALTER TABLE phieu_xuat_kho ADD COLUMN so_tien_can_chuyen REAL;
ALTER TABLE phieu_xuat_kho ADD COLUMN trang_thai_chuyen_tien TEXT CHECK (trang_thai_chuyen_tien IN (
    'Cho KTV chuyen', 'KTV da chuyen', 'TN da duyet'
));
ALTER TABLE phieu_xuat_kho ADD COLUMN bang_chung_chuyen_tien_url TEXT;
ALTER TABLE phieu_xuat_kho ADD COLUMN ngay_ktv_chuyen TEXT;

DROP TABLE phieu_xuat_kho_log;
CREATE TABLE phieu_xuat_kho_log (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    phieu_xuat_kho_id TEXT NOT NULL REFERENCES phieu_xuat_kho(id),
    trang_thai        TEXT NOT NULL CHECK (trang_thai IN (
                          'Dang tao phieu', 'Cho ke toan', 'Da chot xong don xuat',
                          'Dang gui KTV', 'KTV da nhan', 'Ke toan huy', 'Hang tru kho', 'Kho da ket thuc'
                      )),
    nguoi_xu_ly       TEXT NOT NULL REFERENCES users(email),
    ngay_xu_ly        TEXT NOT NULL DEFAULT (datetime('now')),
    ghi_chu           TEXT
);
CREATE INDEX idx_pxkl_id ON phieu_xuat_kho_log(phieu_xuat_kho_id);

DROP TABLE phieu_so_tien;
