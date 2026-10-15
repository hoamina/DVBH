-- Toi uu D1 rows_read (ra soat 2026-10-15, wrangler d1 insights 7 ngay - xem nhat_ky_lam_viec.md).

-- GET /api/cases/:id (cases.ts) doc "SELECT ... FROM vi_pham_push_log WHERE case_id = ? AND
-- loai_su_kien = 'nghi_ngo_moi'" moi lan mo chi tiet ca - migration 0109 chi index vi_pham_id/
-- created_at nen moi lan quet het bang (~9k lan/tuan, 11,8M rows_read).
CREATE INDEX IF NOT EXISTS idx_vi_pham_push_log_case ON vi_pham_push_log (case_id, loai_su_kien);

-- Tab/badge "Cho QC" (survey.ts computeSurveyCounts/GET "/", notifications.ts choQc): idx_vi_pham_cho_qc
-- (migration 0001) loc chot_bo_cap_2 IS NULL AND ket_qua_cap_1 IS NOT NULL - khop gan HET bang (37k/38k
-- dong, gom ca "Khong loi"), nen thuc te van quet ca bang. Index partial nay them dieu kien != 'Khong loi'
-- -> chi con cac dong that su cho QC. Dieu kien WHERE phai giu NGUYEN VAN trong query de planner dung duoc.
CREATE INDEX IF NOT EXISTS idx_vi_pham_cho_qc_that ON vi_pham (case_id)
  WHERE ket_qua_cap_1 IS NOT NULL AND ket_qua_cap_1 != 'Khong loi' AND chot_bo_cap_2 IS NULL;

-- Tab "Vi pham da chot" (chot_bo_cap_2 = 1): ~50 dong nhung truoc day quet ca bang (~37k/lan).
CREATE INDEX IF NOT EXISTS idx_vi_pham_da_chot ON vi_pham (case_id) WHERE chot_bo_cap_2 = 1;
