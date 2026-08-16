-- Nhom loai de xuat: moi nhom co nhieu option, duoc gan cho nhieu vai tro.
-- vai_tro_json la JSON array cac flag: "la_ktv_dvbh", "la_ve_tinh", "vai_tro:Admin", etc.
CREATE TABLE settings_loai_de_xuat_nhom (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ten_nhom       TEXT NOT NULL,
  vai_tro_json   TEXT NOT NULL DEFAULT '[]',
  bat_tat        INTEGER NOT NULL DEFAULT 1,
  nguoi_cap_nhat TEXT REFERENCES users(email),
  ngay_cap_nhat  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cac option cu the trong moi nhom, sap xep theo stt.
CREATE TABLE settings_loai_de_xuat (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nhom_id        INTEGER NOT NULL REFERENCES settings_loai_de_xuat_nhom(id),
  ten_option     TEXT NOT NULL,
  bat_tat        INTEGER NOT NULL DEFAULT 1,
  stt            INTEGER NOT NULL DEFAULT 0,
  nguoi_cap_nhat TEXT REFERENCES users(email),
  ngay_cap_nhat  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_loai_de_xuat_nhom_id ON settings_loai_de_xuat (nhom_id, bat_tat);

-- Seed: 2 nhom mac dinh
INSERT INTO settings_loai_de_xuat_nhom (ten_nhom, vai_tro_json) VALUES
  ('KTV & Vệ tinh', '["la_ktv_dvbh","la_ve_tinh"]'),
  ('Admin / TBP DVBH', '["vai_tro:Admin","vai_tro:TBP DVBH"]');

-- Nhom 1: union KTV + No-KTV (dedup, theo thu tu xuat hien trong code cu)
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt) VALUES
  (1, 'MUA HÀNG', 1),
  (1, 'CÔNG NỢ', 2),
  (1, '(ƯU TIÊN) CÔNG NỢ', 3),
  (1, 'CÔNG NỢ - VGREEN', 4),
  (1, 'CÔNG NỢ (XUẤT HÀNG TỪ KHO TRUNG GIAN)', 5),
  (1, 'TRỪ CÔNG NỢ', 6),
  (1, 'THẺ BẢO HÀNH 299k', 7),
  (1, 'MUA DỰ TRỮ', 8),
  (1, 'CÔNG NỢ - ĐƠN ĐANG XỬ LÝ', 9),
  (1, '(ƯU TIÊN) CÔNG NỢ - ĐƠN ĐANG XỬ LÝ', 10),
  (1, 'TRẢ HÀNG CÔNG NỢ', 11),
  (1, 'TRẢ HÀNG LK TỈNH', 12),
  (1, 'TRẢ HÀNG LK ĐẶC THÙ', 13),
  (1, 'TRẢ HÀNG DỮ TRỮ', 14),
  (1, 'TRẢ HÀNG LK KHÁC', 15),
  (1, 'HỖ TRỢ 0 ĐỒNG', 16),
  (1, 'HỖ TRỢ CÔNG NỢ', 17),
  (1, 'HỖ TRỢ 0 ĐỒNG (KÊNH MT)', 18),
  (1, 'HỖ TRỢ CÔNG NỢ (KÊNH MT)', 19),
  (1, '(ƯU TIÊN) HỖ TRỢ 0 ĐỒNG', 20),
  (1, '(ƯU TIÊN) HỖ TRỢ CÔNG NỢ', 21),
  (1, 'HỖ TRỢ NGOÀI BẢO HÀNH TG12-NSKX', 22),
  (1, 'HỖ TRỢ NGOÀI BẢO HÀNH TG12-NPP', 23),
  (1, 'TRỪ CÔNG NỢ TG12-NSKX', 24),
  (1, 'TRỪ CÔNG NỢ TG12-NPP', 25);

-- Nhom 2: Admin extra options
INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt) VALUES
  (2, '(TBP ĐỒNG Ý) MUA HÀNG', 1),
  (2, '(TBP ĐỒNG Ý) CÔNG NỢ', 2),
  (2, '(TBP ĐỒNG Ý) TRỪ CÔNG NỢ', 3),
  (2, '(TBP ĐỒNG Ý) MUA DỰ TRỮ', 4),
  (2, '(TBP ĐỒNG Ý) HỖ TRỢ CÔNG NỢ', 5),
  (2, '(TBP ĐỒNG Ý) TRẢ HÀNG LK KHÁC', 6),
  (2, 'TRẢ HÀNG LK KHÁC KHO VÀ KẾ TOÁN ĐÃ DUYỆT', 7),
  (2, 'TRẢ HÀNG CÔNG NỢ KHO VÀ KẾ TOÁN ĐÃ DUYỆT', 8),
  (2, 'TRẢ HÀNG LK TỈNH KHO VÀ KẾ TOÁN ĐÃ DUYỆT', 9),
  (2, 'TRẢ HÀNG LK ĐẶC THÙ KHO VÀ KẾ TOÁN ĐÃ DUYỆT', 10),
  (2, 'TRẢ HÀNG DỮ TRỮ KHO VÀ KẾ TOÁN ĐÃ DUYỆT', 11),
  (2, 'QC VÀ KHO VÀ KẾ TOÁN ĐỒNG Ý TRẢ HÀNG LK KHÁC', 12),
  (2, 'QC VÀ KHO VÀ KẾ TOÁN ĐỒNG Ý TRẢ HÀNG CÔNG NỢ', 13),
  (2, 'QC VÀ KHO VÀ KẾ TOÁN ĐỒNG Ý TRẢ HÀNG LK TỈNH', 14),
  (2, 'QC VÀ KHO VÀ KẾ TOÁN ĐỒNG Ý TRẢ HÀNG LK ĐẶC THÙ', 15),
  (2, 'QC VÀ KHO VÀ KẾ TOÁN ĐỒNG Ý TRẢ HÀNG DỮ TRỮ', 16),
  (2, '(TBP ĐỒNG Ý) TRẢ HÀNG CÔNG NỢ', 17),
  (2, '(TBP ĐỒNG Ý) TRẢ HÀNG LK TỈNH', 18),
  (2, '(TBP ĐỒNG Ý) TRẢ HÀNG LK ĐẶC THÙ', 19),
  (2, '(TBP ĐỒNG Ý) TRẢ HÀNG DỮ TRỮ', 20),
  (2, '(TBP ĐỒNG Ý) (ƯU TIÊN) CÔNG NỢ', 21),
  (2, '(TBP ĐỒNG Ý) (ƯU TIÊN) HỖ TRỢ 0 ĐỒNG', 22),
  (2, '(TBP ĐỒNG Ý) (ƯU TIÊN) HỖ TRỢ CÔNG NỢ', 23),
  (2, '(TBP ĐỒNG Ý) (ƯU TIÊN) CÔNG NỢ - ĐƠN ĐANG XỬ LÝ', 24);
