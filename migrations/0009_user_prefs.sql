-- Tuy chinh giao dien (theme_config: JSON, null = preset mac dinh "ocean") +
-- moc lan dang nhap gan nhat theo ngay lich VN (last_report_date, dung de bao cao nhanh dau ngay).
ALTER TABLE users ADD COLUMN theme_config TEXT;
ALTER TABLE users ADD COLUMN last_report_date TEXT;
