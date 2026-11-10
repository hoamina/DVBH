-- Bo idx_case_archived_at (tao o 0002) - 2026-11-10. Code chi loc "archived_at IS NULL" (khong co truy van theo gia tri
-- archived_at), nhung sqlite_stat1 ghi "146978 305" -> planner tuong "archived_at IS NULL" chi ~305 ca (thuc te ~77k ca
-- chua luu tru) va CHON index nay thay index theo ngay -> bao cao thang cu / Partner API "hoan thanh tu ngay" doc ~77k
-- dong thay vi ~23k / ~7k (do tren production). Khong co index nay, cac truy vấn "archived_at IS NULL" dung
-- idx_case_archive_pending (0019, partial WHERE archived_at IS NULL, theo thoi_gian_hoan_thanh) - da do: ket qua giong
-- het, doc 22.943 / 7.052 dong. Can khoi phuc: CREATE INDEX idx_case_archived_at ON case_dvbh (archived_at);
DROP INDEX IF EXISTS idx_case_archived_at;
