import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { getCachedEntry, setCachedEntry } from "../lib/closedDataCache";

/**
 * Nap du lieu "Bao cao luy ke" theo co che snapshot R2 tung THANG (xem backend/src/lib/luyKeChunks.ts):
 * 1. GET /luy-ke/manifest - hash + row_count TOAN BO cac thang da co, khong dung R2.
 * 2. So hash voi cache IndexedDB cuc bo (dung chung store voi "Ca da dong", key rieng
 *    "luy-ke-month-<thang>") - thang nao khac/thieu moi can tai.
 * 3. POST /luy-ke/chunks {thang: [...]} - chi goi cho nhung thang lech. Khong rate-limit (tan suat
 *    doc rat thap - vai thang/nam, moi thang chi tai lai khi hash thuc su doi).
 * Toan bo tinh toan/loc (theo khu vuc/hang/nganh/toc do...) lam o COMPONENT tu mang "rows" tra ve -
 * hook nay chi lo dong bo du lieu tho, khong loc gi ca.
 */

const CACHE_PREFIX = "luy-ke-month-";

export interface LuyKeRow {
  khu_vuc: string;
  phan_loai: string;
  dung_han: string;
  toc_do: string;
  thang: string;
  tren_96h: string;
  nam: string;
  hang: string;
  doi_tuong: string;
  nganh: string;
  nguon_crm: string;
  kh_vip: string;
  sl: number;
}

interface ManifestEntry {
  hash: string;
  rowCount: number;
}

interface ManifestResponse {
  manifest: Record<string, ManifestEntry>;
}

interface ChunksResponse {
  chunks: Record<string, LuyKeRow[]>;
}

interface MonthCacheEntry {
  hash: string;
  rows: LuyKeRow[];
}

export function useLuyKeChunked(enabled = true) {
  const [rows, setRows] = useState<LuyKeRow[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  // Tang khi 1 lan sync moi bat dau - lan sync cu con dang chay tu bo ket qua neu khong con moi nhat.
  const syncSeq = useRef(0);

  const sync = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    const mySeq = ++syncSeq.current;
    setIsLoading(true);
    setIsError(false);
    try {
      const manifestRes = await api.get<ManifestResponse>("/luy-ke/manifest");
      const serverMonths = Object.keys(manifestRes.manifest);

      const monthEntries = new Map<string, MonthCacheEntry>();
      const needFetch: string[] = [];
      for (const thang of serverMonths) {
        const cached = await getCachedEntry<MonthCacheEntry>(`${CACHE_PREFIX}${thang}`);
        if (cached && cached.data.hash === manifestRes.manifest[thang].hash) {
          monthEntries.set(thang, cached.data);
        } else {
          needFetch.push(thang);
        }
      }

      if (needFetch.length > 0) {
        const res = await api.post<ChunksResponse>("/luy-ke/chunks", { thang: needFetch });
        for (const thang of needFetch) {
          const chunkRows = res.chunks[thang] ?? [];
          const entry: MonthCacheEntry = { hash: manifestRes.manifest[thang].hash, rows: chunkRows };
          await setCachedEntry(`${CACHE_PREFIX}${thang}`, entry);
          monthEntries.set(thang, entry);
        }
      }

      if (mySeq !== syncSeq.current) return;

      const merged = [...monthEntries.values()].flatMap((entry) => entry.rows);
      setRows(merged);
      setMonths(serverMonths.sort((a, b) => b.localeCompare(a)));
    } catch {
      if (mySeq === syncSeq.current) setIsError(true);
    } finally {
      if (mySeq === syncSeq.current) setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    sync();
  }, [sync]);

  return { rows, months, isLoading, isError, refetch: sync };
}
