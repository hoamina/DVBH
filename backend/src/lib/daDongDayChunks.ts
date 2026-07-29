/**
 * Snapshot "ca da dong" tren R2, chia theo TUNG NGAY (khong phai ca thang) - xem
 * KE_HOACH_TOI_UU_D1.md + memory r2-json-write-trigger-rule.md. Nguyen tac chot voi chu he thong:
 *
 * 1. CHI duoc ghi/ghi de JSON len R2 qua recomputeDaDongDayChunks() - co 2 DIEM GOI duoc chot voi
 *    chu he thong (khong duoc them diem thu 3 ma khong hoi truoc):
 *      a. scheduleCaLapRefreshIfChanged() (routes/importRoute.ts) sau khi import commit/sync-sheet
 *         co GHI_MOI+GHI_DE>0 - diem goi CHINH, chay ngay sau khi biet chac ngay nao bi anh huong.
 *      b. selfHealDaDongDayChunks() (cuoi file nay) - luoi an toan du phong, chot 2026-07-29: goi
 *         tu cron hang gio (index.ts CA_LAP_REFRESH_CRON) de bat lai truong hop diem (a) lo mat 1
 *         lan (vd 1 tac vu nen khac trong cung dot loi/ngop tai nguyen, xem bg_error 2026-07-29) ma
 *         ngay bi anh huong sau do khong con bi dong tiep nen khong bao gio duoc tu dong bat lai.
 * 2. Moi file/ngay co hash SHA-256 luu trong da_dong_chunk_manifest (migration 0029) - client so
 *    hash cua minh voi hash server de biet ngay nao can tai lai.
 * 3. Rate-limit tai chunk theo tung file/ngay rieng - xem lib/r2DownloadRateLimit.ts, ap dung o
 *    noi goi (routes/cases.ts), khong phai trong file nay.
 * 4. Chunk theo NGAY (khop nhip "1 lan import/ngay") thay vi ca thang - moi lan import chi tinh lai
 *    DUNG nhung ngay trong affectedDates (xem lib/importProcessor.ts), khong dung ca thang.
 *
 * Noi dung 1 chunk CHI la cot case_dvbh THUAN (khong JOIN giai_trinh) - de hash/invalidate hoan toan
 * doc lap voi domain "giai_trinh" (von doi thuong xuyen do nguoi dung gui giai trinh don le, xem
 * routes/cases.ts POST /:id/giai-trinh). Phan "ly do/giai trinh gan nhat" tach rieng thanh
 * getDaDongReasons() - cache nho trong D1 qua cachedReport() co san (KHONG phai R2, khong thuoc
 * pham vi 4 nguyen tac tren).
 */
import type { Env } from "../types";
import { cachedReport, buildReportKey } from "./reportCache";
import { nowVN } from "./vnTime";

interface DaDongManifestEntry {
  hash: string;
  rowCount: number;
}

export interface DaDongReasonEntry {
  ly_do_cham: string | null;
  ngay_giai_trinh: string | null;
  ngay_du_kien_hoan_thanh: string | null;
  // 2 truong duoi day chi missingParts.ts dung (tab "Da dong" cua man Thieu linh kien) - gop chung
  // vao 1 cache "reasons" duy nhat thay vi tach rieng, vi cung xuat phat tu 1 dong giai_trinh gan
  // nhat (khong ton them chi phi doc).
  linh_kien_thieu: string | null;
  ngay_yeu_cau_co_hang: string | null;
}

function dayR2Key(ngay: string): string {
  return `da-dong/day/${ngay}.json`;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function computeDayRows(db: D1Database, ngay: string): Promise<Record<string, unknown>[]> {
  const { results } = await db
    .prepare(
      `SELECT c.* FROM case_dvbh c
       WHERE c.thoi_gian_hoan_thanh >= ? AND c.thoi_gian_hoan_thanh < date(?, '+1 day')
       ORDER BY c.id ASC`,
    )
    .bind(ngay, ngay)
    .all();
  return results as Record<string, unknown>[];
}

async function recomputeOneDay(env: Env, ngay: string): Promise<void> {
  const rows = await computeDayRows(env.DB, ngay);

  // Ngay khong con case nao (vd 1 case doi ngay hoan thanh sang ngay khac giua 2 lan import) - xoa
  // hop de "khong co dong manifest" = "0 ca" nhat quan voi trang thai ban dau (chua backfill).
  if (rows.length === 0) {
    await env.DB.prepare("DELETE FROM da_dong_chunk_manifest WHERE ngay = ?").bind(ngay).run();
    await env.REPORTS.delete(dayR2Key(ngay));
    return;
  }

  const payload = JSON.stringify(rows);
  const hash = await sha256Hex(payload);

  const existing = await env.DB.prepare("SELECT hash FROM da_dong_chunk_manifest WHERE ngay = ?").bind(ngay).first<{ hash: string }>();
  if (existing && existing.hash === hash) return; // noi dung khong doi - bo qua, tranh ghi R2 thua

  await env.REPORTS.put(dayR2Key(ngay), payload, { httpMetadata: { contentType: "application/json" } });
  await env.DB.prepare(
    `INSERT INTO da_dong_chunk_manifest (ngay, hash, row_count, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(ngay) DO UPDATE SET hash = excluded.hash, row_count = excluded.row_count, updated_at = excluded.updated_at`,
  )
    .bind(ngay, hash, rows.length)
    .run();
}

/** Diem ghi R2 DUY NHAT cho tinh nang nay - xem quy uoc o dau file. */
export async function recomputeDaDongDayChunks(env: Env, dates: string[]): Promise<void> {
  const uniqueDates = [...new Set(dates)];
  for (const ngay of uniqueDates) {
    await recomputeOneDay(env, ngay);
  }
}

/** Doc manifest hash/row_count cac ngay trong [start, end) - re, khong dung R2. */
export async function getDaDongManifest(db: D1Database, start: string, end: string): Promise<Record<string, DaDongManifestEntry>> {
  const { results } = await db
    .prepare("SELECT ngay, hash, row_count FROM da_dong_chunk_manifest WHERE ngay >= ? AND ngay < ?")
    .bind(start, end)
    .all<{ ngay: string; hash: string; row_count: number }>();

  const map: Record<string, DaDongManifestEntry> = {};
  for (const r of results) map[r.ngay] = { hash: r.hash, rowCount: r.row_count };
  return map;
}

/** Doc noi dung chunk (da ghi san tren R2) cho danh sach ngay - khong tinh lai, chi doc. Ngay chua
 * tung co chunk (chua backfill, hoac 0 ca) tra ve mang rong. */
export async function getDaDongChunks(env: Env, dates: string[]): Promise<Record<string, Record<string, unknown>[]>> {
  const result: Record<string, Record<string, unknown>[]> = {};
  await Promise.all(
    dates.map(async (ngay) => {
      const obj = await env.REPORTS.get(dayR2Key(ngay));
      result[ngay] = obj ? (JSON.parse(await obj.text()) as Record<string, unknown>[]) : [];
    }),
  );
  return result;
}

/** "Ly do/giai trinh gan nhat" theo case_id cho 1 thang - tach rieng khoi chunk R2 vi doi theo domain
 * "giai_trinh" (thuong xuyen hon domain "cases" nhieu - xem chu thich dau file). Cache nho trong D1
 * qua cachedReport() co san, KHONG phai R2. */
export async function getDaDongReasons(db: D1Database, thang: string, start: string, end: string): Promise<Record<string, DaDongReasonEntry>> {
  const key = buildReportKey("da-dong-reasons", { thang }, null);
  return cachedReport(db, key, ["cases", "giai_trinh"], async () => {
    const { results } = await db
      .prepare(
        `SELECT case_id, ly_do_cham, ngay_giai_trinh, ngay_du_kien_hoan_thanh, linh_kien_thieu, ngay_yeu_cau_co_hang
         FROM (
           SELECT gt.case_id, gt.ly_do_cham, gt.ngay_giai_trinh, gt.ngay_du_kien_hoan_thanh, gt.linh_kien_thieu, gt.ngay_yeu_cau_co_hang,
                  ROW_NUMBER() OVER (PARTITION BY gt.case_id ORDER BY gt.ngay_giai_trinh DESC, gt.id DESC) AS rn
           FROM giai_trinh gt
           WHERE gt.case_id IN (SELECT id FROM case_dvbh WHERE thoi_gian_hoan_thanh >= ? AND thoi_gian_hoan_thanh < ?)
         )
         WHERE rn = 1`,
      )
      .bind(start, end)
      .all<{
        case_id: string;
        ly_do_cham: string | null;
        ngay_giai_trinh: string | null;
        ngay_du_kien_hoan_thanh: string | null;
        linh_kien_thieu: string | null;
        ngay_yeu_cau_co_hang: string | null;
      }>();

    const map: Record<string, DaDongReasonEntry> = {};
    for (const r of results) {
      map[r.case_id] = {
        ly_do_cham: r.ly_do_cham,
        ngay_giai_trinh: r.ngay_giai_trinh,
        ngay_du_kien_hoan_thanh: r.ngay_du_kien_hoan_thanh,
        linh_kien_thieu: r.linh_kien_thieu,
        ngay_yeu_cau_co_hang: r.ngay_yeu_cau_co_hang,
      };
    }
    return map;
  });
}

/** Danh sach ten "ly_do" thuoc nhom "thieu linh kien" (settings_ly_do.thuoc_thieu_linh_kien=1) -
 * bang rat nho (~20 dong), khong can cache rieng, doc thang moi lan goi manifest. Dung de missingParts.ts
 * loc client-side: 1 ca thuoc tab "Da dong" cua man Thieu linh kien CHI KHI ly_do_cham gan nhat cua
 * no nam trong danh sach nay (tuong duong INNER JOIN settings_ly_do trong baseJoin() truoc day). */
export async function getThieuLinhKienLyDoList(db: D1Database): Promise<string[]> {
  const { results } = await db.prepare("SELECT ten_ly_do FROM settings_ly_do WHERE thuoc_thieu_linh_kien = 1").all<{ ten_ly_do: string }>();
  return results.map((r) => r.ten_ly_do);
}

// ---------- Self-healing (luoi an toan du phong cho diem ghi R2 chinh o importRoute.ts) ----------

// Dung chung 1 dong trong content_versions (bang co san, cung co che voi CA_LAP_SOURCE_MARKER_KEY o
// lib/caLapRefresh.ts) - "hash" cua dong nay KHONG phai SHA-256 ma la chuoi MAX(updated_at) tho, chi
// de so sanh bang (==) giua 2 lan chay.
const SELF_HEAL_MARKER_KEY = "da-dong-self-heal-max-updated";

// Di qua idx_case_updated_at_closed (migration 0018, dung chung voi caLapRefresh.ts) - doc index,
// KHONG quet toan bang.
async function getClosedCaseMaxUpdated(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare(`SELECT MAX(updated_at) as max_updated FROM case_dvbh WHERE thoi_gian_hoan_thanh IS NOT NULL`)
    .first<{ max_updated: string | null }>();
  return row?.max_updated ?? null;
}

async function readSelfHealMarker(db: D1Database): Promise<string | null> {
  const row = await db.prepare("SELECT hash FROM content_versions WHERE ten_bang = ?").bind(SELF_HEAL_MARKER_KEY).first<{ hash: string }>();
  return row?.hash ?? null;
}

async function writeSelfHealMarker(db: D1Database, value: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO content_versions (ten_bang, hash, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(ten_bang) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at`,
    )
    .bind(SELF_HEAL_MARKER_KEY, value, nowVN())
    .run();
}

/**
 * Tu do + tu va (self-healing) cho snapshot R2 "ca da dong" - goi tu cron hang gio (index.ts
 * CA_LAP_REFRESH_CRON), KHONG phai diem ghi R2 moi (van goi lai dung recomputeDaDongDayChunks() da
 * co, xem nguyen tac o dau file). Muc dich: bat lai truong hop diem ghi CHINH (sau import) lo mat 1
 * lan vi ly do gi do, ma ngay bi anh huong sau do khong con bi dong tiep nen se bi ket qua sai VINH
 * VIEN neu khong co luoi an toan nay (xem thao luan 2026-07-29).
 *
 * Chi phi 2 tang, KHONG quet toan bo case_dvbh:
 *  1. So sanh 1 gia tri MAX(updated_at) (qua index, ~1 dong doc) voi marker luu tu lan chay truoc -
 *     giong het khong doi thi dung ngay, khong doc gi them.
 *  2. Chi khi CO doi: doc DANH SACH NGAY co dong THAT SU bi sua ke tu marker cu (van qua index tren,
 *     WHERE updated_at > marker - chi cac dong vua doi, khong phai toan bo ca da dong).
 * Ket qua buoc 2 duoc truyen vao recomputeDaDongDayChunks() nhu binh thuong - ham do da co san co
 * che "so hash, giong thi bo qua khong ghi R2 thua" nen goi lai an toan du noi dung khong doi that.
 */
export async function selfHealDaDongDayChunks(env: Env): Promise<{ checked: boolean; healedDates: string[] }> {
  const db = env.DB;
  const currentMax = await getClosedCaseMaxUpdated(db);
  if (currentMax === null) return { checked: true, healedDates: [] }; // chua co ca nao dong

  const marker = await readSelfHealMarker(db);
  if (marker !== null && marker === currentMax) {
    return { checked: false, healedDates: [] }; // khong co gi doi tu lan kiem tra truoc - dung ngay
  }

  // marker=null (lan dau chay) se doc toan bo ca da dong 1 LAN DUY NHAT de khoi tao trang thai ban
  // dau - cac lan sau chi doc phan thay doi. Chap nhan duoc vi day la chi phi 1 lan, khong lap lai.
  const { results } = await db
    .prepare(
      `SELECT DISTINCT date(thoi_gian_hoan_thanh) as ngay FROM case_dvbh
       WHERE thoi_gian_hoan_thanh IS NOT NULL AND updated_at > ?`,
    )
    .bind(marker ?? "0000-00-00")
    .all<{ ngay: string }>();

  const dates = results.map((r) => r.ngay).filter((d): d is string => !!d && d.length === 10);
  if (dates.length > 0) {
    await recomputeDaDongDayChunks(env, dates);
  }

  await writeSelfHealMarker(db, currentMax);
  return { checked: true, healedDates: dates };
}
