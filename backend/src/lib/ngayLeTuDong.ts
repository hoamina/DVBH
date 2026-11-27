/**
 * Tu them ngay le quoc gia vao "Ngày loại trừ giải trình" (2026-11-27, chu he thong: "bên PLP có rất nhiều ngày lễ, tự động thêm
 * các ngày lễ này vào danh sách loại trừ giải trình").
 *
 * - Nuoc ap dung: NUOC_TU_DONG_NGAY_LE (hien chi PH - VN Admin van khai tay nhu cu).
 * - Nguon: API cong khai Nager.Date GET https://date.nager.at/api/v3/PublicHolidays/<nam>/<nuoc> (khong can khoa, khong gui du lieu
 *   cua he thong) - nam hien tai + nam sau. Co du le chinh thuc + ngay nghi dac biet toan quoc cua PH; 2 le Hoi giao (Eid'l Fitr /
 *   Eid'l Adha) PH cong bo tung nam nen co the thieu -> Admin them tay.
 * - Ghi: dong khu_vuc = '__ALL__:<nuoc>' (loai tru moi khu vuc cua nuoc do, xem lib/quocGia.ts), ghi_chu "Lễ PH (tự động): <ten>",
 *   nguoi_tao = user he thong. ON CONFLICT DO NOTHING - khong de ghi chu Admin da khai.
 * - Ngay da tu them 1 lan duoc nho o cai_dat_he_thong 'ngay_le_tu_dong_<nuoc>' (JSON mang ngay) -> Admin xoa 1 ngay le (vd van lam
 *   viec) thi lan chay sau KHONG them lai.
 * - Goi tu: cron 03:00 VN hang ngay (index.ts VI_PHAM_SHEET_SYNC_CRON) + nut "Cập nhật ngày lễ" o Cai dat (Admin).
 *   Moi lan: 2 lan fetch / nuoc + 1 doc cai_dat_he_thong; chi ghi khi co ngay moi.
 */
import { khuVucLoaiTruToanBo } from "./quocGia";
import { nowVN } from "./vnTime";

export const NUOC_TU_DONG_NGAY_LE = ["PH"] as const;
const NGUOI_HE_THONG = "he-thong-tu-dong@dvbh.internal";

export interface KetQuaNgayLe {
  nuoc: string;
  ok: boolean;
  so_ngay_le: number;
  them_moi: string[];
  loi: string | null;
}

async function layNgayLe(nam: number, nuoc: string): Promise<{ date: string; localName: string; name: string }[]> {
  const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${nam}/${nuoc}`, { signal: AbortSignal.timeout(10000) });
  if (res.status === 204 || res.status === 404) return [];
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ds = (await res.json()) as { date: string; localName: string; name: string; global?: boolean }[];
  // Chi lay le toan quoc (global) - le dia phuong 1 tinh khong loai tru ca nuoc.
  return ds.filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date) && h.global !== false);
}

export async function tuDongThemNgayLe(db: D1Database): Promise<KetQuaNgayLe[]> {
  const nam = Number(nowVN().slice(0, 4));
  const out: KetQuaNgayLe[] = [];
  for (const nuoc of NUOC_TU_DONG_NGAY_LE) {
    const kq: KetQuaNgayLe = { nuoc, ok: true, so_ngay_le: 0, them_moi: [], loi: null };
    try {
      const ds = [...(await layNgayLe(nam, nuoc)), ...(await layNgayLe(nam + 1, nuoc))];
      kq.so_ngay_le = ds.length;
      const khoa = `ngay_le_tu_dong_${nuoc}`;
      const daNho = await db.prepare("SELECT gia_tri FROM cai_dat_he_thong WHERE khoa = ?").bind(khoa).first<{ gia_tri: string }>();
      const daThem = new Set<string>(daNho ? (JSON.parse(daNho.gia_tri) as string[]) : []);
      const theoNgay = new Map<string, string[]>();
      for (const h of ds) {
        if (daThem.has(h.date)) continue;
        theoNgay.set(h.date, [...(theoNgay.get(h.date) ?? []), h.name || h.localName]);
      }
      if (theoNgay.size > 0) {
        const khuVuc = khuVucLoaiTruToanBo(nuoc);
        for (const ngay of theoNgay.keys()) daThem.add(ngay);
        await db.batch([
          ...[...theoNgay].map(([ngay, ten]) =>
            db
              .prepare(
                `INSERT INTO settings_giai_trinh_exclude_ngay (ngay, khu_vuc, ghi_chu, nguoi_tao) VALUES (?, ?, ?, ?)
                 ON CONFLICT(ngay, khu_vuc) DO NOTHING`,
              )
              .bind(ngay, khuVuc, `Lễ ${nuoc} (tự động): ${ten.join(" / ")}`, NGUOI_HE_THONG),
          ),
          db
            .prepare(
              `INSERT INTO cai_dat_he_thong (khoa, gia_tri, updated_at, updated_by) VALUES (?, ?, ?, 'cron')
               ON CONFLICT(khoa) DO UPDATE SET gia_tri = excluded.gia_tri, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
            )
            .bind(khoa, JSON.stringify([...daThem].sort()), nowVN()),
        ]);
        kq.them_moi = [...theoNgay.keys()].sort();
      }
    } catch (err) {
      kq.ok = false;
      kq.loi = String(err instanceof Error ? err.message : err).slice(0, 200);
      console.error(`[ngay-le-tu-dong] ${nuoc} loi:`, kq.loi);
    }
    out.push(kq);
  }
  return out;
}
