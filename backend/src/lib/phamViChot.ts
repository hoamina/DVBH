import type { Env } from "../types";
import { PHAM_VI_LOC, envPhamVi } from "./phamVi";
import { generateDailySnapshot, generateKhuVucBacklogSnapshots, chotGiaiTrinhDailyLog } from "./dailySnapshot";
import { generateCanhBaoTonSnapshot, retryLuongDoiTraSnapshot } from "./canhBaoTon";
import { generateBacklogAgeSnapshot } from "./backlogAgeSnapshot";
import { generateTonKtvSnapshot } from "./tonKtvSnapshot";

// So chot 08:00 cho 2 pham vi NSKX / Khong NSKX (lib/phamVi.ts, migration 0136) - CUNG ham chot cua "Tất cả", chi
// khac DB da boc (doc view da loc, ghi vao bang "_<pv>"). Tung buoc boc try/catch rieng: 1 buoc loi khong chan buoc
// khac, va KHONG BAO GIO lam hong phan chot "Tất cả" (goi SAU khi "Tất cả" da chot xong). Telegram chi gui o "Tất cả"
// (xem phamViCua trong canhBaoTon.ts / dailySnapshot.ts).
async function thu(ten: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    console.error(`[pham-vi] ${ten} loi:`, err instanceof Error ? err.message : String(err));
  }
}

/** Chot 08:00 (cron) va nut "Làm mới báo cáo" (canhBaoTon=false: nut do khong chot the Canh bao ton). */
export async function chotSoLieuPhamVi(env: Env, generatedBy: string, opts: { canhBaoTon: boolean }): Promise<void> {
  for (const pv of PHAM_VI_LOC) {
    const e = envPhamVi(env, pv);
    await thu(`${pv} generateDailySnapshot`, () => generateDailySnapshot(e.DB, generatedBy));
    await thu(`${pv} generateKhuVucBacklogSnapshots`, () => generateKhuVucBacklogSnapshots(e.DB, generatedBy));
    if (opts.canhBaoTon) await thu(`${pv} generateCanhBaoTonSnapshot`, () => generateCanhBaoTonSnapshot(e, generatedBy));
    await thu(`${pv} generateBacklogAgeSnapshot`, () => generateBacklogAgeSnapshot(e.DB));
    await thu(`${pv} generateTonKtvSnapshot`, () => generateTonKtvSnapshot(e.DB));
  }
}

/** Chot ty le giai trinh 17:30. */
export async function chotGiaiTrinhPhamVi(env: Env): Promise<void> {
  for (const pv of PHAM_VI_LOC) await thu(`${pv} chotGiaiTrinhDailyLog`, () => chotGiaiTrinhDailyLog(envPhamVi(env, pv).DB));
}

/** Thu lai chi tieu luong doi tra cua the Canh bao ton (moi gio 9h-18h). */
export async function retryLuongDoiTraPhamVi(env: Env): Promise<void> {
  for (const pv of PHAM_VI_LOC) await thu(`${pv} retryLuongDoiTraSnapshot`, () => retryLuongDoiTraSnapshot(envPhamVi(env, pv)));
}
