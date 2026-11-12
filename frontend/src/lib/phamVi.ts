import { useSyncExternalStore } from "react";

/*
 * "Phạm vi báo cáo: Tất cả / NSKX / Không NSKX" (2026-10-13) - CHI anh huong viec XEM bao cao/danh sach, moi nghiep vu
 * khac chay binh thuong. api/client.ts tu gan ?pv= vao moi request GET (tru badge menu...), server (backend
 * lib/phamVi.ts) doc/ghi bo du lieu rieng cua pham vi. Du lieu tai ve tu R2 (ca da dong, luy ke) loc tai trinh duyet
 * bang laNskxDoiTac / laNskxKhVip.
 */
export type PhamVi = "tat_ca" | "nskx" | "khong_nskx";

const KEY = "dvbh_pham_vi";
const listeners = new Set<() => void>();

/** Chieu NSKX hieu luc - NSKX chi co nghia o VN: dang xem nuoc khac thi luon "tat_ca" (khop backend chuanHoaPhamVi). */
export function phamViHienTai(): PhamVi {
  const qg = quocGiaHienTai();
  if (qg !== null && qg !== QUOC_GIA_CO_NSKX) return "tat_ca";
  return phamViDaChon();
}
function phamViDaChon(): PhamVi {
  try {
    const v = localStorage.getItem(KEY);
    return v === "nskx" || v === "khong_nskx" ? v : "tat_ca";
  } catch {
    return "tat_ca";
  }
}

/*
 * "Đa quốc gia" (2026-10-29, SRS §12, backend lib/phamVi.ts): nuoc dang xem. La QUYEN (users.pham_vi_quoc_gia, null =
 * toan bo) - server tu kiem lai, o day chi de gui ?qg= va dat khoa cache trinh duyet khop voi nuoc server dung.
 * Moi nguoi chi xem tung nuoc 1 (bo "Tất cả" 2026-11-11); null chi con la gia tri tam truoc khi biet quyen.
 */
export const QUOC_GIA_CO_NSKX = "VN";
const KEY_QG = "dvbh_quoc_gia";
// undefined = chua biet quyen (truoc khi /auth/me tra ve).
let quyenQuocGia: string[] | null | undefined;

/** Goi khi biet user (AuthContext): danh sach nuoc duoc xem, null = toan bo. */
export function datQuyenQuocGia(ds: string[] | null) {
  quyenQuocGia = ds;
  listeners.forEach((l) => l());
}
export function quyenQuocGiaHienTai(): string[] | null | undefined {
  return quyenQuocGia;
}
/** Nuoc dang xem (null = tat ca nuoc) - cung quy tac backend chonQuocGia. */
export function quocGiaHienTai(): string | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY_QG) || null;
  } catch {
    raw = null;
  }
  // Toan bo (hoac chua biet quyen): khong con "Tất cả quốc gia" (2026-11-11) -> mac dinh VN; server kiem lai nuoc co bat.
  if (!quyenQuocGia) return raw ?? QUOC_GIA_CO_NSKX;
  if (raw && quyenQuocGia.includes(raw)) return raw;
  return quyenQuocGia[0] ?? QUOC_GIA_CO_NSKX;
}
export function setQuocGia(v: string | null) {
  if (v) localStorage.setItem(KEY_QG, v);
  else localStorage.removeItem(KEY_QG);
  listeners.forEach((l) => l());
}
export function useQuocGiaDangXem(): string | null {
  return useSyncExternalStore(subscribe, quocGiaHienTai);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => (e.key === KEY || e.key === KEY_QG) && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}
export function setPhamVi(v: PhamVi) {
  localStorage.setItem(KEY, v);
  listeners.forEach((l) => l());
}
export function usePhamVi(): PhamVi {
  return useSyncExternalStore(subscribe, phamViHienTai);
}

export const PHAM_VI_LABEL: Record<PhamVi, string> = { tat_ca: "Tất cả", nskx: "NSKX", khong_nskx: "Không NSKX" };

/** Hau to cho khoa cache phia trinh duyet (IndexedDB) - "" o che do Tất cả (moi nuoc) de giu nguyen cache cu. */
export function hauToPhamVi(v: PhamVi = phamViHienTai(), qg: string | null = quocGiaHienTai()): string {
  return `${qg ? `|qg=${qg}` : ""}${v === "tat_ca" ? "" : `|pv=${v}`}`;
}

/** Loc du lieu tai tu R2 (chunk ca da dong) theo nuoc dang xem - chunk cu chua co cot quoc_gia = VN (truoc 2026-10-29). */
export function locTheoQuocGia<T>(rows: T[], qg: string | null = quocGiaHienTai()): T[] {
  if (qg === null) return rows;
  return rows.filter((r) => ((r as { quoc_gia?: string | null }).quoc_gia ?? QUOC_GIA_CO_NSKX) === qg);
}

/** Ca NSKX theo doi_tac: "NSKX" hoac "[NSKX]" (cach ghi CRM cu, du lieu truoc 07/2026) - khop view backend (migration 0136). */
export function laNskxDoiTac(doiTac: unknown): boolean {
  return doiTac === "NSKX" || doiTac === "[NSKX]";
}

/** Luy ke: cot "KH VIPs" chua "NSKX" (hoac ghi nham "NSXK", vd "NSXK - hết 1 năm") = nhom KH NSKX. */
export function laNskxKhVip(khVip: unknown): boolean {
  return /NSKX|NSXK/i.test(String(khVip ?? ""));
}

/** Loc 1 mang theo pham vi hien tai (du lieu tai tu R2 / tinh o trinh duyet). */
export function locTheoPhamVi<T>(rows: T[], laNskx: (r: T) => boolean, v: PhamVi = phamViHienTai()): T[] {
  if (v === "tat_ca") return rows;
  return rows.filter((r) => laNskx(r) === (v === "nskx"));
}

/*
 * Bo loc khu vuc "Tất cả DVBH (MB/MN...)" (gia tri ao "__QLDVBH__" = khu_vuc co chua "qldvbh") CHI co y nghia voi VN:
 * nuoc khac co khu vuc rieng (PH: "MM", "Retail"...) nen loc nay ra 0 ca (loi 2026-11-12: PH "Quản lý tồn" hien 0 du co 56
 * ca ton). Khi dang xem nuoc khac VN: an lua chon nay va coi nhu "Tất cả khu vực" - KHONG ghi de gia tri da luu, quay lai VN
 * van la "Tất cả DVBH". api/client.ts con bo "khu_vuc=__QLDVBH__" khoi request cua nuoc khac lam chot chan cuoi.
 */
export const GIA_TRI_NHOM_DVBH = "__QLDVBH__"; // = constants.ts QLDVBH_FILTER_VALUE (khong import de tranh vong phu thuoc)
export function coNhomDvbh(qg: string | null = quocGiaHienTai()): boolean {
  return qg === null || qg === QUOC_GIA_CO_NSKX;
}
/** Gia tri khu vuc dung that (nuoc khac VN + "Tất cả DVBH" -> macDinh = gia tri "Tất cả khu vực" cua man do). */
export function khuVucHieuLuc(v: string, macDinh = "", qg: string | null = quocGiaHienTai()): string {
  return v === GIA_TRI_NHOM_DVBH && !coNhomDvbh(qg) ? macDinh : v;
}
export function useKhuVucHieuLuc(v: string, macDinh = ""): string {
  return khuVucHieuLuc(v, macDinh, useQuocGiaDangXem());
}

/*
 * Khu vuc da gan cua user (khu_vuc_phu_trach + khu_vuc_duoc_xem) - toan la khu vuc VN tru khi Admin gan khu vuc rieng cua nuoc
 * khac. Loi 2026-11-12: nguoi gan MB1..MN3 chon PH thi 0 du lieu. Server (backend lib/phamVi.ts khuVucTheoNuocDangXem) da bo
 * khu vuc khong thuoc nuoc dang xem; o day: (1) KhuVucFilterControl khong hien chip / tu chon khu vuc VN khi xem nuoc khac,
 * (2) api/client.ts bo tham so khu_vuc chi gom khu vuc da gan (bo loc VN da luu) khoi request cua nuoc khac.
 */
let khuVucDaGan: string[] = [];
export function datKhuVucDaGan(ds: string[]) {
  khuVucDaGan = ds;
}
export function boKhuVucDaGanKhoiPath(path: string, qg: string | null = quocGiaHienTai()): string {
  if (coNhomDvbh(qg) || !khuVucDaGan.length) return path;
  const m = path.match(/([?&])khu_vuc=([^&]*)(&|$)/);
  if (!m) return path;
  let giaTri = "";
  try {
    giaTri = decodeURIComponent(m[2].replace(/\+/g, " "));
  } catch {
    return path;
  }
  const ds = giaTri.split(",").map((x) => x.trim()).filter(Boolean);
  if (!ds.length || !ds.every((k) => khuVucDaGan.includes(k))) return path;
  return path.replace(m[0], m[3] ? m[1] : "").replace(/\?$/, "");
}

