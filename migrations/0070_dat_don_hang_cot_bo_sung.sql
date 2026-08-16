-- Migration 0070: Bo sung cot con thieu tren dat_don_hang, doi chieu file Excel goc "Data dat
-- hang.xlsx" (sheet "2. Don hang") - CHOT 2026-08-14 sau khi thao luan voi chu he thong.
--
-- 6 cot MOI, deu do NGUOI TAO don dien luc tao (POST /phieu-dat), khong sua duoc sau do:
--   ghi_chu           - GHI CHU NGUOI DAT HANG, rieng TUNG DONG (khac phieu_dat.ghi_chu la ghi chu
--                        CHUNG ca phieu)
--   yeu_cau_hoa_don   - dropdown 3 gia tri co dinh (xem sheet Settings file Excel)
--   tt_mail_duyet     - TT+MAIL DUYET: ma/noi dung email phe duyet dac biet (vd de xuat ho tro 0d
--                        ngoai quy trinh chuan), nguoi tao dan vao lam bang chung
--   tt_khach_hang     - TT KHACH HANG: thong tin khach hang (ten/sdt/dia chi) lien quan don
--   chinh_sach        - dropdown 2 gia tri: Trong CSBH / Ngoai CSBH
--   ma_yeu_cau_su_co  - MA YEU CAU CUA SU CO LIEN QUAN: ma ticket he thong ngoai, KHONG phai FK toi
--                        case_dvbh (format khac hoan toan, vd "T23914")
--
-- Cot ly_do_cham (co san tu 0056) TRUOC DAY bi dung SAI trong code: nguoi tao dien luc tao qua o
-- input "Ly do dat" (khong hien thi lai o dau ca trong UI - xac nhan voi chu he thong day la loi tu
-- phien lam viec truoc, he thong khong he thiet ke cot nay cho nguoi tao). Y NGHIA THAT (theo chu he
-- thong): TAC NGHIEP (TN) dung de giai trinh khi 1 dong ton qua 24h ke tu luc chuyen "Cho TN duyet"
-- (cong them so ngay T7/CN neu khoang cho di qua cuoi tuan - xem lib/hanLyDoCham.ts) ma VAN CHUA
-- duoc dua vao 1 Phieu Xuat Kho dat trang thai "Cho ke toan" - hoan toan khong lien quan nguoi tao.
-- Da go input "Ly do dat" khoi form tao don (frontend DatMuaLinhKienModule.tsx), chuyen quyen ghi
-- ly_do_cham sang PATCH /don-hang/:id (TN-only, datMuaLinhKien.ts) + chan cung tai
-- POST /phieu-xuat-kho/:id/log luc chuyen "Dang tao phieu" -> "Cho ke toan" (phieuXuatKho.ts).

ALTER TABLE dat_don_hang ADD COLUMN ghi_chu TEXT;
ALTER TABLE dat_don_hang ADD COLUMN yeu_cau_hoa_don TEXT CHECK (yeu_cau_hoa_don IN (
    'Không', 'Yêu cầu hóa đơn (KTV không thu phí dịch vụ)', 'Yêu cầu hóa đơn (KTV có thu phí dịch vụ)'
));
ALTER TABLE dat_don_hang ADD COLUMN tt_mail_duyet TEXT;
ALTER TABLE dat_don_hang ADD COLUMN tt_khach_hang TEXT;
ALTER TABLE dat_don_hang ADD COLUMN chinh_sach TEXT CHECK (chinh_sach IN ('Trong CSBH', 'Ngoài CSBH'));
ALTER TABLE dat_don_hang ADD COLUMN ma_yeu_cau_su_co TEXT;
