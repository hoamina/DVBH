-- "Khu vuc duoc xem" (chi xem) - tach rieng khoi khu_vuc_phu_trach cho vai tro Giam sat: truoc day
-- Admin phai nhoi them khu vuc vao khu_vuc_phu_trach de Giam sat XEM duoc nhieu khu vuc hon, nhung
-- cot do cung la nguon tinh "thẻ khảo sát"/leaderboard vi pham theo giam sat phu trach (xem
-- routes/viPham.ts computeViPhamLeaderboard by=giam-sat, lib/dailyReport.ts) nen bi tinh sai vao so
-- lieu ca nhan. Cot moi nay CHI duoc scopeByKhuVuc.ts hop nhat vao pham vi XEM (danh sach/case),
-- KHONG duoc doc boi bat ky truy van bao cao/attribution nao - nhung noi do tiep tuc doc thang
-- khu_vuc_phu_trach. JSON array text, cung dinh dang voi khu_vuc_phu_trach.
ALTER TABLE users ADD COLUMN khu_vuc_duoc_xem TEXT;
