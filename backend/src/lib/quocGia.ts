/**
 * "Đa quốc gia" (2026-10-29, migration 0148). Quoc gia + nguon cua 1 ca xac dinh tu MAU ID (GLOB kieu SQLite) trong
 * bang quoc_gia_mau_id - them nuoc/nguon moi chi can them dong cau hinh (Cai dat -> "Quốc gia"), khong sua code.
 * GĐ1: chi gan cot case_dvbh.quoc_gia luc import (dong GHI_MOI) + luu users.pham_vi_quoc_gia; chua ep quyen.
 */

export interface MauIdQuocGia {
  mau_glob: string;
  ma_quoc_gia: string;
  nguon: string;
  do_uu_tien: number;
}

/** Ma nuoc hop le: 2-5 chu in hoa (khop CHECK migration 0148) - GĐ2 ghep ma nay vao ten bang/view nen phai chat. */
export const RE_MA_QUOC_GIA = /^[A-Z]{2,5}$/;

/** Nuoc mac dinh: ID khong khop mau nao -> VN; tai khoan moi chi xem VN (chu he thong chot 2026-10-29). */
export const QUOC_GIA_MAC_DINH = "VN";
/** Gia tri users.pham_vi_quoc_gia ghi cho tai khoan moi (tru Admin bootstrap). */
export const PHAM_VI_QUOC_GIA_MAC_DINH = JSON.stringify([QUOC_GIA_MAC_DINH]);

/** GLOB SQLite (* ? [..] [^..]) -> RegExp, phan biet hoa/thuong nhu GLOB. Tra null neu mau hong. */
export function globSangRegex(glob: string): RegExp | null {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === "*") re += "[\\s\\S]*";
    else if (ch === "?") re += "[\\s\\S]";
    else if (ch === "[") {
      const end = glob.indexOf("]", i + 2);
      if (end < 0) return null;
      let body = glob.slice(i + 1, end);
      if (body.startsWith("^")) body = "^" + body.slice(1).replace(/[\\\]]/g, "\\$&");
      else body = body.replace(/[\\\]^]/g, "\\$&");
      re += `[${body}]`;
      i = end;
    } else re += ch.replace(/[.+^${}()|\\]/g, "\\$&");
  }
  try {
    return new RegExp(`^${re}$`);
  } catch {
    return null;
  }
}

export interface BoMauId {
  khop(id: string): { ma_quoc_gia: string; nguon: string } | null;
}

/** Sap theo do_uu_tien tang dan, cung uu tien thi mau dai hon truoc (cu the hon). */
export function taoBoMauId(rows: MauIdQuocGia[]): BoMauId {
  const ds = rows
    .map((r) => ({ ...r, re: globSangRegex(r.mau_glob) }))
    .filter((r): r is typeof r & { re: RegExp } => r.re !== null)
    .sort((a, b) => a.do_uu_tien - b.do_uu_tien || b.mau_glob.length - a.mau_glob.length);
  return {
    khop(id) {
      const r = ds.find((m) => m.re.test(id));
      return r ? { ma_quoc_gia: r.ma_quoc_gia, nguon: r.nguon } : null;
    },
  };
}

export async function docBoMauId(db: D1Database): Promise<BoMauId> {
  const { results } = await db
    .prepare("SELECT mau_glob, ma_quoc_gia, nguon, do_uu_tien FROM quoc_gia_mau_id")
    .all<MauIdQuocGia>();
  return taoBoMauId(results);
}

/** Quoc gia cua 1 ID theo bo mau - khong khop mau nao -> QUOC_GIA_MAC_DINH. */
export function xacDinhQuocGia(id: string, bo: BoMauId): string {
  return bo.khop(id)?.ma_quoc_gia ?? QUOC_GIA_MAC_DINH;
}

/** users.pham_vi_quoc_gia (JSON mang ma nuoc) -> mang ma hop le; NULL -> null (toan bo). Gia tri hong -> [] (khong nuoc
 * nao) chu KHONG phai toan bo: GĐ2 ep quyen theo truong nay nen loi du lieu phai "dong" (fail-closed). */
export function docPhamViQuocGia(raw: string | null | undefined): string[] | null {
  if (raw === null || raw === undefined) return null;
  try {
    const v = JSON.parse(raw);
    if (v === null) return null;
    if (!Array.isArray(v)) return [];
    return [...new Set(v.filter((x): x is string => typeof x === "string" && RE_MA_QUOC_GIA.test(x)))];
  } catch {
    return [];
  }
}

// Danh sach ma nuoc dang bat - doc moi request co ?qg cua user toan bo + moi lan cron chot, nen giu trong isolate
// 5 phut (bang vai dong). Sua danh muc (routes/quocGia.ts) goi xoaCacheQuocGia() cho isolate dang chay.
let cacheNuoc: { ds: string[]; luc: number } | null = null;
const TUOI_CACHE_NUOC_MS = 5 * 60_000;

export async function dsQuocGiaKichHoat(db: D1Database): Promise<string[]> {
  if (cacheNuoc && Date.now() - cacheNuoc.luc < TUOI_CACHE_NUOC_MS) return cacheNuoc.ds;
  const { results } = await db.prepare("SELECT ma FROM quoc_gia WHERE kich_hoat = 1 ORDER BY thu_tu, ma").all<{ ma: string }>();
  const ds = results.map((r) => r.ma).filter((m) => RE_MA_QUOC_GIA.test(m));
  cacheNuoc = { ds, luc: Date.now() };
  return ds;
}

export function xoaCacheQuocGia(): void {
  cacheNuoc = null;
}
