-- 2026-10-30: idx_case_huy_bo_at thanh PARTIAL index (chi ca DA huy).
-- View case_hieu_luc / case_hieu_luc_<pv> (migration 0133/0136/0149) deu loc "huy_bo_at IS NULL" (~97% bang). Voi index day du,
-- SQLite chon idx_case_huy_bo_at (huy_bo_at=NULL) cho rat nhieu truy van bao cao -> doc ~143k entry index + tra tung dong ngau
-- nhien trong DB 788 MB: do that 4,6 giay cho 1 SELECT DISTINCT (9 ms khi di idx_case_khu_vuc). Partial index KHONG dung duoc cho
-- "IS NULL" nen planner quay ve index chon loc / quet tuan tu; truy van "huy_bo_at IS NOT NULL" (danh sach ca huy) van dung duoc.
DROP INDEX IF EXISTS idx_case_huy_bo_at;
CREATE INDEX idx_case_huy_bo_at ON case_dvbh (huy_bo_at) WHERE huy_bo_at IS NOT NULL;
-- Ung vien hang doi tranh chap "Cho xu ly" (routes/tranhChap.ts TRANH_CHAP_UNG_VIEN_CHO_XU_LY) - chi vai tram ca co co nay.
CREATE INDEX IF NOT EXISTS idx_case_theo_doi_doi_tra_1 ON case_dvbh (id) WHERE theo_doi_doi_tra = 1;
-- sqlite_stat1 cu (80k dong, bang that 147k) - cap nhat thong ke de planner uoc luong dung.
PRAGMA optimize;
