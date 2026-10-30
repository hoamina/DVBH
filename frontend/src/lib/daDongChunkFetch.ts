import { api } from "../api/client";

/**
 * Tai chunk R2 "ca da dong" theo DOT nho (CHOT 2026-10-30): truoc day hook gui CA THANG trong 1 request -> Worker gop ~30 ngay
 * thanh 1 chuoi JSON qua lon -> 500 "RangeError: Invalid string length" (Danh sach tong thang 09 "Khong tai duoc du lieu"; lan
 * loi van tinh vao han muc tai nen cac lan sau hien "dang cho dong bo"). Gio moi request toi da NGAY_MOI_DOT ngay; dot nao loi thi
 * cac ngay do tra ve trong "loi" (hook xu ly nhu bi cho: dung tam cache cu + tu thu lai), KHONG lam hong ca thang.
 * Server cung chan toi da 5 ngay/request (routes/cases.ts POST /da-dong-chunks).
 */
const NGAY_MOI_DOT = 3;

export interface ChunkDotResult<Row> {
  chunks: Record<string, Row[]>;
  throttled: Record<string, { retryAfterSeconds: number }>;
}

export async function taiChunkTheoDot<Row>(ngay: string[], qg: string | null | undefined): Promise<ChunkDotResult<Row>> {
  const out: ChunkDotResult<Row> = { chunks: {}, throttled: {} };
  for (let i = 0; i < ngay.length; i += NGAY_MOI_DOT) {
    const dot = ngay.slice(i, i + NGAY_MOI_DOT);
    try {
      const res = await api.post<ChunkDotResult<Row>>("/cases/da-dong-chunks", { ngay: dot, qg: qg ?? undefined });
      Object.assign(out.chunks, res.chunks);
      Object.assign(out.throttled, res.throttled);
    } catch {
      // Dot loi (mang/Worker): coi nhu "cho dong bo" 60s - hook dung tam cache cu neu co va tu thu lai.
      for (const d of dot) out.throttled[d] = { retryAfterSeconds: 60 };
    }
  }
  return out;
}
