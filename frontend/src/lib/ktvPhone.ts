import { useQuery } from "@tanstack/react-query";
import { fetchWithHashCache } from "./staticListCache";
import type { KtvLienHeRow } from "../types";

/**
 * "case_dvbh.ky_thuat_vien" la text tu do tu CRM, dang "(ma) Loai - Khu vuc - Ten" (vd "(huannt.mb)
 * Tram Bac Ninh - TNHH TM va DV 3T Bac Ninh"). Phan "(ma)" o dau chuoi on dinh, phan con lai co the
 * doi qua cac lan import - dung ham nay de trich khoa dinh danh on dinh, khop dung ban sao phia
 * backend (backend/src/lib/ktvCode.ts) - khong co workspace dung chung FE/BE trong repo nay nen phai
 * lap lai, ham rat nho (5 dong) nen rui ro lech thap.
 */
export function extractMaKtv(kyThuatVien: string | null | undefined): string | null {
  if (!kyThuatVien) return null;
  const m = /^\(([^)]+)\)/.exec(kyThuatVien.trim());
  return m ? m[1].trim() : null;
}

export const KTV_PHONE_QUERY_KEY = ["settings-ktv-lien-he"];

/** Danh ba SDT KTV, doc qua cache hash noi dung (giong settings-ly-do/settings-linh-kien trong
 * SettingsModule.tsx) - danh sach nay duoc doc o RAT NHIEU man hinh (moi noi hien ten KTV) nhung
 * hiem khi doi, hop voi co che cache nay. */
export function useKtvPhoneMap() {
  const { data } = useQuery({
    queryKey: KTV_PHONE_QUERY_KEY,
    queryFn: () => fetchWithHashCache<{ rows: KtvLienHeRow[] }>("settings-ktv-lien-he", "/settings/ktv-lien-he/version", "/settings/ktv-lien-he"),
  });
  const map = new Map<string, KtvLienHeRow>();
  for (const row of data?.rows ?? []) map.set(row.ma_ktv, row);
  return map;
}
