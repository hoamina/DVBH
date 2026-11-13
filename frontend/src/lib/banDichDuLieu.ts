import { NGON_NGU_TRANG, tr } from "../i18n/tr";

/*
 * Ban dich cac lua chon trong Cai dat (ly do cham, loai loi vi pham, phan loai / ket qua / ly do ton tranh chap, loai de
 * xuat...) - "Đa quốc gia" SRS §12 Q3, migration 0150, backend routes/banDich.ts. Du lieu LUU va gui server van la tieng
 * Viet; CHI dich luc hien thi bang dl(gia tri). Tach rieng khoi tu dien giao dien tr() (i18n/tr.ts) de khong de len nhan
 * UI va tieu de cot Excel. GIA TRI o Excel / Telegram giu tieng Viet: chi boc dl() o cho render, khong boc
 * gia tri dem so sanh, gui server, dung lam khoa hay ghi vao file Excel.
 * Nap 1 lan sau khi dang nhap (AuthContext), chi khi ngon ngu khac "vi". Admin sua ban dich -> co hieu luc lan tai trang sau.
 */
let bang: Map<string, string> | null = null;

export async function napBanDichDuLieu(): Promise<void> {
  if (NGON_NGU_TRANG === "vi") return;
  try {
    const res = await fetch("/api/ban-dich", { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as { en: Record<string, string>; id: Record<string, string> };
    bang = new Map(Object.entries(NGON_NGU_TRANG === "en" ? data.en : data.id));
  } catch {
    // Loi mang -> giu tieng Viet, khong chan dang nhap.
  }
}

/** Dich 1 gia tri lua chon de HIEN THI - khong co ban dich (hoac khong phai chuoi) thi tra nguyen gia tri. */
export function dl(v: string): string;
export function dl<T>(v: T): T | string;
export function dl(v: unknown): unknown {
  if (typeof v !== "string" || !bang) return v;
  return bang.get(v) ?? bang.get(v.trim()) ?? v;
}

/**
 * Dich 1 GIA TRI du lieu CRM/Odoo de HIEN THI (hinh thuc bao hanh, tien do, ly do qua han/huy, nhom yeu cau, hien tuong
 * loi...) - 2026-11-13: ca nuoc ngoai (PH) xem bang tieng Anh ma cac gia tri nay van tieng Viet. Thu ban dich lua chon
 * Cai dat dl() truoc, roi tu dien tr() (cac gia tri co dinh cua CRM/Odoo nam trong tu-dien.json). Khong co = giu nguyen.
 * Chi boc o cho render (giong dl).
 */
export function gt(v: string): string;
export function gt<T>(v: T): T | string;
export function gt(v: unknown): unknown {
  if (typeof v !== "string" || NGON_NGU_TRANG === "vi") return v;
  const d = dl(v);
  if (d !== v) return d;
  return tr(v.trim());
}

/** "Cach thuc xu ly" Odoo dang "<hien tuong>: [<linh kien>] <hanh dong>, [<linh kien>] <hanh dong>": dich hien tuong + hanh dong,
 * giu nguyen ten/ma linh kien. */
export function gtCachThuc(v: string | null | undefined): string | null | undefined {
  if (!v || NGON_NGU_TRANG === "vi") return v;
  const m = /^([^:[\]]+):\s*(.*)$/s.exec(v);
  const dau = m ? `${gt(m[1].trim())}: ` : "";
  const than = m ? m[2] : v;
  if (!m && !than.includes("[")) return gt(v);
  return dau + than.replace(/\]\s+([^,[\]]+?)(?=\s*(,|$|NOTE:))/g, (_s, hd: string) => `] ${gt(hd.trim())}`);
}
