-- ============================================================
-- Bang dem ID tuan tu dung chung, thay the pattern "SELECT COUNT(*) FROM table"
-- moi lan sinh ID (ket_qua_goi/vi_pham) - pattern cu doc lai TOAN BO bang moi lan
-- ghi 1 dong, chi phi tang dan vo han theo thoi gian khi bang lon dan (O(n) moi insert).
-- Thay bang dem rieng + UPDATE ... RETURNING (atomic, O(1)) khong phu thuoc kich thuoc bang nguon.
-- ============================================================

CREATE TABLE id_counters (
    ten_bang         TEXT PRIMARY KEY,
    gia_tri_hien_tai INTEGER NOT NULL DEFAULT 0
);

INSERT INTO id_counters (ten_bang, gia_tri_hien_tai)
SELECT 'ket_qua_goi', COUNT(*) FROM ket_qua_goi
UNION ALL
SELECT 'vi_pham', COUNT(*) FROM vi_pham;
