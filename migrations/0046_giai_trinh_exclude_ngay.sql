-- Danh sach ngay LOAI TRU khoi tinh luy ke/ty le giai trinh thang cua "Quan ly ton" (CHOT 2026-08-03,
-- xem backend/src/lib/dailySnapshot.ts computeBacklogDeltaPayload + backend/src/routes/cases.ts GET
-- /giai-trinh-daily-trend). Moi dong la 1 cap (ngay, khu_vuc) bi loai tru - khu_vuc = '__ALL__' nghia
-- la loai tru CA HE THONG cho dung ngay do (khong can liet ke tung khu vuc). Chu nhat MOI TUAN da bi
-- loai tru CUNG (quy tac cung, tinh qua strftime('%w', ngay) = '0', KHONG luu dong nao o day cho no) -
-- bang nay CHI chua cac ngay loai tru THEM ngoai Chu nhat. KHONG ghi settings_audit_log (danh muc cau
-- hinh don gian, cung quyet dinh nhu settings_greeting_gif/settings_greeting_message).
CREATE TABLE settings_giai_trinh_exclude_ngay (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ngay        TEXT NOT NULL,              -- 'YYYY-MM-DD'
    khu_vuc     TEXT NOT NULL,              -- gia tri khu_vuc that, hoac '__ALL__' cho toan bo khu vuc
    ghi_chu     TEXT,
    nguoi_tao   TEXT REFERENCES users(email),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE (ngay, khu_vuc)
);

CREATE INDEX idx_giai_trinh_exclude_ngay ON settings_giai_trinh_exclude_ngay (ngay);
