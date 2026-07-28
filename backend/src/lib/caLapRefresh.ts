import { eligibleClause } from "./caLapEligible";
import { computeAndStoreHash } from "./contentHash";
import { nowVN } from "./vnTime";

// Ten dong trong content_versions (dung chung co che voi contentHash.ts/staticListCache.ts da
// dung cho settings_ly_do/linh_kien) - client co the GET /api/ca-lap/version de biet danh sach
// "ca lap" (KHONG tinh trang thai giai trinh - xem comment ham ben duoi) co doi hay chua.
export const CA_LAP_SNAPSHOT_HASH_KEY = "ca_lap_snapshot";

// Ten dong RIENG trong content_versions dung lam "marker" cho guard cron (xem shouldSkipCronRefresh
// ben duoi) - KHONG dung chung dong voi CA_LAP_SNAPSHOT_HASH_KEY vi khac ban chat: cot "hash" cua
// dong nay KHONG phai hash SHA-256 ma la chuoi MAX(updated_at) tho, chi de so sanh bang chuoi (==)
// giua 2 lan refresh - tan dung lai model bang co san (ten_bang/hash/updated_at) thay vi tao bang moi.
const CA_LAP_SOURCE_MARKER_KEY = "ca-lap-source-max-updated";

const CHUNK_SIZE_SERI = 100; // an toan voi gioi han bind-param cua SQLite, giong CHUNK_SIZE_SELECT o lib/importProcessor.ts

/** MAX(updated_at) tren cac ca DA DONG - di qua idx_case_updated_at_closed (migration 0018), SQLite
 * tra loi qua doc B-tree (O(1)) khong quet toan bang. Dung lam "dau van tay" re de biet du lieu
 * nguon co doi tu lan refresh truoc hay khong (xem shouldSkipCronRefresh). */
async function getSourceMaxUpdated(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare(`SELECT MAX(updated_at) as max_updated FROM case_dvbh WHERE thoi_gian_hoan_thanh IS NOT NULL`)
    .first<{ max_updated: string | null }>();
  return row?.max_updated ?? null;
}

async function readSourceMarker(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare("SELECT hash FROM content_versions WHERE ten_bang = ?")
    .bind(CA_LAP_SOURCE_MARKER_KEY)
    .first<{ hash: string }>();
  return row?.hash ?? null;
}

async function writeSourceMarker(db: D1Database, value: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO content_versions (ten_bang, hash, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(ten_bang) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at`,
    )
    .bind(CA_LAP_SOURCE_MARKER_KEY, value, nowVN())
    .run();
}

/**
 * Guard danh RIENG cho Cron Trigger (backend/src/index.ts scheduled()) - luoi an toan du phong, xem
 * comment refreshCaLapPrecompute ben duoi. Luong import/blacklist LUON biet chac du lieu vua doi
 * (chinh no vua ghi) nen KHONG can qua guard nay, goi thang refreshCaLapPrecompute.
 *
 * So sanh MAX(updated_at) hien tai cua cac ca da dong voi marker luu tu lan refresh truoc (xem
 * writeSourceMarker). Neu KHONG doi tuc la khong co ghi du lieu nao (import/dong bo/sua ca) xay ra
 * ke tu lan refresh truoc -> khong co gi de tinh lai, tra ve true de cron bo qua het buoc quet/ghi
 * ton kem (clear + CTE LAG() + SELECT hash).
 */
export async function shouldSkipCronRefresh(db: D1Database): Promise<boolean> {
  const current = await getSourceMaxUpdated(db);
  if (current === null) return false; // chua co ca nao dong - de refreshCaLapPrecompute tu chay (ket qua rong) thay vi doan mo
  const marker = await readSourceMarker(db);
  return marker !== null && marker === current;
}

// Loc + chuan hoa danh sach serial "bi anh huong" truyen vao tu import/blacklist: bo rong, bo trung,
// bo serial qua ngan (<=4 ky tu) vi khong bao gio du dieu kien vao danh sach "ca lap" (xem WHERE
// length(c.seri_san_pham) > 4 ben duoi) - serial nhu vay khong can tinh lai. Tra ve null khi danh
// sach rong sau loc (hoac caller khong truyen gi) de bao hieu "khong xac dinh duoc pham vi -> full
// recompute", giong dung tinh than luoi an toan cua ham nay.
function normalizeAffectedSerials(affectedSerials?: string[]): string[] | null {
  if (!affectedSerials || affectedSerials.length === 0) return null;
  const filtered = [...new Set(affectedSerials.map((s) => String(s).trim()).filter((s) => s.length > 4))];
  return filtered.length > 0 ? filtered : null;
}

// Than CTE LAG() dung chung cho ca 2 che do (full/incremental) - `extraWhere` la dieu kien loc pham
// vi serial (rong o che do full). Tach ham de khong lap code giua 2 nhanh trong refreshCaLapPrecompute.
function buildRankedCte(extraWhere: string): string {
  return `
    WITH ranked AS (
      SELECT c.id,
        LAG(c.thoi_gian_hoan_thanh) OVER (PARTITION BY c.seri_san_pham ORDER BY c.thoi_gian_hoan_thanh ASC, c.id ASC) AS prior_ht,
        LAG(c.id) OVER (PARTITION BY c.seri_san_pham ORDER BY c.thoi_gian_hoan_thanh ASC, c.id ASC) AS prior_id
      FROM case_dvbh c
      WHERE c.thoi_gian_hoan_thanh IS NOT NULL
        AND c.seri_san_pham IS NOT NULL AND length(c.seri_san_pham) > 4${extraWhere}
        AND NOT EXISTS (
          SELECT 1 FROM blacklist_serial b
          WHERE b.seri_san_pham = UPPER(TRIM(c.seri_san_pham)) AND b.bat_tat = 1
        )${eligibleClause("c.")}
    )`;
}

/**
 * Tinh lai toan bo / mot phan cot ca_lap_prior_id/ca_lap_prior_ht cua case_dvbh (xem migrations/0017 +
 * comment o routes/caLap.ts CA_LAP_CTE_BODY). Goi tu 3 noi:
 *  - NGAY SAU KHI IMPORT/DONG BO GHI DU LIEU MOI (importRoute.ts) - day la nguon chinh lam danh sach
 *    "ca lap" thay doi that su. Truyen kem affectedSerials (tap DISTINCT seri_san_pham cua cac dong
 *    GHI_MOI/GHI_DE, xem lib/importProcessor.ts) de chi tinh lai trong pham vi bi anh huong.
 *  - Cac thao tac blacklist (routes/caLap.ts) - LUON full recompute (khong truyen serials): blacklist
 *    luu serial da chuan hoa (trim + toUpperCase) con case_dvbh.seri_san_pham la gia tri tho, so khop
 *    IN theo gia tri tho se bo sot bien the viet thuong/thua khoang trang (NOT EXISTS trong CTE so
 *    sanh qua UPPER(TRIM(...))). Thao tac blacklist hiem nen chi phi nay chap nhan duoc.
 *  - Cron Trigger (backend/src/index.ts scheduled()) - CHI la luoi an toan du phong (vd 1 duong ghi
 *    du lieu nao khac quen goi truc tiep), duoc guard boi shouldSkipCronRefresh() truoc khi goi ham
 *    nay, va khi thuc su chay thi la FULL recompute (khong truyen affectedSerials) de lam dung nghia
 *    luoi an toan (bat duoc ca truong hop sot mat 1 nguon ghi khong xac dinh duoc serial).
 *
 * CHE DO INCREMENTAL (affectedSerials con lai sau loc, xem normalizeAffectedSerials): gioi han buoc 1
 * (xoa prior cu) va buoc 2 (CTE LAG()) vao dung cac serial trong danh sach, chunk 100 serial/cau
 * (giong pattern IN-chunk o lib/importProcessor.ts) vi LAG() PARTITION BY seri_san_pham nen ket qua
 * trong 1 serial KHONG BAO GIO phu thuoc du lieu cua serial khac - gioi han pham vi nay AN TOAN VE
 * LOGIC (ket qua giong het full recompute cho cac serial trong pham vi) nhung it rows-read hon nhieu.
 * Buoc 3 (tinh hash) van SELECT toan bo tap "lap" hien co (tap nay von da nho, di qua
 * idx_case_ca_lap_prior_ht) de hash luon phan anh dung TOAN BO danh sach hien tai, khong chi phan
 * vua doi.
 *
 * Neu KHONG truyen affectedSerials (hoac sau loc con rong) -> FULL recompute nhu truoc day: 3 buoc:
 *  1. Xoa het gia tri cu (phong truong hop 1 case truoc day co "prior" nhung nay khong con dieu
 *     kien nua - vd serial vua bi blacklist, hoac tien_do_hoan_thanh vua doi khac "Hoan thanh
 *     XLSC" - neu khong xoa truoc, dong do se giu gia tri CU mai mai vi UPDATE...FROM ben duoi chi
 *     dat lai gia tri cho cac dong CO trong tap "ranked" moi, khong tu xoa dong da rot ra ngoai).
 *  2. Tinh lai LAG() 1 lan duy nhat (dung window function - cham nhung CHI CHAY O DAY, khong o
 *     moi request), ghi ket qua vao case_dvbh qua UPDATE ... FROM (SQLite 3.33+, D1 ho tro).
 *  3. Dong ma hash cua danh sach "ca lap" vua tinh (CHI gom id/prior_id/prior_ht - KHONG gom trang
 *     thai giai trinh, vi trang thai doi lien tuc moi khi GS/QC xu ly xong 1 ca, se lam hash doi
 *     qua thuong xuyen neu gom vao, mat het loi ich cache).
 *
 * Sau khi xong (ca 2 che do), cap nhat lai marker MAX(updated_at) (xem shouldSkipCronRefresh) de cac
 * lan cron sau biet du lieu nguon da duoc "bat kip" den dau - chup gia tri NGAY TU DAU ham (truoc khi
 * ghi cac cot ca_lap_*), vi cac buoc ghi cua chinh ham nay KHONG dong cham cot updated_at nen chup
 * truoc/sau deu tuong duong ve mat gia tri, chup truoc de an toan hon voi du lieu moi ghi vao GIUA
 * luc ham dang chay (se bi cron lan sau bat lai, khong bo sot).
 */
export async function refreshCaLapPrecompute(
  db: D1Database,
  affectedSerials?: string[],
): Promise<{ cleared: number; updated: number; hash: string }> {
  const now = nowVN();
  const sourceMaxUpdated = await getSourceMaxUpdated(db);
  const serials = normalizeAffectedSerials(affectedSerials);

  let cleared = 0;
  let updated = 0;

  if (serials) {
    for (let i = 0; i < serials.length; i += CHUNK_SIZE_SERI) {
      const chunk = serials.slice(i, i + CHUNK_SIZE_SERI);
      const placeholders = chunk.map(() => "?").join(", ");

      const clearResult = await db
        .prepare(
          `UPDATE case_dvbh SET ca_lap_prior_id = NULL, ca_lap_prior_ht = NULL, ca_lap_computed_at = ?
           WHERE ca_lap_prior_ht IS NOT NULL AND seri_san_pham IN (${placeholders})`,
        )
        .bind(now, ...chunk)
        .run();
      cleared += clearResult.meta.changes ?? 0;

      const updateResult = await db
        .prepare(
          `${buildRankedCte(`\n        AND c.seri_san_pham IN (${placeholders})`)}
           UPDATE case_dvbh
           SET ca_lap_prior_id = ranked.prior_id, ca_lap_prior_ht = ranked.prior_ht, ca_lap_computed_at = '${now}'
           FROM ranked
           WHERE case_dvbh.id = ranked.id AND ranked.prior_ht IS NOT NULL`,
        )
        .bind(...chunk)
        .run();
      updated += updateResult.meta.changes ?? 0;
    }
  } else {
    const clearResult = await db
      .prepare(
        `UPDATE case_dvbh SET ca_lap_prior_id = NULL, ca_lap_prior_ht = NULL, ca_lap_computed_at = ?
         WHERE ca_lap_prior_ht IS NOT NULL`,
      )
      .bind(now)
      .run();
    cleared = clearResult.meta.changes ?? 0;

    const updateResult = await db
      .prepare(
        `${buildRankedCte("")}
         UPDATE case_dvbh
         SET ca_lap_prior_id = ranked.prior_id, ca_lap_prior_ht = ranked.prior_ht, ca_lap_computed_at = '${now}'
         FROM ranked
         WHERE case_dvbh.id = ranked.id AND ranked.prior_ht IS NOT NULL`,
      )
      .run();
    updated = updateResult.meta.changes ?? 0;
  }

  const { results: snapshot } = await db
    .prepare(
      `SELECT id, ca_lap_prior_id, ca_lap_prior_ht FROM case_dvbh
       WHERE ca_lap_prior_ht IS NOT NULL ORDER BY id`,
    )
    .all();
  const hash = await computeAndStoreHash(db, CA_LAP_SNAPSHOT_HASH_KEY, snapshot);

  if (sourceMaxUpdated !== null) await writeSourceMarker(db, sourceMaxUpdated);

  return { cleared, updated, hash };
}
