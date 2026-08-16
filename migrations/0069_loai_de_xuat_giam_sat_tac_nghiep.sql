-- Migration 0069: Them nhom "Giam sat + Tac nghiep" cho module Dat mua linh kien.
-- Chot 2026-08-14: GS + TBP DVBH can thay tap 15 option rieng (HO TRO / CONG NO).
-- Flag JSON dung gia tri DB khong dau (VAI_TRO_VALUES backend/src/types.ts).
-- Dung 15 INSERT rieng vi D1 gioi han compound SELECT terms thap hon SQLite desktop.

INSERT INTO settings_loai_de_xuat_nhom (ten_nhom, vai_tro_json) VALUES
  ('Giám sát + Tác nghiệp', '["vai_tro:Giam sat","vai_tro:TBP DVBH"]');

INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt) SELECT id, 'HỖ TRỢ 0 ĐỒNG', 1 FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'Giám sát + Tác nghiệp';
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt) SELECT id, 'HỖ TRỢ CÔNG NỢ', 2 FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'Giám sát + Tác nghiệp';
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt) SELECT id, 'HỖ TRỢ 0 ĐỒNG (KÊNH MT)', 3 FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'Giám sát + Tác nghiệp';
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt) SELECT id, 'HỖ TRỢ CÔNG NỢ (KÊNH MT)', 4 FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'Giám sát + Tác nghiệp';
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt) SELECT id, '(ƯU TIÊN) CÔNG NỢ', 5 FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'Giám sát + Tác nghiệp';
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt) SELECT id, '(ƯU TIÊN) HỖ TRỢ 0 ĐỒNG', 6 FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'Giám sát + Tác nghiệp';
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt) SELECT id, '(ƯU TIÊN) HỖ TRỢ CÔNG NỢ', 7 FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'Giám sát + Tác nghiệp';
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt) SELECT id, 'HỖ TRỢ NGOÀI BẢO HÀNH TG12-NSKX', 8 FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'Giám sát + Tác nghiệp';
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt) SELECT id, 'HỖ TRỢ NGOÀI BẢO HÀNH TG12-NPP', 9 FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'Giám sát + Tác nghiệp';
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt) SELECT id, 'TRỪ CÔNG NỢ TG12-NSKX', 10 FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'Giám sát + Tác nghiệp';
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt) SELECT id, 'TRỪ CÔNG NỢ TG12-NPP', 11 FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'Giám sát + Tác nghiệp';
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt) SELECT id, 'MUA DỰ TRỮ', 12 FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'Giám sát + Tác nghiệp';
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt) SELECT id, 'CÔNG NỢ (XUẤT HÀNG TỪ KHO TRUNG GIAN)', 13 FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'Giám sát + Tác nghiệp';
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt) SELECT id, 'CÔNG NỢ - ĐƠN ĐANG XỬ LÝ', 14 FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'Giám sát + Tác nghiệp';
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt) SELECT id, '(ƯU TIÊN) CÔNG NỢ - ĐƠN ĐANG XỬ LÝ', 15 FROM settings_loai_de_xuat_nhom WHERE ten_nhom = 'Giám sát + Tác nghiệp';
