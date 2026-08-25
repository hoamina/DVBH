-- Cache cac gia tri cua LOG MOI NHAT thang len tranh_chap_tien_trinh (CHOT 2026-08-22, theo phan hoi
-- nguoi dung ve chi phi D1 tang VO HAN theo lich su: bang nay khong co archive, cac cau thong ke/bao
-- cao (computeTienTrinhStats, computeDoiMayTheoKhuVuc, /tai-khoan-ton) truoc day phai CROSS JOIN +
-- subquery sang tranh_chap_log cho MOI dong de biet trang thai - quet toan bo lich su du so ca DANG
-- MO thuc te luon gioi han ~200-300 (xem do that: 268 dong hien co, 265 dong tao rieng thang 8/2026,
-- quet full = 1.6k rows_read/lan, se tang len ~40-60k rows_read sau 2-3 nam neu khong sua).
--
-- VAN la CACHE, KHONG thay doi nguyen tac "tranh_chap_log la nguon goc du lieu" (migration
-- 0035_tranh_chap_tien_trinh.sql) - danh sach chi tiet/tien trinh (GET /tien-trinh, TienTrinhPanel)
-- VAN doc truc tiep tu tranh_chap_log nhu cu, KHONG dung cac cot cache nay. Cac cot duoi day CHI
-- duoc doc boi 3 ham thong ke/bao cao noi tren, dong bo tai DUNG 3 diem ghi log hien co: POST
-- /:caseId/tiep-nhan, POST /tien-trinh/:id/log, PATCH /log/:id (+ import hang loat POST
-- /import/commit) - xem routes/tranhChap.ts.
--
-- "dang_mo": 1 neu trang_thai_hien_tai KHONG thuoc TRANH_CHAP_TRANG_THAI_DONG, dung lam dieu kien
-- loc SOM (truoc khi JOIN case_dvbh/tranh_chap_log) qua partial index ben duoi - day la phan quan
-- trong nhat, giai quyet dung van de "quet toan bo lich su".
-- "log_created_at_hien_tai": copy tranh_chap_log.created_at (cot audit RAW UTC, KHAC cac cot
-- nghiep vu VN-local con lai trong bang nay) - KHONG doi khi log bi SUA (PATCH /log/:id, van la
-- CHINH log do, khong phai log moi) - chi doi khi co 1 log MOI duoc tao.
ALTER TABLE tranh_chap_tien_trinh ADD COLUMN dang_mo INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tranh_chap_tien_trinh ADD COLUMN trang_thai_hien_tai TEXT;
ALTER TABLE tranh_chap_tien_trinh ADD COLUMN thoi_gian_du_kien_xong_hien_tai TEXT;
ALTER TABLE tranh_chap_tien_trinh ADD COLUMN log_created_at_hien_tai TEXT;
ALTER TABLE tranh_chap_tien_trinh ADD COLUMN nguoi_xu_ly_hien_tai TEXT;
ALTER TABLE tranh_chap_tien_trinh ADD COLUMN dang_cho_nguoi_xu_ly_hien_tai TEXT;

-- Backfill tu du lieu THAT hien co (re - vai tram dong tai thoi diem viet migration nay).
UPDATE tranh_chap_tien_trinh
SET
  trang_thai_hien_tai = (SELECT trang_thai_xu_ly FROM tranh_chap_log WHERE tien_trinh_id = tranh_chap_tien_trinh.id ORDER BY id DESC LIMIT 1),
  thoi_gian_du_kien_xong_hien_tai = (SELECT thoi_gian_du_kien_xong FROM tranh_chap_log WHERE tien_trinh_id = tranh_chap_tien_trinh.id ORDER BY id DESC LIMIT 1),
  log_created_at_hien_tai = (SELECT created_at FROM tranh_chap_log WHERE tien_trinh_id = tranh_chap_tien_trinh.id ORDER BY id DESC LIMIT 1),
  nguoi_xu_ly_hien_tai = (SELECT nguoi_xu_ly FROM tranh_chap_log WHERE tien_trinh_id = tranh_chap_tien_trinh.id ORDER BY id DESC LIMIT 1),
  dang_cho_nguoi_xu_ly_hien_tai = (SELECT dang_cho_nguoi_xu_ly FROM tranh_chap_log WHERE tien_trinh_id = tranh_chap_tien_trinh.id ORDER BY id DESC LIMIT 1);

UPDATE tranh_chap_tien_trinh
SET dang_mo = CASE
  WHEN trang_thai_hien_tai IN ('Giam sat dong hoan thanh', 'Giam sat dong that bai', 'CSKH khong can xu ly', 'CSKH xu ly xong') THEN 0
  ELSE 1
END;

CREATE INDEX idx_tctt_dang_mo ON tranh_chap_tien_trinh (id) WHERE dang_mo = 1;
