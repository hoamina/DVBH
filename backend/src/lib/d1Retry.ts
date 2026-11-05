// Thu lai khi D1 bao "D1 DB is overloaded. Too many resources consumed within a 10 second window" (2026-11-05).
// Tinh trang nay la cua CA TAI KHOAN D1 (khong rieng 1 request) va keo dai LIEN TUC suot cua so import cua pipeline
// (vai phut, xac nhan qua wrangler tail) - can ngan sach retry du dai (toi da ~1 phut, backoff tang dan + jitter).
// Chi thu lai dung loi "overloaded"; moi loi khac nem ra ngay.
export async function withD1Retry<T>(fn: () => Promise<T>, maxAttempts = 8): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("D1_ERROR") || !/overloaded/i.test(msg) || attempt === maxAttempts) throw err;
      lastErr = err;
      const delay = Math.min(800 * 2 ** (attempt - 1), 10000) + Math.random() * 400;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}
