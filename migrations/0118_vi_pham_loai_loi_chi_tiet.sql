-- Migration 0118: cot "Loai loi" TU DO cho vi pham import Excel (yeu cau chu he thong 2026-09-30).
-- File import co cot "LOAI LOI" chua phan loai rieng cua nguoi dung (vd "GQKN - Vi pham co khieu nai"),
-- KHONG thuoc 5 nguon co dinh cua vi_pham.loai_loi (CHECK) va KHONG thuoc danh muc "Loai loi vi pham"
-- (danh muc do chi dung cho ket_qua_cap_1). Luu nguyen van vao cot moi; loai_loi van = 'Khac'.
-- Chi ALTER ADD COLUMN (an toan, khong dung pattern recreate-table - vi_pham co bang con FK).
ALTER TABLE vi_pham ADD COLUMN loai_loi_chi_tiet TEXT;
ALTER TABLE vi_pham_ktv ADD COLUMN loai_loi_chi_tiet TEXT;
