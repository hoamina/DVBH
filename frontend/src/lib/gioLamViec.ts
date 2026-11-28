// Tinh "gio lam viec" cho SLA tung buoc Chi tiet ca (chot 2026-11-28):
//   vp  (van phong: BO, Kho, Mua hang, Admin BH) - T2-T6 8:00-12:00 + 13:30-17:30 (8h), T7 8:00-12:00, nghi chieu T7 + Chu nhat
//       + ngay trong "Ngày loại trừ giải trình" (Cai dat) cua khu vuc / nuoc cua ca.
//   ktv (viec cua KTV: hen, dong ca, tra xac) - 7:00-19:00 MOI ngay (12h, khong tru chieu T7 / Chu nhat), chi tru ngay loai tru.
//   lich - ngay lich (24h, khong tru gi).
// Moi gio tinh theo gio VN (UTC+7), dau vao / dau ra la epoch ms.
import { tr } from "../i18n/tr";

export type KieuGio = "vp" | "ktv" | "lich";

const VN_MS = 7 * 3600_000;
const NGAY_MS = 24 * 3600_000;

// Khung lam viec trong ngay (phut tu 00:00), theo thu (0 = CN).
function khung(kieu: KieuGio, thu: number): [number, number][] {
  if (kieu === "ktv") return [[7 * 60, 19 * 60]];
  if (thu === 0) return [];
  if (thu === 6) return [[8 * 60, 12 * 60]];
  return [
    [8 * 60, 12 * 60],
    [13 * 60 + 30, 17 * 60 + 30],
  ];
}

function ngayKey(vnMs: number): string {
  return new Date(vnMs).toISOString().slice(0, 10);
}

/** So phut lam viec giua 2 moc (tu < den). `ngayNghi` = tap "YYYY-MM-DD" khong lam viec (ngay loai tru). */
export function phutLamViec(tuMs: number, denMs: number, kieu: KieuGio, ngayNghi?: ReadonlySet<string>): number {
  if (denMs <= tuMs) return 0;
  if (kieu === "lich") return (denMs - tuMs) / 60_000;
  const tu = tuMs + VN_MS;
  const den = denMs + VN_MS;
  let tong = 0;
  for (let ngay = Math.floor(tu / NGAY_MS) * NGAY_MS; ngay < den; ngay += NGAY_MS) {
    if (ngayNghi?.has(ngayKey(ngay))) continue;
    const thu = new Date(ngay).getUTCDay();
    for (const [a, b] of khung(kieu, thu)) {
      const s = Math.max(tu, ngay + a * 60_000);
      const e = Math.min(den, ngay + b * 60_000);
      if (e > s) tong += (e - s) / 60_000;
    }
  }
  return tong;
}

/** "5 giờ 30 phút" / "45 phút" - dung cho thoi gian lam viec (khong quy ra ngay 24h). */
export function fmtPhut(phut: number): string {
  const p = Math.max(0, Math.round(phut));
  const h = Math.floor(p / 60);
  const m = p % 60;
  if (!h) return tr("{0} phút", m);
  return m ? tr("{0} giờ {1} phút", h, m) : tr("{0} giờ", h);
}
