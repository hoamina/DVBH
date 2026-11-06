/**
 * Keo luong "Gui bao hanh linh kien" cua 1 ca tu he doc lap suachua (suachua.dichvu3t.workers.dev, repo
 * "gui-bao-hanh-linh-kien") qua API doi tac GET /api/partner/v1/case-timeline?id=<case_id> (routes/partnerCase.ts
 * cua repo do). Them 2026-11-06.
 *
 * Cung khuon lib/linhKienTimeline.ts: goi THEO YEU CAU moi lan mo chi tiet 1 ca (khong luu D1, khong cron) -
 * khong ton rows_read/written D1 cua DVBH, du lieu luon moi. Bo sung (khong thay) badge tom tat sc_* tren
 * don_bao_hanh_odoo (suachua day ve 15 phut/lan) - badge do van dung cho danh sach; API nay cho chi tiet
 * (phieu gui, van chuyen, kho/admin nhan, huong xu ly, NV sua, phieu tra, nhat ky) va ca cac don KTV tao tay
 * tren suachua KHONG co don Odoo (truoc day dvbh khong thay).
 *
 * Loi/het han/chua cau hinh KHONG nem ra ngoai - tra { ok:false, error } de chi tiet ca van hien binh thuong.
 */
import type { Env } from "../types";

export interface SuaChuaTimelineResult {
  configured: boolean;
  ok: boolean;
  error: string | null;
  // Giu nguyen cau truc suachua tra ve (frontend/src/lib/suaChuaTimeline.ts khai bao kieu chi tiet).
  don: unknown[];
}

const TIMEOUT_MS = 8000;

export async function fetchSuaChuaTimeline(env: Env, caseId: string): Promise<SuaChuaTimelineResult> {
  if (!env.SUACHUA_APP_URL || !env.SUACHUA_APP_API_KEY) {
    return { configured: false, ok: false, error: "NOT_CONFIGURED", don: [] };
  }
  const url = `${env.SUACHUA_APP_URL}/api/partner/v1/case-timeline?id=${encodeURIComponent(caseId)}`;
  const init: RequestInit = { headers: { "X-API-Key": env.SUACHUA_APP_API_KEY }, signal: AbortSignal.timeout(TIMEOUT_MS) };
  try {
    // Service Binding tren production (fetch() thang workers.dev cung tai khoan bi loi 1042); local dev
    // khong co binding thi fetch() thang URL.
    const res = env.SUACHUA_APP ? await env.SUACHUA_APP.fetch(url, init) : await fetch(url, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[suaChuaTimeline] case=${caseId} HTTP ${res.status}: ${text.slice(0, 300)}`);
      return { configured: true, ok: false, error: `HTTP_${res.status}`, don: [] };
    }
    const body = (await res.json()) as { don?: unknown[] };
    return { configured: true, ok: true, error: null, don: Array.isArray(body.don) ? body.don : [] };
  } catch (err) {
    console.error(`[suaChuaTimeline] case=${caseId} loi:`, err);
    return { configured: true, ok: false, error: String(err).slice(0, 200), don: [] };
  }
}
