/**
 * Snapshot "ca da dong" tren R2, chia theo TUNG NGAY (khong phai ca thang) - xem
 * KE_HOACH_TOI_UU_D1.md + memory r2-json-write-trigger-rule.md. Nguyen tac chot voi chu he thong:
 *
 * 1. CHI duoc ghi/ghi de JSON len R2 tu recomputeDaDongDayChunks(), goi DUY NHAT tu
 *    scheduleCaLapRefreshIfChanged() (routes/importRoute.ts) sau khi import commit/sync-sheet co
 *    GHI_MOI+GHI_DE>0. KHONG duoc them compute-on-miss hay bat ky trigger nao khac ghi R2 o day -
 *    phai hoi chu he thong truoc (xem memory).
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
