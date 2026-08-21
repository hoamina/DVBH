-- ============================================================
-- Index cho loadGiamSatByKhuVucMap() (backend/src/lib/tranhChapTienTrinh.ts) - truoc day WHERE
-- vai_tro = 'Giam sat' AND trang_thai_duyet = 'Da duyet' AND bi_khoa = 0 phai quet TOAN BO bang
-- users (khong co index nao tren vai_tro), du ket qua tra ve chi vai dong. Chi con 1 diem goi con
-- lai (GET /tranh-chap/tien-trinh danh sach chung, cot "GS phu trach" trong TranhChapModule.tsx) sau
-- khi bo hoan toan diem goi N+1 tu CaseDetail.tsx (2026-08-20, xem tranhChap.ts nhanh case_id).
-- Partial index khop DUNG dieu kien WHERE thuc te, khong index du lieu khong can loc.
-- ============================================================
CREATE INDEX idx_users_giam_sat_active ON users (vai_tro) WHERE trang_thai_duyet = 'Da duyet' AND bi_khoa = 0;
