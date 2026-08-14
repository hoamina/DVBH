-- Add dang_cho_nguoi_xu_ly column to tranh_chap_log table
ALTER TABLE tranh_chap_log ADD COLUMN dang_cho_nguoi_xu_ly TEXT REFERENCES users(email);
