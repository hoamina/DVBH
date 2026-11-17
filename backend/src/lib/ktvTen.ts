/**
 * "Bao cao KTV gom theo MA, hien ten MOI NHAT" (chu he thong, 2026-11-17, sau dot doi ten tram hang loat ben Odoo).
 *
 * case_dvbh.ky_thuat_vien / ktv_trien_khai = "(ma) Loai - Khu vuc - Ten", chep nguyen tu CRM/Odoo luc import. Doi ten tram
 * -> chi ca duoc pipeline gui lai mang ten moi, ca cu (nhat la ca da dong) giu ten cu -> cung 1 ma co nhieu chuoi -> bao cao
 * gom theo nguyen chuoi tach 1 KTV thanh nhieu dong (ngoai ra con chenh Unicode NFD (CRM cu) / NFC (Odoo), hau to "(huy)"...).
 *
 * Cach lam: KHONG doi SQL/snapshot. Bang ktv_ten_moi_nhat (migration 0174) giu ten cua ca tiep nhan moi nhat cho tung ma; o tang
 * route, cac dong bao cao duoc doi ten qua tenKtvChuan() roi GOP cac dong trung ten (cong cac cot so). Vi ap luc DOC, so chot 08:00
 * cu cung duoc gop dung. Chuoi khong co "(ma)" (vd KTV PH "Ten (email)") giu nguyen, chi chuan hoa NFC.
 */
import { extractMaKtv } from "./ktvCode";
import { nowVN } from "./vnTime";

export type BangTenKtv = Map<string, string>;

const TUOI_CACHE_MS = 5 * 60 * 1000;
let cache: { luc: number; bang: BangTenKtv; phienBan: string } | null = null;

function chuanHoaChuoi(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Doc bang ma -> ten moi nhat (~300 dong), cache trong isolate 5 phut. Loi doc (vd bang chua migrate) -> bang rong = giu nguyen ten. */
export async function layBangTenKtv(db: D1Database): Promise<BangTenKtv> {
  return (await layBangTenKtvKemPhienBan(db)).bang;
}

/** Kem "phienBan" (thay doi khi bat ky ten nao doi) - dung ghep vao hash/manifest de client biet tai lai. */
export async function layBangTenKtvKemPhienBan(db: D1Database): Promise<{ bang: BangTenKtv; phienBan: string }> {
  if (cache && Date.now() - cache.luc < TUOI_CACHE_MS) return cache;
  const bang: BangTenKtv = new Map();
  let phienBan = "0";
  try {
    const { results } = await db.prepare("SELECT ma, ten FROM ktv_ten_moi_nhat").all<{ ma: string; ten: string }>();
    let h = 0;
    for (const r of results) {
      const ten = chuanHoaChuoi(r.ten);
      bang.set(r.ma, ten);
      const s = `${r.ma}\u0000${ten}`;
      for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
    }
    phienBan = `${results.length}.${(h >>> 0).toString(36)}`;
  } catch (e) {
    console.error("[ktvTen] khong doc duoc ktv_ten_moi_nhat:", e);
  }
  cache = { luc: Date.now(), bang, phienBan };
  return cache;
}

/** Ten hien thi chuan cua 1 chuoi KTV: co "(ma)" va ma co trong bang -> ten moi nhat; khong thi giu chuoi (chuan hoa NFC). */
export function tenKtvChuan<T extends string | null | undefined>(bang: BangTenKtv, ten: T): T {
  if (ten === null || ten === undefined || ten === "") return ten;
  const ma = extractMaKtv(ten);
  return ((ma && bang.get(ma)) || chuanHoaChuoi(ten)) as T;
}

/** Doi ten cac cot KTV cua tung dong roi gop cac dong trung khoa (cac cot KTV + cac cot "khoaThem"): cot so cong don, cot khac lay
 * gia tri dong dau. Thu tu giu theo lan xuat hien dau tien. */
export function gopDongTheoKtv<T extends object>(
  rows: T[],
  bang: BangTenKtv,
  cotKtv: string[],
  khoaThem: string[] = [],
): T[] {
  const gop = new Map<string, T>();
  for (const r of rows) {
    const moi: Record<string, unknown> = { ...(r as Record<string, unknown>) };
    for (const cot of cotKtv) if (typeof moi[cot] === "string") moi[cot] = tenKtvChuan(bang, moi[cot] as string);
    const khoa = [...cotKtv, ...khoaThem].map((k) => String(moi[k] ?? "\u0001")).join("\u0000");
    const cu = gop.get(khoa) as Record<string, unknown> | undefined;
    if (!cu) {
      gop.set(khoa, moi as T);
      continue;
    }
    for (const [k, v] of Object.entries(moi)) {
      if (cotKtv.includes(k) || khoaThem.includes(k)) continue;
      if (typeof v === "number") cu[k] = (typeof cu[k] === "number" ? (cu[k] as number) : 0) + v;
      else if (cu[k] === null || cu[k] === undefined) cu[k] = v;
    }
  }
  return [...gop.values()];
}

/** Dieu kien loc "dung KTV nay" khop MOI ten cua cung ma (ten cu + ten moi): co "(ma)" -> so khop tien to "(ma)", khong thi so bang. */
export function ktvLocClause(cot: string, giaTri: string): { sql: string; binds: unknown[] } {
  const ma = extractMaKtv(giaTri);
  if (!ma) return { sql: ` AND ${cot} = ?`, binds: [giaTri] };
  const tienTo = `(${ma})`;
  return { sql: ` AND (${cot} = ? OR substr(${cot}, 1, ?) = ?)`, binds: [giaTri, tienTo.length, tienTo] };
}

/** Cap nhat bang ten tu cac dong import (moi dong hop le, ke ca BO_QUA): moi ma lay dong co thoi_gian_cskh_tiep_nhan lon nhat.
 * Chi ghi khi (ten khac va moc >= moc dang luu) hoac (moc sang ngay moi) -> toi da ~1 lan ghi/ma/ngay, ten doi thi ghi ngay. */
export async function capNhatTenKtvTuImport(db: D1Database, rows: Record<string, unknown>[]): Promise<number> {
  const tot = new Map<string, { ten: string; moc: string }>();
  for (const r of rows) {
    const moc = typeof r.thoi_gian_cskh_tiep_nhan === "string" ? r.thoi_gian_cskh_tiep_nhan.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}/.test(moc)) continue;
    for (const cot of ["ky_thuat_vien", "ktv_trien_khai"]) {
      const v = r[cot];
      if (typeof v !== "string") continue;
      const ma = extractMaKtv(v);
      if (!ma) continue;
      const cu = tot.get(ma);
      if (!cu || moc >= cu.moc) tot.set(ma, { ten: v.trim(), moc });
    }
  }
  if (tot.size === 0) return 0;
  const now = nowVN();
  const ds = [...tot.entries()];
  const lenh: D1PreparedStatement[] = [];
  // 4 bind/dong, D1 toi da 100 bind/cau -> 25 dong/cau.
  for (let i = 0; i < ds.length; i += 25) {
    const lo = ds.slice(i, i + 25);
    lenh.push(
      db
        .prepare(
          `INSERT INTO ktv_ten_moi_nhat (ma, ten, moc, cap_nhat) VALUES ${lo.map(() => "(?, ?, ?, ?)").join(", ")}
           ON CONFLICT(ma) DO UPDATE SET ten = excluded.ten, moc = excluded.moc, cap_nhat = excluded.cap_nhat
           WHERE (excluded.ten <> ktv_ten_moi_nhat.ten AND excluded.moc >= ktv_ten_moi_nhat.moc)
              OR substr(excluded.moc, 1, 10) > substr(ktv_ten_moi_nhat.moc, 1, 10)`,
        )
        .bind(...lo.flatMap(([ma, x]) => [ma, x.ten, x.moc, now])),
    );
  }
  await db.batch(lenh);
  cache = null; // isolate nay doc lai ngay lan sau
  return ds.length;
}
