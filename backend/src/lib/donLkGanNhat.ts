/**
 * "ID đặt hàng gần nhất" cua ca dang ton thieu linh kien (2026-11-12, chu he thong) - Quan ly ton > Danh sach chi tiet them cot
 * ID don + trang thai + ngay dat / duyet / xuat hang. Bang don_lk_gan_nhat (migration 0164), 1 dong / ca.
 *
 * Nguon: linh-kien-app POST /api/partner/v1/don-gan-nhat-theo-ca (Service Binding LINHKIEN_APP). Ben do chon 1 don / ca: bo don tra
 * hang / tu choi / huy, uu tien don dung ma LK thieu (ke ca ma thay the), roi don tao moi nhat. Don khop qua: ma ca tren don
 * (dat_don_case / ma_yeu_cau_su_co) > ID Lada (case_lada) > ma DDH-xxxxxx ghi trong o "Mã xuất hàng liên quan" cua giai trinh gan nhat.
 *
 * Tan suat (de it ghi/doc):
 *   - ID don, ngay dat: co dinh; ngay duyet / xuat / KTV nhan: ghi 1 lan khi xay ra; trang thai: doi lien tuc.
 *   - Moi gio 8h-18h VN (piggyback DAILY_SNAPSHOT_CRON, khong them Cron Trigger): chi hoi ca CHUA co dong, don chua ket thuc, hoac ma
 *     LK thieu da doi. Lan 08:00 (toanBo) hoi lai MOI ca ung vien (bat don moi tao sau don da ket thuc) + xoa dong cua ca khong con
 *     la ung vien (da dong / het thieu LK).
 *   - Mo chi tiet 1 ca (GET /cases/:id/linh-kien-timeline) -> lam moi ngay ca do (waitUntil).
 *   - Chi ghi dong co cot thay doi. Loi linh-kien-app: giu nguyen du lieu cu, ghi loi vao cai_dat_he_thong 'don_lk_gan_nhat_dong_bo'.
 */
import type { Env } from "../types";
import { dbGoc } from "./phamVi";
import { latestGiaiTrinhJoin } from "./needGiaiTrinh";
import { nowVN } from "./vnTime";

const TRANG_THAI_DON: Record<string, string> = {
  "Cho Tram duyet": "Chờ Trạm duyệt",
  "Cho TBP xac nhan": "Chờ TBP DVBH xác nhận",
  "Cho GS duyet": "Chờ GS duyệt (vượt trần)",
  "Cho thanh toan": "Chờ thanh toán (thiếu hàng)",
  "Cho TN duyet": "Chờ TN duyệt",
  "TN da duyet": "TN đã duyệt",
  "Cho hang": "Chờ hàng (thiếu hàng)",
};
const TRANG_THAI_PXK: Record<string, string> = {
  cho_tao_phieu: "Chờ tạo phiếu",
  cho_ktv_chuyen_tien: "Chờ KTV chuyển tiền",
  cho_xac_nhan_chuyen_tien: "Chờ xác nhận chuyển tiền",
  cho_gui_ke_toan: "Chờ TN gửi kế toán",
  cho_ke_toan_chot: "Chờ kế toán chốt",
  cho_kho_gui_hang: "Chờ kho gửi hàng",
  cho_ktv_xac_nhan: "Đã gửi, chờ KTV xác nhận",
  ktv_da_nhan: "KTV đã nhận",
  hang_tru_kho: "Hàng trừ kho",
  kho_da_ket_thuc: "Kho đã kết thúc",
  phieu_da_huy: "Phiếu đã hủy",
};
// Don chua duyet xong / dang cho hang -> trang thai don; da duyet -> trang thai phieu xuat kho (sau hon).
const DON_TRUOC_PXK = new Set(["Cho Tram duyet", "Cho TBP xac nhan", "Cho GS duyet", "Cho thanh toan", "Cho TN duyet", "Cho hang"]);

export function nhanTrangThai(don: string | null, pxk: string | null): string | null {
  if (don && DON_TRUOC_PXK.has(don)) return TRANG_THAI_DON[don] ?? don;
  if (pxk && TRANG_THAI_PXK[pxk]) return TRANG_THAI_PXK[pxk];
  return don ? (TRANG_THAI_DON[don] ?? don) : null;
}

interface DonApi {
  don_id: string;
  ma_lk: string;
  ten_lk: string | null;
  loai_de_xuat: string | null;
  trang_thai_hien_tai: string | null;
  trang_thai_pxk: string | null;
  ngay_tao: string;
  ngay_duyet: string | null;
  ngay_xuat: string | null;
  ngay_ktv_nhan: string | null;
  nguon: string;
  khop_ma_lk: number;
  ket_thuc: number;
}

const COT = [
  "ma_lk_thieu", "don_id", "nguon", "khop_ma_lk", "ma_lk_don", "ten_lk", "loai_de_xuat", "trang_thai", "trang_thai_don", "trang_thai_pxk",
  "ngay_dat", "ngay_duyet", "ngay_xuat", "ngay_ktv_nhan", "so_don", "ket_thuc",
] as const;
type Dong = Record<(typeof COT)[number], string | number | null>;

const MA_DDH = /DDH-\d{3,}/gi;
const LO = 500;

export interface KetQuaDongBo {
  ok: boolean;
  so_ca: number;
  da_hoi: number;
  thay_doi: number;
  xoa: number;
  loi: string | null;
}

/** caseIds = chi lam moi cac ca nay (van phai la ung vien); khong truyen = theo lich (toanBo = hoi lai moi ung vien). */
export async function dongBoDonLkGanNhat(env: Env, opts: { caseIds?: string[]; toanBo?: boolean } = {}): Promise<KetQuaDongBo> {
  const db = dbGoc(env.DB);
  const kq: KetQuaDongBo = { ok: true, so_ca: 0, da_hoi: 0, thay_doi: 0, xoa: 0, loi: null };
  if (!env.LINHKIEN_APP_URL || !env.LINHKIEN_APP_API_KEY) return { ...kq, ok: false, loi: "NOT_CONFIGURED" };

  // Ung vien = ca dang ton co "Mã linh kiện thiếu" o giai trinh gan nhat (dung dinh nghia cot "Mã linh kiện thiếu gần nhất").
  const locId = opts.caseIds ? "AND c.id IN (SELECT value FROM json_each(?))" : "";
  const { results: ungVien } = await db
    .prepare(
      `SELECT CAST(c.id AS TEXT) AS id, lg.linh_kien_thieu AS ma_lk, lg.ma_xuat_hang_lien_quan AS ma_xh,
              x.case_id AS co_dong, x.ket_thuc, x.ma_lk_thieu AS ma_lk_cu
       FROM case_hieu_luc c ${latestGiaiTrinhJoin()}
       LEFT JOIN don_lk_gan_nhat x ON x.case_id = c.id
       WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND COALESCE(lg.linh_kien_thieu, '') <> '' ${locId}`,
    )
    .bind(...(opts.caseIds ? [JSON.stringify(opts.caseIds)] : []))
    .all<{ id: string; ma_lk: string; ma_xh: string | null; co_dong: string | null; ket_thuc: number | null; ma_lk_cu: string | null }>();
  kq.so_ca = ungVien.length;

  const canHoi = ungVien.filter((r) => opts.caseIds || opts.toanBo || !r.co_dong || r.ket_thuc !== 1 || r.ma_lk_cu !== r.ma_lk);
  const ghi: D1PreparedStatement[] = [];
  const luc = nowVN();

  for (let i = 0; i < canHoi.length; i += LO) {
    const lo = canHoi.slice(i, i + LO);
    const ids = lo.map((r) => r.id);
    const [ladaRes, cuRes] = await db.batch([
      db.prepare("SELECT order_id, CAST(case_id AS TEXT) AS case_id FROM case_lada WHERE case_id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)),
      db.prepare(`SELECT case_id, ${COT.join(", ")} FROM don_lk_gan_nhat WHERE case_id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)),
    ]);
    const cu = new Map(((cuRes.results ?? []) as (Dong & { case_id: string })[]).map((r) => [String(r.case_id), r]));
    const maDon = lo.flatMap((r) => [...new Set((r.ma_xh ?? "").match(MA_DDH) ?? [])].map((m) => [m.toUpperCase(), r.id]));
    const url = `${env.LINHKIEN_APP_URL}/api/partner/v1/don-gan-nhat-theo-ca`;
    const init: RequestInit = {
      method: "POST",
      headers: { "X-API-Key": env.LINHKIEN_APP_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        ca: lo.map((r) => [r.id, r.ma_lk]),
        lada: ((ladaRes.results ?? []) as { order_id: string; case_id: string }[]).map((r) => [String(r.order_id), r.case_id]),
        ma_don: maDon,
      }),
      signal: AbortSignal.timeout(25000),
    };
    let rows: { case_id: string; so_don: number; don: DonApi | null }[];
    try {
      const res = env.LINHKIEN_APP ? await env.LINHKIEN_APP.fetch(url, init) : await fetch(url, init);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      rows = ((await res.json()) as { rows?: typeof rows }).rows ?? [];
    } catch (err) {
      kq.ok = false;
      kq.loi = String(err instanceof Error ? err.message : err).slice(0, 300);
      console.error("[don-lk-gan-nhat] goi linh-kien-app loi:", kq.loi);
      break; // giu du lieu cu, khong ghi gi them cho lo nay va cac lo sau
    }
    kq.da_hoi += lo.length;
    const maLkTheoCa = new Map(lo.map((r) => [r.id, r.ma_lk]));
    for (const r of rows) {
      const id = String(r.case_id);
      if (!maLkTheoCa.has(id)) continue;
      const d = r.don;
      const moi: Dong = {
        ma_lk_thieu: maLkTheoCa.get(id) ?? null,
        don_id: d?.don_id ?? null,
        nguon: d?.nguon ?? null,
        khop_ma_lk: d?.khop_ma_lk ? 1 : 0,
        ma_lk_don: d?.ma_lk ?? null,
        ten_lk: d?.ten_lk ?? null,
        loai_de_xuat: d?.loai_de_xuat ?? null,
        trang_thai: d ? nhanTrangThai(d.trang_thai_hien_tai, d.trang_thai_pxk) : null,
        trang_thai_don: d?.trang_thai_hien_tai ?? null,
        trang_thai_pxk: d?.trang_thai_pxk ?? null,
        ngay_dat: d?.ngay_tao ?? null,
        ngay_duyet: d?.ngay_duyet ?? null,
        ngay_xuat: d?.ngay_xuat ?? null,
        ngay_ktv_nhan: d?.ngay_ktv_nhan ?? null,
        so_don: Number(r.so_don) || 0,
        ket_thuc: d?.ket_thuc ? 1 : 0,
      };
      const truoc = cu.get(id);
      if (truoc && COT.every((k) => (truoc[k] ?? null) === (moi[k] ?? null))) continue;
      ghi.push(
        db
          .prepare(
            `INSERT INTO don_lk_gan_nhat (case_id, ${COT.join(", ")}, cap_nhat_luc) VALUES (?, ${COT.map(() => "?").join(", ")}, ?)
             ON CONFLICT(case_id) DO UPDATE SET ${COT.map((k) => `${k} = excluded.${k}`).join(", ")}, cap_nhat_luc = excluded.cap_nhat_luc`,
          )
          .bind(id, ...COT.map((k) => moi[k]), luc),
      );
    }
  }
  kq.thay_doi = ghi.length;

  // Lan hoi toan bo thanh cong: xoa dong cua ca khong con la ung vien (da dong, het thieu LK, bi huy).
  if (opts.toanBo && kq.ok && !opts.caseIds) {
    const r = await db
      .prepare(
        `DELETE FROM don_lk_gan_nhat WHERE case_id NOT IN (SELECT value FROM json_each(?))`,
      )
      .bind(JSON.stringify(ungVien.map((u) => u.id)))
      .run();
    kq.xoa = r.meta?.changes ?? 0;
  }
  for (let i = 0; i < ghi.length; i += 100) await db.batch(ghi.slice(i, i + 100));
  if (!opts.caseIds) {
    await db
      .prepare(
        `INSERT INTO cai_dat_he_thong (khoa, gia_tri, updated_at, updated_by) VALUES ('don_lk_gan_nhat_dong_bo', ?, ?, 'cron')
         ON CONFLICT(khoa) DO UPDATE SET gia_tri = excluded.gia_tri, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      )
      .bind(JSON.stringify(kq), luc)
      .run();
  }
  return kq;
}
