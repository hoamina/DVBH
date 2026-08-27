-- Fix 2026-08-27: tranh_chap_log_con.created_at (migration 0092) INSERT truoc day khong dat cot
-- nay nen roi vao DEFAULT (datetime('now')) = UTC that, LECH voi quy uoc VN-local dung cho MOI cot
-- thoi gian he thong tu sinh khac (nowVN(), xem lib/vnTime.ts) - hien thi som hon thuc te 7 tieng
-- va sap xep sai trong "Tien trinh chung" (CaseDetail.tsx). Code INSERT da sua dat tuong minh qua
-- nowVN() (xem routes/tranhChap.ts) - migration nay CHI backfill cac dong CU da ghi truoc khi sua
-- (dich +7 gio de dua ve dung gio VN, khop voi thuc te da xay ra).
UPDATE tranh_chap_log_con SET created_at = datetime(created_at, '+7 hours');
