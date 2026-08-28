import { useCallback, useEffect, useRef, useState } from "react";
import { api, buildQuery } from "../api/client";
import { getCachedEntry, setCachedEntry } from "../lib/closedDataCache";

/**
 * Nap du lieu "Bao cao tuoi ton trung binh" theo THANG (xem backend/src/lib/backlogAgeSnapshot.ts):
 * 1. GET /backlog-age-report/manifest - hash tung thang da co (khong dung R2, bang D1 nho).
 * 2. So hash voi cache IndexedDB cuc bo (dung chung store voi "Ca da dong"/"Luy ke", key rieng
 *    "backlog-age-month-<thang>") - chi khi khac/thieu moi goi lai server.
 * 3. GET /backlog-age-report/data?thang=... - chi 1 thang dang xem (khac luy-ke: khong tai truoc TOAN
 *    BO cac thang, vi bao cao nay tich luy hang ngay nen cang ve sau du lieu cang lon).
 * Toan bo tinh trung binh (tong_tuoi/so_ca) va gop theo dimension/ngay lam o COMPONENT tu "rows" tra
 * ve - hook nay chi lo dong bo du lieu tho cho 1 thang.
 */

const CACHE_PREFIX = "backlog-age-month-";

export interface BacklogAgeRow {
  ngay: string;
  dim: string;
  gia_tri: string;
  tong_tuoi: number;
  so_ca: number;
}

interface ManifestResponse {
  manifest: Record<string, string>;
}

interface DataResponse {
  thang: string;
  rows: BacklogAgeRow[];
}

interface MonthCacheEntry {
  hash: string;
  rows: BacklogAgeRow[];
}

export function useBacklogAgeReport(thang: string, enabled = true) {
  const [rows, setRows] = useState<BacklogAgeRow[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const syncSeq = useRef(0);

  const sync = useCallback(async () => {
    if (!enabled || !thang) {
      setIsLoading(false);
      return;
    }
    const mySeq = ++syncSeq.current;
    setIsLoading(true);
    setIsError(false);
    try {
      const manifestRes = await api.get<ManifestResponse>("/backlog-age-report/manifest");
      if (mySeq !== syncSeq.current) return;
      setMonths(Object.keys(manifestRes.manifest).sort((a, b) => b.localeCompare(a)));

      const serverHash = manifestRes.manifest[thang];
      if (!serverHash) {
        setRows([]);
        return;
      }

      const cached = await getCachedEntry<MonthCacheEntry>(`${CACHE_PREFIX}${thang}`);
      if (cached && cached.data.hash === serverHash) {
        setRows(cached.data.rows);
        return;
      }

      const res = await api.get<DataResponse>(`/backlog-age-report/data${buildQuery({ thang })}`);
      if (mySeq !== syncSeq.current) return;
      await setCachedEntry(`${CACHE_PREFIX}${thang}`, { hash: serverHash, rows: res.rows });
      setRows(res.rows);
    } catch {
      if (mySeq === syncSeq.current) setIsError(true);
    } finally {
      if (mySeq === syncSeq.current) setIsLoading(false);
    }
  }, [thang, enabled]);

  useEffect(() => {
    sync();
  }, [sync]);

  return { rows, months, isLoading, isError, refetch: sync };
}
