-- ============================================================
-- Chuyen link Google Sheet dong bo (truoc day hardcode trong wrangler.jsonc vars)
-- thanh cau hinh luu trong DB, Admin sua duoc qua Settings ma khong can deploy lai.
-- Ap dung cho ca 4 loai dong bo: ca moi (case), bang gia linh kien (linh_kien),
-- giai trinh cu (giai_trinh_cu), khao sat cu (khao_sat_cu).
-- ============================================================

CREATE TABLE settings_sheet_urls (
    loai_dong_bo TEXT PRIMARY KEY,
    url          TEXT,
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_by   TEXT REFERENCES users(email)
);

INSERT INTO settings_sheet_urls (loai_dong_bo, url) VALUES
    ('case', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSr_mvr2UtVJnpVFlUVmLuq0556MGhCKuT72GokxrdgXTf5f2SHCa7VierJEumKUYBcvbD5kTTyQFGN/pub?gid=792991291&single=true&output=tsv'),
    ('linh_kien', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ02aMyUHGYZC59csU07jfbzDX0M3vRPipKCN1ZAwhGU6p6JWElulY1GFn5aAAJuAJ3VegHivyEKsfN/pub?gid=0&single=true&output=tsv'),
    ('giai_trinh_cu', NULL),
    ('khao_sat_cu', NULL);
