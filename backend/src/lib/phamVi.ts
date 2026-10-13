import type { MiddlewareHandler } from "hono";
import type { Env } from "../types";

/**
 * "Phạm vi báo cáo: Tất cả / NSKX / Không NSKX" (2026-10-13, chot voi chu he thong, migration 0136).
 *
 * Nut tren TopBar CHI anh huong viec XEM bao cao / danh sach - moi nghiep vu khac (giai trinh, khao sat, duyet,
 * import, badge menu, Telegram, API doi tac) chay binh thuong. NSKX = doi_tac 'NSKX' hoac '[NSKX]' (cach ghi CRM cu cua
 * cung doi tac, con trong du lieu import truoc 07/2026 - giong partnerDanhSachTon.ts).
 *
 * Cach lam: request GET co ?pv=nskx|khong_nskx -> middleware phamViMiddleware thay c.env.DB bang 1 D1 "boc"
 * (bocPhamVi) DOI TEN trong moi cau SQL truoc khi gui D1:
 *   - case_hieu_luc                       -> case_hieu_luc_<pv> (view da loc doi_tac, migration 0136)
 *   - case_dvbh [alias] INDEXED BY idx    -> nskx: view (bo INDEXED BY de dung idx_case_doi_tac - chi doc vai tram ca);
 *                                            khong_nskx: subquery GIU INDEXED BY (giu duong doc da toi uu) + loc doi_tac
 *   - BANG_THEO_PHAM_VI (so chot + cache)  -> ban sao "_<pv>"
 * Nho vay MOI logic tinh / chot / tu ghi bu (self-heal) / cachedReport chay NGUYEN VAN nhung doc + ghi dung bo du
 * lieu cua pham vi - KHONG THE ghi de so "Tất cả". Truy van theo id don le van dung case_dvbh (khong doi).
 *
 * Code ghi du lieu DUNG CHUNG tu ket qua doc (vd refreshCaLapPrecompute) phai dung dbGoc(db) - xem cac cho goi.
 * Code gui ra ngoai (Telegram) phai kiem tra phamViCua(db) === "tat_ca".
 */
export type PhamVi = "tat_ca" | "nskx" | "khong_nskx";

/** 2 pham vi co bang/view rieng - cron chot them cho tung pham vi nay (index.ts). */
export const PHAM_VI_LOC: Exclude<PhamVi, "tat_ca">[] = ["nskx", "khong_nskx"];

export function docPhamVi(raw: string | undefined | null): PhamVi {
  return raw === "nskx" || raw === "khong_nskx" ? raw : "tat_ca";
}

const BANG_THEO_PHAM_VI = [
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

/** Doi ten bang/view trong 1 cau SQL theo pham vi (export de test). */
export function doiTenSql(sql: string, pv: PhamVi): string {
  if (pv === "tat_ca") return sql;
  const s = sql.replace(RE_INDEXED, (_m, alias: string | undefined, idx: string) => {
    const a = alias || "case_dvbh";
    return pv === "nskx"
      ? `case_hieu_luc_nskx ${a}`
      : `(SELECT * FROM case_dvbh INDEXED BY ${idx} WHERE COALESCE(doi_tac, '') NOT IN ('NSKX', '[NSKX]')) ${a}`;
  });
  return s.replace(RE_BANG, `$1_${pv}`);
}

const GOC = Symbol("dbGoc");
const PV = Symbol("phamVi");

/** D1 "boc" theo pham vi - tat_ca tra lai chinh db. */
export function bocPhamVi(db: D1Database, pv: PhamVi): D1Database {
  if (pv === "tat_ca") return db;
  const goc = dbGoc(db);
  const boc = {
    prepare: (sql: string) => goc.prepare(doiTenSql(sql, pv)),
    batch: <T = unknown>(stmts: D1PreparedStatement[]) => goc.batch<T>(stmts),
    exec: (sql: string) => goc.exec(doiTenSql(sql, pv)),
    dump: () => goc.dump(),
    withSession: () => {
      throw new Error("phamVi: withSession khong ho tro tren D1 da boc");
    },
    [GOC]: goc,
    [PV]: pv,
  };
  return boc as unknown as D1Database;
}

export function phamViCua(db: D1Database): PhamVi {
  return ((db as unknown as Record<symbol, PhamVi | undefined>)[PV]) ?? "tat_ca";
}

export function dbGoc(db: D1Database): D1Database {
  return ((db as unknown as Record<symbol, D1Database | undefined>)[GOC]) ?? db;
}

/** Env voi DB da boc (dung cho cron chot them pham vi + ham nhan Env). */
export function envPhamVi(env: Env, pv: PhamVi): Env {
  return pv === "tat_ca" ? env : { ...env, DB: bocPhamVi(env.DB, pv) };
}

// Duong dan KHONG ap pham vi du co ?pv (badge menu + so lieu he thong luon "Tất cả"; khong phai bao cao).
const BO_QUA_PATH = /^\/api\/(notifications|auth|partner|external-import)(\/|$)/;

/** Middleware cho /api/*: CHI request GET (xem bao cao) moi bi boc - POST/PUT/PATCH/DELETE luon dung DB goc. */
export const phamViMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (c.req.method === "GET" && !BO_QUA_PATH.test(c.req.path)) {
    const pv = docPhamVi(c.req.query("pv"));
    if (pv !== "tat_ca") c.env = envPhamVi(c.env, pv);
  }
  await next();
};
