-- Migration 0089: doi ten gia tri "Sua chua" -> "Bao hanh" trong cot he_thong_su_dung cua
-- settings_ly_do_cham - CHOT 2026-08-19 khi them UI quan ly danh sach nay vao Settings: cot
-- "He thong su dung" gio la 2 lua chon CO DINH "Mua hang"/"Bao hanh" (checkbox), khong con la
-- text tu do nua. Du lieu that hien co 2 dong dung "Sua chua" (rieng hoac ghep "Mua hang, Sua
-- chua") tu seed migration 0065 - doi thanh "Bao hanh" cho khop danh nghia moi. Dung REPLACE
-- (khong phai UPDATE ... WHERE = ) vi 1 dong la "Mua hang, Sua chua" (ghep 2 gia tri).
UPDATE settings_ly_do_cham
SET he_thong_su_dung = REPLACE(he_thong_su_dung, 'Sửa chữa', 'Bảo hành')
WHERE he_thong_su_dung LIKE '%Sửa chữa%';
