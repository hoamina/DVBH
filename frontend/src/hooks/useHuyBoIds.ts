import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

// Tap id ca da Admin "huy bo" (GET /cases/huy-bo/ids). CHOT 2026-10-11: ca huy bo KHONG hien trong bat
// ky danh sach/bao cao nao. Backend da loc qua view case_hieu_luc, nhung chunk R2 "Ca da dong" chup du
// lieu luc import - ca bi huy SAU do van nam trong chunk (khong ghi lai R2 khi huy) nen client phai tu
// loc them bang tap id nay (xem useDaDongChunked / useMissingPartsDaDongChunked).
export function useHuyBoIds(): Set<string> {
  const { data } = useQuery({
    queryKey: ["cases-huy-bo-ids"],
    queryFn: () => api.get<{ ids: string[] }>("/cases/huy-bo/ids"),
    staleTime: 10 * 60 * 1000,
  });
  return useMemo(() => new Set(data?.ids ?? []), [data]);
}
