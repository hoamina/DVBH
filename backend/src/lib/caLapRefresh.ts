import { eligibleClause } from "./caLapEligible";

/**
 * Tinh lai toan bo cot ca_lap_prior_id/ca_lap_prior_ht cua case_dvbh (xem migrations/0017 +
 * comment o routes/caLap.ts CA_LAP_CTE_BODY) - goi dinh ky tu Cron Trigger (backend/src/index.ts
 * scheduled()), KHONG goi tu request nguoi dung.
 *
 * 2 buoc:
 *  1. Xoa het gia tri cu (phong truong hop 1 case truoc day co "prior" nhung nay khong con dieu
 *     kien nua - vd serial vua bi blacklist, hoac tien_do_hoan_thanh vua doi khac "Hoan thanh
 *     XLSC" - neu khong xoa truoc, dong do se giu gia tri CU mai mai vi UPDATE...FROM ben duoi chi
 *     dat lai gia tri cho cac dong CO trong tap "ranked" moi, khong tu xoa dong da rot ra ngoai).
 *  2. Tinh lai LAG() 1 lan duy nhat (dung window function - cham nhung CHI CHAY O DAY, khong o
 *     moi request), ghi ket qua vao case_dvbh qua UPDATE ... FROM (SQLite 3.33+, D1 ho tro).
 */
export async function refreshCaLapPrecompute(db: D1Database): Promise<{ cleared: number; updated: number }> {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  const clearResult = await db
    .prepare(
      `UPDATE case_dvbh SET ca_lap_prior_id = NULL, ca_lap_prior_ht = NULL, ca_lap_computed_at = ?
       WHERE ca_lap_prior_ht IS NOT NULL`,
    )
    .bind(now)
    .run();

  const updateResult = await db
    .prepare(
      `WITH ranked AS (
         SELECT c.id,
           LAG(c.thoi_gian_hoan_thanh) OVER (PARTITION BY c.seri_san_pham ORDER BY c.thoi_gian_hoan_thanh ASC, c.id ASC) AS prior_ht,
           LAG(c.id) OVER (PARTITION BY c.seri_san_pham ORDER BY c.thoi_gian_hoan_thanh ASC, c.id ASC) AS prior_id
         FROM case_dvbh c
         WHERE c.thoi_gian_hoan_thanh IS NOT NULL
           AND c.seri_san_pham IS NOT NULL AND length(c.seri_san_pham) > 4
           AND NOT EXISTS (
             SELECT 1 FROM blacklist_serial b
             WHERE b.seri_san_pham = UPPER(TRIM(c.seri_san_pham)) AND b.bat_tat = 1
           )${eligibleClause("c.")}
       )
       UPDATE case_dvbh
       SET ca_lap_prior_id = ranked.prior_id, ca_lap_prior_ht = ranked.prior_ht, ca_lap_computed_at = '${now}'
       FROM ranked
       WHERE case_dvbh.id = ranked.id AND ranked.prior_ht IS NOT NULL`,
    )
    .run();

  return { cleared: clearResult.meta.changes ?? 0, updated: updateResult.meta.changes ?? 0 };
}
