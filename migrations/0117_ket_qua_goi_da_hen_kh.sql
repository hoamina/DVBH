-- "Da hen KH?" (CHOT 2026-09-27): CSKH bat buoc chon 1 trong 3 gia tri khi cuoc goi co dinh kem
-- ket luan "Loi 120 phut" (bat ke Khong loi/Loi) - dung de tinh lai "Ty le % da goi hen 120'" chi
-- tinh ca da lien he thanh cong VA da hen lich voi KH (xem computeSurveyKhuVucReport, survey.ts).
-- NULL cho cac cuoc goi khong lien quan "Loi 120 phut".
ALTER TABLE ket_qua_goi ADD COLUMN da_hen_kh TEXT CHECK (da_hen_kh IN ('Da hen KH', 'Chua hen KH', 'Khong xac dinh'));
