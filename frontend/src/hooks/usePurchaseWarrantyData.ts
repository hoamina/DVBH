// Hook dung chung: mount 1 lan o MainApp (App.tsx) de kich hoat dong bo NGAM 3 tap du lieu Google
// Sheet ngay sau khi dang nhap, va CaseDetail.tsx goi lai CUNG hook nay - TanStack Query tu chia se
// cache theo queryKey nen khong fetch lai lan 2, chi doc lai ket qua dang co/dang tai.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getDataset, type PurchaseWarrantyDataset } from "../lib/purchaseWarrantySync";

const STALE_TIME = 2 * 60 * 60 * 1000; // 2 gio, khop TTL cache IndexedDB o purchaseWarrantySync.ts
const DATASETS: PurchaseWarrantyDataset[] = ["mua-hang", "bao-hanh", "thieu-hang", "qc-thuc-te", "po-dat-hang"];

// "po-dat-hang" co phan du lieu app EO Mua hang cap nhat lien tuc - hoi lai moi 5 phut (chi so version, re);
// phan Google Sheet ben trong van giu cache 2h (purchaseWarrantySync.ts getDataset).
const PO_STALE_TIME = 5 * 60 * 1000;

function useDatasetQuery(dataset: PurchaseWarrantyDataset) {
  return useQuery({
    queryKey: ["purchase-warranty", dataset],
    queryFn: () => getDataset(dataset),
    staleTime: dataset === "po-dat-hang" ? PO_STALE_TIME : STALE_TIME,
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
    await refreshSome(DATASETS);
  }

  // 2026-11-14: lam moi CHI cac tap can dung (vd Quan ly ton chi can PO + don mua + don BH, khong keo qc-thuc-te ~9MB).
  async function refreshSome(ds: PurchaseWarrantyDataset[]) {
    await Promise.all(
      ds.map(async (d) => {
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
    // Rieng tap "po-dat-hang" - tab "Linh kien thieu" (MissingPartsModule) hien trang thai dong bo PO.
    poSyncedAt: poDatHangQ.data?.cachedAt ?? null,
    poError: poDatHangQ.error ? String((poDatHangQ.error as Error).message ?? poDatHangQ.error) : null,
    refreshAll,
    refreshSome,
  };
}
