-- Manifest hash tung ngay cua snapshot "ca da dong" luu tren R2 theo tung file/ngay (xem
-- lib/daDongDayChunks.ts) - CHI duoc ghi/cap nhat tu nhanh import commit/sync-sheet co
-- GHI_MOI+GHI_DE>0 (importRoute.ts -> scheduleCaLapRefreshIfChanged), TUYET DOI KHONG duoc
-- computed-on-miss luc doc hay bat ky trigger nao khac (xem memory r2-json-write-trigger-rule.md -
-- phai hoi chu he thong truoc khi them diem ghi JSON moi len R2 lien quan toi tinh nang nay).
CREATE TABLE da_dong_chunk_manifest (
  ngay TEXT PRIMARY KEY,             -- 'YYYY-MM-DD' theo thoi_gian_hoan_thanh (UTC), = ten file R2
  hash TEXT NOT NULL,                -- SHA-256 hex noi dung JSON (case_dvbh thuan, KHONG join giai_trinh)
  row_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rate-limit tai chunk tu R2 theo TUNG FILE/ngay rieng (khong phai 1 ngan sach chung ca tai khoan):
-- 1 tai khoan chi duoc tai LAI DUNG 1 file "chunk_ngay" toi thieu each 10 phut, toi da 5 lan/ngay VN
-- (moc reset la ngay_vn). Cac file (ngay) khac nhau co dong ha rieng, khong dung chung so dem - xem
-- lib/r2DownloadRateLimit.ts.
CREATE TABLE r2_download_log (
  email TEXT NOT NULL,
  chunk_ngay TEXT NOT NULL,          -- ngay cua file dang xin tai (vd '2026-07-24')
  ngay_vn TEXT NOT NULL,             -- ngay VN hien tai (moc reset "5 lan/ngay")
  so_lan INTEGER NOT NULL DEFAULT 0,
  last_download_at TEXT,
  PRIMARY KEY (email, chunk_ngay, ngay_vn)
);
