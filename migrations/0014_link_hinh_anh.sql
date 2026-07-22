-- Cot moi "Link hinh anh" (sau cot "TBP" trong file import hang ngay) - luu JSON array string cac
-- URL anh bao cao cong viec, da duoc tach theo dau phay va chuan hoa domain o backend/src/lib/ratchet.ts.
ALTER TABLE case_dvbh ADD COLUMN link_hinh_anh TEXT;
