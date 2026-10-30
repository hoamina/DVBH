import { api } from "../api/client";

/**
 * Tai chunk R2 "ca da dong" theo DOT nho (CHOT 2026-10-30): truoc day hook gui CA THANG trong 1 request -> Worker gop ~30 ngay
 * thanh 1 chuoi JSON qua lon -> 500 "RangeError: Invalid string length" (Danh sach tong thang 09 "Khong tai duoc du lieu"; lan
 * loi van tinh vao han muc tai nen cac lan sau hien "dang cho dong bo"). Gio moi request toi da NGAY_MOI_DOT ngay; dot nao loi thi
 * cac ngay do tra ve trong "loi" (hook xu ly nhu bi cho: dung tam cache cu + tu thu lai), KHONG lam hong ca thang.
 * Server cung chan toi da 5 ngay/request (routes/cases.ts POST /da-dong-chunks).
 *
 * Dang "cot" (SUA 2026-10-30, v1.512): moi dong la object 82 cot lap lai ten cot o tung ca (~3,6 KB/ca, Danh sach tong thang 10
 * len toi ~216 MB) -> server tra { cot: [...ten cot], dong: [[gia tri...]] } (giam ~40%), cache IndexedDB cung luu dang nay.
 * Dong mo ra (moDong) van du MOI cot ke ca null -> Excel xuat "tat ca cot" khong doi.
 */
const NGAY_MOI_DOT = 3;

export interface ChunkCot {
  cot: string[];
  dong: unknown[][];
}

export interface ChunkDotResult {
  chunks: Record<string, ChunkCot>;
  throttled: Record<string, { retryAfterSeconds: number }>;
}

/** Entry cache IndexedDB 1 ngay: dang cot (moi) hoac "rows" object (cache cu truoc v1.512). */
export interface DayCacheEntry<Row> {
  hash: string;
  cot?: string[];
  dong?: unknown[][];
  rows?: Row[];
}

export function moDong<Row>(entry: DayCacheEntry<Row>): Row[] {
  if (entry.rows) return entry.rows;
  const cot = entry.cot ?? [];
  return (entry.dong ?? []).map((d) => {
    const row: Record<string, unknown> = {};
    for (let i = 0; i < cot.length; i++) row[cot[i]] = d[i];
    return row as Row;
  });
}

export async function taiChunkTheoDot(ngay: string[], qg: string | null | undefined): Promise<ChunkDotResult> {
  const out: ChunkDotResult = { chunks: {}, throttled: {} };
  for (let i = 0; i < ngay.length; i += NGAY_MOI_DOT) {
    const dot = ngay.slice(i, i + NGAY_MOI_DOT);
    try {
      const res = await api.post<ChunkDotResult>("/cases/da-dong-chunks", { ngay: dot, qg: qg ?? undefined, dang: "cot" });
      Object.assign(out.chunks, res.chunks);
      Object.assign(out.throttled, res.throttled);
    } catch {
      // Dot loi (mang/Worker): coi nhu "cho dong bo" 60s - hook dung tam cache cu neu co va tu thu lai.
      for (const d of dot) out.throttled[d] = { retryAfterSeconds: 60 };
    }
  }
  return out;
}
