-- 2026-11-25: ngay loai tru "Tất cả khu vực" (settings_giai_trinh_exclude_ngay) GAN THEO NUOC. Truoc day khu_vuc = '__ALL__'
-- ap cho moi nuoc -> khai nghi le 24/11 cho VN lam bang "Tỷ lệ giải trình" cua PH (PLP) cung hien "Loại trừ".
-- Tu nay dong "toan bo" luu '__ALL__:<ma nuoc>' (lib/quocGia.ts khuVucLoaiTruToanBo / locLoaiTruTheoNuoc). Moi dong '__ALL__'
-- hien co deu khai cho VN (da kiem du lieu that: chi 24/11 "Nghỉ lễ") -> doi sang '__ALL__:VN'. Bang nho, khong FK tham chieu.
UPDATE settings_giai_trinh_exclude_ngay SET khu_vuc = '__ALL__:VN' WHERE khu_vuc = '__ALL__';
