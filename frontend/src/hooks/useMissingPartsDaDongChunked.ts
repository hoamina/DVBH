import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { moDong, taiChunkTheoDot, type DayCacheEntry as DayCacheEntryChung } from "../lib/daDongChunkFetch";
import { useHuyBoIds } from "./useHuyBoIds";
import { api } from "../api/client";
import { getCachedEntry, setCachedEntry } from "../lib/closedDataCache";
import type { CaseRow } from "../types";
import { laNskxDoiTac, locTheoPhamVi, locTheoQuocGia, usePhamVi, useQuocGiaDangXem } from "../lib/phamVi";

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

type DayCacheEntry = DayCacheEntryChung<Record<string, unknown>>;

export interface ThrottleInfo {
  ngay: string;
  retryAfterSeconds: number;
}

// Ke thua toan bo cot case_dvbh (CaseRow) - chunk R2 thuc su chua "c.*" day du, khong chi vai truong
// he hien tren bang (can du cot cho drill-down theo REPORT_DIMS: tinh/doi_tac/hang/...).
export interface MissingPartClosedCase extends CaseRow {
  last_linh_kien_thieu: string | null;
  last_ngay_yeu_cau_co_hang: string | null;
  // Gan o MissingPartsDaDongList (theo trang, GET /missing-parts/ten-linh-kien) - khong co trong chunk R2.
  ten_linh_kien_thieu?: string | null;
}

export function useMissingPartsDaDongChunked(thang: string) {
  const [rows, setRows] = useState<MissingPartClosedCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [throttled, setThrottled] = useState<ThrottleInfo[]>([]);
  const syncSeq = useRef(0);

  // "Đa quốc gia": server chi tra dong cua nuoc dang xem -> khoa cache IndexedDB + noi dung tach theo nuoc.
  const qgTai = useQuocGiaDangXem();
  const hauToNuoc = qgTai ? `${qgTai}-` : "";
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
        const res = await taiChunkTheoDot(needFetch, qgTai);
        for (const ngay of needFetch) {
          if (res.chunks[ngay]) {
            const entry: DayCacheEntry = { hash: manifest.chunks[ngay].hash, ...res.chunks[ngay] };
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

      const merged: MissingPartClosedCase[] = [];
      for (const entry of dayEntries.values()) {
        for (const row of moDong(entry)) {
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
  }, [thang, qgTai]);

  useEffect(() => {
    sync();
  }, [sync]);

  // Bo ca da huy bo (CHOT 2026-10-11): ca huy truoc khi chunk duoc ghi da co huy_bo_at trong chunk, ca
  // huy SAU khi ghi chunk chi biet qua tap id tu server (xem useHuyBoIds).
  const huyBoIds = useHuyBoIds();
  // "Phạm vi báo cáo" (lib/phamVi.ts): chunk R2 toan he thong -> loc tai trinh duyet.
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
