import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { ageExpr, ageFilterClause as ageFilterClauseFor } from "../lib/ageCalc";
import { khuVucAdHocClause, REPORT_DIMS, dimAdHocClause, sharedReportFilters } from "../lib/filterParams";
import { getDaDongManifest, getDaDongChunks, getDaDongReasons } from "../lib/daDongDayChunks";
import { checkAndConsumeDownloadQuota } from "../lib/r2DownloadRateLimit";
import { findExistingCaseIds, runBatched, logImportHistory } from "../lib/backfillImportProcessor";
import { csvTemplateResponse } from "../lib/csvTemplate";
import {
  latestGiaiTrinhJoin,
  CASE_FILTER_TON,
  NEED_GIAI_TRINH_CATEGORIES,
  NEED_LO_KE_HOACH,
  NEED_TAI_GIAI_TRINH,
} from "../lib/needGiaiTrinh";
import { getCaLapDetection } from "./caLap";
import { bumpVersions } from "../lib/dataVersions";
import { cachedReport, buildReportKey } from "../lib/reportCache";
import { nowVN } from "../lib/vnTime";

const cases = new Hono<{ Bindings: Env }>();
cases.use("*", verifySessionMiddleware, loadUser);

const SORTABLE_COLUMNS = new Set(["id", "khach_hang", "khu_vuc", "thoi_gian_cskh_tiep_nhan", "ngay_import"]);

const TAB_FILTERS: Record<string, string> = {
  "da-giai-trinh": "lg.case_id IS NOT NULL",
};

/** "2026-06" -> { start: "2026-06-01", end: "2026-07-01" } - dung range thay vi strftime(...) = ? de
 * tan dung index. KHONG duoc them gio "00:00:00" vao day: mot so ca co thoi_gian_hoan_thanh chi
 * la ngay thuan (vd "2026-07-01", khong gio) do nguon CRM khong co gio cho dong do - neu bound la
 * "2026-07-01 00:00:00" thi so sanh chuoi "2026-07-01" >= "2026-07-01 00:00:00" se la FALSE (chuoi
 * ngan hon la tien to cua chuoi dai hon, SQLite coi la NHO HON), lam ca dong dung ngay dau thang bi
 * rot khoi bao cao thang do. Dung ngay thuan (khong gio) o ca 2 dau lam bound thi moi gia tri (co
 * gio hay khong) deu so sanh dung. */
function monthBounds(thang: string): { start: string; end: string } {
  const m = thang.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const [y, mo] = m ? [Number(m[1]), Number(m[2])] : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const start = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-01`;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const nextY = mo === 12 ? y + 1 : y;
  const end = `${String(nextY).padStart(4, "0")}-${String(nextMo).padStart(2, "0")}-01`;
  return { start, end };
}

const AGE_EXPR = ageExpr("c.thoi_gian_cskh_tiep_nhan");

function ageFilterClause(tuoiTu?: string, tuoiDen?: string): { sql: string; binds: unknown[] } {
  return ageFilterClauseFor("c.thoi_gian_cskh_tiep_nhan", tuoiTu, tuoiDen);
}

// ---------- Bao cao tinh san (cachedReport - xem lib/reportCache.ts) cho /counts, /backlog-stats,
// /backlog-by-khu-vuc: tach params doc tu Context ra khoi phan tinh toan (computeXxx) de vua build
// duoc cache key TRUOC khi goi compute, vua cho R7 (warm-up sau import) goi lai dung ham compute voi
// bo params thuan (khong can Context) - xem "BO SUNG BAT BUOC cho R5/R6" trong
// YEU_CAU_BAO_CAO_TINH_SAN.md.

/** Doc khu_vuc (ad-hoc) + tat ca dim con lai trong REPORT_DIMS (tru khu_vuc, da co rieng) tu query
 * string - dung lam "params" cho ca buildReportKey() lan computeXxx() ben duoi, thay the viec goi
 * thang sharedReportFilters(c, ...) (nhan Context) trong than ham compute. Them "ky_thuat_vien"
 * RIENG cho cases.ts (khong dua vao REPORT_DIMS dung chung o filterParams.ts vi se anh huong
 * missingParts.ts/napGas.ts/survey.ts - giong quyet dinh o computeSurveyKhuVucReport truoc do). */
function readReportFilterParams(c: Context<{ Bindings: Env }>): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = { khu_vuc: c.req.query("khu_vuc"), ky_thuat_vien: c.req.query("ky_thuat_vien") };
  for (const dimKey of Object.keys(REPORT_DIMS)) {
    if (dimKey === "khu_vuc") continue;
    params[dimKey] = c.req.query(dimKey);
  }
  return params;
}

/** Ban sao cua sharedReportFilters() trong lib/filterParams.ts nhung nhan "params" (Record thuan)
 * thay vi Context - de dung duoc trong computeXxx (khong co Context o R7 warm-up). Logic PHAI khop
 * y het sharedReportFilters (cung doc tu REPORT_DIMS, bo qua khu_vuc), CONG THEM ky_thuat_vien
 * (xem readReportFilterParams). */
function sharedReportFiltersFromParams(params: Record<string, string | undefined>, prefix = ""): { sql: string; binds: unknown[] } {
  let sql = "";
  const binds: unknown[] = [];
  for (const [dimKey, col] of Object.entries(REPORT_DIMS)) {
    if (dimKey === "khu_vuc") continue;
    const value = params[dimKey];
    if (value) {
      sql += ` AND ${prefix}${col} = ?`;
      binds.push(value);
    }
  }
  if (params.ky_thuat_vien) {
    sql += ` AND ${prefix}ky_thuat_vien = ?`;
    binds.push(params.ky_thuat_vien);
  }
  return { sql, binds };
}

export interface CasesCountsPayload {
  can_giai_trinh_tong: number;
  lo_ke_hoach: number;
  tai_giai_trinh: number;
  chua_gt_3_ngay: number;
  chua_gt_5_ngay: number;
  dieu_hoa: number;
  b2b: number;
  nskx: number;
  da_giai_trinh: number;
}

/** Tach tu cases.get("/counts") - xem chu thich route ben duoi. Domain phu thuoc (khai bao o route
 * khi goi cachedReport): cases, giai_trinh, settings - theo dung bang R5 trong
 * YEU_CAU_BAO_CAO_TINH_SAN.md (dong bo domain voi backlog-stats/backlog-by-khu-vuc, cung nhom "Ton/
 * giai trinh"). */
export async function computeCasesCounts(db: D1Database, params: Record<string, string | undefined>, scope: string[] | null): Promise<CasesCountsPayload> {
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", params.khu_vuc);
  const sharedClause = sharedReportFiltersFromParams(params, "c.");
  const extraFilter = khuVucClause.sql + sharedClause.sql;
  const extraBinds = [...khuVucClause.binds, ...sharedClause.binds];

  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.tong} THEN 1 ELSE 0 END) as tong,
         SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.lo_ke_hoach} THEN 1 ELSE 0 END) as lo_ke_hoach,
         SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.tai_giai_trinh} THEN 1 ELSE 0 END) as tai_giai_trinh,
         SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.chua_gt_3_ngay} THEN 1 ELSE 0 END) as chua_gt_3_ngay,
         SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.chua_gt_5_ngay} THEN 1 ELSE 0 END) as chua_gt_5_ngay,
         SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.dieu_hoa} THEN 1 ELSE 0 END) as dieu_hoa,
         SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.b2b} THEN 1 ELSE 0 END) as b2b,
         SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.nskx} THEN 1 ELSE 0 END) as nskx,
         SUM(CASE WHEN lg.case_id IS NOT NULL THEN 1 ELSE 0 END) as da_giai_trinh
       FROM case_dvbh c
       ${latestGiaiTrinhJoin(CASE_FILTER_TON)}
       WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND c.huy_bo_at IS NULL${scopeClause.sql}${extraFilter}`,
    )
    .bind(...scopeClause.binds, ...extraBinds)
    .first<Record<string, number>>();

  return {
    can_giai_trinh_tong: row?.tong ?? 0,
    lo_ke_hoach: row?.lo_ke_hoach ?? 0,
    tai_giai_trinh: row?.tai_giai_trinh ?? 0,
    chua_gt_3_ngay: row?.chua_gt_3_ngay ?? 0,
    chua_gt_5_ngay: row?.chua_gt_5_ngay ?? 0,
    dieu_hoa: row?.dieu_hoa ?? 0,
    b2b: row?.b2b ?? 0,
    nskx: row?.nskx ?? 0,
    da_giai_trinh: row?.da_giai_trinh ?? 0,
  };
}

export interface BacklogStatsPayload {
  tongTon: { tong: number; tren1: number; tren3: number; tren5: number; tren7: number; tren14: number; daGiaiTrinh: number };
  aging: { duoi1: number; tu1den3: number; tu3den7: number; tu7den14: number; tren14: number };
  byReason: { ly_do: string; n: number }[];
}

/** Tach tu cases.get("/backlog-stats") - xem chu thich route ben duoi.
 *
 * R9.1 (YEU_CAU_BAO_CAO_TINH_SAN.md): truoc day ca ham nay chi doc 1 lan qua 1 cachedReport() gop
 * chung domain ["cases","giai_trinh","settings"] o cap route, nen moi khi co giai trinh moi thi CA
 * "tong/tren_1/tren_3/tren_7/tren_14" (thuan case_dvbh, khong doc gi tu lg.*) cung bi tinh lai theo.
 * Tach thanh 3 cachedReport() doc lap NGAY TRONG ham nay (thay vi o route) de cases.ts van la file
 * duy nhat bi sua (computeBacklogStats() giu nguyen chu ky/kieu tra ve cho reportWarmup.ts):
 *   - Phan A (khong JOIN giai_trinh): tong/tren_1/tren_3/tren_5/tren_7/tren_14 + aging (phan bo tuoi, von
 *     da thuan case_dvbh san) - domain ["cases"].
 *   - Phan B (JOIN giai_trinh, chi lay da_giai_trinh) - domain ["cases","giai_trinh"].
 *   - Phan C (byReason, doc lg.ly_do_cham) - domain ["cases","giai_trinh","settings"] (giu dung
 *     domain route dang khai bao cho endpoint nay).
 * Cong thuc SQL tung cot GIU NGUYEN 100% so voi ban truoc khi tach (chi tach cau, khong doi dieu
 * kien) - xem doi chieu chi tiet trong bao cao thuc hien R9.1/R9.2. */
export async function computeBacklogStats(db: D1Database, params: Record<string, string | undefined>, scope: string[] | null): Promise<BacklogStatsPayload> {
  const scopeClauseC = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClauseC = khuVucAdHocClause("c.khu_vuc", params.khu_vuc);
  const sharedClause = sharedReportFiltersFromParams(params, "c.");
  const extraFilter = khuVucClauseC.sql + sharedClause.sql;
  const extraBinds = [...khuVucClauseC.binds, ...sharedClause.binds];

  const keyA = buildReportKey("cases/backlog-stats/khong-join", params, scope);
  const partA = cachedReport(db, keyA, ["cases"], async () => {
    const tongTon = await db
      .prepare(
        `SELECT
           COUNT(*) as tong,
           SUM(CASE WHEN ${AGE_EXPR} >= 1 THEN 1 ELSE 0 END) as tren_1,
           SUM(CASE WHEN ${AGE_EXPR} >= 3 THEN 1 ELSE 0 END) as tren_3,
           SUM(CASE WHEN ${AGE_EXPR} >= 5 THEN 1 ELSE 0 END) as tren_5,
           SUM(CASE WHEN ${AGE_EXPR} >= 7 THEN 1 ELSE 0 END) as tren_7,
           SUM(CASE WHEN ${AGE_EXPR} >= 14 THEN 1 ELSE 0 END) as tren_14
         FROM case_dvbh c
         WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND c.huy_bo_at IS NULL${scopeClauseC.sql}${extraFilter}`,
      )
      .bind(...scopeClauseC.binds, ...extraBinds)
      .first<Record<string, number>>();

    const aging = await db
      .prepare(
        `SELECT
           SUM(CASE WHEN ${AGE_EXPR} < 1 THEN 1 ELSE 0 END) as duoi_1_ngay,
           SUM(CASE WHEN ${AGE_EXPR} >= 1 AND ${AGE_EXPR} < 3 THEN 1 ELSE 0 END) as tu_1_den_3,
           SUM(CASE WHEN ${AGE_EXPR} >= 3 AND ${AGE_EXPR} < 7 THEN 1 ELSE 0 END) as tu_3_den_7,
           SUM(CASE WHEN ${AGE_EXPR} >= 7 AND ${AGE_EXPR} < 14 THEN 1 ELSE 0 END) as tu_7_den_14,
           SUM(CASE WHEN ${AGE_EXPR} >= 14 THEN 1 ELSE 0 END) as tren_14_ngay
         FROM case_dvbh c
         WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND c.huy_bo_at IS NULL${scopeClauseC.sql}${extraFilter}`,
      )
      .bind(...scopeClauseC.binds, ...extraBinds)
      .first<Record<string, number>>();

    return { tongTon, aging };
  });

  const keyB = buildReportKey("cases/backlog-stats/join", params, scope);
  const partB = cachedReport(db, keyB, ["cases", "giai_trinh"], async () => {
    const row = await db
      .prepare(
        `SELECT SUM(CASE WHEN lg.case_id IS NOT NULL THEN 1 ELSE 0 END) as da_giai_trinh
         FROM case_dvbh c
         ${latestGiaiTrinhJoin(CASE_FILTER_TON)}
         WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND c.huy_bo_at IS NULL${scopeClauseC.sql}${extraFilter}`,
      )
      .bind(...scopeClauseC.binds, ...extraBinds)
      .first<Record<string, number>>();
    return row?.da_giai_trinh ?? 0;
  });

  const keyC = buildReportKey("cases/backlog-stats/by-reason", params, scope);
  const partC = cachedReport(db, keyC, ["cases", "giai_trinh", "settings"], async () => {
    const { results } = await db
      .prepare(
        `SELECT COALESCE(lg.ly_do_cham, 'Chưa giải trình') as ly_do, COUNT(*) as n
         FROM case_dvbh c
         ${latestGiaiTrinhJoin(CASE_FILTER_TON)}
         WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND c.huy_bo_at IS NULL${scopeClauseC.sql}${extraFilter}
         GROUP BY ly_do
         ORDER BY n DESC`,
      )
      .bind(...scopeClauseC.binds, ...extraBinds)
      .all<{ ly_do: string; n: number }>();
    return results;
  });

  const [{ tongTon, aging }, daGiaiTrinh, byReason] = await Promise.all([partA, partB, partC]);

  return {
    tongTon: {
      tong: tongTon?.tong ?? 0,
      tren1: tongTon?.tren_1 ?? 0,
      tren3: tongTon?.tren_3 ?? 0,
      tren5: tongTon?.tren_5 ?? 0,
      tren7: tongTon?.tren_7 ?? 0,
      tren14: tongTon?.tren_14 ?? 0,
      daGiaiTrinh: daGiaiTrinh ?? 0,
    },
    aging: {
      duoi1: aging?.duoi_1_ngay ?? 0,
      tu1den3: aging?.tu_1_den_3 ?? 0,
      tu3den7: aging?.tu_3_den_7 ?? 0,
      tu7den14: aging?.tu_7_den_14 ?? 0,
      tren14: aging?.tren_14_ngay ?? 0,
    },
    byReason,
  };
}

/** Tach tu cases.get("/backlog-by-khu-vuc") - xem chu thich route ben duoi. "dim" (ten cot nhom, da
 * qua whitelist REPORT_DIMS o route) nam trong params.dim.
 *
 * R9.2 (YEU_CAU_BAO_CAO_TINH_SAN.md): tach 1 cau SELECT ...GROUP BY duy nhat (gop ca cot thuan
 * case_dvbh lan cot doc lg.* hoac EXISTS settings_ly_do) thanh 2 cachedReport() doc lap NGAY TRONG ham
 * nay (giu nguyen chu ky computeBacklogByKhuVuc() cho reportWarmup.ts, chi sua cases.ts):
 *   - Cau A (khong JOIN giai_trinh): nhom, tong_ton/tren_3/tren_7/tren_14 - domain ["cases"].
 *   - Cau B (JOIN giai_trinh + EXISTS settings_ly_do): nhom, da_giai_trinh/can_giai_trinh_tong/
 *     lo_ke_hoach/cho_giai_trinh_lai/chua_gt_3_ngay/chua_gt_5_ngay/dieu_hoa_1_ngay/b2b_1_ngay/
 *     nskx_2_ngay/thieu_linh_kien - domain ["cases","giai_trinh","settings"].
 * Merge 2 mang ket qua theo khoa "nhom" bang Map (LEFT JOIN thu cong) truoc khi tra ve, giu dung
 * shape { rows } nhu cu (du tat ca cot, khong thieu field nao dù 1 ben khong co dong tuong ung -
 * ly thuyet khong xay ra vi ca A va B cung GROUP BY 1 dimCol tren cung tap ca dang ton, nhung van
 * fallback 0 cho an toan). Cong thuc SQL tung cot GIU NGUYEN 100% so voi ban truoc khi tach. */
export async function computeBacklogByKhuVuc(db: D1Database, params: Record<string, string | undefined>, scope: string[] | null): Promise<{ rows: Record<string, string | number>[] }> {
  const dimColRaw = REPORT_DIMS[params.dim ?? "khu_vuc"] ?? "khu_vuc";
  const dimCol = `c.${dimColRaw}`;

  const scopeClauseC = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClauseC = khuVucAdHocClause("c.khu_vuc", params.khu_vuc);
  const sharedClause = sharedReportFiltersFromParams(params, "c.");
  const extraFilter = khuVucClauseC.sql + sharedClause.sql;
  const extraBinds = [...khuVucClauseC.binds, ...sharedClause.binds];

  const keyA = buildReportKey("cases/backlog-by-khu-vuc/khong-join", params, scope);
  const partA = cachedReport(db, keyA, ["cases"], async () => {
    const { results } = await db
      .prepare(
        `SELECT ${dimCol} as nhom,
           SUM(CASE WHEN ${AGE_EXPR} >= 1 THEN 1 ELSE 0 END) as tong_ton,
           SUM(CASE WHEN ${AGE_EXPR} >= 3 THEN 1 ELSE 0 END) as tren_3,
           SUM(CASE WHEN ${AGE_EXPR} >= 7 THEN 1 ELSE 0 END) as tren_7,
           SUM(CASE WHEN ${AGE_EXPR} >= 14 THEN 1 ELSE 0 END) as tren_14
         FROM case_dvbh c
         WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND c.huy_bo_at IS NULL AND ${dimCol} IS NOT NULL${scopeClauseC.sql}${extraFilter}
         GROUP BY ${dimCol}
         ORDER BY tong_ton DESC`,
      )
      .bind(...scopeClauseC.binds, ...extraBinds)
      .all<Record<string, string | number>>();
    return results;
  });

  const keyB = buildReportKey("cases/backlog-by-khu-vuc/join", params, scope);
  const partB = cachedReport(db, keyB, ["cases", "giai_trinh", "settings"], async () => {
    const { results } = await db
      .prepare(
        `SELECT ${dimCol} as nhom,
           SUM(CASE WHEN lg.case_id IS NOT NULL THEN 1 ELSE 0 END) as da_giai_trinh,
           SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.tong} THEN 1 ELSE 0 END) as can_giai_trinh_tong,
           SUM(CASE WHEN ${NEED_LO_KE_HOACH} THEN 1 ELSE 0 END) as lo_ke_hoach,
           SUM(CASE WHEN ${NEED_TAI_GIAI_TRINH} THEN 1 ELSE 0 END) as cho_giai_trinh_lai,
           SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.chua_gt_3_ngay} THEN 1 ELSE 0 END) as chua_gt_3_ngay,
           SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.chua_gt_5_ngay} THEN 1 ELSE 0 END) as chua_gt_5_ngay,
           SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.dieu_hoa} THEN 1 ELSE 0 END) as dieu_hoa_1_ngay,
           SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.b2b} THEN 1 ELSE 0 END) as b2b_1_ngay,
           SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.nskx} THEN 1 ELSE 0 END) as nskx_2_ngay,
           SUM(CASE WHEN EXISTS (SELECT 1 FROM settings_ly_do sld WHERE sld.ten_ly_do = lg.ly_do_cham AND sld.thuoc_thieu_linh_kien = 1) THEN 1 ELSE 0 END) as thieu_linh_kien
         FROM case_dvbh c
         ${latestGiaiTrinhJoin(CASE_FILTER_TON)}
         WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND c.huy_bo_at IS NULL AND ${dimCol} IS NOT NULL${scopeClauseC.sql}${extraFilter}
         GROUP BY ${dimCol}`,
      )
      .bind(...scopeClauseC.binds, ...extraBinds)
      .all<Record<string, string | number>>();
    return results;
  });

  const [rowsA, rowsB] = await Promise.all([partA, partB]);

  const mapB = new Map<string | number, Record<string, string | number>>();
  for (const r of rowsB) mapB.set(r.nhom, r);

  const rows = rowsA.map((a) => {
    const b = mapB.get(a.nhom);
    return {
      nhom: a.nhom,
      tong_ton: a.tong_ton,
      tren_3: a.tren_3,
      tren_7: a.tren_7,
      tren_14: a.tren_14,
      da_giai_trinh: b?.da_giai_trinh ?? 0,
      can_giai_trinh_tong: b?.can_giai_trinh_tong ?? 0,
      lo_ke_hoach: b?.lo_ke_hoach ?? 0,
      cho_giai_trinh_lai: b?.cho_giai_trinh_lai ?? 0,
      chua_gt_3_ngay: b?.chua_gt_3_ngay ?? 0,
      chua_gt_5_ngay: b?.chua_gt_5_ngay ?? 0,
      dieu_hoa_1_ngay: b?.dieu_hoa_1_ngay ?? 0,
      b2b_1_ngay: b?.b2b_1_ngay ?? 0,
      nskx_2_ngay: b?.nskx_2_ngay ?? 0,
      thieu_linh_kien: b?.thieu_linh_kien ?? 0,
    };
  });

  return { rows };
}

// GET /api/cases?tab=&khu_vuc=&page=&pageSize=&sortBy=&sortDir=&export=
// tab dac biet:
// - "ton-hien-tai": TOAN BO ca dang ton (khong phan biet da/chua giai trinh), loc them duoc qua
//   tuoi_tu/tuoi_den (vd "Ton tren 7 ngay").
// - "can-giai-trinh": 1 trong 5 nhom NEED_GIAI_TRINH_CATEGORIES (query "category", mac dinh "tong"
//   = hop OR ca 5 nhom, 1 ca thuoc nhieu nhom van chi dem/hien 1 lan).
cases.get("/", async (c) => {
  const scope = scopeByKhuVuc(c);
  const tab = c.req.query("tab") ?? "ton-hien-tai";
  const khuVucFilter = c.req.query("khu_vuc");
  const isExport = c.req.query("export") === "true";
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const dimClause = dimAdHocClause(`c.${REPORT_DIMS[c.req.query("dim") ?? ""] ?? "khu_vuc"}`, c.req.query("dim"), c.req.query("dim_value"));
  const sharedClause = sharedReportFilters(c, "c.");
  const idFilter = (c.req.query("id") ?? "").trim();
  const idClause: { sql: string; binds: unknown[] } = idFilter ? { sql: " AND c.id LIKE ?", binds: [`%${idFilter}%`] } : { sql: "", binds: [] };

  // "Ca da dong" (tab=da-dong) da tach rieng thanh 2 route ben duoi (da-dong-manifest/da-dong-chunks)
  // - snapshot theo tung ngay tren R2, chi ghi khi import (xem lib/daDongDayChunks.ts).
  if (tab === "da-dong") return c.json({ error: "DEPRECATED_USE_MANIFEST_ENDPOINT" }, 410);

  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const sortByRaw = c.req.query("sortBy") ?? "id";
  const sortBy = SORTABLE_COLUMNS.has(sortByRaw) ? sortByRaw : "id";
  const sortDir = c.req.query("sortDir") === "asc" ? "ASC" : "DESC";

  let tabFilter: string | null = null;
  if (tab === "ton-hien-tai") {
    tabFilter = "1=1";
  } else if (tab === "can-giai-trinh") {
    const category = c.req.query("category") ?? "tong";
    tabFilter = NEED_GIAI_TRINH_CATEGORIES[category] ?? null;
  } else {
    tabFilter = TAB_FILTERS[tab] ?? null;
  }
  if (!tabFilter) return c.json({ error: "INVALID_TAB" }, 400);

  const khuVucClause = khuVucAdHocClause("c.khu_vuc", khuVucFilter);
  const ageClause = ageFilterClause(c.req.query("tuoi_tu"), c.req.query("tuoi_den"));
  const ktv = c.req.query("ky_thuat_vien");
  const ktvClause: { sql: string; binds: unknown[] } = ktv ? { sql: " AND c.ky_thuat_vien = ?", binds: [ktv] } : { sql: "", binds: [] };
  const extraFilter = khuVucClause.sql + ageClause.sql + dimClause.sql + sharedClause.sql + idClause.sql + ktvClause.sql;
  const binds: unknown[] = [
    ...scopeClause.binds,
    ...khuVucClause.binds,
    ...ageClause.binds,
    ...dimClause.binds,
    ...sharedClause.binds,
    ...idClause.binds,
    ...ktvClause.binds,
  ];

  const whereSql = `WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND c.huy_bo_at IS NULL AND ${tabFilter}${scopeClause.sql}${extraFilter}`;

  // Tat ca cac tab o day (ton-hien-tai/can-giai-trinh/da-giai-trinh) deu bat buoc WHERE ngoai co
  // "thoi_gian_hoan_thanh IS NULL AND archived_at IS NULL" (xem whereSql) => an toan dung preset
  // CASE_FILTER_TON (khong bind param) de gioi han subquery ROW_NUMBER().
  const join = latestGiaiTrinhJoin(CASE_FILTER_TON);

  const countRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM case_dvbh c ${join} ${whereSql}`,
  )
    .bind(...binds)
    .first<{ total: number }>();

  // Cot "nhom ton" (Danh sach chi tiet BacklogModule.tsx) - tinh san server-side, tai dung DUNG
  // bieu thuc NEED_GIAI_TRINH_CATEGORIES (needGiaiTrinh.ts) de dam bao khop 100% voi cac StatCard/
  // pivot dang dung cung dinh nghia, thay vi tinh lai tuoi ca o client (de sai lech moc VN). Them
  // cot KHONG lam tang so dong quet (van cung 1 WHERE/JOIN, D1 tinh phi theo dong quet chu khong
  // theo so cot - xem CLAUDE.md "D1 read-budget discipline").
  const baseQuery = `
    SELECT c.*, lg.ly_do_cham as last_ly_do_cham, lg.ngay_giai_trinh as last_ngay_giai_trinh,
           lg.ngay_du_kien_hoan_thanh as last_ngay_du_kien_hoan_thanh,
           (CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.lo_ke_hoach} THEN 1 ELSE 0 END) as need_lo_ke_hoach,
           (CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.tai_giai_trinh} THEN 1 ELSE 0 END) as need_tai_giai_trinh,
           (CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.chua_gt_3_ngay} THEN 1 ELSE 0 END) as need_chua_gt_3_ngay,
           (CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.chua_gt_5_ngay} THEN 1 ELSE 0 END) as need_chua_gt_5_ngay,
           (CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.dieu_hoa} THEN 1 ELSE 0 END) as need_dieu_hoa,
           (CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.b2b} THEN 1 ELSE 0 END) as need_b2b,
           (CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.nskx} THEN 1 ELSE 0 END) as need_nskx
    FROM case_dvbh c
    ${join}
    ${whereSql}
    ORDER BY c.${sortBy} ${sortDir}
  `;

  if (isExport) {
    const { results } = await c.env.DB.prepare(`${baseQuery} LIMIT 5000`).bind(...binds).all();
    return c.json({ rows: results });
  }

  const offset = (page - 1) * pageSize;
  const { results } = await c.env.DB.prepare(`${baseQuery} LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, offset)
    .all();

  return c.json({
    rows: results,
    page,
    pageSize,
    total: countRow?.total ?? 0,
  });
});

// GET /api/cases/da-dong-manifest?thang=YYYY-MM - hash + so dong tung ngay trong thang (khong dung
// R2, khong rate-limit - chi doc bang manifest nho + cache "ly do gan nhat" co san). Client so hash
// nay voi cache IndexedDB cuc bo de biet ngay nao can goi POST /da-dong-chunks.
cases.get("/da-dong-manifest", async (c) => {
  const thang = c.req.query("thang") || new Date().toISOString().slice(0, 7);
  const { start, end } = monthBounds(thang);
  const [chunks, reasons] = await Promise.all([
    getDaDongManifest(c.env.DB, start, end),
    getDaDongReasons(c.env.DB, thang, start, end),
  ]);
  return c.json({ thang, chunks, reasons });
});

// POST /api/cases/da-dong-chunks {ngay: string[]} - tai noi dung chunk R2 cho tung ngay trong danh
// sach. Loc theo scope (khu_vuc_phu_trach) TRUOC KHI tra ve - ranh gioi bao mat, khong doi so voi
// truoc day. Loc ad-hoc (khu_vuc nguoi dung tu chon/hang/dim/id) KHONG con o server nua, chuyen het
// sang client (khong phai ranh gioi bao mat, chi la thu hep them trong pham vi da duoc phep xem).
// Rate-limit RIENG cho tung ngay (xem lib/r2DownloadRateLimit.ts) - ngay nao bi chan thi xep vao
// "throttled", KHONG chan cac ngay con lai trong cung request.
cases.post("/da-dong-chunks", async (c) => {
  const scope = scopeByKhuVuc(c);
  const user = c.get("user");
  const body = await c.req.json<{ ngay?: unknown }>().catch(() => ({ ngay: [] }));
  const requested = Array.isArray(body.ngay)
    ? [...new Set(body.ngay.filter((n): n is string => typeof n === "string" && /^\d{4}-\d{2}-\d{2}$/.test(n)))]
    : [];
  if (requested.length === 0) return c.json({ chunks: {}, throttled: {} });

  const allowedDates: string[] = [];
  const throttled: Record<string, { retryAfterSeconds: number }> = {};
  for (const ngay of requested) {
    const quota = await checkAndConsumeDownloadQuota(c.env.DB, user.email, ngay);
    if (quota.allowed) allowedDates.push(ngay);
    else throttled[ngay] = { retryAfterSeconds: quota.retryAfterSeconds ?? 60 };
  }

  const rawChunks = allowedDates.length > 0 ? await getDaDongChunks(c.env, allowedDates) : {};
  const chunks: Record<string, Record<string, unknown>[]> = {};
  for (const [ngay, rows] of Object.entries(rawChunks)) {
    chunks[ngay] =
      scope === null
        ? rows
        : rows.filter((row) => scope.length > 0 && typeof row.khu_vuc === "string" && scope.includes(row.khu_vuc as string));
  }

  return c.json({ chunks, throttled });
});

// GET /api/cases/search?q= - tra cuu nhanh theo ID hoac Serial (TopBar)
cases.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (!q) return c.json({ found: null });

  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "khu_vuc");
  // ID tu CRM la text (co the chua ky tu), khong con phan biet so/chuoi - thu khop ca id lan serial
  const row = await c.env.DB.prepare(
    `SELECT id FROM case_dvbh WHERE (id = ? OR seri_san_pham = ?)${scopeClause.sql}`,
  )
    .bind(q, q, ...scopeClause.binds)
    .first<{ id: string }>();

  return c.json({ found: row?.id ?? null });
});

// GET /api/cases/counts - so luong tung tab Backlog trong 1 query (cho hien thi "Chua giai trinh (4500)")
// Boc qua cachedReport (xem lib/reportCache.ts) - domain phu thuoc: cases, giai_trinh, settings (bang
// R5 trong YEU_CAU_BAO_CAO_TINH_SAN.md). Params dua vao key: khu_vuc (ad-hoc) + cac dim con lai trong
// REPORT_DIMS + scope khu_vuc theo vai tro (khong phu thuoc vai_tro/email nen khong can them).
cases.get("/counts", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params = readReportFilterParams(c);
  const key = buildReportKey("cases/counts", params, scope);
  const data = await cachedReport(c.env.DB, key, ["cases", "giai_trinh", "settings"], () => computeCasesCounts(c.env.DB, params, scope));
  return c.json(data);
});

// GET /api/cases/backlog-stats - tong ton hien tai theo nguong tuoi (1/3/7/14 ngay) + phan bo tuoi
// ca ton (cho bieu do) + co cau theo ly do cham gan nhat
// R9.1 (YEU_CAU_BAO_CAO_TINH_SAN.md): computeBacklogStats() tu goi cachedReport 3 lan doc lap ben
// trong (domain rieng cho phan thuan case_dvbh vs phan can JOIN giai_trinh) - route KHONG boc them
// 1 lop cachedReport gop domain nua de tranh luu trung du lieu (xem chu thich computeBacklogStats).
cases.get("/backlog-stats", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params = readReportFilterParams(c);
  const data = await computeBacklogStats(c.env.DB, params, scope);
  return c.json(data);
});

// GET /api/cases/backlog-by-khu-vuc?dim= - bao cao ca dang TON (thoi diem hien tai, khong theo
// thang) nhom theo 1 cot bat ky trong REPORT_DIMS (mac dinh khu_vuc): tong ton + tung nguong tuoi
// (1/3/7/14 ngay), so ca thieu linh kien, so/ty le da giai trinh, va 5 nhom "can giai trinh" (dung
// chung dinh nghia needGiaiTrinh.ts voi phan con lai cua he thong). Tra ten cot nhom chung la "nhom".
// R9.2 (YEU_CAU_BAO_CAO_TINH_SAN.md): computeBacklogByKhuVuc() tu goi cachedReport 2 lan doc lap
// ben trong (domain rieng cho phan thuan case_dvbh vs phan can JOIN giai_trinh/settings) - route
// KHONG boc them 1 lop cachedReport gop domain nua (xem chu thich computeBacklogByKhuVuc). "dim"
// van validate qua REPORT_DIMS truoc, tra 400 NGOAI moi cache.
cases.get("/backlog-by-khu-vuc", async (c) => {
  const dimKey = c.req.query("dim") ?? "khu_vuc";
  if (!REPORT_DIMS[dimKey]) return c.json({ error: "INVALID_DIM" }, 400);

  const scope = scopeByKhuVuc(c);
  const params = { ...readReportFilterParams(c), dim: dimKey };
  const data = await computeBacklogByKhuVuc(c.env.DB, params, scope);
  return c.json(data);
});

// GET /api/cases/archived
cases.get("/archived", requireRole("Admin", "Viewer"), async (c) => {
  const countRow = await c.env.DB.prepare(
    "SELECT COUNT(*) as total FROM case_dvbh WHERE archived_at IS NOT NULL",
  ).first<{ total: number }>();

  if (c.req.query("export") === "true") {
    const { results } = await c.env.DB.prepare(
      "SELECT * FROM case_dvbh WHERE archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT 5000",
    ).all();
    return c.json({ rows: results });
  }

  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM case_dvbh WHERE archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT ? OFFSET ?",
  )
    .bind(pageSize, offset)
    .all();

  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// GET /api/cases/tong-hop?khu_vuc=&hang=&trang_thai=&page=&pageSize=&export=
// "Danh sach tong" - toan bo ca da dong trong 3 thang gan nhat (thang hien tai + 2 thang truoc,
// tinh theo lich thang) CONG voi TAT CA ca dang ton (khong gioi han tuoi) - dung de doi chieu du
// lieu / lam bao cao, khac voi Backlog (chi ca dang ton) hay "Ca da dong" (chi 1 thang don).
cases.get("/tong-hop", async (c) => {
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const hang = c.req.query("hang");
  const hangClause: { sql: string; binds: unknown[] } = hang ? { sql: " AND c.hang = ?", binds: [hang] } : { sql: "", binds: [] };
  const trangThai = c.req.query("trang_thai");
  const trangThaiClause = trangThai === "dang-ton" ? " AND c.thoi_gian_hoan_thanh IS NULL" : trangThai === "da-dong" ? " AND c.thoi_gian_hoan_thanh IS NOT NULL" : "";

  const whereSql = `WHERE c.archived_at IS NULL
     AND (c.thoi_gian_hoan_thanh IS NULL OR c.thoi_gian_hoan_thanh >= date(datetime('now', '+7 hours'), 'start of month', '-2 months'))
     ${scopeClause.sql}${khuVucClause.sql}${hangClause.sql}${trangThaiClause}`;
  const binds = [...scopeClause.binds, ...khuVucClause.binds, ...hangClause.binds];

  const baseQuery = `SELECT c.* FROM case_dvbh c ${whereSql} ORDER BY c.id DESC`;

  if (c.req.query("export") === "true") {
    const { results } = await c.env.DB.prepare(`${baseQuery} LIMIT 5000`).bind(...binds).all();
    return c.json({ rows: results });
  }

  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM case_dvbh c ${whereSql}`)
    .bind(...binds)
    .first<{ total: number }>();
  const { results } = await c.env.DB.prepare(`${baseQuery} LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, offset)
    .all();

  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// GET /api/cases/data-version - MAX(updated_at) cua toan bo ca DA DONG (thoi_gian_hoan_thanh khong
// rong). Dung index rieng (migrations/0018) nen SQLite tra loi bang 1 lan doc index (khong quet
// bang) - gan nhu mien phi, khong can precompute nhu Ca lap. ClosedCasesTab.tsx dung gia tri nay de
// tu bien co can dong bo lai cache IndexedDB tren may hay khong, thay vi nguoi dung phai tu bam
// "Dong bo lai" (xem phan tich "diem 6" trong danh sach viec can lam ve dong bo theo thoi gian
// cap nhat). Chi 1 gia tri toan cuc (khong tach theo thang) vi da du re - GHI_DE/CAP_NHAT_MOC deu
// bump updated_at (xem importProcessor.ts), nen bat ky sua doi nao (ke ca sua 1 ca thang cu) deu
// lam gia tri nay doi, khien FE tu dong tai lai DUNG thang dang xem (khong phai toan bo cac thang
// da cache) - van dung 1 lan doc /cases/da-dong that su cho thang do, khong hon khong kem so voi
// bam nut "Dong bo lai" thu cong truoc day.
cases.get("/data-version", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT MAX(updated_at) as version FROM case_dvbh WHERE thoi_gian_hoan_thanh IS NOT NULL",
  ).first<{ version: string | null }>();
  return c.json({ version: row?.version ?? "" });
});

// GET /api/cases/:id
cases.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "INVALID_ID" }, 400);

  const caseRow = await c.env.DB.prepare("SELECT * FROM case_dvbh WHERE id = ?").bind(id).first();
  if (!caseRow) return c.json({ error: "NOT_FOUND" }, 404);

  const scope = scopeByKhuVuc(c);
  if (scope !== null && !scope.includes(String(caseRow.khu_vuc))) {
    return c.json({ error: "FORBIDDEN_KHU_VUC" }, 403);
  }

  const [giaiTrinhLog, ketQuaGoi, viPham, caLap, napGasDanhGia] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM giai_trinh WHERE case_id = ? ORDER BY ngay_giai_trinh DESC").bind(id).all(),
    c.env.DB.prepare("SELECT * FROM ket_qua_goi WHERE case_id = ? ORDER BY ngay_gio_thuc_hien DESC").bind(id).all(),
    c.env.DB.prepare("SELECT * FROM vi_pham WHERE case_id = ? ORDER BY ngay_ghi_nhan DESC").bind(id).all(),
    getCaLapDetection(c.env.DB, id),
    // Danh gia nap gas (xem migration 0025 + backend/src/routes/napGas.ts) - moi ca chi co 1 dong
    // (case_id la PRIMARY KEY), null neu chua tung duoc chot.
    c.env.DB.prepare("SELECT * FROM nap_gas_danh_gia WHERE case_id = ?").bind(id).first(),
  ]);

  return c.json({
    case: caseRow,
    giaiTrinh: giaiTrinhLog.results,
    ketQuaGoi: ketQuaGoi.results,
    viPham: viPham.results,
    caLap,
    napGasDanhGia: napGasDanhGia ?? null,
  });
});

// POST /api/cases/:id/giai-trinh - append-only, khong bao gio UPDATE/DELETE. "KSNB Doi tac" DA BO
// KHOI danh sach vai tro duoc phep (chot 2026-07-24): vai tro nay truoc chi duoc giai trinh ca dang
// TON thuoc tranh chap, nhung tranh chap gio CHI con tinh tren ca DA DONG (xem TRANH_CHAP_ELIGIBLE
// trong tranhChap.ts) - ma route nay chi nhan giai trinh cho ca dang MO (xem check CASE_ALREADY_DONE
// ben duoi), nen 2 dieu kien "dang ton" + "thuoc tranh chap" khong con the nao cung dung mot luc,
// lam quyen rieng cua KSNB Doi tac vinh vien khong dung duoc - da go bo hoan toan (khong con code
// chet), vai tro nay van GIU quyen xem (chi doc) module Quan ly tranh chap.
cases.post("/:id/giai-trinh", requireRole("Giam sat", "TBP DVBH", "Admin"), async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "INVALID_ID" }, 400);

  const caseRow = await c.env.DB.prepare("SELECT id, khu_vuc, thoi_gian_hoan_thanh FROM case_dvbh WHERE id = ?")
    .bind(id)
    .first<{ id: string; khu_vuc: string | null; thoi_gian_hoan_thanh: string | null }>();
  if (!caseRow) return c.json({ error: "NOT_FOUND" }, 404);
  if (caseRow.thoi_gian_hoan_thanh) return c.json({ error: "CASE_ALREADY_DONE" }, 400);

  const user = c.get("user");

  const scope = scopeByKhuVuc(c);
  if (scope !== null && !scope.includes(String(caseRow.khu_vuc))) {
    return c.json({ error: "FORBIDDEN_KHU_VUC" }, 403);
  }

  const body = await c.req.json<{
    ly_do_cham: string;
    noi_dung?: string;
    linh_kien_thieu?: string | null;
    ngay_du_kien_hoan_thanh?: string | null;
    ngay_yeu_cau_co_hang?: string | null;
    ma_xuat_hang_lien_quan?: string | null;
  }>();

  if (!body.ly_do_cham) return c.json({ error: "MISSING_LY_DO_CHAM" }, 400);
  if (!body.noi_dung || !body.noi_dung.trim()) return c.json({ error: "MISSING_NOI_DUNG" }, 400);
  if (!body.ngay_du_kien_hoan_thanh) return c.json({ error: "MISSING_NGAY_DU_KIEN" }, 400);

  const lyDo = await c.env.DB.prepare("SELECT ten_ly_do, thuoc_thieu_linh_kien FROM settings_ly_do WHERE ten_ly_do = ? AND bat_tat = 1")
    .bind(body.ly_do_cham)
    .first<{ ten_ly_do: string; thuoc_thieu_linh_kien: number }>();
  if (!lyDo) return c.json({ error: "INVALID_LY_DO_CHAM" }, 400);

  // Ly do thuoc nhom "thieu linh kien" bat buoc ke ca 3 truong con (linh kien / ngay yeu cau co
  // hang / ma xuat hang) - khac cac ly do khac chi bat buoc 3 truong chung o tren.
  if (lyDo.thuoc_thieu_linh_kien) {
    if (!body.linh_kien_thieu) return c.json({ error: "MISSING_LINH_KIEN_THIEU" }, 400);
    if (!body.ngay_yeu_cau_co_hang) return c.json({ error: "MISSING_NGAY_YEU_CAU_CO_HANG" }, 400);
    if (!body.ma_xuat_hang_lien_quan) return c.json({ error: "MISSING_MA_XUAT_HANG" }, 400);
  }

  const giaiTrinhId = crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO giai_trinh (id, case_id, ly_do_cham, noi_dung, linh_kien_thieu, ngay_du_kien_hoan_thanh,
       ngay_yeu_cau_co_hang, ma_xuat_hang_lien_quan, nguoi_giai_trinh, ngay_giai_trinh)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      giaiTrinhId,
      id,
      body.ly_do_cham,
      body.noi_dung ?? null,
      lyDo.thuoc_thieu_linh_kien ? body.linh_kien_thieu ?? null : null,
      body.ngay_du_kien_hoan_thanh ?? null,
      body.ngay_yeu_cau_co_hang ?? null,
      body.ma_xuat_hang_lien_quan ?? null,
      user.email,
      nowVN(),
    )
    .run();

  // Bump domain "giai_trinh" (xem lib/dataVersions.ts) - cac endpoint bao cao phu thuoc giai_trinh
  // (vd /cases/counts, /cases/backlog-stats) se tinh lai o lan doc tiep theo.
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["giai_trinh"]));

  return c.json({ id: giaiTrinhId }, 201);
});

// POST /api/cases/:id/huy - Admin danh dau 1 ca "huy bo" (khong can xu ly): an khoi moi hang doi
// can xu ly (backlog/khao sat/ca lap/nap gas...) + loai KPI, nhung van xem duoc o CaseDetail va
// "Danh sach tong". Ghi vao 3 cot huy_bo_* (migration 0037) - nam NGOAI BUSINESS_FIELDS nen khong
// bao gio bi importProcessor.ts ghi de, song sot qua moi lan import CRM. Co the dao nguoc (POST
// /bo-huy ben duoi).
cases.post("/:id/huy", requireRole("Admin"), async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "INVALID_ID" }, 400);

  const caseRow = await c.env.DB.prepare("SELECT id FROM case_dvbh WHERE id = ?").bind(id).first();
  if (!caseRow) return c.json({ error: "NOT_FOUND" }, 404);

  const body = await c.req.json<{ ly_do?: string }>().catch(() => ({ ly_do: undefined }));
  const user = c.get("user");

  await c.env.DB.prepare("UPDATE case_dvbh SET huy_bo_at = ?, huy_bo_by = ?, huy_bo_ly_do = ? WHERE id = ?")
    .bind(nowVN(), user.email, body.ly_do || null, id)
    .run();

  // Bump "cases" - huy ca anh huong KPI/backlog/khao sat/ca lap (khac assigned_to o survey.ts von
  // co y bo qua bump vi khong anh huong bao cao nao).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["cases"]));

  return c.json({ ok: true });
});

// POST /api/cases/:id/bo-huy - dao nguoc /huy, tra ca ve trang thai binh thuong.
cases.post("/:id/bo-huy", requireRole("Admin"), async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "INVALID_ID" }, 400);

  const caseRow = await c.env.DB.prepare("SELECT id FROM case_dvbh WHERE id = ?").bind(id).first();
  if (!caseRow) return c.json({ error: "NOT_FOUND" }, 404);

  await c.env.DB.prepare("UPDATE case_dvbh SET huy_bo_at = NULL, huy_bo_by = NULL, huy_bo_ly_do = NULL WHERE id = ?")
    .bind(id)
    .run();

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["cases"]));

  return c.json({ ok: true });
});

// GET /api/cases/huy-bulk/template - file CSV mau (id, ly_do) cho import huy ca hang loat.
cases.get("/huy-bulk/template", requireRole("Admin"), (c) => {
  return csvTemplateResponse(c, "id,ly_do\n1234567,Ca trung du lieu CRM\n", "mau_huy_ca_hang_loat.csv");
});

interface HuyBulkRow {
  id?: string;
  ly_do?: string;
}
interface HuyBulkSummary {
  thanhCong: number;
  loi: number;
  errors: string[];
}

async function processBulkHuy(db: D1Database, rows: HuyBulkRow[], nguoiHuy: string, commit: boolean): Promise<HuyBulkSummary> {
  const summary: HuyBulkSummary = { thanhCong: 0, loi: 0, errors: [] };

  // File Excel/CSV nguoi dung tai len: SheetJS co the tra ve cell toan chu so (vd id "1014874")
  // dang kieu number chu khong phai string - ep String() truoc .trim() (giong processBulkAssign
  // trong survey.ts) de tranh loi.
  const idsRaw = rows.map((r) => String(r.id ?? "").trim());
  const existingIds = await findExistingCaseIds(db, idsRaw);

  const validRows: { id: string; lyDo: string | null }[] = [];
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const id = String(row.id ?? "").trim();
    if (!id) return; // dong trong (thuong do file co dong cuoi rong) - bo qua tham lang
    if (!existingIds.has(id)) {
      summary.loi++;
      summary.errors.push(`Dòng ${i + 2}: không tìm thấy case_id "${id}"`);
      return;
    }
    if (seen.has(id)) return; // trung id trong cung file - chi xu ly 1 lan, khong tinh loi
    seen.add(id);
    validRows.push({ id, lyDo: row.ly_do ? String(row.ly_do).trim() || null : null });
  });

  summary.thanhCong = validRows.length;

  if (commit && validRows.length > 0) {
    const now = nowVN();
    const statements = validRows.map(({ id, lyDo }) =>
      db.prepare("UPDATE case_dvbh SET huy_bo_at = ?, huy_bo_by = ?, huy_bo_ly_do = ? WHERE id = ?").bind(now, nguoiHuy, lyDo, id),
    );
    await runBatched(db, statements);
  }

  return summary;
}

// POST /api/cases/huy-bulk/preview
cases.post("/huy-bulk/preview", requireRole("Admin"), async (c) => {
  const body = await c.req.json<{ rows: HuyBulkRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const user = c.get("user");
  const summary = await processBulkHuy(c.env.DB, body.rows, user.email, false);
  return c.json(summary);
});

// POST /api/cases/huy-bulk/commit
cases.post("/huy-bulk/commit", requireRole("Admin"), async (c) => {
  const body = await c.req.json<{ rows: HuyBulkRow[]; filename?: string }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const user = c.get("user");
  const summary = await processBulkHuy(c.env.DB, body.rows, user.email, true);

  if (summary.thanhCong > 0) {
    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["cases"]));
    c.executionCtx.waitUntil(
      logImportHistory(c.env.DB, {
        loai: "huy_ca_bulk",
        tenFile: body.filename ?? "huy_ca.csv",
        nguoiImport: user.email,
        thanhCong: summary.thanhCong,
        loi: summary.loi,
      }),
    );
  }

  return c.json(summary);
});

export default cases;
