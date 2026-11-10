import { BANG_THEO_PHAM_VI, QUOC_GIA_CO_NSKX, dbGoc, dieuKienPhamVi, hauToPhamVi, phamViTheoNuoc, type PhamViDb } from "./phamVi";

/**
 * "Đa quốc gia" (SRS §12): tao view case_hieu_luc_<hau to> + ban sao cac bang so chot/cache (BANG_THEO_PHAM_VI) cho
 * pham vi cua 1 hay nhieu nuoc - de them nuoc moi KHONG can migration. DDL lay tu chinh bang goc trong sqlite_master
 * (bang + index), doi ten, "IF NOT EXISTS" -> goi lai bao nhieu lan cung an toan. VN + ID da tao san o migration 0149.
 * Goi khi Admin them/bat 1 nuoc (routes/quocGia.ts) va dau moi lan cron chot (lib/phamViChot.ts, tu va neu thieu).
 */
const BANG_SAO = BANG_THEO_PHAM_VI.filter((b) => b !== "case_hieu_luc");

interface DongDdl {
  type: "table" | "index";
  name: string;
  tbl_name: string;
  sql: string;
}

/** Cac lenh CREATE (view + bang + index) cho 1 pham vi tu DDL bang goc (export de sinh migration / test). */
export function lenhTaoPhamVi(s: PhamViDb, ddl: DongDdl[]): string[] {
  const ht = hauToPhamVi(s);
  if (!ht) return [];
  const lenh = [`CREATE VIEW IF NOT EXISTS case_hieu_luc_${ht} AS SELECT * FROM case_dvbh WHERE huy_bo_at IS NULL AND ${dieuKienPhamVi(s)}`];
  // Index mot phan cho nuoc ngoai VN (migration 0157): dieu kien TRUNG KHOP dieuKienPhamVi de SQLite dung duoc, VN
  // khong bao gio khop -> khong anh huong truy van VN. Khong co index nay moi truy van cua nuoc do quet toan bang.
  if (s.qg && s.qg !== QUOC_GIA_CO_NSKX && s.pv === "tat_ca") {
    lenh.push(`CREATE INDEX IF NOT EXISTS idx_case_dvbh_qg_${s.qg.toLowerCase()} ON case_dvbh(quoc_gia, thoi_gian_hoan_thanh) WHERE ${dieuKienPhamVi(s)}`);
  }
  for (const d of ddl.filter((x) => x.type === "table")) {
    lenh.push(d.sql.replace(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?\w+["`]?/i, `CREATE TABLE IF NOT EXISTS ${d.name}_${ht}`));
  }
  for (const d of ddl.filter((x) => x.type === "index")) {
    lenh.push(
      d.sql.replace(
        /^CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?\w+["`]?\s+ON\s+["`]?\w+["`]?/i,
        (_m, u: string | undefined) => `CREATE ${u ?? ""}INDEX IF NOT EXISTS ${d.name}_${ht} ON ${d.tbl_name}_${ht}`,
      ),
    );
  }
  return lenh;
}

export async function docDdlBangGoc(db: D1Database): Promise<DongDdl[]> {
  const { results } = await dbGoc(db)
    .prepare(
      `SELECT type, name, tbl_name, sql FROM sqlite_master
       WHERE type IN ('table', 'index') AND sql IS NOT NULL AND tbl_name IN (${BANG_SAO.map(() => "?").join(", ")})`,
    )
    .bind(...BANG_SAO)
    .all<DongDdl>();
  return results;
}

/** Dam bao du view/bang cho moi pham vi cua cac nuoc cho truoc (chi tao cai con thieu). */
export async function damBaoBangQuocGia(db: D1Database, dsNuoc: string[]): Promise<void> {
  if (!dsNuoc.length) return;
  const goc = dbGoc(db);
  const ddl = await docDdlBangGoc(goc);
  const dsPhamVi = phamViTheoNuoc(dsNuoc).filter((s) => s.qg !== null);
  // Bo qua nhung pham vi da du (view ton tai = da tao tron bo trong cung 1 batch truoc do).
  const { results: coSan } = await goc
    .prepare("SELECT name FROM sqlite_master WHERE type = 'view' AND name LIKE 'case_hieu_luc_%'")
    .all<{ name: string }>();
  const daCo = new Set(coSan.map((r) => r.name));
  const lenh = dsPhamVi.filter((s) => !daCo.has(`case_hieu_luc_${hauToPhamVi(s)}`)).flatMap((s) => lenhTaoPhamVi(s, ddl));
  if (lenh.length) await goc.batch(lenh.map((q) => goc.prepare(q)));
}
