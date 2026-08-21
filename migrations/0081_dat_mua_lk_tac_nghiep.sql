-- ============================================================
-- Tach "Tac nghiep" (nguoi duyet don mua/PXK/tra hang trong module
-- "Dat mua linh kien") khoi vai_tro="TBP DVBH" - CHOT 2026-08-16:
-- truoc day canTacNghiep() (datMuaLinhKien.ts/phieuXuatKho.ts/
-- traHang.ts) hardcode vai_tro==="TBP DVBH"||"Admin", muon 1 nguoi
-- duyet don ma khong phai la TBP DVBH (vai tro "chinh" gan lien BC
-- + import + tranh chap + settings) thi phai thang cap ho len TBP
-- DVBH, cap du thua nhieu quyen khong lien quan. Gio tach thanh flag
-- doc lap, dung PATTERN HET voi la_kho/la_ke_toan (migration 0053).
--
-- KHONG backfill vai_tro="TBP DVBH" hien co ve la_tac_nghiep=1 (chot
-- ro voi chu he thong 2026-08-16) - Admin tu tick lai tung nguoi can
-- qua UsersModule.tsx sau khi deploy.
-- ============================================================

ALTER TABLE users ADD COLUMN la_tac_nghiep INTEGER NOT NULL DEFAULT 0;
