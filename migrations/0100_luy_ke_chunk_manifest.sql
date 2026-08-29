-- Manifest hash tung THANG cua snapshot "Bao cao luy ke" (pivot DVBH toan quoc, du lieu da tong hop
-- san tu file Excel import thu cong) luu tren R2 theo tung file/thang (xem lib/luyKeChunks.ts).
-- CHI duoc ghi/cap nhat tu routes/luyKe.ts POST /import/commit (Admin/TBP DVBH) - diem ghi R2 DUY
-- NHAT cho tinh nang nay, da chot voi chu he thong 2026-08-28 (xem memory
-- r2-json-write-trigger-rule.md). Moi lan import THAY THE TOAN BO du lieu cua NHUNG THANG co mat
-- trong file upload (khong merge/cong don voi du lieu thang do da co san).
CREATE TABLE luy_ke_chunk_manifest (
  thang TEXT PRIMARY KEY,            -- 'YYYY-MM', = ten file R2 (luy-ke/month/<thang>.json)
  hash TEXT NOT NULL,                -- SHA-256 hex noi dung JSON
  row_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
