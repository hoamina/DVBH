import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { taiChunkTheoDot } from "../lib/daDongChunkFetch";
import { useHuyBoIds } from "./useHuyBoIds";
import { api } from "../api/client";
import { getCachedEntry, setCachedEntry } from "../lib/closedDataCache";
import type { CaseRow } from "../types";
import { laNskxDoiTac, locTheoPhamVi, locTheoQuocGia, usePhamVi, useQuocGiaDangXem } from "../lib/phamVi";

/**
 * Nap du lieu "Ca da dong" theo co che snapshot R2 tung ngay (xem backend/src/lib/daDongDayChunks.ts):
 * 1. GET /cases/da-dong-manifest?thang= - hash + row_count tung ngay trong thang, khong dung R2.
 * 2. So hash voi cache IndexedDB cuc bo (key "da-dong-day-<ngay>") - ngay nao khac/thieu moi can tai.
 * 3. POST /cases/da-dong-chunks {ngay: [...]} - chi goi cho nhung ngay lech, server tu ap rate-limit
 *    RIENG cho tung ngay (10 phut/lan, 5 lan/ngay) - ngay bi chan roi vao "throttled", van dung du
 *    lieu cu trong cache cho ngay do (neu co).
 * Loc ad-hoc (khu_vuc/hang/dim/id) KHONG con o day - component goi hook tu loc tren mang "rows" tra
 * ve (chi loc trong pham vi da duoc phep xem, scope da loc o server).
 */

const CACHE_PREFIX = "da-dong-day-";

interface DaDongManifestEntry {
  hash: string;
  rowCount: number;
}

interface DaDongReasonEntry {
  ly_do_cham: string | null;
  ngay_giai_trinh: string | null;
  ngay_du_kien_hoan_thanh: string | null;
}

interface ManifestResponse {
  thang: string;
  chunks: Record<string, DaDongManifestEntry>;
  reasons: Record<string, DaDongReasonEntry>;
}

interface ChunksResponse {
  chunks: Record<string, CaseRow[]>;
  throttled: Record<string, { retryAfterSeconds: number }>;
}

interface DayCacheEntry {
  hash: string;
  rows: CaseRow[];
}

export interface ThrottleInfo {
  ngay: string;
  retryAfterSeconds: number;
}

export function useDaDongChunked(thang: string, enabled = true) {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [throttled, setThrottled] = useState<ThrottleInfo[]>([]);
  // So the tang khi 1 lan sync moi bat dau - lan sync cu con dang chay (vd doi thang lien tuc) phat
  // hien minh khong con la lan moi nhat thi tu bo ket qua, tranh ghi de state bang du lieu cu hon.
  const syncSeq = useRef(0);

  // "Đa quốc gia": server chi tra dong cua nuoc dang xem -> khoa cache IndexedDB + noi dung tach theo nuoc.
  const qgTai = useQuocGiaDangXem();
  const hauToNuoc = qgTai ? `${qgTai}-` : "";
  const sync = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    const mySeq = ++syncSeq.current;
    setIsLoading(true);
    setIsError(false);
    try {
      const manifest = await api.get<ManifestResponse>(`/cases/da-dong-manifest?thang=${encodeURIComponent(thang)}`);
      const serverDays = Object.keys(manifest.chunks);

      const dayEntries = new Map<string, DayCacheEntry>();
      const needFetch: string[] = [];

      for (const ngay of serverDays) {
        const cached = await getCachedEntry<DayCacheEntry>(`${CACHE_PREFIX}${hauToNuoc}${ngay}`);
        if (cached && cached.data.hash === manifest.chunks[ngay].hash) {
          dayEntries.set(ngay, cached.data);
        } else {
          needFetch.push(ngay);
        }
      }

      const throttledList: ThrottleInfo[] = [];
      if (needFetch.length > 0) {
        // Tai theo dot 3 ngay (lib/daDongChunkFetch.ts) - ca thang 1 request lam Worker loi "Invalid string length".
        const res: ChunksResponse = await taiChunkTheoDot(needFetch, qgTai);
        for (const ngay of needFetch) {
          if (res.chunks[ngay]) {
            const entry: DayCacheEntry = { hash: manifest.chunks[ngay].hash, rows: res.chunks[ngay] };
            await setCachedEntry(`${CACHE_PREFIX}${hauToNuoc}${ngay}`, entry);
            dayEntries.set(ngay, entry);
          } else if (res.throttled[ngay]) {
            throttledList.push({ ngay, retryAfterSeconds: res.throttled[ngay].retryAfterSeconds });
            // Chua co cache cua nuoc dang xem -> dung tam cache "Tất cả" (du moi nuoc, ben duoi van loc theo nuoc) thay vi trong.
            const stale =
              (await getCachedEntry<DayCacheEntry>(`${CACHE_PREFIX}${hauToNuoc}${ngay}`)) ??
              (hauToNuoc ? await getCachedEntry<DayCacheEntry>(`${CACHE_PREFIX}${ngay}`) : null);
            if (stale) dayEntries.set(ngay, stale.data);
          }
        }
      }

      if (mySeq !== syncSeq.current) return;

      const merged = [...dayEntries.values()].flatMap((entry) =>
        entry.rows.map((row) => {
          const reason = manifest.reasons[row.id];
          return reason
            ? { ...row, last_ly_do_cham: reason.ly_do_cham, last_ngay_giai_trinh: reason.ngay_giai_trinh, last_ngay_du_kien_hoan_thanh: reason.ngay_du_kien_hoan_thanh }
            : row;
        }),
      );
      merged.sort((a, b) => String(b.thoi_gian_hoan_thanh ?? "").localeCompare(String(a.thoi_gian_hoan_thanh ?? "")));

      setRows(merged);
      setThrottled(throttledList);
    } catch {
      if (mySeq === syncSeq.current) setIsError(true);
    } finally {
      if (mySeq === syncSeq.current) setIsLoading(false);
    }
  }, [thang, enabled, qgTai]);

  useEffect(() => {
    sync();
  }, [sync]);

  // Bo ca da huy bo (CHOT 2026-10-11): ca huy truoc khi chunk duoc ghi da co huy_bo_at trong chunk, ca
  // huy SAU khi ghi chunk chi biet qua tap id tu server (xem useHuyBoIds).
  const huyBoIds = useHuyBoIds();
  // "Phạm vi báo cáo" (lib/phamVi.ts): chunk R2 la du lieu toan he thong -> loc NSKX / Khong NSKX tai trinh duyet.
  const pv = usePhamVi();
  // "Đa quốc gia": chunk R2 chua ca moi nuoc -> loc theo nuoc dang xem tai trinh duyet (nhu NSKX).
  const qg = useQuocGiaDangXem();
  const visibleRows = useMemo(
    () =>
      locTheoPhamVi(
        locTheoQuocGia(
          rows.filter((r) => !(r as { huy_bo_at?: string | null }).huy_bo_at && !huyBoIds.has(String(r.id))),
          qg,
        ),
        (r) => laNskxDoiTac(r.doi_tac),
        pv,
      ),
    [rows, huyBoIds, pv, qg],
  );

  return { rows: visibleRows, isLoading, isError, throttled, refetch: sync };
}
