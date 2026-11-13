import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useQuocGiaDangXem } from "./phamVi";

/*
 * "Đa quốc gia" (2026-10-29, migration 0148, backend routes/quocGia.ts). GĐ1: danh muc quoc gia + mau ID (Cai dat ->
 * "Quốc gia") va pham vi quoc gia cua tung user (Quan ly User). Chua loc du lieu theo nuoc - GĐ2.
 */
export interface QuocGia {
  ma: string;
  ten: string;
  thu_tu: number;
  kich_hoat: number;
  telegram_chat_id: string | null;
  moc_ton_giai_trinh?: number;
  nguoi_sua: string | null;
  ngay_sua: string | null;
}
export interface MauIdQuocGia {
  id: number;
  mau_glob: string;
  ma_quoc_gia: string;
  nguon: string;
  do_uu_tien: number;
  ghi_chu: string | null;
  nguoi_sua: string | null;
  ngay_sua: string | null;
}
export interface QuocGiaPayload {
  quoc_gia: QuocGia[];
  mau_id: MauIdQuocGia[];
  canEdit: boolean;
  mac_dinh: string;
}

export const QUOC_GIA_QUERY_KEY = ["quoc-gia"];

export function useQuocGia() {
  return useQuery({
    queryKey: QUOC_GIA_QUERY_KEY,
    queryFn: () => api.get<QuocGiaPayload>("/quoc-gia"),
    staleTime: 10 * 60_000,
  });
}

/** "Mốc tồn cần giải trình" (so ngay) cua nuoc dang xem - VN 5, PH 1 (migration 0167). Khong co du lieu -> 5. */
export function useMocTonGiaiTrinh(): number {
  const { data } = useQuocGia();
  const qg = useQuocGiaDangXem() ?? "VN";
  return data?.quoc_gia.find((q) => q.ma === qg)?.moc_ton_giai_trinh ?? 5;
}
/** Doi so "5" trong nhan "Chưa GT >5 ngày" (moi ngon ngu) thanh moc cua nuoc dang xem. */
export function nhanTheoMoc(s: string, moc: number): string {
  return moc === 5 ? s : s.replace(/>\s*5/, `>${moc}`);
}

