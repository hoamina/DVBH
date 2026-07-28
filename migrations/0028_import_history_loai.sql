-- Them cot "loai" vao import_history de phan biet nguon import (CRM hang ngay vs 4 loai backfill du
-- lieu cu: giai_trinh_cu/giai_trinh_lap_cu/khao_sat_cu/nap_gas_danh_gia_cu) - truoc day bang nay CHI
-- duoc importRoute.ts (CRM) ghi nen khong can phan biet, nay cac import backfill cung ghi lich su
-- rieng nen can loc theo tung tab "Import data".
--
-- ADD COLUMN co DEFAULT 'crm': SQLite tu dong ap DEFAULT nay cho CA cac dong da co san (toan bo lich
-- su CRM tu truoc den nay) LAN cac INSERT tuong lai khong liet ke cot nay (importRoute.ts hien tai) -
-- khong can UPDATE rieng, khong can sua importRoute.ts.
--
-- KHONG dung CHECK(loai IN (...)) - tranh lap lai van de "khong the mo rong CHECK don gian, phai
-- recreate ca chuoi bang" da gap voi users.vai_tro (xem migrations/0023_tranh_chap.sql), vi chac chan
-- se can them loai import moi trong tuong lai. Validate o tang ung dung (query param whitelist trong
-- route) la du.
ALTER TABLE import_history ADD COLUMN loai TEXT NOT NULL DEFAULT 'crm';

CREATE INDEX idx_import_history_loai ON import_history (loai, thoi_gian DESC);
