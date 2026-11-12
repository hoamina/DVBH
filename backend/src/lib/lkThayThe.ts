/**
 * Nhom linh kien thay the / tuong duong (2026-11-12, chu he thong): keo dinh ky tu linh-kien-app GET /api/partner/v1/lk-thay-the
 * (nguon su that - Admin linh-kien-app quan ly nhom) ve bang lk_thay_the (migration 0165) de "Ho so linh kien" hien ngay cac ma
 * tuong duong kem ton kho (doc ton_kho_lk san co), khong goi API ben ngoai moi lan mo ho so.
 *
 * Lich: moi lan fire DAILY_SNAPSHOT_CRON (8h-18h VN) - 1 request; phien_ban khong doi -> khong ghi gi (chi so trong
 * cai_dat_he_thong). Doi -> xoa + ghi lai toan bo trong 1 batch (vai tram dong). Nut "Đồng bộ ngay" o tab tuong duong ep keo lai.
 */
import type { Env } from "../types";
import { callLinhKienPartner } from "./tonKhoLk";
import { nowVN } from "./vnTime";

interface RemoteNhom {
  id: number;
  ten_nhom: string | null;
  ghi_chu: string | null;
  linh_kien: { ma_linh_kien: string; ten_linh_kien: string | null; bat_tat: number | null; co_trong_danh_muc: number; ghi_chu: string | null }[];
}

export interface LkThayTheMeta {
  phien_ban: string | null;
  so_nhom: number;
  so_ma: number;
  dong_bo_luc: string | null;
  kiem_tra_luc: string | null;
  loi: string | null;
}

const KHOA = "lk_thay_the_dong_bo";

export async function getLkThayTheMeta(db: D1Database): Promise<LkThayTheMeta | null> {
  const r = await db.prepare("SELECT gia_tri FROM cai_dat_he_thong WHERE khoa = ?").bind(KHOA).first<{ gia_tri: string }>();
  try {
    return r ? (JSON.parse(r.gia_tri) as LkThayTheMeta) : null;
  } catch {
    return null;
  }
}

function ghiMeta(db: D1Database, meta: LkThayTheMeta, actor: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO cai_dat_he_thong (khoa, gia_tri, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(khoa) DO UPDATE SET gia_tri = excluded.gia_tri, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(KHOA, JSON.stringify(meta), nowVN(), actor);
}

export async function syncLkThayThe(env: Env, opts: { force?: boolean; actor: string }): Promise<{ ok: boolean; changed: boolean; loi?: string }> {
  const db = env.DB;
  const cu = await getLkThayTheMeta(db);
  const luc = nowVN();
  try {
    const data = await callLinhKienPartner<{ phien_ban: string; rows: RemoteNhom[] }>(env, "/v1/lk-thay-the");
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (!opts.force && cu?.phien_ban === data.phien_ban && !cu.loi) {
      // Khong doi: khong ghi gi (tranh 1 dong ghi moi gio) - "kiem_tra_luc" chi cap nhat khi co thay doi / loi.
      return { ok: true, changed: false };
    }
    const dong = rows.flatMap((n) =>
      (n.linh_kien ?? [])
        .filter((l) => l.ma_linh_kien)
        .map((l, i) => [n.id, n.ten_nhom, n.ghi_chu, l.ma_linh_kien.trim(), l.ten_linh_kien, l.bat_tat, l.co_trong_danh_muc ? 1 : 0, l.ghi_chu, i]),
    );
    const stmts: D1PreparedStatement[] = [db.prepare("DELETE FROM lk_thay_the")];
    for (let i = 0; i < dong.length; i += 500) {
      stmts.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO lk_thay_the (nhom_id, ten_nhom, ghi_chu_nhom, ma_lk, ten_lk, bat_tat, co_trong_danh_muc, ghi_chu, stt)
             SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'),
                    json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]'), json_extract(value, '$[7]'),
                    json_extract(value, '$[8]')
             FROM json_each(?)`,
          )
          .bind(JSON.stringify(dong.slice(i, i + 500))),
      );
    }
    stmts.push(
      ghiMeta(
        db,
        { phien_ban: data.phien_ban ?? null, so_nhom: rows.length, so_ma: dong.length, dong_bo_luc: luc, kiem_tra_luc: luc, loi: null },
        opts.actor,
      ),
    );
    await db.batch(stmts);
    return { ok: true, changed: true };
  } catch (err) {
    const loi = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    try {
      await ghiMeta(db, { phien_ban: cu?.phien_ban ?? null, so_nhom: cu?.so_nhom ?? 0, so_ma: cu?.so_ma ?? 0, dong_bo_luc: cu?.dong_bo_luc ?? null, kiem_tra_luc: luc, loi }, opts.actor).run();
    } catch {
      // bo qua
    }
    return { ok: false, changed: false, loi };
  }
}

export interface LkTuongDuong {
  ma_lk: string;
  ten_lk: string | null;
  bat_tat: number | null;
  co_trong_danh_muc: number;
  ghi_chu: string | null;
  ton_mb: number;
  ton_mn: number;
  ton_kho_khac: number; // kho cong ty chua khai bao MB/MN
  ton_ktv: number;
  so_ktv: number;
  /** KTV dang giu theo khu vuc (khu_vuc_ma) - giam dan */
  theo_kv: { kv: string; sl: number; so_ktv: number }[];
  /** Tung kho cong ty co hang */
  kho: { ma_kho: string; ten_kho: string | null; nhom: string | null; sl: number }[];
}

/** Cac nhom chua ma `ma` + ton kho cua MOI ma trong nhom (ke ca chinh no, de so sanh). 2 cau, deu theo index ma. */
export async function docTuongDuong(db: D1Database, ma: string) {
  const [nhomRes, tonRes] = await db.batch([
    db.prepare(
      `SELECT b.nhom_id, b.ten_nhom, b.ghi_chu_nhom, b.ma_lk, COALESCE(l.ten_linh_kien, b.ten_lk) AS ten_lk, b.bat_tat, b.co_trong_danh_muc, b.ghi_chu, b.stt
       FROM lk_thay_the a JOIN lk_thay_the b ON b.nhom_id = a.nhom_id
       LEFT JOIN linh_kien l ON l.ma_linh_kien = b.ma_lk
       WHERE a.ma_lk = ? ORDER BY b.nhom_id, b.stt`,
    ).bind(ma),
    db.prepare(
      `SELECT t.ma_hang, t.nguon, t.ma_kho, t.ten_kho, t.khu_vuc_ma, t.cuoi_ky, n.nhom
       FROM ton_kho_lk t LEFT JOIN ton_kho_nhom_kho n ON n.ma_kho = t.ma_kho
       WHERE t.ma_hang IN (SELECT b.ma_lk FROM lk_thay_the a JOIN lk_thay_the b ON b.nhom_id = a.nhom_id WHERE a.ma_lk = ?)
         AND t.cuoi_ky > 0`,
    ).bind(ma),
  ]);
  type NhomRow = { nhom_id: number; ten_nhom: string | null; ghi_chu_nhom: string | null; ma_lk: string; ten_lk: string | null; bat_tat: number | null; co_trong_danh_muc: number; ghi_chu: string | null };
  type TonRow = { ma_hang: string; nguon: string; ma_kho: string; ten_kho: string | null; khu_vuc_ma: string | null; cuoi_ky: number; nhom: string | null };
  const tonTheoMa = new Map<string, TonRow[]>();
  for (const r of (tonRes.results ?? []) as TonRow[]) tonTheoMa.set(r.ma_hang, [...(tonTheoMa.get(r.ma_hang) ?? []), r]);

  const tongHop = (r: NhomRow): LkTuongDuong => {
    const ton = tonTheoMa.get(r.ma_lk) ?? [];
    const sum = (xs: TonRow[]) => xs.reduce((s, x) => s + (x.cuoi_ky ?? 0), 0);
    // Giong Ho so linh kien: kho co nhom MB/MN tinh vao MB/MN (ke ca kho nguon "ktv" da khai bao), con lai nguon "ktv" = KTV giu.
    const ktv = ton.filter((x) => x.nguon === "ktv" && !x.nhom);
    const kv = new Map<string, { sl: number; so_ktv: number }>();
    for (const x of ktv) {
      const k = x.khu_vuc_ma || "?";
      const v = kv.get(k) ?? { sl: 0, so_ktv: 0 };
      v.sl += x.cuoi_ky;
      v.so_ktv += 1;
      kv.set(k, v);
    }
    const khoCty = ton.filter((x) => x.nguon === "kho" || !!x.nhom);
    return {
      ma_lk: r.ma_lk,
      ten_lk: r.ten_lk,
      bat_tat: r.bat_tat,
      co_trong_danh_muc: r.co_trong_danh_muc,
      ghi_chu: r.ghi_chu,
      ton_mb: sum(ton.filter((x) => x.nhom === "MB")),
      ton_mn: sum(ton.filter((x) => x.nhom === "MN")),
      ton_kho_khac: sum(khoCty.filter((x) => !x.nhom)),
      ton_ktv: sum(ktv),
      so_ktv: ktv.length,
      theo_kv: [...kv.entries()].map(([k, v]) => ({ kv: k, ...v })).sort((a, b) => b.sl - a.sl),
      kho: khoCty.map((x) => ({ ma_kho: x.ma_kho, ten_kho: x.ten_kho, nhom: x.nhom, sl: x.cuoi_ky })).sort((a, b) => b.sl - a.sl),
    };
  };

  const nhom = new Map<number, { id: number; ten_nhom: string | null; ghi_chu: string | null; linh_kien: LkTuongDuong[] }>();
  for (const r of (nhomRes.results ?? []) as NhomRow[]) {
    if (!nhom.has(r.nhom_id)) nhom.set(r.nhom_id, { id: r.nhom_id, ten_nhom: r.ten_nhom, ghi_chu: r.ghi_chu_nhom, linh_kien: [] });
    nhom.get(r.nhom_id)!.linh_kien.push(tongHop(r));
  }
  return [...nhom.values()];
}
