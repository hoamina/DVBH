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
  noi_dung: string; // ban da lam gon de hien thi (bo bang dan phang, chu ky) - he theodoidoimay src/gonThu.ts
  tom_tat: string; // 1 dong tom tat cho nhat ky mail
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
  ket_thuc_at: string | null; // nguoi dung xac nhan ket thuc luong doi tra (he do ngung truy van DVBH cho ca nay)
  ket_thuc_boi: string;
  ket_thuc_ghi_chu: string;
}

/** Nhat ky thao tac tren luong doi tra: he thong tu dong (nguoi = "Hệ thống") hoac nguoi dung DVBH. */
export interface MailNhatKy {
  hanh_dong: "tao_tu_mail" | "ket_thuc" | "mo_lai" | "gan_ca_moi" | "khong_co_ca_moi" | "bo_ca_moi";
  nguoi: string;
  nguoi_email: string;
  chi_tiet: string;
  at: string; // ISO UTC
}

/** Ca MOI mo de doi cho KH - he theodoidoimay noi voi ca goc CHI theo case_dvbh.id_khach_hang (sau moc duyet). */
export interface MailCaMoi {
  id_khach_hang: string;
  ca_moi_id: string | null;
  trang_thai_gan: "tu_dong" | "xac_nhan" | "goi_y" | "nhieu_ung_vien" | "chua_co" | "khong_co_id_kh";
  ca_moi_tn_at: string | null; // ISO UTC
  ca_moi_ht_at: string | null; // ca moi hoan thanh = doi tra thanh cong
  ca_moi_tien_do: string;
  ca_moi_san_pham: string;
  ung_vien: { id: string; tn_at: string | null; ht_at: string | null; san_pham: string; tien_do: string; khop_model: boolean }[];
}

export interface MailTimelineResult {
  configured: boolean;
  ok: boolean;
  error: string | null;
  found: boolean;
  luong: MailLuong | null;
  thu: MailThu[];
  ca_moi: MailCaMoi | null;
  nhat_ky: MailNhatKy[];
}

const TIMEOUT_MS = 8000;

/** Goi API doi tac cua theodoidoimay: Service Binding tren production, fetch() thang URL khi local dev. */
async function goiTheoDoi(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${env.THEODOI_APP_URL}${path}`;
  const req: RequestInit = {
    ...init,
    headers: { "X-API-Key": env.THEODOI_APP_API_KEY ?? "", "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };
  return env.THEODOI_APP ? env.THEODOI_APP.fetch(url, req) : fetch(url, req);
}

export function theoDoiConfigured(env: Env): boolean {
  return !!env.THEODOI_APP_URL && !!env.THEODOI_APP_API_KEY;
}

export type DoiTraAction = "ket-thuc" | "mo-lai" | "ca-moi";

/**
 * Thao tac tren luong doi tra (ket thuc / mo lai / nhap ma ca moi thu cong). DVBH da kiem tra quyen - gui kem
 * ten + email nguoi thao tac de he theodoidoimay ghi nhat ky. Tra { ok, error, status } (khong nem loi).
 */
export async function postDoiTraAction(
  env: Env,
  action: DoiTraAction,
  body: { case_id: string; nguoi: string; email: string; ghi_chu?: string; ca_moi_id?: string | null },
): Promise<{ ok: boolean; error: string | null; status: number }> {
  if (!theoDoiConfigured(env)) return { ok: false, error: "NOT_CONFIGURED", status: 503 };
  try {
    const res = await goiTheoDoi(env, `/api/partner/doi-tra/${action}`, { method: "POST", body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return { ok: res.ok && !!data.ok, error: res.ok ? null : (data.error ?? `HTTP_${res.status}`), status: res.status };
  } catch (err) {
    console.error(`[mailTimeline] ${action} case=${body.case_id} loi:`, err);
    return { ok: false, error: String(err).slice(0, 200), status: 502 };
  }
}

/** 1 dong trong danh sach luong doi tra (tab "Luồng duyệt đổi trả"). */
export interface LuongDoiTraRow {
  case_id: string;
  trang_thai: MailLuong["trang_thai"];
  loai_yeu_cau: string;
  serial: string;
  msg_count: number;
  origin_at: string | null;
  last_at: string | null;
  tiep_nhan_at: string | null;
  de_xuat_at: string | null;
  duyet_at: string | null;
  giao_xu_ly_at: string | null;
  len_so_at: string | null;
  len_do_at: string | null;
  ket_thuc_at: string | null;
  ket_thuc_boi: string;
  created_at: string;
  ca_moi_id: string | null;
  ca_moi_gan: MailCaMoi["trang_thai_gan"] | null;
  ca_moi_tn_at: string | null;
  ca_moi_ht_at: string | null;
  ca_moi_tien_do: string | null;
}

/**
 * Luong doi tra da gan case, loc trang thai PHIA he kia ("dang_mo" | "ket_thuc" | "" = tat ca) - mac dinh chi luong dang mo
 * (luong tu ket thuc sau 30 ngay -> so dong nho). Noi goi tu loc theo pham vi khu vuc/bo loc va phan trang.
 */
export async function fetchLuongDoiTraList(env: Env, trangThai = ""): Promise<{ ok: boolean; error: string | null; rows: LuongDoiTraRow[] }> {
  if (!theoDoiConfigured(env)) return { ok: false, error: "NOT_CONFIGURED", rows: [] };
  try {
    const res = await goiTheoDoi(env, `/api/partner/luong-list?trang_thai=${encodeURIComponent(trangThai)}`);
    if (!res.ok) return { ok: false, error: `HTTP_${res.status}`, rows: [] };
    const data = (await res.json()) as { rows?: LuongDoiTraRow[] };
    return { ok: true, error: null, rows: Array.isArray(data.rows) ? data.rows : [] };
  } catch (err) {
    console.error("[mailTimeline] luong-list loi:", err);
    return { ok: false, error: String(err).slice(0, 200), rows: [] };
  }
}

/** "2026-09-28 17:08:40" (gio VN, dinh dang case_dvbh) -> ISO UTC (dinh dang he theodoidoimay). */
function vnToIso(s: string | null): string | null {
  if (!s) return null;
  const t = Date.parse(`${s.trim().replace(" ", "T")}+07:00`);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Tien do HIEN TAI cua ca moi (ca doi cho KH) doc tu chinh D1 cua DVBH - he theodoidoimay ngung cap nhat ca moi khi luong
 * da ket thuc (tu ket thuc 30 ngay / gan tay sau khi ket thuc), nen DVBH tu doc de hien dung "Đổi trả thành công".
 */
export async function caMoiLive(
  env: Env,
  ids: string[],
): Promise<Map<string, Pick<MailCaMoi, "ca_moi_tn_at" | "ca_moi_ht_at" | "ca_moi_tien_do" | "ca_moi_san_pham">>> {
  const out = new Map<string, Pick<MailCaMoi, "ca_moi_tn_at" | "ca_moi_ht_at" | "ca_moi_tien_do" | "ca_moi_san_pham">>();
  if (!ids.length) return out;
  const { results } = await env.DB.prepare(
    `SELECT CAST(id AS TEXT) AS id, thoi_gian_cskh_tiep_nhan, thoi_gian_hoan_thanh, tien_do_hoan_thanh, san_pham_bao_hanh
     FROM case_dvbh WHERE id IN (SELECT value FROM json_each(?))`,
  )
    .bind(JSON.stringify([...ids, ...ids.map((x) => x.toLowerCase())]))
    .all<{ id: string; thoi_gian_cskh_tiep_nhan: string | null; thoi_gian_hoan_thanh: string | null; tien_do_hoan_thanh: string | null; san_pham_bao_hanh: string | null }>();
  for (const r of results) {
    out.set(r.id.toUpperCase(), {
      ca_moi_tn_at: vnToIso(r.thoi_gian_cskh_tiep_nhan),
      ca_moi_ht_at: vnToIso(r.thoi_gian_hoan_thanh),
      ca_moi_tien_do: r.tien_do_hoan_thanh ?? "",
      ca_moi_san_pham: r.san_pham_bao_hanh ?? "",
    });
  }
  return out;
}

export async function fetchMailTimeline(env: Env, caseId: string): Promise<MailTimelineResult> {
  const empty = { found: false, luong: null, thu: [], ca_moi: null, nhat_ky: [] };
  if (!env.THEODOI_APP_URL || !env.THEODOI_APP_API_KEY) {
    return { configured: false, ok: false, error: "NOT_CONFIGURED", ...empty };
  }
  try {
    // Service Binding tren production (fetch() thang workers.dev cung tai khoan bi loi 1042 - xem
    // lib/viPhamBenNgoai.ts); local dev khong co binding thi fetch() thang URL.
    const res = await goiTheoDoi(env, `/api/partner/case?id=${encodeURIComponent(caseId)}`);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[mailTimeline] case=${caseId} HTTP ${res.status}: ${text.slice(0, 300)}`);
      return { configured: true, ok: false, error: `HTTP_${res.status}`, ...empty };
    }
    const body = (await res.json()) as { found?: boolean; luong?: MailLuong | null; thu?: MailThu[]; ca_moi?: MailCaMoi | null; nhat_ky?: MailNhatKy[] };
    const caMoi = body.ca_moi ?? null;
    if (caMoi?.ca_moi_id) {
      const live = (await caMoiLive(env, [caMoi.ca_moi_id])).get(caMoi.ca_moi_id.toUpperCase());
      if (live) Object.assign(caMoi, live);
    }
    return {
      configured: true,
      ok: true,
      error: null,
      found: Boolean(body.found),
      luong: body.luong ?? null,
      thu: Array.isArray(body.thu) ? body.thu : [],
      ca_moi: caMoi,
      nhat_ky: Array.isArray(body.nhat_ky) ? body.nhat_ky : [],
    };
  } catch (err) {
    console.error(`[mailTimeline] case=${caseId} loi:`, err);
    return { configured: true, ok: false, error: String(err).slice(0, 200), ...empty };
  }
}
