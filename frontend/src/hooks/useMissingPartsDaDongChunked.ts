import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { getCachedEntry, setCachedEntry } from "../lib/closedDataCache";
import type { CaseRow } from "../types";

/**
 * Tab "Da dong" cua man Thieu linh kien - dung CHUNG co che chunk R2 theo ngay voi cases.ts
 * (xem hooks/useDaDongChunked.ts + backend/src/lib/daDongDayChunks.ts): manifest rieng
 * (/missing-parts/da-dong-manifest, tra them "reasons" mo rong + danh sach ly_do thuoc "thieu linh
 * kien"), nhung noi dung chunk ngay goi CHUNG endpoint POST /api/cases/da-dong-chunks (cung 1 file
 * R2, khong tao ban sao rieng) - tiet kiem ca ghi R2 lan quota rate-limit.
 *
 * Loc "chi giu ca co ly_do_cham gan nhat thuoc nhom thieu linh kien" (truoc day la INNER JOIN
 * settings_ly_do trong baseJoin()) gio lam client-side, vi phu thuoc dong thoi ca reasons (doi
 * thuong xuyen theo domain giai_trinh) lan settings_ly_do (bang cau hinh) - khong the "dong bang"
 * trong 1 snapshot bat bien duoc.
 */

const CACHE_PREFIX = "da-dong-day-";

interface DaDongManifestEntry {
  hash: string;
  rowCount: number;
}

interface MissingPartsReasonEntry {
  ly_do_cham: string | null;
  linh_kien_thieu: string | null;
  ngay_yeu_cau_co_hang: string | null;
  ngay_du_kien_hoan_thanh: string | null;
}

interface ManifestResponse {
  thang: string;
  chunks: Record<string, DaDongManifestEntry>;
  reasons: Record<string, MissingPartsReasonEntry>;
  thieuLinhKienLyDo: string[];
}

interface ChunksResponse {
  chunks: Record<string, Record<string, unknown>[]>;
  throttled: Record<string, { retryAfterSeconds: number }>;
}

interface DayCacheEntry {
  hash: string;
  rows: Record<string, unknown>[];
}

export interface ThrottleInfo {
  ngay: string;
  retryAfterSeconds: number;
}

// Ke thua toan bo cot case_dvbh (CaseRow) - chunk R2 thuc su chua "c.*" day du, khong chi vai truong
// he hien tren bang (can du cot cho drill-down theo REPORT_DIMS: tinh/doi_tac/hang/...).
export interface MissingPartClosedCase extends CaseRow {
  last_linh_kien_thieu: string | null;
  last_ngay_yeu_cau_co_hang: string | null;
}

export function useMissingPartsDaDongChunked(thang: string) {
  const [rows, setRows] = useState<MissingPartClosedCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [throttled, setThrottled] = useState<ThrottleInfo[]>([]);
  const syncSeq = useRef(0);

  const sync = useCallback(async () => {
    const mySeq = ++syncSeq.current;
    setIsLoading(true);
    setIsError(false);
    try {
      const manifest = await api.get<ManifestResponse>(`/missing-parts/da-dong-manifest?thang=${encodeURIComponent(thang)}`);
      const serverDays = Object.keys(manifest.chunks);
      const thieuSet = new Set(manifest.thieuLinhKienLyDo);

      const dayEntries = new Map<string, DayCacheEntry>();
      const needFetch: string[] = [];

      for (const ngay of serverDays) {
        const cached = await getCachedEntry<DayCacheEntry>(`${CACHE_PREFIX}${ngay}`);
        if (cached && cached.data.hash === manifest.chunks[ngay].hash) {
          dayEntries.set(ngay, cached.data);
        } else {
          needFetch.push(ngay);
        }
      }

      const throttledList: ThrottleInfo[] = [];
      if (needFetch.length > 0) {
        const res = await api.post<ChunksResponse>("/cases/da-dong-chunks", { ngay: needFetch });
        for (const ngay of needFetch) {
          if (res.chunks[ngay]) {
            const entry: DayCacheEntry = { hash: manifest.chunks[ngay].hash, rows: res.chunks[ngay] };
            await setCachedEntry(`${CACHE_PREFIX}${ngay}`, entry);
            dayEntries.set(ngay, entry);
          } else if (res.throttled[ngay]) {
            throttledList.push({ ngay, retryAfterSeconds: res.throttled[ngay].retryAfterSeconds });
            const stale = await getCachedEntry<DayCacheEntry>(`${CACHE_PREFIX}${ngay}`);
            if (stale) dayEntries.set(ngay, stale.data);
          }
        }
      }

      if (mySeq !== syncSeq.current) return;

      const merged: MissingPartClosedCase[] = [];
      for (const entry of dayEntries.values()) {
        for (const row of entry.rows) {
          const id = row.id as string;
          const reason = manifest.reasons[id];
          if (!reason || !reason.ly_do_cham || !thieuSet.has(reason.ly_do_cham)) continue;
          merged.push({
            ...(row as unknown as CaseRow),
            last_linh_kien_thieu: reason.linh_kien_thieu,
            last_ngay_yeu_cau_co_hang: reason.ngay_yeu_cau_co_hang,
            last_ngay_du_kien_hoan_thanh: reason.ngay_du_kien_hoan_thanh,
          });
        }
      }
      merged.sort((a, b) => String(b.thoi_gian_hoan_thanh ?? "").localeCompare(String(a.thoi_gian_hoan_thanh ?? "")));

      setRows(merged);
      setThrottled(throttledList);
    } catch {
      if (mySeq === syncSeq.current) setIsError(true);
    } finally {
      if (mySeq === syncSeq.current) setIsLoading(false);
    }
  }, [thang]);

  useEffect(() => {
    sync();
  }, [sync]);

  return { rows, isLoading, isError, throttled, refetch: sync };
}
