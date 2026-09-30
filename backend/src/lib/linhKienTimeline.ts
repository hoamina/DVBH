/**
 * Keo log "Dat mua linh kien" (don mua/cong no/tra hang + ticket thieu LK + phieu xuat kho) cua 1 ca
 * tu he doc lap linh-kien-app (linhkien.dichvu3t.workers.dev) qua API doi tac
 * GET /api/partner/v1/case-timeline?id=<case_id> (xem lib/partnerTimeline.ts cua repo do).
 *
 * CHOT 2026-09-30: goi THEO YEU CAU moi lan mo chi tiet 1 ca (khong luu D1, khong cron) - du lieu luon
 * moi, khong ton rows_read/written D1 cua DVBH. Doi lai: chi dung cho 1 ca, KHONG dung cho danh sach/
 * bao cao (can phuong an keo dinh ky ve D1 neu sau nay can). Nguon AppSheet (Google Sheet mua-hang/
 * thieu-hang, frontend lib/purchaseWarrantySync.ts) van giu SONG SONG theo chot cua chu he thong.
 *
 * Loi/het han/chua cau hinh KHONG nem ra ngoai - tra { ok:false, error } de chi tiet ca van hien binh
 * thuong, chi phan log nay bao "khong tai duoc".
 */
import type { Env } from "../types";

export interface LinhKienTimelineEvent {
  at: string; // ISO 8601 +07:00
  event: string; // enum on dinh cua linh-kien-app (vd "tn_da_duyet", "thieu_lk_kho_xac_nhan_hang_ve")
  actor: string | null;
  actor_name?: string | null; // bo sung 2026-09-30 - linh-kien-app ban cu chua co
  note: string | null;
  source: "mua_hang" | "thieu_lk" | "phieu_xuat_kho" | "tra_hang";
}

export interface LinhKienThieuLk {
  id: string;
  ly_do: string | null;
  ngay_tao: string;
  ngay_du_kien_co_hang: string | null;
  ngay_hang_ve_thuc_te: string | null;
}

export interface LinhKienOrder {
  order_id: string;
  ma_lk: string;
  ten_lk: string | null;
  loai_don: string;
  trang_thai_hien_tai: string | null;
  nguoi_tao: string;
  nguoi_nhan_hang: string | null;
  ngay_tao: string;
  phieu_xuat_kho: { id: string; ma_xuat_kho: string }[];
  timeline: LinhKienTimelineEvent[];
  // Bo sung 2026-09-30 (optional - linh-kien-app ban cu chua tra)
  loai_de_xuat?: string | null;
  so_luong_de_xuat?: number;
  so_luong_thuc_xuat?: number | null;
  ly_do_cham?: string | null;
  nguoi_tao_ten?: string | null;
  nguoi_nhan_hang_ten?: string | null;
  thieu_lk?: LinhKienThieuLk[];
}

export interface LinhKienTimelineResult {
  configured: boolean;
  ok: boolean;
  error: string | null;
  orders: LinhKienOrder[];
}

const TIMEOUT_MS = 8000;

export async function fetchLinhKienTimeline(env: Env, caseId: string): Promise<LinhKienTimelineResult> {
  if (!env.LINHKIEN_APP_URL || !env.LINHKIEN_APP_API_KEY) {
    return { configured: false, ok: false, error: "NOT_CONFIGURED", orders: [] };
  }
  const url = `${env.LINHKIEN_APP_URL}/api/partner/v1/case-timeline?id=${encodeURIComponent(caseId)}`;
  const init: RequestInit = { headers: { "X-API-Key": env.LINHKIEN_APP_API_KEY }, signal: AbortSignal.timeout(TIMEOUT_MS) };
  try {
    // Service Binding tren production (fetch() thang workers.dev cung tai khoan bi loi 1042 - xem
    // lib/viPhamBenNgoai.ts); local dev khong co binding thi fetch() thang URL.
    const res = env.LINHKIEN_APP ? await env.LINHKIEN_APP.fetch(url, init) : await fetch(url, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[linhKienTimeline] case=${caseId} HTTP ${res.status}: ${text.slice(0, 300)}`);
      return { configured: true, ok: false, error: `HTTP_${res.status}`, orders: [] };
    }
    const body = (await res.json()) as { orders?: LinhKienOrder[] };
    return { configured: true, ok: true, error: null, orders: Array.isArray(body.orders) ? body.orders : [] };
  } catch (err) {
    console.error(`[linhKienTimeline] case=${caseId} loi:`, err);
    return { configured: true, ok: false, error: String(err).slice(0, 200), orders: [] };
  }
}
