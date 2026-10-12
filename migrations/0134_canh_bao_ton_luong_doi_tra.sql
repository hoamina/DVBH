-- Canh bao ton (Quan ly ton): 2 chi tieu moi "Luong doi tra" ton >=7 ngay (Cap 1 TP DVBH) / >=10 ngay (Cap 2 CEO),
-- CHOT 2026-10-12 - xem backend/src/lib/canhBaoTon.ts + luongDoiTraTon.ts. Nguon la he theodoidoimay (khong luu
-- trong D1), so dem theo khu_vuc ghi vao lich su o 2 cot nay. NULL = ngay chua co chi tieu / chua lay duoc so
-- (khong phai 0) - getCanhBaoTonTrendDeltas tra null cho cac ngay do.
ALTER TABLE canh_bao_ton_daily_log ADD COLUMN luong_doi_tra_7_ngay INTEGER;
ALTER TABLE canh_bao_ton_daily_log ADD COLUMN luong_doi_tra_10_ngay INTEGER;
