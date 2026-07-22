-- Cot moi "Tinh vao KPIs" tu CRM (dang bool TRUE/FALSE, nam sau cot "Nhom san pham" trong file
-- import) - thay the logic cu dua vao chuoi van ban "KHONG TINH" trong dung_han/xu_ly_24h_bucket
-- de loai 1 ca khoi mau so cac bao cao toc do/ty le (SLA, xu ly <=24h). Mac dinh 1 (co tinh) cho
-- du lieu hien co; backfill 0 cho dung cac ca CRM da tung danh dau "KHONG TINH" truoc do, de ket
-- qua bao cao khong doi ngay sau khi trien khai - tu ca sau, cot moi nay la nguon duy nhat quyet
-- dinh co tinh vao KPI hay khong.
ALTER TABLE case_dvbh ADD COLUMN tinh_vao_kpi INTEGER NOT NULL DEFAULT 1;
UPDATE case_dvbh SET tinh_vao_kpi = 0 WHERE dung_han = 'KHÔNG TÍNH' OR xu_ly_24h_bucket = 'KHÔNG TÍNH';
