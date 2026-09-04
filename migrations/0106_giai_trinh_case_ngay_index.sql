-- ============================================================
-- CHOT 2026-09-04: index composite cho giai_trinh dung dung thu tu ROW_NUMBER() OVER (PARTITION BY
-- case_id ORDER BY ngay_giai_trinh DESC, id DESC) - pattern nay lap lai o nhieu noi (needGiaiTrinh.ts
-- latestGiaiTrinhJoin(), missingParts.ts baseJoin()...) de lay giai trinh MOI NHAT/case. Truoc day chi
-- co idx_giai_trinh_case (case_id don le, migration 0001) nen SQLite phai tu sort trong bo nho de xac
-- dinh thu tu trong tung partition; composite index nay cho phep doc thang theo dung thu tu can, bo
-- buoc sort rieng - dieu tra "Ca thieu linh kien > Danh sach chi tiet" bi lag (nhat_ky_lam_viec.md
-- 2026-09-04).
-- ============================================================
CREATE INDEX idx_giai_trinh_case_ngay ON giai_trinh (case_id, ngay_giai_trinh DESC, id DESC);
