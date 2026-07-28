/**
 * Rate-limit tai chunk R2 theo TUNG FILE/ngay rieng (khong phai 1 ngan sach chung ca tai khoan) -
 * nguyen tac chot voi chu he thong: 1 tai khoan chi duoc tai LAI DUNG 1 file "chunk_ngay" toi thieu
 * moi 10 phut, toi da 5 lan/ngay (VN). Cac file (ngay) khac nhau co dong ho rieng - dung
 * r2_download_log (migration 0029), khoa (email, chunk_ngay, ngay_vn).
 */
import { getVnDateStr } from "./reportCache";

const MIN_INTERVAL_MS = 10 * 60 * 1000;
const MAX_PER_DAY = 5;

export interface DownloadQuotaResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  remainingToday?: number;
}

function msUntilNextVnMidnight(): number {
  const vnNow = Date.now() + 7 * 60 * 60 * 1000;
  const vnDate = new Date(vnNow);
  const msSinceVnMidnight =
    vnDate.getUTCHours() * 3_600_000 + vnDate.getUTCMinutes() * 60_000 + vnDate.getUTCSeconds() * 1000 + vnDate.getUTCMilliseconds();
  return 24 * 3_600_000 - msSinceVnMidnight;
}

function parseUtc(sqlDateTime: string): number {
  return new Date(`${sqlDateTime.replace(" ", "T")}Z`).getTime();
}

/** Kiem tra + tieu 1 luot quota cho DUNG 1 file "chunkNgay" cua 1 tai khoan - goi rieng cho tung
 * ngay trong 1 lo request (khong phai 1 lan cho ca request), xem routes/cases.ts POST /da-dong-chunks. */
export async function checkAndConsumeDownloadQuota(db: D1Database, email: string, chunkNgay: string): Promise<DownloadQuotaResult> {
  const ngayVn = getVnDateStr();
  const row = await db
    .prepare("SELECT so_lan, last_download_at FROM r2_download_log WHERE email = ? AND chunk_ngay = ? AND ngay_vn = ?")
    .bind(email, chunkNgay, ngayVn)
    .first<{ so_lan: number; last_download_at: string | null }>();

  if (row?.last_download_at) {
    const elapsed = Date.now() - parseUtc(row.last_download_at);
    if (elapsed < MIN_INTERVAL_MS) {
      return { allowed: false, retryAfterSeconds: Math.ceil((MIN_INTERVAL_MS - elapsed) / 1000) };
    }
  }

  if (row && row.so_lan >= MAX_PER_DAY) {
    return { allowed: false, retryAfterSeconds: Math.ceil(msUntilNextVnMidnight() / 1000) };
  }

  const nowIso = new Date().toISOString().slice(0, 19).replace("T", " ");
  await db
    .prepare(
      `INSERT INTO r2_download_log (email, chunk_ngay, ngay_vn, so_lan, last_download_at) VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(email, chunk_ngay, ngay_vn) DO UPDATE SET so_lan = so_lan + 1, last_download_at = excluded.last_download_at`,
    )
    .bind(email, chunkNgay, ngayVn, nowIso)
    .run();

  return { allowed: true, remainingToday: MAX_PER_DAY - (row?.so_lan ?? 0) - 1 };
}
