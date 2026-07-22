-- ============================================================
-- Ho tro GET /api/cases/data-version: MAX(updated_at) tren cac ca DA DONG, dung lam tin hieu re de
-- "Ca luu tru" (ClosedCasesTab.tsx) tu dong biet cache IndexedDB tren may co con moi khong, thay vi
-- nguoi dung phai tu bam "Dong bo lai" thu cong. Index rieng (khong dung chung idx_case_hoan_thanh_
-- not_null vi cot khac) de SQLite tra loi MAX(updated_at) bang 1 lan doc B-tree, khong quet bang.
-- ============================================================

CREATE INDEX idx_case_updated_at_closed ON case_dvbh (updated_at) WHERE thoi_gian_hoan_thanh IS NOT NULL;
