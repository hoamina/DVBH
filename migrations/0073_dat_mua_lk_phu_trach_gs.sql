-- Khu vuc phu trach (Giam sat) cho TN/Kho/Ke toan - scope MEM cho badge/thong ke, khong anh huong
-- danh sach/tim kiem. Xem CLAUDE.md / DatMuaLinhKienModule cho thiet ke day du.
CREATE TABLE dat_mua_lk_phu_trach_gs (
    nguoi_phu_trach TEXT NOT NULL REFERENCES users(email),
    giam_sat_email  TEXT NOT NULL REFERENCES users(email),
    ngay_gan        TEXT NOT NULL DEFAULT (datetime('now')),
    tu_dong_gan     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (nguoi_phu_trach, giam_sat_email)
);

CREATE INDEX idx_dmlpgs_gs ON dat_mua_lk_phu_trach_gs(giam_sat_email);
