/**
 * "Luong doi tra" ton (CHOT 2026-10-12) - dung cho 2 chi tieu moi cua the "Canh bao ton" (Quan ly ton):
 * Cap 1 TP DVBH = luong ton >= 7 ngay, Cap 2 CEO = >= 10 ngay, chot 08:00 cung snapshot canh_bao_ton.
 *
 * Nguon: he "Theo doi doi may" (theodoidoimay, lib/mailTimeline.ts fetchLuongDoiTraList) - DVBH KHONG luu
 * luong trong D1. Dinh nghia "ton":
 * - luong CHUA ket thuc (ket_thuc_at NULL) - he kia tu ket thuc sau 30 ngay hoac nguoi dung bam ket thuc;
 * - VA chua "Doi tra thanh cong" (ca doi moi da "Hoan thanh..." co thoi_gian_hoan_thanh - doc LIVE tu
 *   case_dvbh qua caMoiLive, cung tieu chi moc "Đổi trả thành công" o LuongMailPanel.tsx). Luong da doi
 *   xong nhung chua bam ket thuc KHONG con la "ton".
 * Tuoi = so ngay tu luc PHAT SINH luong (origin_at, thieu thi created_at) den moc 00:00 hom nay gio VN -
 * cung kieu cat nguyen ngay voi ageExpr (ageCalc.ts AGE_ANCHOR) cua cac chi tieu khac.
 *
 * Cache trong bo nho isolate 5 phut cho cac lan doc LIVE (cot trang thai luong o danh sach KN, so "hom
 * nay" cua the) - KHONG dung caches.default vi Cache API khong hoat dong tren *.workers.dev. Snapshot
 * 08:00 luon goi moi (fresh = true).
 */
import type { Env } from "../types";
import { caMoiLive, fetchLuongDoiTraList, type LuongDoiTraRow } from "./mailTimeline";

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;
const CACHE_TTL_MS = 5 * 60_000;

const memCache = new Map<string, { at: number; data: { ok: boolean; error: string | null; rows: LuongDoiTraRow[] } }>();

/** fetchLuongDoiTraList + cache isolate 5 phut (trang_thai "" = tat ca, "dang_mo", "ket_thuc"). */
export async function fetchLuongDoiTraListCached(env: Env, trangThai: string, fresh = false) {
  const hit = memCache.get(trangThai);
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  const data = await fetchLuongDoiTraList(env, trangThai);
  if (data.ok) memCache.set(trangThai, { at: Date.now(), data });
  return data;
}

/** Tuoi (ngay) tu 1 moc ISO UTC den 00:00 hom nay gio VN; null neu khong parse duoc. */
export function tuoiLuongNgay(iso: string | null): number | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return null;
  const anchorUtc = Math.floor((Date.now() + VN_OFFSET_MS) / DAY_MS) * DAY_MS - VN_OFFSET_MS;
  return Math.trunc((anchorUtc - t) / DAY_MS);
}

/** "YYYY-MM-DD" gio VN cua 1 moc ISO UTC ("" neu khong parse duoc). */
export function ngayVNCuaIso(iso: string | null): string {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? "" : new Date(t + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export interface LuongTonRow {
  case_id: string;
  tuoi: number;
  last_at: string | null;
}

/** Cac luong dang "ton" (dinh nghia o dau file) kem tuoi. ok=false khi khong goi duoc he theodoidoimay. */
export async function computeLuongDoiTraTon(env: Env, fresh = false): Promise<{ ok: boolean; error: string | null; rows: LuongTonRow[] }> {
  const list = await fetchLuongDoiTraListCached(env, "dang_mo", fresh);
  if (!list.ok) return { ok: false, error: list.error, rows: [] };
  const mo = list.rows.filter((r) => !r.ket_thuc_at);
  const live = await caMoiLive(env, mo.map((r) => r.ca_moi_id).filter((x): x is string => !!x));
  const rows: LuongTonRow[] = [];
  for (const r of mo) {
    const cm = r.ca_moi_id ? live.get(r.ca_moi_id.toUpperCase()) : undefined;
    if (cm?.ca_moi_ht_at && /^Hoàn thành/i.test(cm.ca_moi_tien_do ?? "")) continue;
    const tuoi = tuoiLuongNgay(r.origin_at ?? r.created_at);
    if (tuoi === null) continue;
    rows.push({ case_id: r.case_id, tuoi, last_at: r.last_at });
  }
  return { ok: true, error: null, rows };
}
