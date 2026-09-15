-- Doi thiet ke etx_giai_trinh_sync_log (migration 0110) tu "1 dong/doi tac + 1 dong tong ket" sang
-- CHI "1 dong duy nhat moi lan goi API" (chot voi chu he thong 2026-09-14 - qua chi tiet, kho doc).
-- Khong co bang nao khac FK toi bang nay nen dung duoc pattern recreate-table binh thuong (xem
-- CLAUDE.md "D1 migration constraint: FK-referenced tables"). Du lieu cu (58 dong tu lan bam "Chay
-- ngay" thu nghiem) la log tam thoi, khong can giu lai - DROP thang, khong migrate du lieu.
DROP TABLE etx_giai_trinh_sync_log;

CREATE TABLE etx_giai_trinh_sync_log (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ok                  INTEGER NOT NULL,
    so_case_cap_nhat    INTEGER NOT NULL DEFAULT 0,  -- so case_dvbh.id KHAC NHAU nhan duoc >=1 dong moi
    so_lich_su_moi      INTEGER NOT NULL DEFAULT 0,  -- tong so dong giai_trinh MOI ghi duoc (khong tinh trung)
    so_lich_su_trung    INTEGER NOT NULL DEFAULT 0,  -- tong so dong da ton tai san (ON CONFLICT DO NOTHING)
    error               TEXT,                        -- gop loi cua tung doi tac loi (neu co), null neu ok het
    created_at          TEXT NOT NULL DEFAULT (datetime('now', '+7 hours'))
);
CREATE INDEX idx_etx_sync_log_created ON etx_giai_trinh_sync_log (created_at);
