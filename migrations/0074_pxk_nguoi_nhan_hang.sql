-- Chot nghiep vu 2026-08-15: 1 phieu xuat kho (PXK) chi duoc gan cho DUY NHAT 1 KTV (chon luc tao
-- phieu). Truoc day (xem migration 0066) 1 PXK co the gop dong tu nhieu phieu_dat/KTV khac nhau.
-- Cot moi denormalized de truy van/loc/bao cao theo KTV don gian, khong can join qua
-- phieu_xuat_kho_dong -> dat_don_hang -> phieu_dat moi lan doc.
ALTER TABLE phieu_xuat_kho ADD COLUMN nguoi_nhan_hang TEXT REFERENCES users(email);

-- Backfill du lieu cu: chi dien khi PXK do co DUNG 1 gia tri KTV duy nhat trong cac dong cua no
-- (HAVING COUNT(DISTINCT...) = 1), con lai giu NULL - an toan cho truong hop hiem gap co PXK da
-- gop nhieu KTV truoc khi chot quy tac nay (se khong xuat hien trong bao cao theo KTV, khong chan
-- nghiep vu hien co).
UPDATE phieu_xuat_kho SET nguoi_nhan_hang = (
  SELECT pd.nguoi_nhan_hang
  FROM phieu_xuat_kho_dong pxkd
  JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id
  JOIN phieu_dat pd ON pd.id = ddh.phieu_dat_id
  WHERE pxkd.phieu_xuat_kho_id = phieu_xuat_kho.id
  GROUP BY pxkd.phieu_xuat_kho_id
  HAVING COUNT(DISTINCT pd.nguoi_nhan_hang) = 1
);
