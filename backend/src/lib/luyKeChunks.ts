/**
 * Snapshot "Bao cao luy ke" (pivot DVBH toan quoc, du lieu tong hop san tu file Excel import thu
 * cong hang thang) tren R2, chia theo TUNG THANG - xem memory r2-json-write-trigger-rule.md.
 * Nguyen tac chot voi chu he thong (2026-08-28), mo phong dung mo hinh da co cua "ca da dong"
 * (lib/daDongDayChunks.ts) nhung don gian hon (khong can rate-limit tai R2, khong can self-heal
 * cron vi tan suat ghi rat thap - 1 lan/thang, chu dong boi nguoi dung, khong phai he qua cua 1
 * tien trinh ngam co the "lo mat" nhu import CRM hang ngay):
 *
 * 1. CHI duoc ghi/ghi de JSON len R2 qua recomputeLuyKeMonth() - 2 diem goi da CHOT (khong tu them
 *    diem thu 3 ma khong hoi truoc): (a) routes/luyKe.ts POST /import/commit (Admin/TBP DVBH, import
 *    Excel thu cong - "chot cuoi" 1 thang bat ky), (b) lib/luyKeCompute.ts
 *    computeAndPushLuyKeCurrentMonth() goi tu cron DAILY_SNAPSHOT_CRON 08:00 VN (chot 2026-08-28,
 *    CHI tinh lai thang hien tai tu case_dvbh that) - ca 2 deu THAY THE TOAN BO du lieu 1 thang, nen
 *    ai goi sau cung "thang" se la ban ghi cuoi cung, khong co logic merge.
 * 2. Moi file/thang co hash SHA-256 luu trong luy_ke_chunk_manifest (migration 0100) - client so
 *    hash cua minh voi hash server de biet thang nao can tai lai.
 * 3. Noi dung 1 chunk la NGUYEN VAN cac dong pivot da import cho thang do (khong tinh toan/join gi
 *    them - moi tinh toan/loc/bieu do deu lam o client sau khi tai xong, xem hooks/useLuyKeChunked.ts).
 * 4. Moi lan import THAY THE TOAN BO du lieu cua thang do (khong merge/cong don).
 */
import type { Env } from "../types";

export interface LuyKeRow {
  khu_vuc: string;
  phan_loai: string;
  dung_han: string;
  toc_do: string;
  thang: string; // 'YYYY-MM'
  tren_96h: string;
  nam: string;
  hang: string;
  doi_tuong: string;
  nganh: string;
  nguon_crm: string;
  // "KH VIPs" (them 2026-08-28) - gia tri 0/rong trong file goc duoc chuan hoa thanh nhan "KH thường"
  // luc import (xem normalizeKhVip() o routes/luyKe.ts), KHONG de rong "". Cron tu dong
  // (luyKeCompute.ts) LUON ghi "KH thường" vi case_dvbh khong co cot nguon tuong ung - chi co gia tri
  // VIP that qua import Excel thu cong.
  kh_vip: string;
  sl: number;
}

interface LuyKeManifestEntry {
  hash: string;
  rowCount: number;
}

function monthR2Key(thang: string): string {
  return `luy-ke/month/${thang}.json`;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Diem ghi R2 DUY NHAT cho tinh nang "Bao cao luy ke" - xem quy uoc o dau file. Rows rong (thang
 * bi bo khoi 1 lan import sau) se xoa hop de "khong co dong manifest" thay vi giu snapshot cu treo. */
export async function recomputeLuyKeMonth(env: Env, thang: string, rows: LuyKeRow[]): Promise<void> {
  if (rows.length === 0) {
    await env.DB.prepare("DELETE FROM luy_ke_chunk_manifest WHERE thang = ?").bind(thang).run();
    await env.REPORTS.delete(monthR2Key(thang));
    return;
  }

  const payload = JSON.stringify(rows);
  const hash = await sha256Hex(payload);

  const existing = await env.DB.prepare("SELECT hash FROM luy_ke_chunk_manifest WHERE thang = ?").bind(thang).first<{ hash: string }>();
  if (existing && existing.hash === hash) return; // noi dung khong doi - bo qua, tranh ghi R2 thua

  await env.REPORTS.put(monthR2Key(thang), payload, { httpMetadata: { contentType: "application/json" } });
  await env.DB.prepare(
    `INSERT INTO luy_ke_chunk_manifest (thang, hash, row_count, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(thang) DO UPDATE SET hash = excluded.hash, row_count = excluded.row_count, updated_at = excluded.updated_at`,
  )
    .bind(thang, hash, rows.length)
    .run();
}

/** Doc manifest hash/row_count TOAN BO cac thang da co - re, khong dung R2. */
export async function getLuyKeManifest(db: D1Database): Promise<Record<string, LuyKeManifestEntry>> {
  const { results } = await db.prepare("SELECT thang, hash, row_count FROM luy_ke_chunk_manifest ORDER BY thang DESC").all<{
    thang: string;
    hash: string;
    row_count: number;
  }>();
  const map: Record<string, LuyKeManifestEntry> = {};
  for (const r of results) map[r.thang] = { hash: r.hash, rowCount: r.row_count };
  return map;
}

/** Doc noi dung chunk (da ghi san tren R2) cho danh sach thang - khong tinh lai, chi doc. */
export async function getLuyKeChunks(env: Env, months: string[]): Promise<Record<string, LuyKeRow[]>> {
  const result: Record<string, LuyKeRow[]> = {};
  await Promise.all(
    months.map(async (thang) => {
      const obj = await env.REPORTS.get(monthR2Key(thang));
      result[thang] = obj ? (JSON.parse(await obj.text()) as LuyKeRow[]) : [];
    }),
  );
  return result;
}
