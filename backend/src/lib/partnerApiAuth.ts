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
 *
 * SUA 2026-09-13: bo gioi han "N request/phut/IP" ap dung CHUNG cho moi request (ke ca key hop le) -
 * cac he doc lap (Dat mua linh kien, vipham...) goi sang tu Worker khac nen CF-Connecting-IP DVBH
 * nhin thay la IP egress dung chung/xoay vong cua Cloudflare cho request server-to-server, KHONG on
 * dinh theo tung doi tac - gioi han theo IP kieu do vua khong dung muc tieu (khong phan biet duoc
 * doi tac nao) vua de bop nham traffic hop le khi ~300-400 tai khoan cung dung chung 1 key/pool IP.
 * Muc tieu that su (chan flood key sai/rac gay ton D1 - moi key la 1 chuoi khac nhau se khong trung
 * cache "key sai" tung gia tri, moi lan la 1 luot SELECT D1 moi) duoc thay bang bo dem THEO IP nhung
 * CHI tang khi request bi tu choi vi thieu/sai key (isIpBadAuthBlocked/recordBadAuth ben duoi) - key
 * hop le khong lam tang bo dem nay nen khong con bi anh huong. Rieng /sync/* (routes/partnerApi.ts)
 * truoc gio dua hoan toan vao lop IP-limit chung do de gioi han - bo no di thi can bu bang gioi han
 * rieng THEO KEY (checkPerKeyRateLimit) o cac route do, neu khong 1 key bi lo se ghi D1 khong gioi han.
 */

const BAD_AUTH_IP_LIMIT_PER_MIN = 30;

async function bumpCacheCounter(cacheUrl: string): Promise<number> {
  const cache = caches.default;
  const req = new Request(cacheUrl);
  const cached = await cache.match(req);
  let count = 1;
  let exp = Date.now() + 60_000;
  if (cached) {
    const data = (await cached.json()) as { count: number; exp: number };
    count = data.count + 1;
    exp = data.exp;
  }
  await cache.put(
    req,
    new Response(JSON.stringify({ count, exp }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `max-age=${Math.max(1, Math.round((exp - Date.now()) / 1000))}`,
      },
    }),
  );
  return count;
}

function badAuthCacheUrl(ip: string): string {
  return `https://internal-cache.dvbh-suite/partner-ip-badauth/${encodeURIComponent(ip)}`;
}

// Doc-only, khong tang dem - dung o dau middleware "*" de chan som (khong cham D1) cac IP dang vuot
// nguong "lan goi thieu/sai key" gan day. Tu het han sau ~1 phut ke tu lan cuoi bi tang dem (khong co
// co che gia han rieng - don gian, du dung cho muc tieu chan flood ngan han).
export async function isIpBadAuthBlocked(ip: string): Promise<boolean> {
  const cached = await caches.default.match(new Request(badAuthCacheUrl(ip)));
  if (!cached) return false;
  const data = (await cached.json()) as { count: number };
  return data.count > BAD_AUTH_IP_LIMIT_PER_MIN;
}

// Goi khi 1 request bi tu choi vi thieu/sai API key (xem cac diem goi trong routes/partnerApi.ts).
// Luon goi qua c.executionCtx.waitUntil() tu phia caller - request dang bi tu choi 401 roi nen khong
// can cho ghi cache xong moi tra response.
export async function recordBadAuth(ip: string): Promise<void> {
  await bumpCacheCounter(badAuthCacheUrl(ip));
}

// Gioi han mem theo tung API key (khong ghi D1) - dung chung cho /case-lookup va /sync/* voi so
// nguong khac nhau tuy endpoint. Kiem tra TRUOC roi moi tang dem (khac bumpCacheCounter o tren) de
// mot khi da vuot nguong thi ngung tang/lam moi TTL, tu nhien het chan sau toi da ~1 phut.
export async function checkPerKeyRateLimit(
  bucket: string,
  keyId: number,
  limitPerMinute: number,
  waitUntil: (p: Promise<unknown>) => void,
): Promise<boolean> {
  const cache = caches.default;
  const req = new Request(`https://internal-cache.dvbh-suite/${bucket}/${keyId}`);
  const cached = await cache.match(req);
  if (cached) {
    const data = (await cached.json()) as { count: number; exp: number };
    if (data.count > limitPerMinute) return false;
    data.count++;
    waitUntil(
      cache.put(
        req,
        new Response(JSON.stringify(data), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `max-age=${Math.max(1, Math.round((data.exp - Date.now()) / 1000))}`,
          },
        }),
      ),
    );
    return true;
  }
  const exp = Date.now() + 60_000;
  waitUntil(
    cache.put(
      req,
      new Response(JSON.stringify({ count: 1, exp }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "max-age=60" },
      }),
    ),
  );
  return true;
}

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
