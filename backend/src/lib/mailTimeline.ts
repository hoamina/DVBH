/**
 * Keo "Luồng mail" doi tra cua 1 ca tu he doc lap theodoidoimay (theodoidoimay.dichvu3t.workers.dev,
 * repo "thu ky mail doi may") qua API doi tac GET /api/partner/case?id=<case_id>.
 *
 * He do nhan mail CC vao theodoidoimay@gmail.com, gom luong theo ma case/serial/header, nhan dien moc:
 * Karofi tiep nhan -> de xuat doi -> TBP 3T duyet -> Karofi giao xu ly -> len SO -> len DO.
 *
 * Giong lib/linhKienTimeline.ts: goi THEO YEU CAU moi lan mo chi tiet 1 ca, KHONG luu D1 cua DVBH, khong cron.
 * Loi/het han/chua cau hinh KHONG nem ra ngoai - tra { ok:false, error } de chi tiet ca van hien binh thuong.
 */
import type { Env } from "../types";

export interface MailThu {
  nguon: "gmail" | "trich_dan"; // trich_dan = thu cu khoi phuc tu phan trich dan cua mail FW/RE
  gmail_id: string;
  from_name: string;
  from_email: string;
  to_addr: string;
  cc_addr: string;
  subject: string;
  sent_at: string; // ISO UTC
  body_new: string; // phan noi dung moi (da cat trich dan), toi da 2000 ky tu
  attachments: { name: string; size: number; type: string }[];
  la_de_xuat: number;
  la_duyet: number;
  moc: "" | "tiep_nhan" | "giao_xu_ly" | "len_so" | "len_do" | "len_so_do";
  gmail_link: string | null;
}

export interface MailLuong {
  id: number;
  dvbh_case_id: string;
  trang_thai: "phat_sinh" | "tiep_nhan" | "cho_duyet" | "da_duyet" | "giao_xu_ly" | "da_len_so" | "da_len_do";
  loai_yeu_cau: string;
  serial: string;
  subject: string;
  origin_name: string;
  origin_email: string;
  origin_domain: string;
  origin_at: string | null;
  last_at: string | null;
  msg_count: number;
  tiep_nhan_at: string | null;
  de_xuat_at: string | null;
  de_xuat_from: string;
  duyet_at: string | null;
  duyet_from: string;
  duyet_xac_nhan: number;
  giao_xu_ly_at: string | null;
  len_so_at: string | null;
  len_do_at: string | null;
  de_xuat: Record<string, string>; // bang 22 truong trong mail de xuat (Hãng, Lý do đổi, Chính sách...)
}

export interface MailTimelineResult {
  configured: boolean;
  ok: boolean;
  error: string | null;
  found: boolean;
  luong: MailLuong | null;
  thu: MailThu[];
}

const TIMEOUT_MS = 8000;

export async function fetchMailTimeline(env: Env, caseId: string): Promise<MailTimelineResult> {
  const empty = { found: false, luong: null, thu: [] };
  if (!env.THEODOI_APP_URL || !env.THEODOI_APP_API_KEY) {
    return { configured: false, ok: false, error: "NOT_CONFIGURED", ...empty };
  }
  const url = `${env.THEODOI_APP_URL}/api/partner/case?id=${encodeURIComponent(caseId)}`;
  const init: RequestInit = { headers: { "X-API-Key": env.THEODOI_APP_API_KEY }, signal: AbortSignal.timeout(TIMEOUT_MS) };
  try {
    // Service Binding tren production (fetch() thang workers.dev cung tai khoan bi loi 1042 - xem
    // lib/viPhamBenNgoai.ts); local dev khong co binding thi fetch() thang URL.
    const res = env.THEODOI_APP ? await env.THEODOI_APP.fetch(url, init) : await fetch(url, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[mailTimeline] case=${caseId} HTTP ${res.status}: ${text.slice(0, 300)}`);
      return { configured: true, ok: false, error: `HTTP_${res.status}`, ...empty };
    }
    const body = (await res.json()) as { found?: boolean; luong?: MailLuong | null; thu?: MailThu[] };
    return {
      configured: true,
      ok: true,
      error: null,
      found: Boolean(body.found),
      luong: body.luong ?? null,
      thu: Array.isArray(body.thu) ? body.thu : [],
    };
  } catch (err) {
    console.error(`[mailTimeline] case=${caseId} loi:`, err);
    return { configured: true, ok: false, error: String(err).slice(0, 200), ...empty };
  }
}
