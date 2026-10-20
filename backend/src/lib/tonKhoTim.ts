import type { D1Database } from "@cloudflare/workers-types";
import { getVersionTag } from "./dataVersions";

/**
 * Tim linh kien KHONG DAU cho o "Tra tồn LK" (TopBar, GET /api/ton-kho-lk/tim). SQLite khong bo dau duoc nen
 * dung 1 "chi muc" trong bo nho isolate: moi ma hang (ton_kho_lk gop MB/MN/KTV + ma chi co trong danh muc
 * linh_kien) kem chuoi da bo dau. Dung lai theo version domain ton_kho (dong bo ton) + settings (/sync/linh-kien
 * va sua danh muc deu bump settings) -> lan dau / sau khi doi du lieu ~14k dong doc, cac lan tim sau 1 dong
 * (so version). Isolate moi thi dung lai tu dau.
 */
export interface TonTimRow { ma_hang: string; ten_hang: string | null; dvt: string | null; ton_mb: number; ton_mn: number; ton_ktv: number; co_du_lieu_ton: number }
interface Entry extends TonTimRow { k: string; m: string }

let cache: { tag: string; at: number; rows: Entry[] } | null = null;
// Mot so duong sua danh muc linh_kien (lkSettings, linhKienSync) khong bump domain -> them han 10 phut cho chac.
const MAX_AGE_MS = 10 * 60_000;

/** Bo dau tieng Viet + d/D + thuong + gop khoang trang. */
export function boDau(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u0111\u0110]/g, "d")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

async function index(db: D1Database): Promise<Entry[]> {
  const tag = await getVersionTag(db, ["ton_kho", "settings"]);
  if (cache && cache.tag === tag && Date.now() - cache.at < MAX_AGE_MS) return cache.rows;
  const ton = (await db.prepare(
    `SELECT t.ma_hang, MAX(t.ten_hang) AS ten_hang, MAX(t.dvt) AS dvt,
            SUM(CASE WHEN n.nhom = 'MB' THEN t.cuoi_ky ELSE 0 END) AS ton_mb,
            SUM(CASE WHEN n.nhom = 'MN' THEN t.cuoi_ky ELSE 0 END) AS ton_mn,
            SUM(CASE WHEN t.nguon = 'ktv' THEN t.cuoi_ky ELSE 0 END) AS ton_ktv
     FROM ton_kho_lk t LEFT JOIN ton_kho_nhom_kho n ON n.ma_kho = t.ma_kho
     GROUP BY t.ma_hang`,
  ).all<Omit<TonTimRow, "co_du_lieu_ton">>()).results;
  const dm = (await db.prepare("SELECT ma_linh_kien, ten_linh_kien FROM linh_kien").all<{ ma_linh_kien: string; ten_linh_kien: string }>()).results;
  const seen = new Set(ton.map((r) => r.ma_hang));
  const tenDm = new Map(dm.map((r) => [r.ma_linh_kien, r.ten_linh_kien]));
  const rows: Entry[] = ton.map((r) => {
    const ten = r.ten_hang || tenDm.get(r.ma_hang) || null;
    return { ...r, ten_hang: ten, co_du_lieu_ton: 1, m: boDau(r.ma_hang), k: boDau(`${r.ma_hang} ${ten ?? ""}`) };
  });
  for (const r of dm) {
    if (seen.has(r.ma_linh_kien)) continue;
    rows.push({ ma_hang: r.ma_linh_kien, ten_hang: r.ten_linh_kien, dvt: null, ton_mb: 0, ton_mn: 0, ton_ktv: 0, co_du_lieu_ton: 0,
      m: boDau(r.ma_linh_kien), k: boDau(`${r.ma_linh_kien} ${r.ten_linh_kien}`) });
  }
  cache = { tag, at: Date.now(), rows };
  return rows;
}

/** Moi tu trong q (da bo dau) phai co trong "ma + ten". Uu tien: trung ma > ma bat dau bang q > con ton > ma. */
export async function timTonKho(db: D1Database, q: string, limit = 40): Promise<TonTimRow[]> {
  const nq = boDau(q);
  const words = nq.split(" ").filter(Boolean);
  if (!words.length) return [];
  const rows = await index(db);
  const hits = rows.filter((r) => words.every((w) => r.k.includes(w)));
  const rank = (r: Entry) => (r.m === nq ? 0 : r.m.startsWith(nq) ? 1 : 2);
  hits.sort((a, b) => rank(a) - rank(b) || (b.ton_mb + b.ton_mn) - (a.ton_mb + a.ton_mn) || a.ma_hang.localeCompare(b.ma_hang));
  return hits.slice(0, limit).map(({ k, m, ...r }) => r);
}
