import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { ageExpr, ageFilterClause as ageFilterClauseFor } from "../lib/ageCalc";
import { khuVucAdHocClause, REPORT_DIMS, dimAdHocClause, sharedReportFilters, QLDVBH_FILTER_VALUE, khuVucReportExclusionClause } from "../lib/filterParams";
import { getDaDongManifest, getDaDongChunks, getDaDongReasons } from "../lib/daDongDayChunks";
import { checkAndConsumeDownloadQuota } from "../lib/r2DownloadRateLimit";
import { findExistingCaseIds, runBatched, logImportHistory } from "../lib/backfillImportProcessor";
import { csvTemplateResponse } from "../lib/csvTemplate";
import {
  latestGiaiTrinhJoin,
  CASE_FILTER_TON,
  CASE_FILTER_TON_AND_CLOSED_RECENTLY,
  caseFilterTonAt0800,
  NEED_GIAI_TRINH_CATEGORIES,
  NEED_LO_KE_HOACH,
  NEED_TAI_GIAI_TRINH,
} from "../lib/needGiaiTrinh";
import { getCaLapDetection, NGUONG_NGAY_LAP } from "./caLap";
import { bumpVersions } from "../lib/dataVersions";
import { cachedReport, buildReportKey } from "../lib/reportCache";
import { nowVN } from "../lib/vnTime";
import { getBacklogDailyWithDelta, getBacklogDailyForKhuVuc, getBacklogDailyForKhuVucGroup, getBacklogSnapshotIds, roleVariantOf, buildSnapshotScopeKey } from "../lib/dailySnapshot";
import { getCanhBaoTonSnapshot, getCanhBaoTonTrendDeltas, filterBucketsByKhuVuc, computeCanhBaoTonProgressToday, type CanhBaoTonMetricKey } from "../lib/canhBaoTon";
import { hasModule } from "../lib/moduleAccess";

const cases = new Hono<{ Bindings: Env }>();

function validateReportParams(c: Context<{ Bindings: Env }>): string | null {
  const khuVuc = c.req.query("khu_vuc");
  if (khuVuc && khuVuc.length > 200) return "khu_vuc too long";

  const ktv = c.req.query("ky_thuat_vien");
  if (ktv) {
    if (ktv.length > 120) return "ky_thuat_vien too long";
    // Định dạng KTV chuẩn của CRM phải bắt đầu bằng mã trong ngoặc đơn, vd: "(ma) Tên"
    const hasParentheses = /^\([^)]+\)/.test(ktv);
    const isSpecialPlaceholder = ["Chưa phân công", "Không có", "N/A", "null", "undefined"].includes(ktv.trim());
    if (!hasParentheses && !isSpecialPlaceholder) {
      return "invalid ky_thuat_vien format";
    }
  }

  // Xác thực độ dài các tham số dimension khác trong whitelist REPORT_DIMS
  for (const dimKey of Object.keys(REPORT_DIMS)) {
    if (dimKey === "khu_vuc") continue;
    const value = c.req.query(dimKey);
    if (value && value.length > 100) {
      return `${dimKey} too long`;
    }
  }

  return null;
}

cases.use("*", verifySessionMiddleware, loadUser, async (c, next) => {
  const error = validateReportParams(c);
  if (error) return c.json({ error: "INVALID_PARAMETERS", message: error }, 400);
  await next();
});

const SORTABLE_COLUMNS = new Set(["id", "khach_hang", "khu_vuc", "thoi_gian_cskh_tiep_nhan", "ngay_import"]);

const TAB_FILTERS: Record<string, string> = {
  "da-giai-trinh": "lg.case_id IS NOT NULL",
  "da-giai-trinh-trong-ngay": "lg.case_id IS NOT NULL AND lg.ngay_giai_trinh >= date(datetime('now', '+7 hours'))",
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
  loc_tong_bcn: number;
  vip_24h: number;
  da_giai_trinh: number;
  dmx_3_ngay: number;
  dmx_chua_gt_3_ngay: number;
  dmx_tai_giai_trinh: number;
  dmx_lo_ke_hoach: number;
}

/** Tach tu cases.get("/counts") - xem chu thich route ben duoi. Domain phu thuoc (khai bao o route
 * khi goi cachedReport): cases, giai_trinh, settings - theo dung bang R5 trong
 * YEU_CAU_BAO_CAO_TINH_SAN.md (dong bo domain voi backlog-stats/backlog-by-khu-vuc, cung nhom "Ton/
 * giai trinh"). */
export async function computeCasesCounts(db: D1Database, params: Record<string, string | undefined>, scope: string[] | null): Promise<CasesCountsPayload> {
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", params.khu_vuc);
  const sharedClause = sharedReportFiltersFromParams(params, "c.");
  const exclusionClause = khuVucReportExclusionClause("c.khu_vuc");
  const extraFilter = khuVucClause.sql + sharedClause.sql + exclusionClause.sql;
  const extraBinds = [...khuVucClause.binds, ...sharedClause.binds, ...exclusionClause.binds];

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
         SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.loc_tong_bcn} THEN 1 ELSE 0 END) as loc_tong_bcn,
         SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.vip_24h} THEN 1 ELSE 0 END) as vip_24h,
         SUM(CASE WHEN lg.case_id IS NOT NULL THEN 1 ELSE 0 END) as da_giai_trinh,
         SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.dmx_3_ngay} THEN 1 ELSE 0 END) as dmx_3_ngay,
         SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.dmx_chua_gt_3_ngay} THEN 1 ELSE 0 END) as dmx_chua_gt_3_ngay,
         SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.dmx_tai_giai_trinh} THEN 1 ELSE 0 END) as dmx_tai_giai_trinh,
         SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.dmx_lo_ke_hoach} THEN 1 ELSE 0 END) as dmx_lo_ke_hoach
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
    loc_tong_bcn: row?.loc_tong_bcn ?? 0,
    vip_24h: row?.vip_24h ?? 0,
    da_giai_trinh: row?.da_giai_trinh ?? 0,
    dmx_3_ngay: row?.dmx_3_ngay ?? 0,
    dmx_chua_gt_3_ngay: row?.dmx_chua_gt_3_ngay ?? 0,
    dmx_tai_giai_trinh: row?.dmx_tai_giai_trinh ?? 0,
    dmx_lo_ke_hoach: row?.dmx_lo_ke_hoach ?? 0,
  };
}

export interface BacklogStatsPayload {
  tongTon: { tong: number; tren1: number; tren3: number; tren5: number; tren7: number; tren14: number; daGiaiTrinh: number; vipTon: number };
}

/** Tach tu cases.get("/backlog-stats") - xem chu thich route ben duoi.
 *
 * R9.1 (YEU_CAU_BAO_CAO_TINH_SAN.md): truoc day ca ham nay chi doc 1 lan qua 1 cachedReport() gop
 * chung domain ["cases","giai_trinh","settings"] o cap route, nen moi khi co giai trinh moi thi CA
 * "tong/tren_1/tren_3/tren_7/tren_14" (thuan case_dvbh, khong doc gi tu lg.*) cung bi tinh lai theo.
 * Tach thanh 2 cachedReport() doc lap NGAY TRONG ham nay (thay vi o route) de cases.ts van la file
 * duy nhat bi sua (computeBacklogStats() giu nguyen chu ky/kieu tra ve cho reportWarmup.ts):
 *   - Phan A (khong JOIN giai_trinh): tong/tren_1/tren_3/tren_5/tren_7/tren_14 - domain ["cases"].
 *   - Phan B (JOIN giai_trinh, chi lay da_giai_trinh) - domain ["cases","giai_trinh"].
 * CHOT 2026-08-01: bo Phan C (byReason) + "aging" cua Phan A - 2 bieu do "Phan bo tuoi ca ton"/"Co
 * cau ca ton theo ly do cham gan nhat" da bi go khoi Quan ly ton, khong con noi nao doc 2 truong nay.
 * Cong thuc SQL tung cot con lai GIU NGUYEN 100% so voi ban truoc. */
export async function computeBacklogStats(db: D1Database, params: Record<string, string | undefined>, scope: string[] | null): Promise<BacklogStatsPayload> {
  const scopeClauseC = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClauseC = khuVucAdHocClause("c.khu_vuc", params.khu_vuc);
  const sharedClause = sharedReportFiltersFromParams(params, "c.");
  const exclusionClause = khuVucReportExclusionClause("c.khu_vuc");
  const extraFilter = khuVucClauseC.sql + sharedClause.sql + exclusionClause.sql;
  const extraBinds = [...khuVucClauseC.binds, ...sharedClause.binds, ...exclusionClause.binds];

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
           SUM(CASE WHEN ${AGE_EXPR} >= 14 THEN 1 ELSE 0 END) as tren_14,
           SUM(CASE WHEN c.nhom_kh LIKE '%VIP%' THEN 1 ELSE 0 END) as vip_ton
         FROM case_dvbh c
         WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND c.huy_bo_at IS NULL${scopeClauseC.sql}${extraFilter}`,
      )
      .bind(...scopeClauseC.binds, ...extraBinds)
      .first<Record<string, number>>();

    return { tongTon };
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

  const [{ tongTon }, daGiaiTrinh] = await Promise.all([partA, partB]);

  return {
    tongTon: {
      tong: tongTon?.tong ?? 0,
      tren1: tongTon?.tren_1 ?? 0,
      tren3: tongTon?.tren_3 ?? 0,
      tren5: tongTon?.tren_5 ?? 0,
      tren7: tongTon?.tren_7 ?? 0,
      tren14: tongTon?.tren_14 ?? 0,
      daGiaiTrinh: daGiaiTrinh ?? 0,
      vipTon: tongTon?.vip_ton ?? 0,
    },
  };
}

/** Tach tu cases.get("/backlog-by-khu-vuc") - xem chu thich route ben duoi. "dim" (ten cot nhom, da
 * qua whitelist REPORT_DIMS o route) nam trong params.dim.
 *
 * R9.2 (YEU_CAU_BAO_CAO_TINH_SAN.md): tach 1 cau SELECT ...GROUP BY duy nhat (gop ca cot thuan
 * case_dvbh lan cot doc lg.* hoac EXISTS settings_ly_do) thanh 2 cachedReport() doc lap NGAY TRONG ham
 * nay (giu nguyen chu ky computeBacklogByKhuVuc() cho reportWarmup.ts, chi sua cases.ts):
 *   - Cau A (khong JOIN giai_trinh): nhom, tong_ton/tren_3/tren_5/tren_7/tren_14 - domain ["cases"].
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
  const exclusionClause = khuVucReportExclusionClause("c.khu_vuc");
  const extraFilter = khuVucClauseC.sql + sharedClause.sql + exclusionClause.sql;
  const extraBinds = [...khuVucClauseC.binds, ...sharedClause.binds, ...exclusionClause.binds];

  const keyA = buildReportKey("cases/backlog-by-khu-vuc/khong-join", params, scope);
  const partA = cachedReport(db, keyA, ["cases"], async () => {
    const { results } = await db
      .prepare(
        `SELECT ${dimCol} as nhom,
           SUM(CASE WHEN ${AGE_EXPR} >= 1 THEN 1 ELSE 0 END) as tong_ton,
           SUM(CASE WHEN ${AGE_EXPR} >= 3 THEN 1 ELSE 0 END) as tren_3,
           SUM(CASE WHEN ${AGE_EXPR} >= 5 THEN 1 ELSE 0 END) as tren_5,
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
           SUM(CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.dmx_chua_gt_3_ngay} THEN 1 ELSE 0 END) as dmx_chua_gt_3_ngay,
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
      tren_5: a.tren_5,
      tren_7: a.tren_7,
      tren_14: a.tren_14,
      da_giai_trinh: b?.da_giai_trinh ?? 0,
      can_giai_trinh_tong: b?.can_giai_trinh_tong ?? 0,
      lo_ke_hoach: b?.lo_ke_hoach ?? 0,
      cho_giai_trinh_lai: b?.cho_giai_trinh_lai ?? 0,
      dmx_chua_gt_3_ngay: b?.dmx_chua_gt_3_ngay ?? 0,
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
  // Drill-down tu the "Bao cao ngay 08:00" phai giu ca da dong sau 08:00: day van la
  // case thuoc baseline va Giám sát can giai trinh. Cac danh sach thong thuong van chi lay ca mo.
  const snapshot0800 = c.req.query("snapshot_0800") === "true" && (tab === "can-giai-trinh" || tab === "da-giai-trinh-trong-ngay" || tab === "canh-bao-ton");
  const khuVucFilter = c.req.query("khu_vuc");
  const isExport = c.req.query("export") === "true";
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const dimClause = dimAdHocClause(`c.${REPORT_DIMS[c.req.query("dim") ?? ""] ?? "khu_vuc"}`, c.req.query("dim"), c.req.query("dim_value"));
  const sharedClause = sharedReportFilters(c, "c.");
  // CHOT 2026-08-12: "id" query param gio khop CA ID lan Serial (truoc chi khop ID) - o tim kiem
  // "Danh sach chi tiet" cua Quan ly ton doi ten placeholder thanh "Tim theo ID/Serial…" tuong ung.
  const idFilter = (c.req.query("id") ?? "").trim();
  const idClause: { sql: string; binds: unknown[] } = idFilter
    ? { sql: " AND (c.id LIKE ? OR c.seri_san_pham LIKE ?)", binds: [`%${idFilter}%`, `%${idFilter}%`] }
    : { sql: "", binds: [] };

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
  } else if (tab === "canh-bao-ton") {
    // Loc thuc su qua snapshotIdClause (id IN json_each(?)) ben duoi - "1=1" chi la placeholder de
    // qua kiem tra INVALID_TAB, khong tu tinh dieu kien NEED_* song (bucket da dong bang tu 08:00).
    tabFilter = "1=1";
  } else {
    tabFilter = TAB_FILTERS[tab] ?? null;
  }
  if (!tabFilter) return c.json({ error: "INVALID_TAB" }, 400);

  // Chi dung tap ID da chot khi xem "Bao cao ngay 08:00" de drill-down. "since" PHAI lay tu CUNG
  // snapshot da sinh ra "ids" (tra ve chung tu getBacklogSnapshotIds) - truoc day goi rieng
  // getSnapshotForUser() (luon la snapshot theo vai_tro) du khuVucFilter dang tro toi 1 snapshot khac
  // (theo khu_vuc, xem getBacklogBucketsForKhuVuc trong dailySnapshot.ts), lam lech moc "since" so voi
  // moc da dung de tinh "remaining" tren StatCard - gay bug so lieu Danh sach chi tiet khong khop
  // StatCard "Tong can giai trinh" khi loc theo khu_vuc.
  // "canh-bao-ton": bucket toan he thong, khong theo vai_tro/khu_vuc (xem lib/canhBaoTon.ts) - "since"
  // de null (khong dung block loc theo ngay_giai_trinh ben duoi, block do chi chay cho can-giai-trinh/
  // da-giai-trinh-trong-ngay).
  const snapshotResult =
    tab === "canh-bao-ton" && snapshot0800
      ? await (async () => {
          const metricKey = c.req.query("category") as CanhBaoTonMetricKey | undefined;
          const snap = await getCanhBaoTonSnapshot(c.env.DB);
          const bucket = metricKey ? snap.buckets[metricKey] : undefined;
          if (!bucket) return null;
          return { ids: bucket.ids, since: null as unknown as string, sinceByKhuVuc: {} as Record<string, string> };
        })()
      : snapshot0800
        ? await getBacklogSnapshotIds(c.env.DB, c.get("user"), khuVucFilter || undefined, tab === "da-giai-trinh-trong-ngay" ? "tong" : (c.req.query("category") ?? "tong"))
        : null;
  if (snapshot0800 && snapshotResult === null) return c.json({ error: "SNAPSHOT_NOT_FOUND" }, 409);
  const snapshotIds = snapshotResult ? snapshotResult.ids : null;
  if (snapshotIds && snapshotIds.length === 0) return c.json({ rows: [], page, pageSize, total: 0 });

  const since = snapshotResult ? snapshotResult.since : null;
  const sinceByKhuVuc = snapshotResult ? snapshotResult.sinceByKhuVuc : {};

  const khuVucClause = khuVucAdHocClause("c.khu_vuc", khuVucFilter);
  const ageClause = ageFilterClause(c.req.query("tuoi_tu"), c.req.query("tuoi_den"));
  const ktv = c.req.query("ky_thuat_vien");
  const ktvClause: { sql: string; binds: unknown[] } = ktv ? { sql: " AND c.ky_thuat_vien = ?", binds: [ktv] } : { sql: "", binds: [] };
  const exclusionClause = khuVucReportExclusionClause("c.khu_vuc");
  const extraFilter = khuVucClause.sql + ageClause.sql + dimClause.sql + sharedClause.sql + idClause.sql + ktvClause.sql + exclusionClause.sql;
  // D1 gioi han 100 bind parameters/cau. Snapshot toan he thong co the co hang tram ID, nen
  // truyen ca tap qua json_each(?) thay vi tao mot "?" cho tung ID (loi nay tung lam UI chi hien
  // "Khong tai duoc du lieu" khi click the Bao cao 08:00).
  const snapshotIdClause = snapshotIds ? "c.id IN (SELECT value FROM json_each(?))" : null;
  // CHOT 2026-08-12: khi co snapshotIds, "join" (ben duoi) CUNG can gioi han theo DUNG tap ID nay
  // (thay vi caseFilterTonAt0800() danh gia lai moi lan doc) - nen json_each(?) xuat hien 2 LAN
  // trong cau SQL cuoi cung (1 trong join, 1 trong whereSql) => bind gia tri nay 2 LAN, dung THU TU
  // xuat hien trong text ("${join} ${whereSql}" - join dung truoc). Xem chu thich day du o bien
  // "join" ben duoi ve ly do can gioi han nay (bug "Chua giai trinh" sai du GS da giai trinh).

  const isDaGiaiTrinhTrongNgay = tab === "da-giai-trinh-trong-ngay";
  const caseStateFilter = snapshotIdClause ?? (snapshot0800 ? caseFilterTonAt0800("c") : (isDaGiaiTrinhTrongNgay ? "(c.thoi_gian_hoan_thanh IS NULL OR c.thoi_gian_hoan_thanh >= date(datetime('now', '+7 hours')))" : "c.thoi_gian_hoan_thanh IS NULL"));

  // "canh-bao-ton" (Bao cao ton danh cho QL) chi dung tab nay - "Bao cao" (can-giai-trinh/
  // da-giai-trinh-trong-ngay) van giu nguyen logic scope/khu_vuc/tuoi... o nhanh else ben duoi.
  // Yeu cau nguoi dung: so da chot luc 08:00 phai LUON khop tuyet doi voi danh sach click-through, bat
  // ke trang thai ca thay doi the nao sau do (giai trinh, archived, huy bo, doi khu_vuc...) hay vien
  // dang xem co scope khu_vuc_phu_trach bi han che hay khong (card tong VAN tinh toan he thong khong
  // theo vai_tro - xem canhBaoTon.ts). Vi vay CHI giu id/serial search + loc KTV (2 loc THU CONG nguoi
  // dung tu go/chon trong luc xem) + khuVucClause - CHOT 2026-08-20: khuVucClause (bo loc khu_vuc dang
  // chon tren UI, KHAC scopeClause theo vai_tro) DUOC ap dung lai (truoc bi bo hoan toan) vi StatCard
  // /canh-bao-ton (xem cases.ts route rieng) gio cung loc theo DUNG khuVucAdHocClause nay khi co
  // "khu_vuc" tren query string - giu tinh khop tuyet doi giua StatCard va danh sach click-through, chi
  // KHONG dung scopeClause/ageClause/dim/shared/exclusion (van bo, giu dung y nghia "escalation toan
  // he thong" cho phan KHONG duoc nguoi dung chu dong loc).
  const isCanhBaoTonFrozen = tab === "canh-bao-ton" && !!snapshotIdClause;

  let whereSql: string;
  let binds: unknown[];
  if (isCanhBaoTonFrozen) {
    whereSql = `WHERE ${snapshotIdClause}${idClause.sql}${ktvClause.sql}${khuVucClause.sql}`;
    binds = [JSON.stringify(snapshotIds), JSON.stringify(snapshotIds), ...idClause.binds, ...ktvClause.binds, ...khuVucClause.binds];
  } else {
    whereSql = `WHERE ${caseStateFilter} AND c.archived_at IS NULL AND c.huy_bo_at IS NULL${snapshotIdClause ? "" : ` AND ${tabFilter}`}${scopeClause.sql}${extraFilter}`;
    binds = [
      ...(snapshotIds ? [JSON.stringify(snapshotIds), JSON.stringify(snapshotIds)] : []),
      ...scopeClause.binds,
      ...khuVucClause.binds,
      ...ageClause.binds,
      ...dimClause.binds,
      ...sharedClause.binds,
      ...idClause.binds,
      ...ktvClause.binds,
      ...exclusionClause.binds,
    ];
  }
  if (snapshot0800 && since) {
    // Nhom "Tat ca DVBH" co the gom nhieu khu_vuc voi "since" KHAC NHAU (1 khu_vuc moi tu-heal
    // rieng le se co generatedAt lech xa cac khu_vuc con lai, xem chu thich sinceByKhuVuc trong
    // dailySnapshot.ts) - neu vay PHAI so sanh theo DUNG since cua khu_vuc tung dong (CASE WHEN
    // c.khu_vuc), khong duoc dung 1 gia tri "since" chung cho ca nhom (se lam so dong danh sach
    // lech voi StatCard "remaining" von tinh dung tung khu_vuc). Truong hop thuong (0/1 khu_vuc,
    // hoac tat ca deu chung 1 since) van dung nhanh scalar don gian nhu cu.
    const distinctSinceValues = new Set(Object.values(sinceByKhuVuc));
    const perKhuVucSql = (() => {
      if (distinctSinceValues.size <= 1) return null;
      const entries = Object.entries(sinceByKhuVuc);
      const whenSql = entries.map(() => "WHEN ? THEN ?").join(" ");
      return { sql: `(CASE c.khu_vuc ${whenSql} ELSE ? END)`, binds: [...entries.flat(), since] };
    })();
    if (tab === "can-giai-trinh") {
      if (perKhuVucSql) {
        whereSql += ` AND (lg.ngay_giai_trinh IS NULL OR lg.ngay_giai_trinh <= ${perKhuVucSql.sql})`;
        binds.push(...perKhuVucSql.binds);
      } else {
        whereSql += " AND (lg.ngay_giai_trinh IS NULL OR lg.ngay_giai_trinh <= ?)";
        binds.push(since);
      }
    } else if (tab === "da-giai-trinh-trong-ngay") {
      if (perKhuVucSql) {
        whereSql += ` AND lg.ngay_giai_trinh > ${perKhuVucSql.sql}`;
        binds.push(...perKhuVucSql.binds);
      } else {
        whereSql += " AND lg.ngay_giai_trinh > ?";
        binds.push(since);
      }
    }
  }

  // Tat ca cac tab o day (ton-hien-tai/can-giai-trinh/da-giai-trinh) deu bat buoc WHERE ngoai co
  // "thoi_gian_hoan_thanh IS NULL AND archived_at IS NULL" (xem whereSql) => an toan dung preset
  // CASE_FILTER_TON_AND_CLOSED_RECENTLY (khong bind param) de gioi han subquery ROW_NUMBER().
  //
  // CHOT 2026-08-12 (fix bug: chu he thong bao 4 ca da giai trinh trong ngay 12/08 nhung "Danh sach
  // chi tiet" (drill-down "Bao cao ngay 08:00") van hien "Chua giai trinh"): khi co snapshotIds
  // (dang xem drill-down dong bang), PHAI gioi han subquery "lg" (latest giai_trinh) theo DUNG tap
  // case_id da chot (snapshotIds) thay vi caseFilterTonAt0800() - ham do DANH GIA LAI moi lan doc
  // (dung datetime('now'), khong dong bang), nen 1 ca dang MO luc 08:00 (dat dieu kien lam baseline,
  // dung de tinh vao snapshotIds) nhung sau do TRONG NGAY duoc import lai voi thoi_gian_hoan_thanh
  // bi "lui ve truoc 08:00" (CRM ghi nhan thoi diem hoan thanh THAT SU, thuong som hon luc he thong
  // dong bo du sync xay ra sau 08:00) se lam caseFilterTonAt0800() tu TRUE (dung luc 08:00) chuyen
  // thanh FALSE (danh gia lai o thoi diem doc sau do) - subquery loc case_id cua "lg" khong con chua
  // case_id nay nua, nen JOIN khong tim thay giai_trinh MOI du GS da giai trinh that trong ngay. Dung
  // thang snapshotIds (tap ID CO DINH, khong danh gia lai) lam dieu kien loc thi luon an toan va
  // chinh xac cho drill-down dong bang.
  const join =
    snapshotIds
      ? latestGiaiTrinhJoin("id IN (SELECT value FROM json_each(?))")
      : latestGiaiTrinhJoin(snapshot0800 ? caseFilterTonAt0800() : CASE_FILTER_TON_AND_CLOSED_RECENTLY);

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
  // "last_ma_linh_kien_thieu"/"last_ma_xuat_hang_lien_quan" (CHOT 2026-08-06): lay thang tu "gt.*"
  // da co san trong subquery "lg" cua latestGiaiTrinhJoin() (chi con thieu 2 dong SELECT nay, khong
  // JOIN them bang nao) - dung cho cot tuy chon "Ma/Ten linh kien thieu gan nhat" + tinh nhanh "SL
  // don mua" (khop logic matchMuaHang() dang dung o CaseDetail.tsx) ben frontend, khong luu them gi
  // vao DB ca - chi 100% frontend nhu chu he thong yeu cau.
  const baseQuery = `
    SELECT c.*, lg.ly_do_cham as last_ly_do_cham, lg.ngay_giai_trinh as last_ngay_giai_trinh,
           lg.ngay_du_kien_hoan_thanh as last_ngay_du_kien_hoan_thanh, lg.noi_dung as last_noi_dung_giai_trinh,
           lg.linh_kien_thieu as last_ma_linh_kien_thieu, lg.ma_xuat_hang_lien_quan as last_ma_xuat_hang_lien_quan,
           (CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.lo_ke_hoach} THEN 1 ELSE 0 END) as need_lo_ke_hoach,
           (CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.tai_giai_trinh} THEN 1 ELSE 0 END) as need_tai_giai_trinh,
           (CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.chua_gt_3_ngay} THEN 1 ELSE 0 END) as need_chua_gt_3_ngay,
           (CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.chua_gt_5_ngay} THEN 1 ELSE 0 END) as need_chua_gt_5_ngay,
           (CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.dieu_hoa} THEN 1 ELSE 0 END) as need_dieu_hoa,
           (CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.b2b} THEN 1 ELSE 0 END) as need_b2b,
           (CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.nskx} THEN 1 ELSE 0 END) as need_nskx,
           (CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.loc_tong_bcn} THEN 1 ELSE 0 END) as need_loc_tong_bcn,
           (CASE WHEN ${NEED_GIAI_TRINH_CATEGORIES.vip_24h} THEN 1 ELSE 0 END) as need_vip_24h,
           ${AGE_EXPR} as tuoi_ton
    FROM case_dvbh c
    ${join}
    ${whereSql}
    ORDER BY (CASE WHEN c.nhom_kh LIKE '%VIP%' THEN 0 ELSE 1 END), c.${sortBy} ${sortDir}
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

// GET /api/cases/search?q= - tra cuu nhanh theo ID hoac Serial (TopBar). Tra ve MANG "matches" (khong
// phai 1 ID duy nhat) - tim theo ID luon ra dung 1 ca, nhung tim theo Serial co the trung nhieu ca
// (cung 1 san pham qua nhieu lan bao hanh) - frontend tu quyet dinh mo thang 1 ca (0-1 ket qua) hay
// hien popup danh sach (>1 ket qua, tai dung style "Chuoi lich su theo serial" cua CaseDetail).
// "id = ?" la index seek (PRIMARY KEY), "seri_san_pham = ?" cung co index rieng (idx_case_seri,
// migration 0001) - ca 2 nhanh deu la index-seek theo gia tri chinh xac, KHONG quet toan bang, chi
// phi ty le voi so ca thuc su trung (thuong vai ca), khong dang ngai du khong co LIMIT chan tren
// (van them LIMIT cho an toan truong hop hiem serial la gia tri rac dung chung hang chuc ca).
cases.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (!q) return c.json({ matches: [] });

  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  // "can_giai_trinh_lap" (CHOT 2026-08-12) - khop CHINH XAC dieu kien "eligible_for_eval" cua
  // getCaLapDetection() (caLap.ts) CONG THEM gl.chot_danh_gia_lap IS NULL (GS CHUA danh gia) - dung
  // de TopBar lam noi bat trong popup ket qua tim theo Serial nhung ca dang thuc su bi tinh vao "Ca
  // lap can danh gia" (tab "Can danh gia" cua module Ca lap), giup nguoi dung nhan ra ngay khong can
  // mo tung ca. Chi 1 LEFT JOIN theo case_id (PRIMARY KEY cua giai_trinh_lap) tren toi da 20 dong da
  // loc san boi id/seri_san_pham (index seek) - khong dang ke thay doi chi phi doc so voi truoc.
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.khach_hang, c.khu_vuc, c.thoi_gian_cskh_tiep_nhan, c.thoi_gian_hoan_thanh, c.tien_do_hoan_thanh,
            c.ky_thuat_vien, c.cach_thuc_xu_ly, c.link_crm,
            (c.ca_lap_prior_ht IS NOT NULL AND c.huy_bo_at IS NULL
             AND (julianday(c.thoi_gian_hoan_thanh) - julianday(c.ca_lap_prior_ht)) <= ${NGUONG_NGAY_LAP}
             AND gl.chot_danh_gia_lap IS NULL) as can_giai_trinh_lap
     FROM case_dvbh c LEFT JOIN giai_trinh_lap gl ON gl.case_id = c.id
     WHERE (c.id = ? OR c.seri_san_pham = ?)${scopeClause.sql}
     ORDER BY c.thoi_gian_hoan_thanh DESC LIMIT 20`,
  )
    .bind(q, q, ...scopeClause.binds)
    .all();

  return c.json({ matches: results });
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

// GET /api/cases/backlog-daily?khu_vuc= - "Bao cao ngay 08:00" cho Quan ly ton (dong bang + delta
// trong ngay, xem lib/dailySnapshot.ts). Khong kem "khu_vuc" (hoac khong co y nghia - xem duoi): doc
// snapshot theo vai_tro (getBacklogDailyWithDelta), CHI dung khi Quan ly ton khong co bo loc phu nao
// dang bat (isFrozenEligible o frontend). Kem "khu_vuc" DUNG 1 gia tri (khong phai gia tri ao
// __QLDVBH__, khong phai danh sach nhieu khu_vuc cach nhau dau phay - frontend chi gui khi
// isSingleKhuVucOnly): doc snapshot rieng cho khu_vuc do (getBacklogDailyForKhuVuc, xem
// generateKhuVucBacklogSnapshots) - PHAI kiem tra quyen qua scopeByKhuVuc TRUOC (Giam sat khong duoc
// xem khu_vuc ngoai pham vi phu trach). Kem "khu_vuc=__QLDVBH__" (CHOT 2026-08-01, chu he thong phat
// hien "Tat ca DVBH" truoc do roi ve so song): cong don snapshot cua TUNG khu_vuc thuc te co chua
// "qldvbh" trong ten (getBacklogDailyForKhuVucGroup) - loc theo scope TRUOC khi cong (Giam sat chi
// duoc cong nhung khu_vuc nam trong khu_vuc_phu_trach cua minh). Tra null neu khong co snapshot y
// nghia (Giam sat chua gan khu_vuc_phu_trach nao, giong /dashboard/daily-report).
cases.get("/backlog-daily", async (c) => {
  const khuVucParam = c.req.query("khu_vuc");
  if (khuVucParam === QLDVBH_FILTER_VALUE) {
    const scope = scopeByKhuVuc(c);
    const { results } = await c.env.DB.prepare("SELECT DISTINCT khu_vuc FROM case_dvbh WHERE khu_vuc LIKE '%qldvbh%'").all<{ khu_vuc: string }>();
    let list = results.map((r) => r.khu_vuc);
    if (scope !== null) list = list.filter((kv) => scope.includes(kv));
    const data = await getBacklogDailyForKhuVucGroup(c.env.DB, list);
    return c.json(data);
  }
  const isSingleKhuVuc = !!khuVucParam && khuVucParam !== QLDVBH_FILTER_VALUE && !khuVucParam.includes(",");
  if (isSingleKhuVuc) {
    const scope = scopeByKhuVuc(c);
    if (scope !== null && !scope.includes(khuVucParam)) {
      return c.json({ error: "FORBIDDEN_KHU_VUC" }, 403);
    }
    const data = await getBacklogDailyForKhuVuc(c.env.DB, khuVucParam);
    return c.json(data);
  }
  const data = await getBacklogDailyWithDelta(c.env.DB, c.get("user"));
  return c.json(data);
});

// GET /api/cases/giai-trinh-daily-trend?days=14 - bang lich su "ty le giai trinh trong ngay" theo
// khu vuc, chot 1 lan/ngay luc 17h30 (xem giai_trinh_daily_log migration 0040 + cron
// DAILY_LOG_1730_CRON trong index.ts). Day la du lieu LICH SU (khong the tinh song theo bo loc tuy
// y) - chi loc duoc theo pham vi khu_vuc cua nguoi xem (scopeByKhuVuc), khong nhan them tham so loc
// nao khac.
cases.get("/giai-trinh-daily-trend", async (c) => {
  const scope = scopeByKhuVuc(c);
  const days = Math.min(60, Math.max(1, Number(c.req.query("days") ?? 14)));
  const scopeClause = khuVucWhereClause(scope, "khu_vuc");

  // "excludedNgay" - danh sach ngay/khu_vuc bi loai tru khoi luy ke/ty le thang (settings_giai_trinh_
  // exclude_ngay, migration 0046) DO ADMIN THEM TAY - CHUA gom Chu nhat (quy tac cung, frontend tu
  // tinh qua getUTCDay() nhu backend, khong can server gui - xem BacklogModule.tsx isNgayExcluded).
  const [{ results }, { results: exclusionResults }] = await Promise.all([
    c.env.DB.prepare(
      `SELECT ngay, khu_vuc, can_giai_trinh, da_giai_trinh FROM giai_trinh_daily_log
       WHERE ngay >= date('now', '+7 hours', ?)${scopeClause.sql}
       ORDER BY khu_vuc ASC, ngay DESC`,
    )
      .bind(`-${days} days`, ...scopeClause.binds)
      .all<{ ngay: string; khu_vuc: string; can_giai_trinh: number; da_giai_trinh: number }>(),
    c.env.DB.prepare(`SELECT ngay, khu_vuc FROM settings_giai_trinh_exclude_ngay WHERE ngay >= date('now', '+7 hours', ?)`)
      .bind(`-${days} days`)
      .all<{ ngay: string; khu_vuc: string }>(),
  ]);

  const byKhuVuc = new Map<string, { ngay: string; can_giai_trinh: number; da_giai_trinh: number }[]>();
  for (const r of results) {
    const arr = byKhuVuc.get(r.khu_vuc) ?? [];
    arr.push({ ngay: r.ngay, can_giai_trinh: r.can_giai_trinh, da_giai_trinh: r.da_giai_trinh });
    byKhuVuc.set(r.khu_vuc, arr);
  }
  const rows = Array.from(byKhuVuc.entries()).map(([khu_vuc, days]) => ({ khu_vuc, days }));
  return c.json({ rows, excludedNgay: exclusionResults });
});

// GET /api/cases/ton-trend?tu_ngay=&den_ngay=&khu_vuc= - "So ca ton theo moc thoi gian" (Quan ly ton,
// cuoi tab Bao cao). Doc THANG tu daily_snapshot (khong tinh song NEED_* qua case_dvbh) - moi ngay 1
// dong chot san luc 08:00 (xem lib/dailySnapshot.ts generateDailySnapshot), da co san backlogTongTon/
// backlogTren3/5/7/14 (tong ca scope) VA khuVucReportRows (breakdown tung khu_vuc) trong payload JSON.
// Dung json_extract() de chi lay dung field can, khong keo ca payload (nho hang chuc field ID-list
// khac) ve Worker. Phan quyen: DUNG scope_key theo vai_tro nguoi xem (giong getSnapshotForUser) - Giam
// sat CHI thay dong da chot rieng cho khu_vuc_phu_trach cua ho, khong phai tinh lai; vai tro con lai
// (Admin/Viewer/TBP DVBH/QC/TBP CSKH) deu doc "khac|all"/"qc|all" (toan he thong), dung quy uoc scope
// cua snapshot dong bang, KHONG phai scopeByKhuVuc() song. "khu_vuc" (them 2026-08-22, dong bo voi bo
// loc khu_vuc chung cua ca module - xem khuVucFilter o BacklogModule.tsx) khong doi scope_key/quyen
// xem, chi cong don lai tu khuVucReportRows da co san (Giam sat truyen khu_vuc ngoai pham vi cua ho
// don gian se khop 0 dong, vi kv_rows cua ho von da chi chua khu_vuc_phu_trach).
cases.get("/ton-trend", async (c) => {
  const user = c.get("user");
  const roleVariant = roleVariantOf(user.vai_tro);
  const khuVucList = roleVariant === "giam_sat" ? user.khu_vuc_phu_trach : [];
  if (roleVariant === "giam_sat" && khuVucList.length === 0) return c.json({ rows: [] });
  const scopeKey = buildSnapshotScopeKey(roleVariant, khuVucList);

  const tuNgay = c.req.query("tu_ngay");
  const denNgay = c.req.query("den_ngay");
  const khuVucFilter = c.req.query("khu_vuc");
  let whereSql = "scope_key = ?";
  const binds: unknown[] = [scopeKey];
  if (tuNgay) {
    whereSql += " AND ngay >= ?";
    binds.push(tuNgay);
  }
  if (denNgay) {
    whereSql += " AND ngay <= ?";
    binds.push(denNgay);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT ngay,
       json_extract(payload, '$.backlogTongTon.count') as tong,
       json_extract(payload, '$.backlogTren3') as tren_3,
       json_extract(payload, '$.backlogTren5') as tren_5,
       json_extract(payload, '$.backlogTren7') as tren_7,
       json_extract(payload, '$.backlogTren14') as tren_14,
       json_extract(payload, '$.khuVucReportRows') as kv_rows
     FROM daily_snapshot
     WHERE ${whereSql}
     ORDER BY ngay ASC`,
  )
    .bind(...binds)
    .all<{ ngay: string; tong: number; tren_3: number; tren_5: number; tren_7: number; tren_14: number; kv_rows: string | null }>();

  // "khu_vuc" (them 2026-08-22, ad-hoc giong khuVucAdHocClause nhung tinh tren khuVucReportRows da co
  // san trong JSON thay vi WHERE tren cot, vi day la du lieu dong bang - xem chu thich BacklogBuckets.
  // khuVucReportRows o dailySnapshot.ts) - khong loc thi giu nguyen 5 cot tong da dong bang (backlogTongTon/
  // Tren3/5/7/14 - luon khop voi tong TAT CA khu_vuc trong kv_rows vi cung tinh tren 1 tap case).
  const matchesKhuVuc: (name: string) => boolean = !khuVucFilter
    ? () => true
    : khuVucFilter === QLDVBH_FILTER_VALUE
      ? (name) => name.includes("qldvbh")
      : ((values) => (name: string) => values.includes(name))(
          khuVucFilter
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        );

  const rows = results.map((r) => {
    if (!khuVucFilter) {
      return { ngay: r.ngay, tong: r.tong ?? 0, tren_3: r.tren_3 ?? 0, tren_5: r.tren_5 ?? 0, tren_7: r.tren_7 ?? 0, tren_14: r.tren_14 ?? 0 };
    }
    const kvRows: Record<string, { tong_ton?: number; tren_3?: number; tren_5?: number; tren_7?: number; tren_14?: number }> = r.kv_rows
      ? JSON.parse(r.kv_rows)
      : {};
    const acc = { tong: 0, tren_3: 0, tren_5: 0, tren_7: 0, tren_14: 0 };
    for (const [name, v] of Object.entries(kvRows)) {
      if (!matchesKhuVuc(name)) continue;
      acc.tong += v.tong_ton ?? 0;
      acc.tren_3 += v.tren_3 ?? 0;
      acc.tren_5 += v.tren_5 ?? 0;
      acc.tren_7 += v.tren_7 ?? 0;
      acc.tren_14 += v.tren_14 ?? 0;
    }
    return { ngay: r.ngay, ...acc };
  });

  return c.json({ rows });
});

// GET /api/cases/canh-bao-ton?khu_vuc= - 8 so dem "Canh bao ton danh cho QL" cua snapshot dong bang
// 08:00 hom nay (xem lib/canhBaoTon.ts) - mac dinh toan he thong, khong loc theo khu_vuc_phu_trach cua
// nguoi xem (day van la bao cao escalation cap quan ly). CHOT 2026-08-20: them "khu_vuc" (bo loc dang
// chon tren UI, KHAC scope theo vai_tro) - loc lai tap id da dong bang bang filterBucketsByKhuVuc()
// thay vi tinh lai NEED_* song, dam bao khop tuyet doi voi danh sach click-through (GET /cases ben
// duoi, nhanh isCanhBaoTonFrozen, cung ap dung DUNG 1 khuVucAdHocClause nay). Dung cho 8 o so tren the
// tong quan, bam vao 1 o dieu huong sang GET /cases?tab=canh-bao-ton&category=<key>&snapshot_0800=true.
cases.get("/canh-bao-ton", async (c) => {
  const khuVucFilter = c.req.query("khu_vuc") || undefined;
  const [snap, trend] = await Promise.all([getCanhBaoTonSnapshot(c.env.DB), getCanhBaoTonTrendDeltas(c.env.DB, khuVucFilter)]);
  const buckets = await filterBucketsByKhuVuc(c.env.DB, snap.buckets, khuVucFilter);
  const counts = Object.fromEntries(Object.entries(buckets).map(([key, bucket]) => [key, bucket.count]));
  // CHOT 2026-08-20 (item 4): 3 con so phu "hom nay" (da GT/da ket thuc/hien tai con) moi o metric -
  // tinh tren DUNG buckets DA loc khu_vuc o tren, dam bao dong bo voi counts.
  const progress = await computeCanhBaoTonProgressToday(c.env.DB, buckets);
  return c.json({ generatedAt: snap.generatedAt, counts, trend, progress });
});

// GET /api/cases/canh-bao-ton-daily-trend?days=14&khu_vuc= - bang lich su theo ngay cua "Canh bao ton
// danh cho QL" (canh_bao_ton_daily_log, migration 0076), mirror y het /giai-trinh-daily-trend o tren -
// chot 1 lan/ngay luc 08:00 (cung DAILY_SNAPSHOT_CRON), du lieu LICH SU (khong tinh song). Loc theo
// CA HAI: pham vi khu_vuc cua nguoi xem (scope) VA bo loc khu_vuc dang chon tren UI (them 2026-08-20,
// khuVucClause - dong bo voi /canh-bao-ton o tren khi nguoi dung chu dong loc theo khu_vuc).
cases.get("/canh-bao-ton-daily-trend", async (c) => {
  const scope = scopeByKhuVuc(c);
  const days = Math.min(60, Math.max(1, Number(c.req.query("days") ?? 14)));
  const scopeClause = khuVucWhereClause(scope, "khu_vuc");
  const khuVucClause = khuVucAdHocClause("khu_vuc", c.req.query("khu_vuc"));

  const { results } = await c.env.DB.prepare(
    `SELECT ngay, khu_vuc, ton_14_ngay, vip_svip_5_ngay, loc_tong_3_ngay, tranh_chap_3_ngay,
            ton_20_ngay, vip_svip_7_ngay, loc_tong_5_ngay, tranh_chap_5_ngay
     FROM canh_bao_ton_daily_log
     WHERE ngay >= date('now', '+7 hours', ?)${scopeClause.sql}${khuVucClause.sql}
     ORDER BY khu_vuc ASC, ngay DESC`,
  )
    .bind(`-${days} days`, ...scopeClause.binds, ...khuVucClause.binds)
    .all<{
      ngay: string;
      khu_vuc: string;
      ton_14_ngay: number;
      vip_svip_5_ngay: number;
      loc_tong_3_ngay: number;
      tranh_chap_3_ngay: number;
      ton_20_ngay: number;
      vip_svip_7_ngay: number;
      loc_tong_5_ngay: number;
      tranh_chap_5_ngay: number;
    }>();

  const byKhuVuc = new Map<string, (typeof results)[number][]>();
  for (const r of results) {
    const arr = byKhuVuc.get(r.khu_vuc) ?? [];
    arr.push(r);
    byKhuVuc.set(r.khu_vuc, arr);
  }
  const rows = Array.from(byKhuVuc.entries()).map(([khu_vuc, days]) => ({ khu_vuc, days }));
  return c.json({ rows });
});

// GET /api/cases/tong-hop?khu_vuc=&hang=&trang_thai=&page=&pageSize=&export=
// "Danh sach tong" - toan bo ca da dong trong 3 thang gan nhat (thang hien tai + 2 thang truoc,
// tinh theo lich thang) CONG voi TAT CA ca dang ton (khong gioi han tuoi) - dung de doi chieu du
// lieu / lam bao cao, khac voi Backlog (chi ca dang ton) hay "Ca da dong" (chi 1 thang don).
cases.get("/tong-hop", async (c) => {
  // CHOT 2026-08-01: "Danh sach tong" chi mo cho user co module "danh-sach-tong" trong danh sach
  // duoc xem (xem lib/moduleAccess.ts - Admin luon duoc, con lai theo users.modules/mac dinh vai
  // tro) - khac moi route/khu_vuc khac trong file nay (van scope theo khu_vuc_phu_trach nhu
  // thuong), day la GATE THEM chan ca route (khong chi gioi han du lieu).
  const user = c.get("user");
  if (!hasModule(user, "danh-sach-tong")) {
    return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  }
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const hang = c.req.query("hang");
  const hangClause: { sql: string; binds: unknown[] } = hang ? { sql: " AND c.hang = ?", binds: [hang] } : { sql: "", binds: [] };
  const trangThai = c.req.query("trang_thai");
  const trangThaiClause = trangThai === "dang-ton" ? " AND c.thoi_gian_hoan_thanh IS NULL" : trangThai === "da-dong" ? " AND c.thoi_gian_hoan_thanh IS NOT NULL" : "";
  // CHOT 2026-08-12: o tim ID/Serial rieng cho tab "Ca dang ton" (giong pattern idClause cua GET "/"
  // trong file nay) - khop CA id lan seri_san_pham.
  const idFilter = (c.req.query("id") ?? "").trim();
  const idClause: { sql: string; binds: unknown[] } = idFilter
    ? { sql: " AND (c.id LIKE ? OR c.seri_san_pham LIKE ?)", binds: [`%${idFilter}%`, `%${idFilter}%`] }
    : { sql: "", binds: [] };

  const whereSql = `WHERE c.archived_at IS NULL
     AND (c.thoi_gian_hoan_thanh IS NULL OR c.thoi_gian_hoan_thanh >= date(datetime('now', '+7 hours'), 'start of month', '-2 months'))
     ${scopeClause.sql}${khuVucClause.sql}${hangClause.sql}${trangThaiClause}${idClause.sql}`;
  const binds = [...scopeClause.binds, ...khuVucClause.binds, ...hangClause.binds, ...idClause.binds];

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

  const [giaiTrinhLog, ketQuaGoi, viPham, caLap, napGasDanhGia, bienBanHop] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM giai_trinh WHERE case_id = ? ORDER BY ngay_giai_trinh DESC").bind(id).all(),
    c.env.DB.prepare("SELECT * FROM ket_qua_goi WHERE case_id = ? ORDER BY ngay_gio_thuc_hien DESC").bind(id).all(),
    c.env.DB.prepare("SELECT * FROM vi_pham WHERE case_id = ? ORDER BY ngay_ghi_nhan DESC").bind(id).all(),
    getCaLapDetection(c.env.DB, id),
    // Danh gia nap gas (xem migration 0025 + backend/src/routes/napGas.ts) - moi ca chi co 1 dong
    // (case_id la PRIMARY KEY), null neu chua tung duoc chot.
    c.env.DB.prepare("SELECT * FROM nap_gas_danh_gia WHERE case_id = ?").bind(id).first(),
    // "Bien ban hop" (migration 0080) - nhat ky ghi chu cuoc hop, moi nhat truoc.
    c.env.DB.prepare("SELECT * FROM bien_ban_hop WHERE case_id = ? ORDER BY id DESC").bind(id).all(),
  ]);

  return c.json({
    case: caseRow,
    giaiTrinh: giaiTrinhLog.results,
    ketQuaGoi: ketQuaGoi.results,
    viPham: viPham.results,
    caLap,
    napGasDanhGia: napGasDanhGia ?? null,
    bienBanHop: bienBanHop.results,
  });
});

// POST /api/cases/:id/bien-ban-hop - append-only nhat ky ghi chu cuoc hop (migration 0080). Bat ky
// nguoi dung da dang nhap + co quyen xem ca nay deu ghi duoc (khong gioi han requireRole nhu
// giai-trinh - day la ghi chu noi bo, khong phai quy trinh nghiep vu can duyet). "nguoi_ghi" lay tu
// session (c.get("user").email), KHONG cho client tu goi de tranh gia mao.
cases.post("/:id/bien-ban-hop", async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "INVALID_ID" }, 400);

  const caseRow = await c.env.DB.prepare("SELECT id, khu_vuc FROM case_dvbh WHERE id = ?").bind(id).first<{ id: string; khu_vuc: string | null }>();
  if (!caseRow) return c.json({ error: "NOT_FOUND" }, 404);

  const scope = scopeByKhuVuc(c);
  if (scope !== null && !scope.includes(String(caseRow.khu_vuc))) {
    return c.json({ error: "FORBIDDEN_KHU_VUC" }, 403);
  }

  const body = await c.req.json<{ noi_dung?: string }>().catch(() => ({}) as { noi_dung?: string });
  const noiDung = (body.noi_dung ?? "").trim();
  if (!noiDung) return c.json({ error: "MISSING_NOI_DUNG" }, 400);

  const user = c.get("user");
  const row = await c.env.DB.prepare("INSERT INTO bien_ban_hop (case_id, noi_dung, nguoi_ghi) VALUES (?, ?, ?) RETURNING *")
    .bind(id, noiDung, user.email)
    .first();

  return c.json({ row });
});

// POST /api/cases/:id/giai-trinh - append-only, khong bao gio UPDATE/DELETE. "KSNB Doi tac" DA BO
// KHOI danh sach vai tro duoc phep (chot 2026-07-24): vai tro nay truoc chi duoc giai trinh ca dang
// TON thuoc tranh chap, nhung tranh chap gio CHI con tinh tren ca DA DONG (xem TRANH_CHAP_ELIGIBLE
// trong tranhChap.ts) - ma route nay CHOT 2026-08-12 da mo cho ca ca DA DONG LAU (xem duoi, bo han
// che "trong vong 1 ngay" cu), nen 2 dieu kien "dang ton" + "thuoc tranh chap" van co the cung dung 1
// luc, nhung quyen rieng cua KSNB Doi tac van chua duoc cap lai o day (ngoai pham vi yeu cau nay) -
// vai tro nay van GIU quyen xem (chi doc) module Quan ly tranh chap.
//
// CHOT 2026-08-12: bo han che "chi giai trinh duoc ca da dong trong vong 1 ngay ke tu luc hoan thanh"
// (truoc day tra loi CASE_ALREADY_DONE neu qua han) - theo yeu cau chu he thong, giam sat can giai
// trinh duoc CA CAC CA DA DONG TU LAU (vd de bo sung ly do cham cho KPI/bao cao cu). Khong con kiem
// tra thoi_gian_hoan_thanh o day nua - moi ca (mo hoac da dong, bat ke da dong bao lau) deu nhan giai
// trinh, mien nguoi dung co quyen (requireRole) + dung pham vi khu_vuc (scope check ben duoi).
cases.post("/:id/giai-trinh", requireRole("Giam sat", "TBP DVBH", "Admin"), async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "INVALID_ID" }, 400);

  const caseRow = await c.env.DB.prepare("SELECT id, khu_vuc, thoi_gian_hoan_thanh FROM case_dvbh WHERE id = ?")
    .bind(id)
    .first<{ id: string; khu_vuc: string | null; thoi_gian_hoan_thanh: string | null }>();
  if (!caseRow) return c.json({ error: "NOT_FOUND" }, 404);

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
