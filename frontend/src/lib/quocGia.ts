import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

/*
 * "Đa quốc gia" (2026-10-29, migration 0148, backend routes/quocGia.ts). GĐ1: danh muc quoc gia + mau ID (Cai dat ->
 * "Quốc gia") va pham vi quoc gia cua tung user (Quan ly User). Chua loc du lieu theo nuoc - GĐ2.
 */
export interface QuocGia {
  ma: string;
  ten: string;
  thu_tu: number;
  kich_hoat: number;
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
