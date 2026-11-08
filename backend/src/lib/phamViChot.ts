import type { Env } from "../types";
import { withD1Retry } from "./d1Retry";
import { envPhamVi, hauToPhamVi, phamViTheoNuoc, type PhamViDb } from "./phamVi";
import { dsQuocGiaKichHoat } from "./quocGia";
import { damBaoBangQuocGia } from "./quocGiaKichHoat";
import { chotGiaiTrinhDailyLog } from "./dailySnapshot";
import { retryLuongDoiTraSnapshot } from "./canhBaoTon";
import { phamViCuaNhom } from "./chotTon";
import { getVnDateStr } from "./reportCache";

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

/** Chot ty le giai trinh 17:30 cho 1 nhom quoc gia (lib/chotTon.ts phamViCuaNhom: VN luc 17:30, nuoc khac + "Tất cả quốc gia" luc
 * 17:40). chiKhiChuaCo = lan thu lai (18:00): chi chot pham vi hom nay CHUA co dong log nao (tranh gui trung anh Telegram). */
export async function chotGiaiTrinhNhom(env: Env, nhom: string | null, chiKhiChuaCo = false): Promise<void> {
  if (nhom !== null) await thu(`${nhom} tao bang quoc gia`, () => damBaoBangQuocGia(env.DB, [nhom]));
  for (const s of phamViCuaNhom(nhom)) {
    const db = envPhamVi(env, s).DB;
    await thu(`${hauToPhamVi(s) || "tat-ca"} chotGiaiTrinhDailyLog`, async () => {
      if (chiKhiChuaCo) {
        const co = await db.prepare("SELECT 1 AS c FROM giai_trinh_daily_log WHERE ngay = ? LIMIT 1").bind(getVnDateStr()).first();
        if (co) return;
      }
      await withD1Retry(() => chotGiaiTrinhDailyLog(db), 6);
    });
  }
}

/** Thu lai chi tieu luong doi tra cua the Canh bao ton (moi gio 9h-18h). */
export async function retryLuongDoiTraPhamVi(env: Env): Promise<void> {
  for (const s of await dsPhamViChot(env)) await thu(`${hauToPhamVi(s)} retryLuongDoiTraSnapshot`, () => retryLuongDoiTraSnapshot(envPhamVi(env, s)));
}

/** Lam nong cache bao cao mac dinh cho pham vi VN (da so nguoi xem) - goi canh warmDefaultReports "Tất cả". */
export function envVn(env: Env): Env {
  return envPhamVi(env, { qg: "VN", pv: "tat_ca" });
}
