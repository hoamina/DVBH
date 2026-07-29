-- User "he thong" dung lam actor cho cac tac vu tu dong (cron dong bo Google Sheet giai_trinh/
-- giai_trinh_lap/khao_sat/nap_gas - xem backend/src/index.ts scheduled() + routes/import*.ts
-- syncXxxFromSheet()). Can thiet vi import_history.nguoi_import co FK REFERENCES users(email)
-- (migration 0002) - khong the ghi 1 email tuy y khong ton tai trong bang users.
-- vai_tro = NULL (khong dang nhap duoc qua OAuth, khong xuat hien trong danh sach "cho duyet" vi
-- trang_thai_duyet dat san 'Da duyet') - chi dung lam moc tham chieu FK, khong phai tai khoan that.
INSERT INTO users (email, ten, vai_tro, khu_vuc_phu_trach, trang_thai_duyet)
VALUES ('he-thong-tu-dong@dvbh.internal', 'Hệ thống (tự động)', NULL, '[]', 'Da duyet')
ON CONFLICT(email) DO NOTHING;
