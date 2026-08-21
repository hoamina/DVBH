// Hook dung chung: mount 1 lan o MainApp (App.tsx) de kich hoat dong bo NGAM 3 tap du lieu Google
// Sheet ngay sau khi dang nhap, va CaseDetail.tsx goi lai CUNG hook nay - TanStack Query tu chia se
// cache theo queryKey nen khong fetch lai lan 2, chi doc lai ket qua dang co/dang tai.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataset, type PurchaseWarrantyDataset } from "../lib/purchaseWarrantySync";

const STALE_TIME = 2 * 60 * 60 * 1000; // 2 gio, khop TTL cache IndexedDB o purchaseWarrantySync.ts
const DATASETS: PurchaseWarrantyDataset[] = ["mua-hang", "bao-hanh", "thieu-hang", "qc-thuc-te", "po-dat-hang"];

function useDatasetQuery(dataset: PurchaseWarrantyDataset) {
  return useQuery({
    queryKey: ["purchase-warranty", dataset],
    queryFn: () => getDataset(dataset),
    staleTime: STALE_TIME,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function usePurchaseWarrantyData() {
  const queryClient = useQueryClient();
  const muaHangQ = useDatasetQuery("mua-hang");
  const baoHanhQ = useDatasetQuery("bao-hanh");
  const thieuHangQ = useDatasetQuery("thieu-hang");
  const qcThucTeQ = useDatasetQuery("qc-thuc-te");
  const poDatHangQ = useDatasetQuery("po-dat-hang");

  // "isSyncing" = lan dau tien chua co du lieu nao (dang cho fetch/doc IndexedDB xong) - dung de
  // hien "Dang dong bo du lieu…" trong CaseDetail. Sau lan dau, moi lan tai lai ngam (het TTL hoac
  // bam nut) khong can che UI - du lieu cu van con hien trong luc cho.
  const isSyncing = muaHangQ.isLoading || baoHanhQ.isLoading || thieuHangQ.isLoading || qcThucTeQ.isLoading || poDatHangQ.isLoading;

  const cachedAts = [muaHangQ.data?.cachedAt, baoHanhQ.data?.cachedAt, thieuHangQ.data?.cachedAt, qcThucTeQ.data?.cachedAt, poDatHangQ.data?.cachedAt].filter((v): v is string => !!v);
  const lastSyncedAt = cachedAts.length > 0 ? cachedAts.reduce((a, b) => (a > b ? a : b)) : null;

  async function refreshAll() {
    await Promise.all(
      DATASETS.map(async (d) => {
        const result = await getDataset(d, { force: true });
        queryClient.setQueryData(["purchase-warranty", d], result);
      }),
    );
  }

  return {
    muaHang: muaHangQ.data?.rows ?? [],
    baoHanh: baoHanhQ.data?.rows ?? [],
    thieuHang: thieuHangQ.data?.rows ?? [],
    qcThucTe: qcThucTeQ.data?.rows ?? [],
    poDatHang: poDatHangQ.data?.rows ?? [],
    isSyncing,
    isRefreshing:
      (muaHangQ.isFetching || baoHanhQ.isFetching || thieuHangQ.isFetching || qcThucTeQ.isFetching || poDatHangQ.isFetching) && !isSyncing,
    lastSyncedAt,
    refreshAll,
  };
}
