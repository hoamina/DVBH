/**
 * Xac thuc + rate limit cho API doi tac (xem PARTNER_API_GUIDE.md va routes/partnerApi.ts).
 * api_key luu THANG trong partner_api_keys (khong hash) - dong bo voi cach EXTERNAL_IMPORT_API_KEY
 * (routes/externalImport.ts) duoc so sanh truc tiep qua Bearer token, khong co tien le hash key nao
 * khac trong repo nay.
 *
 * Rate limit dua tren partner_api_call_log: "khoang cach toi thieu" so voi LAN GOI DA GHI LOG gan
 * nhat (chi cac lan goi qua duoc validate mode/date moi duoc ghi log - xem routes/partnerApi.ts), va
 * "so lan trong ngay" dem theo NGAY LICH VIET NAM (called_at da luu san gio VN dia phuong qua
 * datetime('now','+7 hours') - xem migration 0047 - nen so sanh truc tiep date(called_at) voi
 * date('now','+7 hours'), khong can quy doi them, giong quy uoc AGE_ANCHOR o ageCalc.ts).
 */

export interface PartnerApiKeyRow {
  id: number;
  ten_doi_tac: string;
  api_key: string;
  active: number;
}

const DAILY_LIMIT = 30;
const MIN_INTERVAL_MS = 60_000;

export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function findActivePartnerKey(db: D1Database, apiKey: string): Promise<PartnerApiKeyRow | null> {
  const hashed = await hashApiKey(apiKey);
  // So khớp cả API key dạng thô (cũ) và dạng đã băm (mới)
  const row = await db
    .prepare("SELECT id, ten_doi_tac, api_key, active, masked_key FROM partner_api_keys WHERE (api_key = ? OR api_key = ?) AND active = 1")
    .bind(apiKey, hashed)
    .first<PartnerApiKeyRow & { masked_key: string | null }>();

  if (row && row.api_key.startsWith("dvbh_")) {
    // Tự động băm và lưu đè lên DB nếu phát hiện key cũ đang lưu ở dạng plaintext (self-healing)
    const masked = maskPartnerApiKey(row.api_key);
    await db
      .prepare("UPDATE partner_api_keys SET api_key = ?, masked_key = ? WHERE id = ?")
      .bind(hashed, masked, row.id)
      .run();
    row.api_key = hashed;
  }
  return row ?? null;
}

export type RateLimitResult = { ok: true } | { ok: false; error: "MIN_INTERVAL_NOT_MET" | "DAILY_LIMIT_EXCEEDED" };

export async function checkRateLimit(db: D1Database, apiKeyId: number): Promise<RateLimitResult> {
  const last = await db
    .prepare("SELECT called_at FROM partner_api_call_log WHERE api_key_id = ? ORDER BY called_at DESC LIMIT 1")
    .bind(apiKeyId)
    .first<{ called_at: string }>();
  if (last) {
    // "now VN" dung dung cong thuc Date.now()+7h nhu nowVN() (lib/vnTime.ts) de cung khung quy chieu
    // voi gia tri da luu (datetime('now','+7 hours') phia SQL) - hieu (delta) moi la thoi gian thuc.
    const nowVNMs = Date.now() + 7 * 60 * 60 * 1000;
    const lastMs = Date.parse(`${last.called_at.replace(" ", "T")}Z`);
    if (nowVNMs - lastMs < MIN_INTERVAL_MS) return { ok: false, error: "MIN_INTERVAL_NOT_MET" };
  }

  const todayCount = await db
    .prepare(
      "SELECT COUNT(*) as cnt FROM partner_api_call_log WHERE api_key_id = ? AND date(called_at) = date('now', '+7 hours')",
    )
    .bind(apiKeyId)
    .first<{ cnt: number }>();
  if ((todayCount?.cnt ?? 0) >= DAILY_LIMIT) return { ok: false, error: "DAILY_LIMIT_EXCEEDED" };

  return { ok: true };
}

export async function logPartnerApiCall(db: D1Database, apiKeyId: number, mode: string, soDong: number | null) {
  await db
    .prepare("INSERT INTO partner_api_call_log (api_key_id, mode, so_dong) VALUES (?, ?, ?)")
    .bind(apiKeyId, mode, soDong)
    .run();
}

export function generatePartnerApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `dvbh_${hex}`;
}

// Hien thi trong danh sach key cho Admin (GET) - KHONG bao gio tra lai key day du sau lan tao dau
// tien, chi con 8 ky tu dau + 4 ky tu cuoi de nhan dien.
export function maskPartnerApiKey(key: string): string {
  if (key.startsWith("dvbh_")) {
    return `${key.slice(0, 9)}...${key.slice(-4)}`;
  }
  return "dvbh_hash...";
}
