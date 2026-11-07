import type { Env } from "../types";
import { withD1Retry } from "./d1Retry";
import { envPhamVi, hauToPhamVi, phamViTheoNuoc, type PhamViDb } from "./phamVi";
import { dsQuocGiaKichHoat } from "./quocGia";
import { damBaoBangQuocGia } from "./quocGiaKichHoat";
import { generateDailySnapshot, generateKhuVucBacklogSnapshots, chotGiaiTrinhDailyLog } from "./dailySnapshot";
import { generateCanhBaoTonSnapshot, retryLuongDoiTraSnapshot } from "./canhBaoTon";
import { generateBacklogAgeSnapshot } from "./backlogAgeSnapshot";
import { generateTonKtvSnapshot } from "./tonKtvSnapshot";

// So chot 08:00 cho cac pham vi NSKX / Khong NSKX (lib/phamVi.ts, migration 0136) + theo quoc gia (migration 0149) - CUNG ham chot cua "Tất cả", chi
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

/** Moi pham vi can chot ngoai "Tất cả": NSKX / Khong NSKX + tung nuoc dang bat (VN them VN x NSKX) - "Đa quốc gia" SRS §12.
 * Dam bao truoc view/bang cua nuoc (tao neu Admin vua bat nuoc moi ma lenh tao luc do loi). */
async function dsPhamViChot(env: Env): Promise<PhamViDb[]> {
  let dsNuoc: string[] = [];
  try {
    dsNuoc = await dsQuocGiaKichHoat(env.DB);
    await damBaoBangQuocGia(env.DB, dsNuoc);
  } catch (err) {
    console.error("[pham-vi] doc/tao bang quoc gia loi:", err instanceof Error ? err.message : String(err));
  }
  // Nuoc truoc (VN = da so nguoi xem), roi 2 pham vi NSKX toan he thong.
  const ds = phamViTheoNuoc(dsNuoc);
  return [...ds.filter((s) => s.qg !== null), ...ds.filter((s) => s.qg === null)];
}

/** Chot 08:00 (cron) va nut "Làm mới báo cáo" (canhBaoTon=false: nut do khong chot the Canh bao ton). */
// 2026-11-07: moi buoc boc withD1Retry - luc 08:00 D1 hay "overloaded" (pipeline import + nguoi dung mo man), truoc day 1 lan loi la mat
// so chot ca ngay (04/11-07/11 khong co ban chot 08:00 nao). Cac buoc deu upsert idempotent -> thu lai an toan.
export async function chotSoLieuPhamVi(env: Env, generatedBy: string, opts: { canhBaoTon: boolean }): Promise<void> {
  for (const s of await dsPhamViChot(env)) {
    const pv = hauToPhamVi(s);
    const e = envPhamVi(env, s);
    await thu(`${pv} generateDailySnapshot`, () => withD1Retry(() => generateDailySnapshot(e.DB, generatedBy), 6));
    await thu(`${pv} generateKhuVucBacklogSnapshots`, () => withD1Retry(() => generateKhuVucBacklogSnapshots(e.DB, generatedBy), 6));
    if (opts.canhBaoTon) await thu(`${pv} generateCanhBaoTonSnapshot`, () => withD1Retry(() => generateCanhBaoTonSnapshot(e, generatedBy), 6));
    await thu(`${pv} generateBacklogAgeSnapshot`, () => withD1Retry(() => generateBacklogAgeSnapshot(e.DB), 6));
    await thu(`${pv} generateTonKtvSnapshot`, () => withD1Retry(() => generateTonKtvSnapshot(e.DB), 6));
  }
}

/** Chot ty le giai trinh 17:30. */
export async function chotGiaiTrinhPhamVi(env: Env): Promise<void> {
  for (const s of await dsPhamViChot(env)) await thu(`${hauToPhamVi(s)} chotGiaiTrinhDailyLog`, () => chotGiaiTrinhDailyLog(envPhamVi(env, s).DB));
}

/** Thu lai chi tieu luong doi tra cua the Canh bao ton (moi gio 9h-18h). */
export async function retryLuongDoiTraPhamVi(env: Env): Promise<void> {
  for (const s of await dsPhamViChot(env)) await thu(`${hauToPhamVi(s)} retryLuongDoiTraSnapshot`, () => retryLuongDoiTraSnapshot(envPhamVi(env, s)));
}

/** Lam nong cache bao cao mac dinh cho pham vi VN (da so nguoi xem) - goi canh warmDefaultReports "Tất cả". */
export function envVn(env: Env): Env {
  return envPhamVi(env, { qg: "VN", pv: "tat_ca" });
}
