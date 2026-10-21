/**
 * "Canh bao ton cap 2 (CEO)" -> cong vao "Tong can giai trinh" cua Giam sat (CHOT 2026-10-20, chu he thong).
 *
 * - CA 5 chi tieu cap 2 (lib/canhBaoTon.ts: ton20 / vipSvip7 / locTong5 / tranhChap5 / luongDoiTra10) chot 08:00 duoc
 *   GOP (union, khong trung) vao bucket tonCanGiaiTrinh (+ tonCanGiaiTrinhByKhuVuc) cua MOI snapshot 08:00 hom nay, loc
 *   theo khu vuc cua tung scope (Giam sat chi nhan ca khu vuc minh). Vi moi so "can giai trinh" (the 08:00, delta trong
 *   ngay, giai_trinh_daily_log 17h30, anh Telegram, badge menu, danh sach drill-down) deu doc CUNG tonCanGiaiTrinh, gop
 *   1 cho la tat ca cung cong theo.
 * - "Phai giai trinh moi ngay": ca cap 2 nam trong baseline MOI ngay no con o danh sach cap 2, bat ke giai trinh truoc do.
 * - "Da giai trinh" = co dong giai_trinh sau moc chot (nhu moi ca khac) HOAC co log tranh chap trong ngay: khi Giam sat
 *   cap nhat tien trinh / log con tranh chap cua ca cap 2 sau moc chot, autoLogGiaiTrinhQuaTranhChap() tu ghi 1 dong
 *   giai_trinh ly do "Giải trình qua tranh chấp" (migration 0140, nguoi ghi = nguoi viet log) - cung khuon voi
 *   lib/autoLogCaKetThuc.ts, de moi cong thuc dem "da giai trinh" khong phai sua.
 * - Thu tu cron 08:00: snapshot bao cao chay TRUOC Canh bao ton, nen sau khi chot Canh bao ton (va moi lan thu lai luong
 *   doi tra thanh cong) goi boSungCap2VaoSnapshotHomNay() de BO SUNG id vao snapshot da co - KHONG tinh lai snapshot (tinh
 *   lai giua ngay se lam baseline mat ca vua giai trinh). computeBacklogBuckets() cung goi hopCap2VaoBuckets() cho snapshot
 *   tu-heal sinh sau 08:00.
 * - Chi lay ca con trong view case_hieu_luc va chua archived (khop dieu kien danh sach drill-down "can giai trinh").
 */
import { dbGoc } from "./phamVi";
import { getVnDateStr } from "./reportCache";
import { nowVN } from "./vnTime";
import { KHU_VUC_AN_KHOI_BAO_CAO } from "./filterParams";
import { bumpVersions } from "./dataVersions";

export const CAP2_KEYS = ["ton20", "vipSvip7", "locTong5", "tranhChap5", "luongDoiTra10"] as const;
// 2 chi tieu KHONG doi hoi ca con ton (ca da dong nhung tranh chap / luong doi tra con treo) - autoLogCaKetThuc khong duoc
// tu "giai trinh ho" khi ca dong trong ngay.
export const CAP2_KHONG_THEO_TON_KEYS = ["tranhChap5", "luongDoiTra10"] as const;
export const LY_DO_QUA_TRANH_CHAP = "Giải trình qua tranh chấp";
const CANH_BAO_SCOPE_KEY = "canh_bao_ton|all";

interface BucketLike {
  ids: string[];
  count: number;
}
interface BacklogLike {
  tonCanGiaiTrinh: BucketLike;
  tonCanGiaiTrinhByKhuVuc: Record<string, BucketLike>;
  // Tap ca cap 2 trong pham vi snapshot (ke ca ca von da co trong tonCanGiaiTrinh) - the "CEO cần giải trình" (2026-10-21).
  canhBaoCap2?: BucketLike;
}

/** Ca cap 2 cua snapshot Canh bao ton ngay "ngay" (bo bucket dang loi - luong doi tra chua chot duoc) kem khu_vuc hien tai. */
export async function layCap2(db: D1Database, ngay: string): Promise<{ id: string; khu_vuc: string }[]> {
  const row = await db
    .prepare("SELECT payload FROM daily_snapshot WHERE ngay = ? AND scope_key = ?")
    .bind(ngay, CANH_BAO_SCOPE_KEY)
    .first<{ payload: string }>();
  if (!row) return [];
  const buckets = JSON.parse(row.payload) as Record<string, { ids?: string[]; loi?: string } | undefined>;
  const ids = new Set<string>();
  for (const k of CAP2_KEYS) {
    const b = buckets[k];
    if (!b || b.loi) continue;
    for (const id of b.ids ?? []) ids.add(String(id));
  }
  if (ids.size === 0) return [];
  const { results } = await db
    .prepare(
      `SELECT CAST(c.id AS TEXT) AS id, c.khu_vuc AS khu_vuc FROM case_hieu_luc c
       WHERE c.id IN (SELECT value FROM json_each(?)) AND c.archived_at IS NULL AND c.khu_vuc IS NOT NULL`,
    )
    .bind(JSON.stringify([...ids]))
    .all<{ id: string; khu_vuc: string }>();
  return results.filter((r) => !KHU_VUC_AN_KHOI_BAO_CAO.includes(r.khu_vuc));
}

/** Gop ca cap 2 vao tonCanGiaiTrinh (+ByKhuVuc) va bucket rieng canhBaoCap2 cua 1 bucket set - khuVucList null = toan he
 * thong. Tra ve so id them moi (vao tonCanGiaiTrinh HOAC canhBaoCap2) - 0 = khong can ghi lai. */
export function hopCap2VaoBuckets(b: BacklogLike, cap2: { id: string; khu_vuc: string }[], khuVucList: string[] | null): number {
  const daCo = new Set(b.tonCanGiaiTrinh.ids.map(String));
  const ceo = (b.canhBaoCap2 ??= { ids: [], count: 0 });
  const daCoCeo = new Set(ceo.ids.map(String));
  let them = 0;
  for (const r of cap2) {
    if (khuVucList !== null && !khuVucList.includes(r.khu_vuc)) continue;
    if (!daCoCeo.has(r.id)) {
      daCoCeo.add(r.id);
      ceo.ids.push(r.id);
      them++;
    }
    if (daCo.has(r.id)) continue;
    daCo.add(r.id);
    b.tonCanGiaiTrinh.ids.push(r.id);
    const kv = (b.tonCanGiaiTrinhByKhuVuc[r.khu_vuc] ??= { ids: [], count: 0 });
    kv.ids.push(r.id);
    kv.count = kv.ids.length;
    them++;
  }
  b.tonCanGiaiTrinh.count = b.tonCanGiaiTrinh.ids.length;
  ceo.count = ceo.ids.length;
  return them;
}

// Pham vi khu vuc cua 1 scope_key snapshot (xem buildSnapshotScopeKey / buildKhuVucFilterScopeKey o dailySnapshot.ts).
function khuVucCuaScopeKey(scopeKey: string): string[] | null | undefined {
  if (scopeKey === "khac|all" || scopeKey === "qc|all") return null;
  if (scopeKey.startsWith("giam_sat|")) return scopeKey.slice("giam_sat|".length).split(",");
  if (scopeKey.startsWith("khu-vuc-loc|")) return [scopeKey.slice("khu-vuc-loc|".length)];
  return undefined; // scope khong phai bao cao giai trinh - bo qua
}

/** Bo sung ca cap 2 vao MOI snapshot bao cao 08:00 hom nay da co (giu nguyen generated_at = moc "since"). */
export async function boSungCap2VaoSnapshotHomNay(db: D1Database): Promise<number> {
  const ngay = getVnDateStr();
  const cap2 = await layCap2(db, ngay);
  if (cap2.length === 0) return 0;
  const { results } = await db
    .prepare("SELECT scope_key, payload FROM daily_snapshot WHERE ngay = ? AND scope_key NOT LIKE 'canh_bao_ton%'")
    .bind(ngay)
    .all<{ scope_key: string; payload: string }>();
  let tong = 0;
  const stmts: D1PreparedStatement[] = [];
  for (const r of results) {
    const khuVucList = khuVucCuaScopeKey(r.scope_key);
    if (khuVucList === undefined) continue;
    const payload = JSON.parse(r.payload) as Partial<BacklogLike>;
    if (!payload.tonCanGiaiTrinh || !payload.tonCanGiaiTrinhByKhuVuc) continue;
    const them = hopCap2VaoBuckets(payload as BacklogLike, cap2, khuVucList);
    if (them === 0) continue;
    tong += them;
    stmts.push(db.prepare("UPDATE daily_snapshot SET payload = ? WHERE ngay = ? AND scope_key = ?").bind(JSON.stringify(payload), ngay, r.scope_key));
  }
  for (let i = 0; i < stmts.length; i += 20) await db.batch(stmts.slice(i, i + 20));
  // Badge menu (notifications/count) cache theo domain "giai_trinh" - bump de tinh lai voi baseline moi.
  if (tong > 0) await bumpVersions(db, ["giai_trinh"]);
  return tong;
}

/** Tu ghi giai_trinh "Giải trình qua tranh chấp" cho ca cap 2 hom nay co log tranh chap (tien trinh hoac log con) sau moc
 * chot 08:00 ma chua co dong giai_trinh nao sau moc. Idempotent. Goi sau moi lan ghi log tranh chap + cron moi gio. */
export async function autoLogGiaiTrinhQuaTranhChap(dbIn: D1Database): Promise<number> {
  const db = dbGoc(dbIn);
  const ngay = getVnDateStr();
  const moc = await db
    .prepare("SELECT MIN(generated_at) AS since FROM daily_snapshot WHERE ngay = ? AND scope_key NOT LIKE 'canh_bao_ton%'")
    .bind(ngay)
    .first<{ since: string | null }>();
  if (!moc?.since) return 0;
  const cap2 = await layCap2(db, ngay);
  if (cap2.length === 0) return 0;
  // tranh_chap_log.created_at la UTC THAT (ngoai le duy nhat, xem nowUtcSqlite) - so voi moc VN da tru 7h; ngay_xu_ly co the
  // do nguoi dung nhap lui nen khong dung. tranh_chap_log_con.created_at la gio VN (nowVN).
  const { results } = await db
    .prepare(
      `WITH cap2 AS (SELECT value AS id FROM json_each(?1)),
            hd AS (
              SELECT tt.case_id AS case_id, l.nguoi_xu_ly AS nguoi, COALESCE(l.ghi_chu, l.trang_thai_xu_ly) AS noi_dung,
                     datetime(l.created_at, '+7 hours') AS luc
              FROM tranh_chap_log l JOIN tranh_chap_tien_trinh tt ON tt.id = l.tien_trinh_id
              WHERE tt.case_id IN (SELECT id FROM cap2) AND l.created_at > datetime(?2, '-7 hours')
              UNION ALL
              SELECT tt.case_id, lc.nguoi_ghi, lc.noi_dung, lc.created_at
              FROM tranh_chap_log_con lc JOIN tranh_chap_log l ON l.id = lc.tranh_chap_log_id
                JOIN tranh_chap_tien_trinh tt ON tt.id = l.tien_trinh_id
              WHERE tt.case_id IN (SELECT id FROM cap2) AND lc.created_at > ?2
            ),
            moi_nhat AS (SELECT case_id, nguoi, noi_dung, luc, ROW_NUMBER() OVER (PARTITION BY case_id ORDER BY luc DESC) AS rn FROM hd)
       SELECT CAST(m.case_id AS TEXT) AS case_id, m.nguoi, m.noi_dung, m.luc FROM moi_nhat m
       WHERE m.rn = 1 AND EXISTS (SELECT 1 FROM users u WHERE u.email = m.nguoi)
         AND NOT EXISTS (SELECT 1 FROM giai_trinh g WHERE g.case_id = m.case_id AND g.ngay_giai_trinh > ?2)`,
    )
    .bind(JSON.stringify(cap2.map((r) => r.id)), moc.since)
    .all<{ case_id: string; nguoi: string; noi_dung: string | null; luc: string }>();
  if (results.length === 0) return 0;
  const now = nowVN();
  const stmts = results.map((r) =>
    db
      .prepare(
        `INSERT INTO giai_trinh (id, case_id, ly_do_cham, noi_dung, linh_kien_thieu, ngay_du_kien_hoan_thanh,
           ngay_yeu_cau_co_hang, ma_xuat_hang_lien_quan, nguoi_giai_trinh, ngay_giai_trinh)
         VALUES (?, ?, ?, ?, '', '', '', '', ?, ?)
         ON CONFLICT(case_id, ly_do_cham, nguoi_giai_trinh, ngay_giai_trinh, noi_dung, linh_kien_thieu,
           ngay_du_kien_hoan_thanh, ngay_yeu_cau_co_hang, ma_xuat_hang_lien_quan) DO NOTHING`,
      )
      .bind(
        crypto.randomUUID(),
        r.case_id,
        LY_DO_QUA_TRANH_CHAP,
        `Hệ thống tự ghi từ log tranh chấp lúc ${r.luc}: ${(r.noi_dung ?? "").slice(0, 500)}`,
        r.nguoi,
        now,
      ),
  );
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  await bumpVersions(db, ["giai_trinh"]);
  return results.length;
}
