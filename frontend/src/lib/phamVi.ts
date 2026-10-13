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

export function phamViHienTai(): PhamVi {
  try {
    const v = localStorage.getItem(KEY);
    return v === "nskx" || v === "khong_nskx" ? v : "tat_ca";
  } catch {
    return "tat_ca";
  }
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
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

/** Hau to cho khoa cache phia trinh duyet (IndexedDB) - "" o che do Tất cả de giu nguyen cache cu. */
export function hauToPhamVi(v: PhamVi = phamViHienTai()): string {
  return v === "tat_ca" ? "" : `|pv=${v}`;
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
