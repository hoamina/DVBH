/**
 * Đơn có yêu cầu XUẤT HÓA ĐƠN từ app Đặt mua linh kiện (linh-kien-app) - 2026-11-14, chủ hệ thống: "khi 1 đơn đặt hàng trên app linh
 * kiện được kế toán duyệt => bắn thông tin sang dvbh => dvbh lập danh sách các đơn có hóa đơn (+ nút đồng bộ thủ công)".
 *
 *  - ĐẨY: linh-kien-app gọi POST /api/partner/sync/don-hoa-don ngay khi Kế toán chốt phiếu xuất kho (Da chot xong don xuat / Hàng trừ
 *    kho) có dòng chọn hóa đơn (lib/hoaDonDvbh.ts bên đó, best-effort).
 *  - KÉO (nút "Đồng bộ đơn hóa đơn"): GET {LINHKIEN_APP_URL}/api/partner/v1/don-hoa-don?tu_ngay= - bù những lần đẩy bị lỗi.
 * Cả 2 đường cùng đi qua ghiDonHoaDon(): khớp ca (mã ca trên đơn > ID Lada qua case_lada), chỉ ghi dòng đổi row_hash, xoá cặp
 * (đơn, ca) cũ không còn khớp. Ca có >=1 đơn chưa huỷ = "có xuất hóa đơn" tự động (GS vẫn sửa tay được - case_hd_bh).
 */
import type { Env } from "../types";
import { dbGoc } from "./phamVi";
import { nowVN } from "./vnTime";
import { hashApiKey } from "./partnerApiAuth";
import { bumpVersions } from "./dataVersions";
import { HAN_BH_TU_NGAY } from "./hanBaoHanh";

export interface DonHoaDonVao {
  don_id: string;
  ma_ca?: string[] | string | null;
  ma_lada?: string | null;
  pxk_id?: string | null;
  ma_misa?: string | null;
  chot_ke_toan_luc?: string | null;
  trang_thai_pxk?: string | null;
  trang_thai_don?: string | null;
  da_huy?: number | boolean | null;
  yeu_cau_hoa_don?: string | null;
  ma_lk?: string | null;
  ten_lk?: string | null;
  so_luong?: number | null;
  loai_de_xuat?: string | null;
  nguoi_nhan_hang?: string | null;
}

export const DON_HOA_DON_TOI_DA = 2000;
const LO = 200;
const s = (v: unknown) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());

function dsMaCa(v: DonHoaDonVao["ma_ca"]): string[] {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\s]+/) : [];
  return [...new Set(arr.map((x) => String(x ?? "").trim()).filter(Boolean))];
}

export interface KetQuaGhiHd {
  nhan: number;
  ghi: number;
  xoa: number;
  chua_khop: number;
}

export async function ghiDonHoaDon(dbVao: D1Database, rows: DonHoaDonVao[], nguon: "push" | "pull"): Promise<KetQuaGhiHd> {
  const db = dbGoc(dbVao);
  const hopLe = rows.filter((r) => r && typeof r.don_id === "string" && r.don_id.trim());
  if (!hopLe.length) return { nhan: 0, ghi: 0, xoa: 0, chua_khop: 0 };

  const tatCaMaCa = [...new Set(hopLe.flatMap((r) => dsMaCa(r.ma_ca)))];
  const tatCaLada = [...new Set(hopLe.map((r) => s(r.ma_lada)).filter((x): x is string => !!x))];
  const donIds = [...new Set(hopLe.map((r) => r.don_id.trim()))];
  const [caCo, lada, cu] = await db.batch([
    db.prepare("SELECT id FROM case_dvbh WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(tatCaMaCa)),
    db.prepare("SELECT order_id, case_id FROM case_lada WHERE order_id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(tatCaLada)),
    db.prepare("SELECT don_id, case_id, row_hash FROM don_hoa_don_lk WHERE don_id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(donIds)),
  ]);
  const caTonTai = new Set((caCo.results as { id: string }[]).map((r) => r.id));
  const ladaCa = new Map((lada.results as { order_id: string; case_id: string }[]).map((r) => [r.order_id, r.case_id]));
  const hashCu = new Map((cu.results as { don_id: string; case_id: string; row_hash: string }[]).map((r) => [`${r.don_id}\u001f${r.case_id}`, r.row_hash]));

  const luc = nowVN();
  const tuples: unknown[][] = [];
  const conGiu = new Set<string>();
  let chuaKhop = 0;
  for (const r of hopLe) {
    const donId = r.don_id.trim();
    const maCa = dsMaCa(r.ma_ca);
    let caIds = maCa.filter((id) => caTonTai.has(id));
    const maLada = s(r.ma_lada);
    if (!caIds.length && maLada && ladaCa.has(maLada)) caIds = [ladaCa.get(maLada)!];
    if (!caIds.length) {
      caIds = [""];
      chuaKhop++;
    }
    const goc = [
      s(r.pxk_id), s(r.ma_misa), s(r.chot_ke_toan_luc), s(r.trang_thai_pxk), s(r.trang_thai_don), r.da_huy ? 1 : 0, s(r.yeu_cau_hoa_don),
      s(r.ma_lk), s(r.ten_lk), r.so_luong == null || !Number.isFinite(Number(r.so_luong)) ? null : Number(r.so_luong), s(r.loai_de_xuat),
      s(r.nguoi_nhan_hang), maCa.join(",") || null, maLada,
    ];
    const hash = await hashApiKey(JSON.stringify(goc));
    for (const caId of caIds) {
      const k = `${donId}\u001f${caId}`;
      conGiu.add(k);
      if (hashCu.get(k) === hash) continue;
      tuples.push([donId, caId, ...goc, hash]);
    }
  }
  const xoa = [...hashCu.keys()].filter((k) => !conGiu.has(k));

  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < tuples.length; i += LO) {
    stmts.push(
      db.prepare(
        `INSERT INTO don_hoa_don_lk (don_id, case_id, pxk_id, ma_misa, chot_ke_toan_luc, trang_thai_pxk, trang_thai_don, da_huy, yeu_cau_hoa_don,
           ma_lk, ten_lk, so_luong, loai_de_xuat, nguoi_nhan_hang, ma_ca_tren_don, ma_lada, row_hash, nguon, dong_bo_luc)
         SELECT json_extract(value,'$[0]'), json_extract(value,'$[1]'), json_extract(value,'$[2]'), json_extract(value,'$[3]'),
                json_extract(value,'$[4]'), json_extract(value,'$[5]'), json_extract(value,'$[6]'), json_extract(value,'$[7]'),
                json_extract(value,'$[8]'), json_extract(value,'$[9]'), json_extract(value,'$[10]'), json_extract(value,'$[11]'),
                json_extract(value,'$[12]'), json_extract(value,'$[13]'), json_extract(value,'$[14]'), json_extract(value,'$[15]'),
                json_extract(value,'$[16]'), ?, ?
         FROM json_each(?) WHERE 1
         ON CONFLICT(don_id, case_id) DO UPDATE SET
           pxk_id = excluded.pxk_id, ma_misa = excluded.ma_misa, chot_ke_toan_luc = excluded.chot_ke_toan_luc,
           trang_thai_pxk = excluded.trang_thai_pxk, trang_thai_don = excluded.trang_thai_don, da_huy = excluded.da_huy,
           yeu_cau_hoa_don = excluded.yeu_cau_hoa_don, ma_lk = excluded.ma_lk, ten_lk = excluded.ten_lk, so_luong = excluded.so_luong,
           loai_de_xuat = excluded.loai_de_xuat, nguoi_nhan_hang = excluded.nguoi_nhan_hang, ma_ca_tren_don = excluded.ma_ca_tren_don,
           ma_lada = excluded.ma_lada, row_hash = excluded.row_hash, nguon = excluded.nguon, dong_bo_luc = excluded.dong_bo_luc`,
      ).bind(nguon, luc, JSON.stringify(tuples.slice(i, i + LO))),
    );
  }
  for (let i = 0; i < xoa.length; i += LO) {
    stmts.push(
      db.prepare("DELETE FROM don_hoa_don_lk WHERE (don_id || char(31) || case_id) IN (SELECT value FROM json_each(?))").bind(JSON.stringify(xoa.slice(i, i + LO))),
    );
  }
  if (stmts.length) {
    await db.batch(stmts);
    await bumpVersions(db, ["hd_bh"]);
  }
  return { nhan: hopLe.length, ghi: tuples.length, xoa: xoa.length, chua_khop: chuaKhop };
}

export class LoiKeoHoaDon extends Error {}

/** Kéo toàn bộ đơn hóa đơn đã chốt từ `tuNgay` (mặc định 01/11/2026) từ linh-kien-app rồi ghi. */
export async function keoDonHoaDon(env: Env, tuNgay = HAN_BH_TU_NGAY): Promise<KetQuaGhiHd & { tu_ngay: string }> {
  if (!env.LINHKIEN_APP_URL || !env.LINHKIEN_APP_API_KEY) throw new LoiKeoHoaDon("Chưa cấu hình kết nối app Đặt mua linh kiện.");
  const url = `${env.LINHKIEN_APP_URL}/api/partner/v1/don-hoa-don?tu_ngay=${encodeURIComponent(tuNgay)}`;
  const init: RequestInit = { headers: { "X-API-Key": env.LINHKIEN_APP_API_KEY }, signal: AbortSignal.timeout(20000) };
  const res = env.LINHKIEN_APP ? await env.LINHKIEN_APP.fetch(url, init) : await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LoiKeoHoaDon(`App linh kiện trả lỗi HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as { rows?: DonHoaDonVao[] };
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const kq = await ghiDonHoaDon(env.DB, rows, "pull");
  await dbGoc(env.DB)
    .prepare(
      `INSERT INTO cai_dat_he_thong (khoa, gia_tri, updated_at, updated_by) VALUES ('don_hoa_don_dong_bo', ?, ?, 'pull')
       ON CONFLICT(khoa) DO UPDATE SET gia_tri = excluded.gia_tri, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(JSON.stringify({ ...kq, tu_ngay: tuNgay }), nowVN())
    .run();
  return { ...kq, tu_ngay: tuNgay };
}
