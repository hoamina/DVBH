import { eligibleClause } from "./caLapEligible";
import { computeAndStoreHash } from "./contentHash";
import { dbGoc } from "./phamVi";
import { nowVN } from "./vnTime";

// Ten dong trong content_versions (dung chung co che voi contentHash.ts/staticListCache.ts da
// dung cho settings_ly_do/linh_kien) - client co the GET /api/ca-lap/version de biet danh sach
// "ca lap" (KHONG tinh trang thai giai trinh - xem comment ham ben duoi) co doi hay chua.
export const CA_LAP_SNAPSHOT_HASH_KEY = "ca_lap_snapshot";

// Ten dong RIENG trong content_versions dung lam "marker" cho luoi an toan cron (xem refreshCaLapTheoThayDoi
// ben duoi) - cot "hash" cua dong nay KHONG phai SHA-256 ma la chuoi MAX(updated_at) tho cua case_dvbh tai lan
// luoi an toan / tinh lai toan bo gan nhat - tan dung model bang co san (ten_bang/hash/updated_at).
const CA_LAP_SOURCE_MARKER_KEY = "ca-lap-source-max-updated";

// So serial / cau lenh o che do theo serial. Serial truyen qua json_each (1 bind) nen khong vuong gioi han 100 bind cua D1;
// 100 chi de gioi han khoi luong 1 cau.
const CHUNK_SIZE_SERI = 100;

/**
 * MAX(updated_at) cua case_dvbh = "dau van tay" re de biet tu lan truoc co ghi nao vao ca khong. 2 cau, ca 2 di qua index:
 * ca DA DONG qua idx_case_updated_at_closed (migration 0018, doc B-tree O(1)); ca DANG MO qua idx_case_ton (~1.700 dong) -
 * can ca ca dang mo vi 1 ca "mo lai" (import doi thoi_gian_hoan_thanh ve NULL) roi khoi chuoi lap cua serial do.
 */
async function getSourceMaxUpdated(db: D1Database): Promise<string | null> {
  const [dong, mo] = await db.batch<{ m: string | null }>([
    db.prepare(`SELECT MAX(updated_at) AS m FROM case_dvbh WHERE thoi_gian_hoan_thanh IS NOT NULL`),
    db.prepare(`SELECT MAX(updated_at) AS m FROM case_dvbh INDEXED BY idx_case_ton WHERE thoi_gian_hoan_thanh IS NULL`),
  ]);
  const a = dong.results[0]?.m ?? null;
  const b = mo.results[0]?.m ?? null;
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
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

// Loc + chuan hoa danh sach serial: bo rong, bo trung, bo serial qua ngan (<=4 ky tu) vi khong bao gio du dieu kien vao danh
// sach "ca lap" (xem length(c.seri_san_pham) > 4 ben duoi) - serial nhu vay khong can tinh lai.
function normalizeAffectedSerials(affectedSerials: string[]): string[] {
  return [...new Set(affectedSerials.map((s) => String(s).trim()).filter((s) => s.length > 4))];
}

/**
 * 1 cau UPDATE duy nhat ghi lai ca_lap_prior_id/ca_lap_prior_ht trong pham vi `phamViC` (dieu kien them tren bang case_dvbh
 * alias "c", rong = toan bo). SUA 2026-11-11 (ra soat tai du lieu): truoc day "xoa het roi ghi lai" -> moi lan tinh lai toan
 * bo ghi lai ~18,7k ca lap (+ index) du khong co gi doi. Gio:
 *   - ranked = LAG() theo serial (nhu cu) tren ca du dieu kien;
 *   - dich  = ca co prior moi + ca DANG co prior nhung khong con trong tap moi (-> NULL);
 *   - CHI ghi dong co gia tri khac hien tai (IS NOT so ca NULL), ca_lap_computed_at = luc gia tri doi.
 * Doc va ghi trong cung 1 cau nen khong co trang thai trung gian (bug 2026-10-20 "Ca lap trong roi lai ra" khong tai dien).
 */
function buildCapNhatSql(phamViC: string, now: string): string {
  const phamViGoc = phamViC.replace(/\bc\./g, "");
  return `
    WITH ranked AS (
      SELECT c.id,
        LAG(c.thoi_gian_hoan_thanh) OVER (PARTITION BY c.seri_san_pham ORDER BY c.thoi_gian_hoan_thanh ASC, c.id ASC) AS prior_ht,
        LAG(c.id) OVER (PARTITION BY c.seri_san_pham ORDER BY c.thoi_gian_hoan_thanh ASC, c.id ASC) AS prior_id
      FROM case_dvbh c
      WHERE c.thoi_gian_hoan_thanh IS NOT NULL
        AND c.seri_san_pham IS NOT NULL AND length(c.seri_san_pham) > 4${phamViC}
        AND NOT EXISTS (
          SELECT 1 FROM blacklist_serial b
          WHERE b.seri_san_pham = UPPER(TRIM(c.seri_san_pham)) AND b.bat_tat = 1
        )${eligibleClause("c.")}
    ),
    moi AS (SELECT id, prior_id, prior_ht FROM ranked WHERE prior_ht IS NOT NULL),
    dich AS (
      SELECT id, prior_id, prior_ht FROM moi
      UNION ALL
      SELECT id, NULL, NULL FROM case_dvbh
      WHERE ca_lap_prior_ht IS NOT NULL${phamViGoc} AND id NOT IN (SELECT id FROM moi)
    )
    UPDATE case_dvbh
    SET ca_lap_prior_id = dich.prior_id, ca_lap_prior_ht = dich.prior_ht, ca_lap_computed_at = '${now}'
    FROM dich
    WHERE case_dvbh.id = dich.id
      AND (case_dvbh.ca_lap_prior_id IS NOT dich.prior_id OR case_dvbh.ca_lap_prior_ht IS NOT dich.prior_ht)`;
}

/** Hash danh sach ca lap (id/prior_id/prior_ht - KHONG gom trang thai giai trinh) - client so voi GET /api/ca-lap/version. */
async function capNhatHash(db: D1Database, coThayDoi: boolean): Promise<string> {
  if (!coThayDoi) {
    const row = await db.prepare("SELECT hash FROM content_versions WHERE ten_bang = ?").bind(CA_LAP_SNAPSHOT_HASH_KEY).first<{ hash: string }>();
    if (row) return row.hash; // khong dong nao doi -> hash giu nguyen, khong doc lai ~18,7k ca lap
  }
  const { results: snapshot } = await db
    .prepare(
      `SELECT id, ca_lap_prior_id, ca_lap_prior_ht FROM case_dvbh
       WHERE ca_lap_prior_ht IS NOT NULL ORDER BY id`,
    )
    .all();
  return computeAndStoreHash(db, CA_LAP_SNAPSHOT_HASH_KEY, snapshot);
}

async function tinhTheoSerial(db: D1Database, serials: string[], now: string): Promise<number> {
  let updated = 0;
  for (let i = 0; i < serials.length; i += CHUNK_SIZE_SERI) {
    const chunk = serials.slice(i, i + CHUNK_SIZE_SERI);
    const r = await db
      .prepare(buildCapNhatSql(" AND c.seri_san_pham IN (SELECT value FROM json_each(?))", now))
      .bind(JSON.stringify(chunk), JSON.stringify(chunk))
      .run();
    updated += r.meta.changes ?? 0;
  }
  return updated;
}

/**
 * Tinh lai cot ca_lap_prior_id/ca_lap_prior_ht cua case_dvbh (migration 0017, xem routes/caLap.ts CA_LAP_CTE_BODY).
 *
 * - CO truyen affectedSerials (import/dong bo, huy/bo huy ca): chi tinh lai cac serial do - LAG() PARTITION BY seri_san_pham
 *   nen ket qua 1 serial khong phu thuoc serial khac, giong het tinh toan bo cho cac serial nay. Danh sach rong sau khi loc
 *   (vd moi ca deu khong co serial) = KHONG CO GI de tinh (SUA 2026-11-11: truoc day roi vao nhanh tinh lai toan bo ~1 trieu
 *   dong doc).
 * - KHONG truyen: tinh lai toan bo (LAG tren moi ca da dong) - chi danh cho thay doi khong khoanh duoc theo serial: blacklist
 *   (serial luu da chuan hoa UPPER/TRIM, khac gia tri tho trong case_dvbh), cai dat "loai yeu cau bo qua lap", lan dau chua
 *   co hash, luoi an toan chua co marker. Cap nhat marker (xem refreshCaLapTheoThayDoi).
 *
 * Luon chay tren DB goc (dbGoc): cot ca_lap_* dung chung moi pham vi; D1 "boc" theo nuoc (lib/phamVi.ts) se loc ca nuoc khac
 * khoi tap tinh (vd 1 Giam sat chi co quyen VN them blacklist -> truoc day xoa sach ca lap cua nuoc khac).
 */
export async function refreshCaLapPrecompute(
  dbVao: D1Database,
  affectedSerials?: string[],
): Promise<{ updated: number; hash: string }> {
  const db = dbGoc(dbVao);
  const now = nowVN();
  if (affectedSerials) {
    const serials = normalizeAffectedSerials(affectedSerials);
    const updated = serials.length ? await tinhTheoSerial(db, serials, now) : 0;
    return { updated, hash: await capNhatHash(db, updated > 0) };
  }
  const sourceMaxUpdated = await getSourceMaxUpdated(db);
  const r = await db.prepare(buildCapNhatSql("", now)).run();
  const updated = r.meta.changes ?? 0;
  const hash = await capNhatHash(db, updated > 0);
  if (sourceMaxUpdated !== null) await writeSourceMarker(db, sourceMaxUpdated);
  return { updated, hash };
}

/**
 * Luoi an toan cron (index.ts viecNangBuoiTrua): bat cac thay doi ma duong ghi nao do quen tinh lai ca lap. SUA 2026-11-11: truoc
 * day thay MAX(updated_at) doi la tinh lai TOAN BO (~1 trieu dong doc, ~3 s); gio chi tinh lai SERIAL cua cac ca co updated_at
 * moi hon marker (doc qua 2 index updated_at/ca dang mo), roi day marker len. Chua co marker -> tinh lai toan bo 1 lan.
 * Marker chi do luoi an toan va tinh lai toan bo cap nhat (import tinh theo serial KHONG day marker, de luoi an toan khong bo
 * sot ca do duong ghi khac sua truoc luc import).
 */
export async function refreshCaLapTheoThayDoi(dbVao: D1Database): Promise<{ soSerial: number; updated: number }> {
  const db = dbGoc(dbVao);
  const [marker, hienTai] = await Promise.all([readSourceMarker(db), getSourceMaxUpdated(db)]);
  if (hienTai === null) return { soSerial: 0, updated: 0 };
  if (marker === null) {
    const { updated } = await refreshCaLapPrecompute(db);
    return { soSerial: -1, updated };
  }
  if (marker >= hienTai) return { soSerial: 0, updated: 0 };
  const [dong, mo] = await db.batch<{ s: string | null }>([
    db
      .prepare(
        `SELECT DISTINCT seri_san_pham AS s FROM case_dvbh
         WHERE thoi_gian_hoan_thanh IS NOT NULL AND updated_at > ? AND updated_at <= ?`,
      )
      .bind(marker, hienTai),
    db
      .prepare(
        `SELECT DISTINCT seri_san_pham AS s FROM case_dvbh INDEXED BY idx_case_ton
         WHERE thoi_gian_hoan_thanh IS NULL AND updated_at > ? AND updated_at <= ?`,
      )
      .bind(marker, hienTai),
  ]);
  const serials = normalizeAffectedSerials([...dong.results, ...mo.results].map((r) => r.s ?? ""));
  const { updated } = await refreshCaLapPrecompute(db, serials);
  await writeSourceMarker(db, hienTai);
  return { soSerial: serials.length, updated };
}
