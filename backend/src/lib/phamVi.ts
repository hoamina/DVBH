import type { Context, MiddlewareHandler } from "hono";
import type { AppUser, Env } from "../types";
import { QUOC_GIA_MAC_DINH, RE_MA_QUOC_GIA, dsQuocGiaKichHoat } from "./quocGia";

/**
 * Pham vi du lieu cua 1 request = 2 chieu, cung 1 co che "D1 boc doi ten bang":
 *
 * 1. "Phạm vi báo cáo: Tất cả / NSKX / Không NSKX" (pv, 2026-10-13, migration 0136) - nut tren TopBar, CHI anh huong viec
 *    XEM (request GET, tru badge menu). NSKX = doi_tac 'NSKX' hoac '[NSKX]' (cach ghi CRM cu). Chi co nghia o VN.
 * 2. "Đa quốc gia" (qg, 2026-10-29, migration 0148/0149, SRS §12) - la QUYEN: users.pham_vi_quoc_gia (NULL = toan bo).
 *    Nguoi duoc nhieu nuoc chon xem tung nuoc 1 (?qg=), server tu kiem lai (chonQuocGia). Ap trong loadUser
 *    (apPhamViQuocGia) vi can user.
 *
 * Request GET co pham vi -> c.env.DB bi thay bang 1 D1 "boc" (bocPhamVi) DOI TEN trong moi cau SQL truoc khi gui D1:
 *   - case_hieu_luc                       -> case_hieu_luc_<hau to> (view: huy_bo_at IS NULL + quoc_gia + doi_tac)
 *   - case_dvbh [alias] INDEXED BY idx    -> nskx: view (bo INDEXED BY); con lai: subquery GIU INDEXED BY + loc
 *   - FROM/JOIN case_dvbh [alias]         -> (CHI khi co qg) subquery loc quoc_gia -> tra 1 ca theo id cua nuoc khac
 *                                            ra "khong co", JOIN tu bang con (vi pham, khao sat...) cung bi loc theo
 *   - BANG_THEO_PHAM_VI (so chot + cache)  -> ban sao "_<hau to>"
 * Hau to: "" (tat ca) | nskx | khong_nskx | vn | vn_nskx | vn_khong_nskx | id | <ma nuoc>... Bang/view theo nuoc tao
 * san trong migration 0149 (VN, ID) hoac tu dong khi Admin bat 1 nuoc moi (lib/quocGiaKichHoat.ts).
 * Nho vay MOI logic tinh / chot / tu ghi bu (self-heal) / cachedReport chay NGUYEN VAN nhung doc + ghi dung bo du
 * lieu cua pham vi - KHONG THE ghi de so "Tất cả".
 *
 * Request ghi (POST/PATCH/PUT/DELETE) cua nguoi bi gioi han nuoc: CHI loc "FROM/JOIN case_dvbh" (che do "ghi") - ca
 * cua nuoc khac thanh "khong ton tai" voi moi kiem tra/thao tac theo id; KHONG doi ten bang cache/so chot (lenh ghi
 * dung chung, vd xoa cache, phai cham dung bang goc). Bo qua /api/import (Admin, can thay moi ca de so khop ID).
 *
 * Code ghi du lieu DUNG CHUNG tu ket qua doc (vd refreshCaLapPrecompute) phai dung dbGoc(db).
 * Code gui ra ngoai (Telegram) phai kiem tra laPhamViGoc(db).
 */
export type PhamVi = "tat_ca" | "nskx" | "khong_nskx";

/** Pham vi day du: qg = ma nuoc (null = moi nuoc), pv = NSKX. */
export interface PhamViDb {
  qg: string | null;
  pv: PhamVi;
}

/** NSKX la doi tac VN - nuoc khac luon pv = tat_ca. */
export const QUOC_GIA_CO_NSKX = "VN";

/** 2 pham vi NSKX co bang/view rieng (khong theo nuoc, migration 0136). */
export const PHAM_VI_LOC: Exclude<PhamVi, "tat_ca">[] = ["nskx", "khong_nskx"];

export function docPhamVi(raw: string | undefined | null): PhamVi {
  return raw === "nskx" || raw === "khong_nskx" ? raw : "tat_ca";
}

export function chuanHoaPhamVi(s: PhamVi | PhamViDb): PhamViDb {
  const x = typeof s === "string" ? { qg: null, pv: s } : s;
  if (x.qg !== null && !RE_MA_QUOC_GIA.test(x.qg)) throw new Error(`phamVi: ma quoc gia khong hop le "${x.qg}"`);
  return x.qg !== null && x.qg !== QUOC_GIA_CO_NSKX ? { qg: x.qg, pv: "tat_ca" } : x;
}

/** Hau to ten bang/view cua 1 pham vi ("" = goc). */
export function hauToPhamVi(s: PhamViDb): string {
  return [s.qg?.toLowerCase(), s.pv === "tat_ca" ? null : s.pv].filter(Boolean).join("_");
}

/** Moi pham vi KHONG phai goc cua cac nuoc cho truoc (dung cho cron chot / xoa cache / tao bang). */
export function phamViTheoNuoc(dsNuoc: string[]): PhamViDb[] {
  const ds: PhamViDb[] = PHAM_VI_LOC.map((pv) => ({ qg: null, pv }));
  for (const qg of dsNuoc) {
    ds.push({ qg, pv: "tat_ca" });
    if (qg === QUOC_GIA_CO_NSKX) for (const pv of PHAM_VI_LOC) ds.push({ qg, pv });
  }
  return ds;
}

export const BANG_THEO_PHAM_VI = [
  "case_hieu_luc",
  "precomputed_cache",
  "daily_snapshot",
  "giai_trinh_daily_log",
  "backlog_age_daily",
  "backlog_age_month_manifest",
  "ton_ktv_daily",
  "canh_bao_ton_daily_log",
];
const RE_BANG = new RegExp(`\\b(${BANG_THEO_PHAM_VI.join("|")})\\b`, "g");
const RE_INDEXED = /\bcase_dvbh(?:\s+(?:AS\s+)?(?!INDEXED\b)([A-Za-z_]\w*))?\s+INDEXED\s+BY\s+(\w+)/gi;
// "FROM/JOIN case_dvbh [AS] [alias]" (khong phai DELETE FROM, khong co INDEXED BY - da xu ly truoc). Alias = 1 dinh
// danh KHONG phai tu khoa SQL theo sau ten bang.
const TU_KHOA_SAU_BANG =
  "WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|FULL|NATURAL|ON|USING|GROUP|ORDER|LIMIT|HAVING|WINDOW|UNION|EXCEPT|INTERSECT|SET|RETURNING|INDEXED|NOT|AND|OR";
const RE_CASE_DVBH = new RegExp(
  `(?<!\\bDELETE\\s+)\\b(FROM|JOIN)(\\s+)case_dvbh\\b(?!(?:\\s+(?:AS\\s+)?\\w+)?\\s+INDEXED\\b)(?:\\s+(?:AS\\s+)?(?!(?:${TU_KHOA_SAU_BANG})\\b)([A-Za-z_]\\w*))?`,
  "gi",
);
const DK_NSKX = "doi_tac IN ('NSKX', '[NSKX]')";
const DK_KHONG_NSKX = "COALESCE(doi_tac, '') NOT IN ('NSKX', '[NSKX]')";

/** Dieu kien WHERE (tren case_dvbh) cua 1 pham vi - "" neu goc. Dung chung cho view tao dong (quocGiaKichHoat.ts). */
export function dieuKienPhamVi(s: PhamViDb): string {
  const dk: string[] = [];
  if (s.qg) dk.push(`quoc_gia = '${s.qg}'`);
  if (s.pv === "nskx") dk.push(DK_NSKX);
  if (s.pv === "khong_nskx") dk.push(DK_KHONG_NSKX);
  return dk.join(" AND ");
}

function dieuKienNuoc(dsNuoc: string[]): string {
  for (const m of dsNuoc) if (!RE_MA_QUOC_GIA.test(m)) throw new Error(`phamVi: ma quoc gia khong hop le "${m}"`);
  return dsNuoc.length === 1 ? `quoc_gia = '${dsNuoc[0]}'` : `quoc_gia IN (${dsNuoc.map((m) => `'${m}'`).join(", ")})`;
}

// "FROM/JOIN case_dvbh [alias]" khong co INDEXED BY (dang co INDEXED BY da duoc doi rieng truoc do).
function locCaTheoNuoc(sql: string, dsNuoc: string[]): string {
  const dk = dieuKienNuoc(dsNuoc);
  return sql.replace(RE_CASE_DVBH, (_m, kw: string, ws: string, alias?: string) => `${kw}${ws}(SELECT * FROM case_dvbh WHERE ${dk}) ${alias || "case_dvbh"}`);
}

/** Che do "ghi" (request khong phai GET): CHI loc FROM/JOIN case_dvbh theo MOI nuoc user duoc phep (export de test). */
export function locSqlGhi(sql: string, dsNuoc: string[]): string {
  const dk = dieuKienNuoc(dsNuoc);
  const s = sql.replace(RE_INDEXED, (_m, alias: string | undefined, idx: string) => `(SELECT * FROM case_dvbh INDEXED BY ${idx} WHERE ${dk}) ${alias || "case_dvbh"}`);
  return locCaTheoNuoc(s, dsNuoc);
}

/** Doi ten bang/view trong 1 cau SQL theo pham vi (export de test). */
export function doiTenSql(sql: string, pham: PhamVi | PhamViDb): string {
  const s = chuanHoaPhamVi(pham);
  const ht = hauToPhamVi(s);
  if (!ht) return sql;
  let out = sql.replace(RE_INDEXED, (_m, alias: string | undefined, idx: string) => {
    const a = alias || "case_dvbh";
    return s.pv === "nskx"
      ? `case_hieu_luc_${ht} ${a}`
      : `(SELECT * FROM case_dvbh INDEXED BY ${idx} WHERE ${dieuKienPhamVi(s)}) ${a}`;
  });
  if (s.qg) out = locCaTheoNuoc(out, [s.qg]);
  return out.replace(RE_BANG, `$1_${ht}`);
}

const GOC = Symbol("dbGoc");
const PV = Symbol("phamVi");

function taoBoc(goc: D1Database, doi: (sql: string) => string, info: PhamViDb): D1Database {
  const boc = {
    prepare: (sql: string) => goc.prepare(doi(sql)),
    batch: <T = unknown>(stmts: D1PreparedStatement[]) => goc.batch<T>(stmts),
    exec: (sql: string) => goc.exec(doi(sql)),
    dump: () => goc.dump(),
    withSession: () => {
      throw new Error("phamVi: withSession khong ho tro tren D1 da boc");
    },
    [GOC]: goc,
    [PV]: info,
  };
  return boc as unknown as D1Database;
}

/** D1 "boc" theo pham vi xem - pham vi goc tra lai DB goc. */
export function bocPhamVi(db: D1Database, pham: PhamVi | PhamViDb): D1Database {
  const s = chuanHoaPhamVi(pham);
  const goc = dbGoc(db);
  if (!hauToPhamVi(s)) return goc;
  return taoBoc(goc, (sql) => doiTenSql(sql, s), s);
}

/** D1 "boc" che do ghi: chi an ca cua nuoc ngoai dsNuoc. Bang so chot/cache giu nguyen -> laPhamViGoc = true. */
export function bocGhiTheoNuoc(db: D1Database, dsNuoc: string[]): D1Database {
  const goc = dbGoc(db);
  const boc = taoBoc(goc, (sql) => locSqlGhi(sql, dsNuoc), { qg: null, pv: "tat_ca" });
  delete (boc as unknown as Record<symbol, unknown>)[PV];
  return boc;
}

function thongTin(db: D1Database): PhamViDb | undefined {
  return (db as unknown as Record<symbol, PhamViDb | undefined>)[PV];
}

/** Chieu NSKX cua DB (tat_ca neu khong boc). */
export function phamViCua(db: D1Database): PhamVi {
  return thongTin(db)?.pv ?? "tat_ca";
}

/** Chieu quoc gia cua DB (null = moi nuoc). */
export function quocGiaCua(db: D1Database): string | null {
  return thongTin(db)?.qg ?? null;
}

/** true = DB goc (moi nuoc, Tất cả) - chi pham vi nay duoc gui Telegram / xoa cache cac ban sao. */
export function laPhamViGoc(db: D1Database): boolean {
  return thongTin(db) === undefined;
}

export function dbGoc(db: D1Database): D1Database {
  return ((db as unknown as Record<symbol, D1Database | undefined>)[GOC]) ?? db;
}

/** Env voi DB da boc (dung cho cron chot them pham vi + ham nhan Env). */
export function envPhamVi(env: Env, pham: PhamVi | PhamViDb): Env {
  const db = bocPhamVi(env.DB, pham);
  return db === env.DB ? env : { ...env, DB: db };
}

// Duong dan KHONG ap pham vi NSKX du co ?pv (badge menu + so lieu he thong luon "Tất cả"; khong phai bao cao).
const BO_QUA_PATH = /^\/api\/(notifications|auth|partner|external-import)(\/|$)/;
// Duong dan KHONG ap pham vi quoc gia: dang nhap, he thong ngoai (API key, khong co user), import (Admin, so khop ID).
const BO_QUA_QUOC_GIA = /^\/api\/(auth|partner|external-import|import)(\/|$)/;

/** Middleware cho /api/*: CHI request GET (xem bao cao) moi bi boc theo pv - chieu quoc gia ap sau trong loadUser. */
export const phamViMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (c.req.method === "GET" && !BO_QUA_PATH.test(c.req.path)) {
    const pv = docPhamVi(c.req.query("pv"));
    if (pv !== "tat_ca") c.env = envPhamVi(c.env, pv);
  }
  await next();
};

/**
 * Nuoc ma request duoc xem: user toan bo -> ?qg neu la nuoc dang bat, khong thi null (tat ca); user gioi han -> ?qg
 * neu nam trong danh sach, khong thi nuoc dau tien (danh sach rong do loi du lieu -> QUOC_GIA_MAC_DINH).
 */
export async function chonQuocGia(db: D1Database, phamViUser: string[] | null, raw: string | undefined): Promise<string | null> {
  const yeuCau = raw?.trim().toUpperCase() || null;
  if (phamViUser === null) {
    if (!yeuCau || !RE_MA_QUOC_GIA.test(yeuCau)) return null;
    return (await dsQuocGiaKichHoat(db)).includes(yeuCau) ? yeuCau : null;
  }
  if (phamViUser.length === 0) return QUOC_GIA_MAC_DINH;
  return yeuCau && phamViUser.includes(yeuCau) ? yeuCau : phamViUser[0];
}

/** Goi trong loadUser sau khi co user. GET: boc DB theo nuoc dang xem (+ pv da co tu phamViMiddleware). Request ghi:
 * chi an ca cua nuoc user khong co quyen (moi nuoc trong danh sach deu thao tac duoc). User toan bo: khong doi gi them. */
export async function apPhamViQuocGia(c: Context<{ Bindings: Env }>, user: AppUser): Promise<void> {
  if (BO_QUA_QUOC_GIA.test(c.req.path)) return;
  if (c.req.method !== "GET") {
    if (user.pham_vi_quoc_gia === null) return;
    const ds = user.pham_vi_quoc_gia.length ? user.pham_vi_quoc_gia : [QUOC_GIA_MAC_DINH];
    c.env = { ...c.env, DB: bocGhiTheoNuoc(c.env.DB, ds) };
    return;
  }
  const qg = await chonQuocGia(dbGoc(c.env.DB), user.pham_vi_quoc_gia, c.req.query("qg"));
  if (qg === null) return;
  c.env = { ...c.env, DB: bocPhamVi(c.env.DB, { qg, pv: phamViCua(c.env.DB) }) };
}
