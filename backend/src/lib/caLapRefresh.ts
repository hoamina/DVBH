import { eligibleClause } from "./caLapEligible";
import { computeAndStoreHash } from "./contentHash";

// Ten dong trong content_versions (dung chung co che voi contentHash.ts/staticListCache.ts da
// dung cho settings_ly_do/linh_kien) - client co the GET /api/ca-lap/version de biet danh sach
// "ca lap" (KHONG tinh trang thai giai trinh - xem comment ham ben duoi) co doi hay chua.
export const CA_LAP_SNAPSHOT_HASH_KEY = "ca_lap_snapshot";

/**
 * Tinh lai toan bo cot ca_lap_prior_id/ca_lap_prior_ht cua case_dvbh (xem migrations/0017 +
 * comment o routes/caLap.ts CA_LAP_CTE_BODY). Goi tu 2 noi:
 *  - NGAY SAU KHI IMPORT/DONG BO GHI DU LIEU MOI (importRoute.ts) - day la nguon duy nhat lam
 *    danh sach "ca lap" thay doi that su, nen day la luc CAN tinh lai, khong doi den gio.
 *  - Cron Trigger (backend/src/index.ts scheduled()) - CHI la luoi an toan du phong (vd 1 duong
 *    ghi du lieu nao khac quen goi truc tiep), khong phai co che chinh nua.
 *
 * Nguyen tac: sau khi tinh xong danh sach "ca lap" (buoc 1+2), CAC LUOT XEM SAU DO (module Ca lap,
 * badge thong bao, banner Dashboard) chi doc lai danh sach nay qua index (khong quet lai), va
 * TRANG THAI xu ly (chot_danh_gia_lap/qc_chot) luon lay song song qua JOIN gia_trinh_lap theo ID -
 * bang nho, khong nam trong pham vi "tinh lai" nay.
 *
 * 3 buoc:
 *  1. Xoa het gia tri cu (phong truong hop 1 case truoc day co "prior" nhung nay khong con dieu
 *     kien nua - vd serial vua bi blacklist, hoac tien_do_hoan_thanh vua doi khac "Hoan thanh
 *     XLSC" - neu khong xoa truoc, dong do se giu gia tri CU mai mai vi UPDATE...FROM ben duoi chi
 *     dat lai gia tri cho cac dong CO trong tap "ranked" moi, khong tu xoa dong da rot ra ngoai).
 *  2. Tinh lai LAG() 1 lan duy nhat (dung window function - cham nhung CHI CHAY O DAY, khong o
 *     moi request), ghi ket qua vao case_dvbh qua UPDATE ... FROM (SQLite 3.33+, D1 ho tro).
 *  3. Dong ma hash cua danh sach "ca lap" vua tinh (CHI gom id/prior_id/prior_ht - KHONG gom trang
 *     thai giai trinh, vi trang thai doi lien tuc moi khi GS/QC xu ly xong 1 ca, se lam hash doi
 *     qua thuong xuyen neu gom vao, mat het loi ich cache).
 */
export async function refreshCaLapPrecompute(db: D1Database): Promise<{ cleared: number; updated: number; hash: string }> {
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

  const { results: snapshot } = await db
    .prepare(
      `SELECT id, ca_lap_prior_id, ca_lap_prior_ht FROM case_dvbh
       WHERE ca_lap_prior_ht IS NOT NULL ORDER BY id`,
    )
    .all();
  const hash = await computeAndStoreHash(db, CA_LAP_SNAPSHOT_HASH_KEY, snapshot);

  return { cleared: clearResult.meta.changes ?? 0, updated: updateResult.meta.changes ?? 0, hash };
}
