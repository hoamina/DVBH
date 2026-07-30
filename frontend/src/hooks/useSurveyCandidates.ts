import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { getCachedEntry, setCachedEntry } from "../lib/closedDataCache";
import type { CanKhaoSatRow } from "../modules/SurveyModule";

/**
 * "Can khao sat" / "Qua han khao sat": danh sach ca dang ton/moi dong co co nghi ngo vi pham, tinh
 * san theo snapshot R2 1 file (xem backend/src/lib/surveySnapshot.ts) - CHI ghi lai khi import
 * (nguyen tac #1, xem memory r2-json-write-trigger-rule.md).
 *
 * 1. GET /survey/candidates-manifest - hash + trang thai "da co dong vi_pham" theo case_id (doi
 *    thuong xuyen khi CSKH goi khao sat/QC chot) + assigned_to (doi khi Giam sat phan cong) - ca 2
 *    deu KHONG nam trong file R2 bat bien, doc song, nhe.
 * 2. So hash voi cache IndexedDB cuc bo - lech moi goi POST /survey/candidates-content (rate-limit
 *    theo file, xem lib/r2DownloadRateLimit.ts).
 * 3. Tinh lai need_loi_* (co vi pham NHUNG chua co dong vi_pham tuong ung) va "qua han" (>=3 ngay
 *    UTC ke tu thoi_gian_hoan_thanh, dung datetime('now','start of day','-3 days') UTC - GIONG HET
 *    RECENT_OR_OPEN_CONDITION/OVERDUE_SURVEY_CONDITION o backend/src/routes/survey.ts, KHONG dung
 *    moc VN nhu ageCalc.ts vi day la 2 cong thuc khac nhau trong codebase).
 */

const CACHE_KEY = "survey-candidates-snapshot";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const FLAG_TO_LOAI: Record<string, string> = {
  need_loi_120p: "Loi 120 phut",
  need_loi_qua_han_24h: "Hen qua 24h",
  need_loi_lo_ke_hoach: "Loi lo ke hoach",
  need_loi_kh_hen_lai: "KH hen lai",
};

interface ManifestResponse {
  hash: string | null;
  rowCount: number;
  viPhamExistingLoaiLoi: Record<string, string[]>;
  assignedTo: Record<string, string>;
  cancelledIds: string[];
}

interface ContentResponse {
  throttled: boolean;
  retryAfterSeconds?: number;
  rows?: Record<string, unknown>[];
}

interface SnapshotCacheEntry {
  hash: string;
  rows: Record<string, unknown>[];
}

function isOverdueUtc(thoiGianHoanThanh: string | null): boolean {
  if (!thoiGianHoanThanh) return false;
  const utcMidnight = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const cutoff = utcMidnight - 3 * MS_PER_DAY;
  const ts = Date.parse(`${thoiGianHoanThanh.replace(" ", "T")}Z`);
  return !Number.isNaN(ts) && ts < cutoff;
}

export function useSurveyCandidates() {
  const [canKhaoSat, setCanKhaoSat] = useState<CanKhaoSatRow[]>([]);
  const [quaHanKhaoSat, setQuaHanKhaoSat] = useState<CanKhaoSatRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [isThrottled, setIsThrottled] = useState(false);
  const syncSeq = useRef(0);

  const sync = useCallback(async () => {
    const mySeq = ++syncSeq.current;
    setIsLoading(true);
    setIsError(false);
    setIsThrottled(false);
    try {
      const manifest = await api.get<ManifestResponse>("/survey/candidates-manifest");

      let rawRows: Record<string, unknown>[] = [];
      const cached = manifest.hash ? await getCachedEntry<SnapshotCacheEntry>(CACHE_KEY) : null;
      if (manifest.hash && cached && cached.data.hash === manifest.hash) {
        rawRows = cached.data.rows;
      } else if (manifest.hash) {
        const res = await api.post<ContentResponse>("/survey/candidates-content", {});
        if (res.throttled) {
          if (mySeq !== syncSeq.current) return;
          setIsThrottled(true);
          if (cached) rawRows = cached.data.rows; // van dung ban cu neu co, hon la trong rong
        } else {
          rawRows = res.rows ?? [];
          await setCachedEntry<SnapshotCacheEntry>(CACHE_KEY, { hash: manifest.hash, rows: rawRows });
        }
      }

      if (mySeq !== syncSeq.current) return;

      const can: CanKhaoSatRow[] = [];
      const quaHan: CanKhaoSatRow[] = [];
      const cancelledIds = new Set(manifest.cancelledIds ?? []);

      for (const row of rawRows) {
        const id = row.id as string;
        if (cancelledIds.has(id)) continue; // ca da bi Admin "huy bo" - an khoi hang doi khao sat
        const surveyedLoaiLoi = new Set(manifest.viPhamExistingLoaiLoi[id] ?? []);
        const needFlags: Record<string, number> = {};
        let anyNeed = false;
        for (const [field, loai] of Object.entries(FLAG_TO_LOAI)) {
          const has = row[field.replace("need_", "")] === 1 && !surveyedLoaiLoi.has(loai);
          needFlags[field] = has ? 1 : 0;
          if (has) anyNeed = true;
        }
        if (!anyNeed) continue;

        const thoiGianHoanThanh = (row.thoi_gian_hoan_thanh as string | null) ?? null;
        const built: CanKhaoSatRow = {
          id,
          khach_hang: (row.khach_hang as string | null) ?? null,
          khu_vuc: (row.khu_vuc as string | null) ?? null,
          assigned_to: manifest.assignedTo[id] ?? null,
          need_loi_120p: needFlags.need_loi_120p,
          need_loi_qua_han_24h: needFlags.need_loi_qua_han_24h,
          need_loi_lo_ke_hoach: needFlags.need_loi_lo_ke_hoach,
          need_loi_kh_hen_lai: needFlags.need_loi_kh_hen_lai,
          mo_ta_loi: (row.mo_ta_loi as string | null) ?? null,
          ky_thuat_vien: (row.ky_thuat_vien as string | null) ?? null,
          tinh: (row.tinh as string | null) ?? null,
          quan_huyen: (row.quan_huyen as string | null) ?? null,
          thoi_gian_cskh_tiep_nhan: (row.thoi_gian_cskh_tiep_nhan as string | null) ?? null,
          thoi_gian_hen_xu_ly: (row.thoi_gian_hen_xu_ly as string | null) ?? null,
          thoi_gian_hoan_thanh: thoiGianHoanThanh,
          link_crm: (row.link_crm as string | null) ?? null,
          noi_dung_xu_ly: (row.noi_dung_xu_ly as string | null) ?? null,
        };

        if (isOverdueUtc(thoiGianHoanThanh)) quaHan.push(built);
        else can.push(built);
      }

      setCanKhaoSat(can);
      setQuaHanKhaoSat(quaHan);
    } catch {
      if (mySeq === syncSeq.current) setIsError(true);
    } finally {
      if (mySeq === syncSeq.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    sync();
  }, [sync]);

  return { canKhaoSat, quaHanKhaoSat, isLoading, isError, isThrottled, refetch: sync };
}
