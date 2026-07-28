/**
 * Snapshot R2 "ung vien khao sat" (case dang ton/moi dong co co vi pham) - 1 FILE DUY NHAT (khong
 * chia theo ngay nhu lib/daDongDayChunks.ts, vi tap nay khong tang vo han: bi chan boi cron archive
 * 3 thang + dieu kien co co vi pham). Cung nguyen tac voi da_dong_chunk_manifest:
 *
 * 1. CHI duoc ghi/ghi de JSON len R2 tu recomputeSurveySnapshot(), goi DUY NHAT tu
 *    scheduleCaLapRefreshIfChanged() (routes/importRoute.ts) sau import commit/sync-sheet co
 *    GHI_MOI+GHI_DE>0 - xem memory r2-json-write-trigger-rule.md, phai hoi chu he thong truoc khi
 *    them trigger ghi R2 moi.
 * 2. Hash SHA-256 luu trong r2_snapshot_manifest (migration 0031).
 * 3. Rate-limit tai theo file - dung chung bang r2_download_log (migration 0029) voi chunk_ngay
 *    co dinh la SNAPSHOT_KEY.
 *
 * Noi dung file CHI la cot case_dvbh + co vi pham (loi_120p...) - KHONG gom trang thai bang
 * vi_pham (doi thuong xuyen khi co nguoi "chot vi pham"/ghi log goi khao sat, xem
 * routes/viPham.ts PATCH /:id/cap2) va KHONG gom assigned_to (doi khi Giam sat gan CSKH, xem
 * routes/survey.ts POST /assign) - 2 phan nay tach rieng, doc song/cache nho qua cachedReport().
 */
import type { Env } from "../types";
import { cachedReport, buildReportKey } from "./reportCache";

export const SURVEY_SNAPSHOT_KEY = "survey-candidates";
const R2_KEY = "survey/candidates.json";

interface SurveySnapshotManifest {
  hash: string;
  rowCount: number;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function computeCandidateRows(db: D1Database): Promise<Record<string, unknown>[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.khach_hang, c.khu_vuc, c.mo_ta_loi, c.ky_thuat_vien, c.tinh, c.quan_huyen,
              c.thoi_gian_cskh_tiep_nhan, c.thoi_gian_hen_xu_ly, c.thoi_gian_hoan_thanh, c.link_crm, c.noi_dung_xu_ly,
              c.loi_120p, c.loi_qua_han_24h, c.loi_lo_ke_hoach, c.loi_kh_hen_lai
       FROM case_dvbh c
       WHERE c.archived_at IS NULL AND (c.loi_120p = 1 OR c.loi_qua_han_24h = 1 OR c.loi_lo_ke_hoach = 1 OR c.loi_kh_hen_lai = 1)
       ORDER BY c.id ASC`,
    )
    .all();
  return results as Record<string, unknown>[];
}

/** Diem ghi R2 DUY NHAT cho snapshot nay - xem quy uoc o dau file. */
export async function recomputeSurveySnapshot(env: Env): Promise<void> {
  const rows = await computeCandidateRows(env.DB);

  if (rows.length === 0) {
    await env.DB.prepare("DELETE FROM r2_snapshot_manifest WHERE snapshot_key = ?").bind(SURVEY_SNAPSHOT_KEY).run();
    await env.REPORTS.delete(R2_KEY);
    return;
  }

  const payload = JSON.stringify(rows);
  const hash = await sha256Hex(payload);

  const existing = await env.DB.prepare("SELECT hash FROM r2_snapshot_manifest WHERE snapshot_key = ?").bind(SURVEY_SNAPSHOT_KEY).first<{ hash: string }>();
  if (existing && existing.hash === hash) return;

  await env.REPORTS.put(R2_KEY, payload, { httpMetadata: { contentType: "application/json" } });
  await env.DB.prepare(
    `INSERT INTO r2_snapshot_manifest (snapshot_key, hash, row_count, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(snapshot_key) DO UPDATE SET hash = excluded.hash, row_count = excluded.row_count, updated_at = excluded.updated_at`,
  )
    .bind(SURVEY_SNAPSHOT_KEY, hash, rows.length)
    .run();
}

/** Doc manifest hash/row_count - re, khong dung R2. */
export async function getSurveySnapshotManifest(db: D1Database): Promise<SurveySnapshotManifest | null> {
  const row = await db
    .prepare("SELECT hash, row_count FROM r2_snapshot_manifest WHERE snapshot_key = ?")
    .bind(SURVEY_SNAPSHOT_KEY)
    .first<{ hash: string; row_count: number }>();
  return row ? { hash: row.hash, rowCount: row.row_count } : null;
}

/** Doc noi dung file (da ghi san tren R2) - khong tinh lai, chi doc. */
export async function getSurveySnapshotContent(env: Env): Promise<Record<string, unknown>[]> {
  const obj = await env.REPORTS.get(R2_KEY);
  if (!obj) return [];
  return JSON.parse(await obj.text()) as Record<string, unknown>[];
}

/** Case nao da co dong vi_pham cho tung loai_loi (bat ke da chot QC hay chua) - dung de tinh lai
 * client-side "can khao sat" = co co vi pham (trong snapshot) VA loai_loi tuong ung CHUA co trong
 * day. Bang vi_pham con nho (tang cham hon nhieu so voi case_dvbh) nen doc toan bo, cache qua
 * cachedReport() (domain "vi_pham" - doi moi khi co nguoi ghi nhan/chot vi pham). */
export async function getViPhamExistingLoaiLoi(db: D1Database): Promise<Record<string, string[]>> {
  const key = buildReportKey("survey/vi-pham-existing", {}, null);
  return cachedReport(db, key, ["vi_pham"], async () => {
    const { results } = await db.prepare("SELECT DISTINCT case_id, loai_loi FROM vi_pham").all<{ case_id: string; loai_loi: string }>();
    const map: Record<string, string[]> = {};
    for (const r of results) {
      (map[r.case_id] ??= []).push(r.loai_loi);
    }
    return map;
  });
}
