// Dich giao dien theo "cau goc tieng Viet" (2026-10-28, Dot 2+ cua i18n VI/EN/ID).
//
// tr("Quản lý tồn") / tr("Ca {0} đã đóng", id): khoa = chinh cau tieng Viet trong code, ban dich nam o
// tu-dien.json dang { "<cau tieng Viet>": ["<English>", "<Indonesia>"] }. Khong co trong tu dien = giu
// nguyen tieng Viet (an toan: du lieu nghiep vu nhu ten khu vuc/trang thai CRM khong bao gio bi dich vi
// khong ai dua vao tu dien). "{0}", "{1}"... = tham so (bien trong template string goc).
//
// Ngon ngu CO DINH trong 1 lan tai trang: doi ngon ngu -> tai lai trang (NgonNguSwitcher/AuthContext), nho
// vay ca hang so khai bao o cap module (mang OPTS, nhan cot...) cung dich dung ma khong can hook/re-render.
// Tu dien nap (dynamic import, chi khi khac "vi") TRUOC khi import App - xem main.tsx.
//
// Khoa i18next kieu t("topbar.logout") cua Dot 1 (i18n/index.ts) van dung song song cho phan khung.
// Them chuoi moi: boc tr("...") roi chay `node frontend/scripts/i18n-kiem-tra.mjs` de liet ke cau chua dich.

export type NgonNgu = "vi" | "en" | "id";
const LS_KEY = "dvbh_ngon_ngu";

function docNgonNgu(): NgonNgu {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v === "en" || v === "id" ? v : "vi";
  } catch {
    return "vi";
  }
}

export const NGON_NGU_TRANG: NgonNgu = docNgonNgu();

let bang: Map<string, string> | null = null; // cau Viet -> ban dich
let nguoc: Map<string, string> | null = null; // ban dich -> cau Viet (giu Excel tieng Viet)

export async function napTuDien(): Promise<void> {
  if (NGON_NGU_TRANG === "vi") return;
  const tuDien = (await import("./tu-dien.json")).default as Record<string, string[]>;
  const cot = NGON_NGU_TRANG === "en" ? 0 : 1;
  bang = new Map();
  nguoc = new Map();
  for (const [vi, dich] of Object.entries(tuDien)) {
    const s = dich[cot];
    if (!s) continue;
    bang.set(vi, s);
    if (!nguoc.has(s)) nguoc.set(s, vi);
  }
}

export function tr(vi: string, ...thamSo: unknown[]): string {
  const s = bang?.get(vi) ?? vi;
  if (thamSo.length === 0) return s;
  return s.replace(/\{(\d+)\}/g, (m, k: string) => {
    const v = thamSo[Number(k)];
    return v === undefined ? m : String(v);
  });
}

/** Doi 1 nhan da dich (ngon ngu DANG CHON) ve lai tieng Viet - exportExcel dung lam ten cot noi bo (mau chon cot). */
export function veTiengViet(s: string): string {
  return nguoc?.get(s) ?? s;
}

/** Doc file Excel import do app tai ve (tieu de da dich theo ngon ngu nguoi TAI, co the khac nguoi dang import): tra ve
 * ham cho 1 cau tieng Viet -> moi cach viet cua no [vi, en, id] de so khop tieu de cot. Di theo chieu xuoi (khong dich
 * nguoc) vi nhieu cau Viet trung 1 ban dich. Nap tu dien day du ca o che do "vi". */
export async function napCacBanDichTieuDe(): Promise<(vi: string) => string[]> {
  const tuDien = (await import("./tu-dien.json")).default as Record<string, string[]>;
  return (vi: string) => [vi, ...(tuDien[vi] ?? []).filter(Boolean)];
}
