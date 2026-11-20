-- 2026-11-20 (v1.646) - Giam dung luong D1 (~100 MB): don so chot cua pham vi "Tất cả quốc gia" va 2 pham vi NSKX / Khong NSKX
-- "toan he thong" (bang khong gan nuoc). Tu 11/11 moi nguoi dung xem 1 nuoc (?qg bat buoc) -> bang cua nuoc (_vn, _vn_nskx, _ph...)
-- moi la du lieu nguoi xem; cac bang/dong duoi day khong con man hinh nao doc. Tu v1.646 cron cung thoi ghi chung (lib/chotTon.ts
-- phamViCuaNhom + chotNhom: pham vi goc chi con dong he thong).
--
-- GIU LAI trong daily_snapshot (goc) - tien trinh he thong con doc:
--   canh_bao_ton|all : nhat ky chuyen cap TBP/CEO (canhBaoTon.ts ghiLogChuyenCapCanhBao so voi ngay truoc) + ca cap 2.
--   khac|all, chot_xong|all 7 ngay gan nhat : tu ghi log "Case đã được kết thúc" / giai trinh qua tranh chap (moc chot hom nay).

-- 1) daily_snapshot goc: bo dong theo vai tro / giam sat / khu vuc (tap con cua khac|all) + dong he thong cu hon 7 ngay.
DELETE FROM daily_snapshot
WHERE scope_key NOT IN ('canh_bao_ton|all', 'chot_xong|all', 'khac|all')
   OR (scope_key IN ('chot_xong|all', 'khac|all') AND ngay < '2026-11-13');

-- 2) Pham vi NSKX / Khong NSKX khong gan nuoc: khong con ai doc, khong con chot.
DELETE FROM daily_snapshot_nskx;
DELETE FROM daily_snapshot_khong_nskx;
DELETE FROM backlog_age_daily_nskx;
DELETE FROM backlog_age_daily_khong_nskx;
DELETE FROM backlog_age_month_manifest_nskx;
DELETE FROM backlog_age_month_manifest_khong_nskx;
DELETE FROM ton_ktv_daily_nskx;
DELETE FROM ton_ktv_daily_khong_nskx;

-- 3) Tuoi ton / ton KTV cua pham vi goc: chi phuc vu nguoi xem -> pham vi goc khong chot nua.
DELETE FROM backlog_age_daily;
DELETE FROM backlog_age_month_manifest;
DELETE FROM ton_ktv_daily;
