-- "So ca ton theo KTV" (Quan ly ton > Bao cao, CHOT 2026-10-03) - chot 08:00 moi ngay, xem
-- lib/tonKtvSnapshot.ts. Luu CHET (khong tinh lai luc xem): KTV/khu_vuc gan tai DUNG thoi diem chot,
-- ca chuyen KTV giua thang van tinh dung nguoi giu ca ngay do. Khong bo sung ngay cu (chu he thong
-- chot "A, khong bo sung") - chi co du lieu tu ngay deploy.
--
-- 1 dong/ngay, payload JSON (KHONG tach 1 dong/(ktv, khu_vuc, tuoi)): ~vai nghin to hop/ngay se ton
-- vai nghin rows_written/ngay (+ index), trong khi 1 dong JSON chi ton 1 - doc 1 thang = ~31 dong.
-- Chi luu ban toan he thong (cung tap ca voi backlogTongTon cua scope "khac|all"); Giam sat loc theo
-- khu_vuc_phu_trach luc doc.
CREATE TABLE ton_ktv_daily (
    ngay            TEXT PRIMARY KEY,           -- 'YYYY-MM-DD' gio VN (getVnDateStr())
    generated_at    TEXT NOT NULL,              -- nowVN()
    payload         TEXT NOT NULL               -- JSON TonKtvPayload (xem lib/tonKtvSnapshot.ts)
);
