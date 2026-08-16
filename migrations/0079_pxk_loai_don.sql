-- Chot nghiep vu 2026-08-16 (dot 3 gop y #8): 1 PXK chi duoc gom dong CUNG 1 "loai" (mua/cong_no) -
-- khong bao gio tron 2 loai trong 1 phieu. loai_don cua dong dat_don_hang (mua/cong_no/tra_hang, xem
-- deriveLoaiDon) duoc denormalize len chinh PXK de loc/hien thi nhanh, khong can join lai dong con.
ALTER TABLE phieu_xuat_kho ADD COLUMN loai_don TEXT CHECK (loai_don IN ('mua', 'cong_no', 'tra_hang'));

-- Backfill du lieu cu: chi dien khi PXK do co DUNG 1 gia tri loai_don duy nhat trong cac dong cua no,
-- con lai giu NULL (an toan cho PXK da gop lan nhieu loai truoc khi chot quy tac nay).
UPDATE phieu_xuat_kho SET loai_don = (
  SELECT ddh.loai_don
  FROM phieu_xuat_kho_dong pxkd
  JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id
  WHERE pxkd.phieu_xuat_kho_id = phieu_xuat_kho.id
  GROUP BY pxkd.phieu_xuat_kho_id
  HAVING COUNT(DISTINCT ddh.loai_don) = 1
);
