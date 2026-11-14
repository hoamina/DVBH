/**
 * 4 cot PO "theo khu vuc" cua Quan ly ton > Danh sach chi tiet (2026-11-14) - tinh SAN o server vao bang po_hang_ve_mien
 * (migration 0169) de loc / sap xep kieu Excel phia server va hien thi / xuat Excel cung 1 con so.
 * Port DUNG logic frontend lib/ngayHangVeTheoKv.ts (2026-11-11/13) nhung doc thang payload app EO (po_dat_hang_eo), ngay YYYY-MM-DD:
 *   - PO bi bo: trang_thai_eo REJECTED/CANCELLED, trang thai co "hủy"/"từ chối", SL dat = 0.
 *   - PO dang cho: sl_con_thieu > 0 (khong co so thi trang thai gon khong phai ket thuc / hoan thanh / da ve / du).
 *   - Mien PO = mien cua kho (khong ro -> tinh cho ca 2 mien); mien '*' = moi kho (khu vuc ca khong ro mien).
 *   - du_kien = ngay du kien gan nhat SOM NHAT trong PO dang cho; nm_cam_ket / so_lan_lui = cua PO do (khong co -> lon nhat
 *     trong PO dang cho); ve_gan_nhat = max(ngay ve dung kho, ngay ve theo EO / phieu nhap AMIS muon nhat) moi PO.
 * Cap nhat: theo ma LK khi app EO day dong doi (partnerApi.ts), toan bo khi version PO doi ma chua tinh (cron moi gio) / Admin bam.
 * Chi ghi dong doi (so voi bang hien co).
 */
import { dbGoc } from "./phamVi";
import { nowVN } from "./vnTime";

interface Payload {
  id_dat_lk: string;
  ma_lk?: string | null;
  ma_lk_goc?: string | null;
  kho?: string | null;
  trang_thai_eo?: string | null;
  trang_thai?: string | null;
  trang_thai_gon?: string | null;
  sl_dat?: number | string | null;
  sl_con_thieu?: number | string | null;
  ngay_du_kien_gan_nhat?: string | null;
  ngay_ve_theo_eo?: string | null;
  ngay_ve_dung_kho?: string | null;
  ngay_tao?: string | null;
  ke_hoach?: { ngay_nm_cam_ket?: string | null }[] | null;
  phieu_nhap?: { ngay?: string | null }[] | null;
  theo_doi?: { so_lan_lui?: number | null } | null;
}

export type Mien = "MB" | "MN";
const MIEN_TAT_CA = "*";

export interface HangVe {
  du_kien: string | null;
  ve_gan_nhat: string | null;
  nm_cam_ket: string | null;
  so_lan_lui: number | null;
}

/** 'YYYY-MM-DD...' -> 'YYYY-MM-DD'; dinh dang khac -> "" (frontend cu cung bo qua khi so sanh). */
const ngay = (s: string | null | undefined): string => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "");

function soNguyen(v: unknown): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const x = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(x) ? x : null;
}

function biBo(p: Payload): boolean {
  if (p.trang_thai_eo === "REJECTED" || p.trang_thai_eo === "CANCELLED") return true;
  if (/hủy|huỷ|từ chối/i.test(`${p.trang_thai_gon ?? ""} ${p.trang_thai ?? ""}`)) return true;
  return soNguyen(p.sl_dat) === 0;
}

function dangCho(p: Payload): boolean {
  const thieu = soNguyen(p.sl_con_thieu);
  if (thieu !== null) return thieu > 0;
  return !/kết thúc|hoàn thành|đã về|đủ/i.test(p.trang_thai_gon ?? "");
}

function ngayVe(p: Payload): string {
  const eo = ngay(p.ngay_ve_theo_eo);
  if (eo) return eo;
  let best = "";
  for (const r of p.phieu_nhap ?? []) {
    const d = ngay(r.ngay);
    if (d > best) best = d;
  }
  return best;
}

function nmCamKet(p: Payload): string {
  const k = [...(p.ke_hoach ?? [])].reverse().find((x) => x.ngay_nm_cam_ket);
  return ngay(k?.ngay_nm_cam_ket);
}

const boDau = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

export function mienCuaKho(kho: string | null | undefined): Mien | null {
  const s = ` ${boDau(kho ?? "").replace(/[^a-z0-9]+/g, " ")} `;
  if (/ (mb|bac|hn|ha noi) /.test(s) || s.includes("mien bac")) return "MB";
  if (/ (mn|nam|hcm|sg) /.test(s) || s.includes("mien nam") || s.includes("ho chi minh")) return "MN";
  return null;
}

export function mienCuaKhuVuc(khuVuc: string | null | undefined): Mien | null {
  const s = (khuVuc ?? "").toLowerCase();
  if (s.includes("qldvbh.mb") || s.includes("miền bắc")) return "MB";
  if (s.includes("qldvbh.mn") || s.includes("miền nam")) return "MN";
  return null;
}

/** Bieu thuc SQL mien cua ca (alias c) - khop mienCuaKhuVuc (lower() cua SQLite chi doi ky tu ASCII; "Miền Bắc" -> "miền bắc"). */
export const MIEN_CA_SQL = `(CASE WHEN lower(c.khu_vuc) LIKE '%qldvbh.mb%' OR lower(c.khu_vuc) LIKE '%miền bắc%' THEN 'MB'
  WHEN lower(c.khu_vuc) LIKE '%qldvbh.mn%' OR lower(c.khu_vuc) LIKE '%miền nam%' THEN 'MN' ELSE '${MIEN_TAT_CA}' END)`;

export const mienCaKey = (khuVuc: string | null | undefined): string => mienCuaKhuVuc(khuVuc) ?? MIEN_TAT_CA;

function tinhMotNhom(po: Payload[]): HangVe | null {
  if (!po.length) return null;
  const cho = po.filter(dangCho);
  let somNhat: Payload | undefined;
  for (const r of cho) {
    const k = ngay(r.ngay_du_kien_gan_nhat);
    if (k && (!somNhat || k < ngay(somNhat.ngay_du_kien_gan_nhat))) somNhat = r;
  }
  let ve = "";
  for (const r of po) for (const v of [ngay(r.ngay_ve_dung_kho), ngayVe(r)]) if (v > ve) ve = v;
  let nm = somNhat ? nmCamKet(somNhat) : "";
  if (!nm) for (const r of cho) {
    const x = nmCamKet(r);
    if (x > nm) nm = x;
  }
  let lui = somNhat ? soNguyen(somNhat.theo_doi?.so_lan_lui) : null;
  if (lui === null) for (const r of cho) {
    const x = soNguyen(r.theo_doi?.so_lan_lui);
    if (x !== null && (lui === null || x > lui)) lui = x;
  }
  const kq: HangVe = { du_kien: ngay(somNhat?.ngay_du_kien_gan_nhat) || null, ve_gan_nhat: ve || null, nm_cam_ket: nm || null, so_lan_lui: lui };
  return kq.du_kien || kq.ve_gan_nhat || kq.nm_cam_ket || kq.so_lan_lui !== null ? kq : null;
}

/** ma LK -> mien ('MB' | 'MN' | '*') -> gia tri. chiMa: chi tinh cac ma nay (null = moi ma). */
export function tinhHangVe(payloads: Payload[], chiMa: Set<string> | null): Map<string, Map<string, HangVe>> {
  // Thu tu PO giong frontend (mergePoRows: moi nhat theo ngay tao len tren) - quyet dinh PO nao thang khi trung ngay du kien.
  const ds = payloads.filter((p) => !biBo(p)).sort((a, b) => ((a.ngay_tao ?? "") < (b.ngay_tao ?? "") ? 1 : (a.ngay_tao ?? "") > (b.ngay_tao ?? "") ? -1 : 0));
  const theoMa = new Map<string, Payload[]>();
  const them = (k: string | null | undefined, p: Payload) => {
    if (!k || (chiMa && !chiMa.has(k))) return;
    const a = theoMa.get(k);
    if (a) a.push(p);
    else theoMa.set(k, [p]);
  };
  for (const p of ds) {
    them(p.ma_lk, p);
    if (p.ma_lk_goc && p.ma_lk_goc !== p.ma_lk) them(p.ma_lk_goc, p);
  }
  const out = new Map<string, Map<string, HangVe>>();
  for (const [ma, po] of theoMa) {
    const m = new Map<string, HangVe>();
    for (const mien of ["MB", "MN", MIEN_TAT_CA]) {
      const nhom = mien === MIEN_TAT_CA ? po : po.filter((r) => {
        const mk = mienCuaKho(r.kho);
        return mk === null || mk === mien;
      });
      const v = tinhMotNhom(nhom);
      if (v) m.set(mien, v);
    }
    if (m.size) out.set(ma, m);
  }
  return out;
}

const KHOA_MOC = "po_hang_ve_mien_v";

/** maLks: chi tinh lai cac ma nay (app EO vua day dong doi); khong truyen = toan bo + ghi moc version. */
export async function capNhatPoHangVe(dbIn: D1Database, maLks?: string[]): Promise<{ doc: number; ghi: number; xoa: number }> {
  const db = dbGoc(dbIn);
  const chiMa = maLks ? new Set(maLks.filter(Boolean)) : null;
  if (chiMa && chiMa.size === 0) return { doc: 0, ghi: 0, xoa: 0 };
  const dsMa = chiMa ? JSON.stringify([...chiMa]) : null;
  const vRow = chiMa ? null : await db.prepare("SELECT version FROM data_versions WHERE domain = 'po_dat_hang'").first<{ version: number }>();

  const [{ results: rows }, { results: cu }] = await db.batch([
    dsMa
      ? db.prepare("SELECT payload FROM po_dat_hang_eo WHERE ma_lk IN (SELECT value FROM json_each(?1)) OR ma_lk_goc IN (SELECT value FROM json_each(?1))").bind(dsMa)
      : db.prepare("SELECT payload FROM po_dat_hang_eo"),
    dsMa
      ? db.prepare("SELECT * FROM po_hang_ve_mien WHERE ma_lk IN (SELECT value FROM json_each(?))").bind(dsMa)
      : db.prepare("SELECT * FROM po_hang_ve_mien"),
  ]) as [D1Result<{ payload: string }>, D1Result<{ ma_lk: string; mien: string } & HangVe>];

  const payloads: Payload[] = [];
  for (const r of rows) {
    try {
      payloads.push(JSON.parse(r.payload) as Payload);
    } catch {
      /* dong hong - bo qua */
    }
  }
  const moi = tinhHangVe(payloads, chiMa);
  const khoa = (ma: string, mien: string) => `${ma}\u0001${mien}`;
  const cuMap = new Map(cu.map((r) => [khoa(r.ma_lk, r.mien), r]));
  const ghi: unknown[][] = [];
  const xoa: string[][] = [];
  for (const [ma, m] of moi) {
    for (const [mien, v] of m) {
      const o = cuMap.get(khoa(ma, mien));
      cuMap.delete(khoa(ma, mien));
      if (o && o.du_kien === v.du_kien && o.ve_gan_nhat === v.ve_gan_nhat && o.nm_cam_ket === v.nm_cam_ket && o.so_lan_lui === v.so_lan_lui) continue;
      ghi.push([ma, mien, v.du_kien, v.ve_gan_nhat, v.nm_cam_ket, v.so_lan_lui]);
    }
  }
  for (const o of cuMap.values()) xoa.push([o.ma_lk, o.mien]);

  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < ghi.length; i += 200) {
    stmts.push(
      db.prepare(
        `INSERT OR REPLACE INTO po_hang_ve_mien (ma_lk, mien, du_kien, ve_gan_nhat, nm_cam_ket, so_lan_lui)
         SELECT json_extract(value,'$[0]'), json_extract(value,'$[1]'), json_extract(value,'$[2]'), json_extract(value,'$[3]'),
                json_extract(value,'$[4]'), json_extract(value,'$[5]') FROM json_each(?)`,
      ).bind(JSON.stringify(ghi.slice(i, i + 200))),
    );
  }
  for (let i = 0; i < xoa.length; i += 200) {
    stmts.push(
      db.prepare(
        `DELETE FROM po_hang_ve_mien WHERE rowid IN (SELECT p.rowid FROM json_each(?) j JOIN po_hang_ve_mien p
           ON p.ma_lk = json_extract(j.value,'$[0]') AND p.mien = json_extract(j.value,'$[1]'))`,
      ).bind(JSON.stringify(xoa.slice(i, i + 200))),
    );
  }
  if (vRow) {
    stmts.push(
      db.prepare(
        `INSERT INTO cai_dat_he_thong (khoa, gia_tri, updated_at, updated_by) VALUES (?, ?, ?, 'he_thong')
         ON CONFLICT(khoa) DO UPDATE SET gia_tri = excluded.gia_tri, updated_at = excluded.updated_at`,
      ).bind(KHOA_MOC, String(vRow.version), nowVN()),
    );
  }
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  return { doc: rows.length, ghi: ghi.length, xoa: xoa.length };
}

/** Cron moi gio: version PO da doi so voi lan tinh toan bo gan nhat -> tinh lai toan bo (luoi an toan cho cap nhat theo ma). */
export async function capNhatPoHangVeNeuCan(db: D1Database): Promise<boolean> {
  const g = dbGoc(db);
  const [v, moc] = await g.batch([
    g.prepare("SELECT version FROM data_versions WHERE domain = 'po_dat_hang'"),
    g.prepare("SELECT gia_tri FROM cai_dat_he_thong WHERE khoa = ?").bind(KHOA_MOC),
  ]) as [D1Result<{ version: number }>, D1Result<{ gia_tri: string }>];
  if (String(v.results[0]?.version ?? 0) === moc.results[0]?.gia_tri) return false;
  await capNhatPoHangVe(db);
  return true;
}

// Lan dau sau deploy (chua co moc) bang con rong -> danh sach goi ham nay de tinh ngay, khong doi cron 8h. Moi isolate chi kiem 1 lan.
let daKiem: Promise<unknown> | null = null;
export function damBaoPoHangVe(db: D1Database): Promise<unknown> {
  if (!daKiem) {
    // Chi khi CHUA TUNG tinh toan bo (khong co moc) - doi version thi da co cap nhat theo ma + cron moi gio lo.
    daKiem = dbGoc(db)
      .prepare("SELECT 1 AS co FROM cai_dat_he_thong WHERE khoa = ?")
      .bind(KHOA_MOC)
      .first()
      .then((r) => (r ? null : capNhatPoHangVe(db)))
      .catch((err) => {
      daKiem = null;
      console.error("[po-hang-ve-mien] tinh lan dau loi:", err instanceof Error ? err.message : String(err));
    });
  }
  return daKiem;
}
