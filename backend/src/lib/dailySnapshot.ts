/**
 * Bao cao "dong bang" 08:00 sang VN + delta trong ngay - migration 0039 (bang daily_snapshot). Khac
 * cachedReport (lib/reportCache.ts, invalidate moi khi domain lien quan bump version), co che nay
 * CHU DICH khong doi trong ngay: 1 snapshot duoc tinh 1 lan (cron 08:00 VN, xem index.ts
 * DAILY_SNAPSHOT_CRON) hoac khi Admin bam "Lam moi bao cao" trong Import data (POST
 * /api/import/refresh-reports, xem routes/importRoute.ts - dung CHUNG nut voi warmDefaultReports()).
 *
 * Payload gom 2 nhom du lieu khac ban chat:
 * - 4 "bucket" (tonCanGiaiTrinh/thieuLinhKien/caLap/canKhaoSat) cho banner "Bao cao nhanh van de
 *   trong ngay" (Tong quat) - luu DANH SACH case id (khong chi so dem). Luc xem bao cao, doi chieu
 *   cac id do voi log MOI HON moc generated_at cua snapshot de tinh ra "da xu ly trong ngay" (xem
 *   getDailyReportWithDelta) - tu dong bao phu MOI luong ghi log lien quan (giai trinh, giai trinh
 *   lap, vi pham...) ma khong can cai +1/-1 thu cong vao tung route.
 * - KPI/pivot/doanh thu (kpis/pivotByDim/revenue*) cho khoi so lieu con lai cua Tong quat + toan bo
 *   module Bao cao doanh thu (CHOT 2026-08-01) - day la so TONG HOP (khong gan voi 1 danh sach case
 *   id cu the) nen KHONG co delta, chi dong bang nguyen si cho toi lan generate ke tiep. Chi ap dung
 *   cho bo loc MAC DINH (khong khu_vuc/hang, thang hien tai) - xem isDefaultReportParams(); bo loc
 *   khac mac dinh van tinh song qua reportCache nhu truoc (khong dong bang truoc duoc MOI to hop
 *   filter co the co, se bung no chi phi).
 */
import type { AppUser } from "../types";
import { NEED_SURVEY_CONDITION, RECENT_OR_OPEN_CONDITION } from "../routes/survey";
import { CA_LAP_CTE, NGUONG_NGAY_LAP } from "../routes/caLap";
import {
  latestGiaiTrinhJoin,
  CASE_FILTER_TON,
  caseFilterTonAt0800,
  NEED_TONG,
  NEED_LO_KE_HOACH,
  NEED_TAI_GIAI_TRINH,
  NEED_DMX_CHUA_GT_3_NGAY,
  NEED_CHUA_GT_5_NGAY,
  NEED_DIEU_HOA_1_NGAY,
  NEED_B2B_1_NGAY,
  NEED_NSKX_2_NGAY,
  NEED_LOC_TONG_BCN_1_NGAY,
  NEED_LO_KE_HOACH_DMX_5_NGAY,
  NEED_LO_KE_HOACH_14_NGAY,
  NEED_TAI_GIAI_TRINH_DMX_5_NGAY,
  NEED_TAI_GIAI_TRINH_14_NGAY,
} from "./needGiaiTrinh";
import { ageExpr } from "./ageCalc";
import { kpiEligibleClause } from "./kpiEligible";
import { missingPartsJoin, REVENUE_EXPR_C, currentMonthBoundsVN } from "./dailyReport";
import { getVnDateStr } from "./reportCache";
import { fromJsonArray } from "./jsonArray";
import { nowVN } from "./vnTime";
import { CURRENT_MONTH_VALUE, khuVucReportExclusionClause, QLDVBH_FILTER_VALUE } from "./filterParams";
import { hasModule } from "./moduleAccess";
import { type DashboardKpisPayload, type TrendRow, computeDashboardKpis, computeDashboardPivot, PIVOT_DIMS } from "./dashboardCompute";
import { buildBaocaoTonRows, renderBaocaoTonImage } from "./reportImage";
import { sendTelegramPhoto, TELEGRAM_BOT_ID, TELEGRAM_CHAT_ID } from "./telegram";
import { computeRevenue } from "./revenueCompute";

export type RoleVariant = "giam_sat" | "qc" | "khac";

export interface SnapshotBucket {
  ids: string[];
  count: number;
}

// Quan ly ton (CHOT 2026-08-01) - cac bucket rieng cho khoi "Tong ton"/"Can giai trinh" cua trang nay
// (khac tonCanGiaiTrinh don thuan la 1 bucket NEED_TONG dung cho banner Tong quat, o day di kem ban
// gom theo khu_vuc). Tach rieng khoi DailySnapshotPayload (thay vi khai bao thang trong do) de dung
// LAI duoc cho snapshot "loc theo 1 khu_vuc cu the" (xem computeBacklogBuckets/
// generateKhuVucBacklogSnapshots ben duoi, phuc vu khi nguoi dung Quan ly ton loc dung 1 khu_vuc) ma
// KHONG phai tinh lai ca kpis/pivot/revenue (qua ton kem, khong ai doc toi voi tung khu_vuc rieng).
// backlogTongTon = TOAN BO ca dang ton (khong dieu kien NEED_*). backlogTren3/5/7/14 la so tinh
// (khong ID-list, khong delta - yeu cau khong can breakdown rieng cho cac moc tuoi nay).
// Dong bang tinh (khong ID-list, khong delta) cho 1 dong cua bang "Bao cao ton theo khu vuc" (Quan ly
// ton, CHI khi nhom theo Khu vuc - xem showDailyCols o frontend) - khop dung shape KhuVucRow da co san
// o frontend, tru "nhom" (khoa Record) va "can_giai_trinh_tong" (da co san qua tonCanGiaiTrinhByKhuVuc
// nen khong luu trung).
export interface KhuVucReportRow {
  tong_ton: number;
  tren_3: number;
  tren_5: number;
  tren_7: number;
  tren_14: number;
  da_giai_trinh: number;
  lo_ke_hoach: number;
  cho_giai_trinh_lai: number;
  dmx_chua_gt_3_ngay: number;
  chua_gt_5_ngay: number;
  dieu_hoa_1_ngay: number;
  b2b_1_ngay: number;
  nskx_2_ngay: number;
  thieu_linh_kien: number;
}

export interface BacklogBuckets {
  tonCanGiaiTrinh: SnapshotBucket;
  // Cung tap id voi tonCanGiaiTrinh (NEED_TONG), gom theo khu_vuc - dung cho 3 cot "...trong ngay"
  // cua bang "Bao cao ton theo khu vuc" (Quan ly ton) va cho chotGiaiTrinhDailyLog() (log 17h30).
  tonCanGiaiTrinhByKhuVuc: Record<string, SnapshotBucket>;
  backlogTongTon: SnapshotBucket;
  backlogTren3: number;
  backlogTren5: number;
  backlogTren7: number;
  backlogTren14: number;
  backlogLoKeHoach: SnapshotBucket;
  backlogTaiGiaiTrinh: SnapshotBucket;
  backlogChuaGt3NgayDmx: SnapshotBucket;
  backlogChuaGt5Ngay: SnapshotBucket;
  backlogDieuHoa1Ngay: SnapshotBucket;
  backlogLoKeHoachDmx5: SnapshotBucket;
  backlogLoKeHoach14: SnapshotBucket;
  backlogTaiGiaiTrinhDmx5: SnapshotBucket;
  backlogTaiGiaiTrinh14: SnapshotBucket;
  // CHOT 2026-08-01: them de "2 chi tieu phu" B2B/NSKX cung dong bang/co delta nhat quan voi phan
  // con lai cua trang (truoc do 2 the nay doc song qua /cases/counts du dang o nhanh dong bang).
  backlogB2b: SnapshotBucket;
  backlogNskx: SnapshotBucket;
  // CHOT 2026-08-12: "chi tieu phu" moi - the canh bao "Loc tong, BCN >1 ngay" trong "Can giai
  // trinh" cua Quan ly ton, cung kieu B2B/NSKX (dong bang/co delta, KHONG cong vao NEED_TONG).
  backlogLocTongBcn: SnapshotBucket;
  // Nguon "chot cung" cho CAC COT TINH (khong delta) cua bang "Bao cao ton theo khu vuc" khi nhom
  // theo Khu vuc - xem KhuVucReportRow. Chi tinh cho khu_vuc (khong tinh cho tinh/doi_tac/hang/...,
  // giu dung tien le da chot voi chu he thong: "chi can ty le theo Khu vuc").
  khuVucReportRows: Record<string, KhuVucReportRow>;
}

export interface DailySnapshotPayload extends BacklogBuckets {
  thieuLinhKien: SnapshotBucket;
  caLap: SnapshotBucket;
  canKhaoSat: SnapshotBucket;
  doanhThuThang: number;
  kpis: DashboardKpisPayload;
  pivotByDim: Record<string, TrendRow[]>;
  revenueByKhuVuc: { totals: unknown; byDim: unknown[] };
  revenueByHang: { totals: unknown; byDim: unknown[] };
  revenueByKtv: { totals: unknown; byDim: unknown[] };
}

/** Suy role_variant tu vai_tro thuc te - "Giam sat" va "QC" co nhanh caLapWhere rieng (xem duoi), moi
 * vai_tro con lai (Admin/Viewer/TBP DVBH/TBP CSKH/CSKH/TN CSKH/KSNB Doi tac) dung chung 1 payload
 * "khac" (deu scope=null, deu thay ca_lap theo nhanh "ca hai") - chi khac o quyen xem doanh thu, cai
 * do gate rieng o read-side (getDailyReportWithDelta), khong can tach them scope_key. */
export function roleVariantOf(vaiTro: string | null | undefined): RoleVariant {
  if (vaiTro === "Giam sat") return "giam_sat";
  if (vaiTro === "QC") return "qc";
  return "khac";
}

/** scope_key on dinh cho 1 role_variant + khu vuc (chi co y nghia voi "giam_sat") - dung lam khoa
 * UNIQUE(ngay, scope_key) cua bang daily_snapshot. */
export function buildSnapshotScopeKey(roleVariant: RoleVariant, khuVucList: string[]): string {
  if (roleVariant === "giam_sat") return `giam_sat|${[...khuVucList].sort().join(",")}`;
  return `${roleVariant}|all`;
}

/** true neu bo loc dung ("khu_vuc"/"hang"/"thang"/"nhom_san_pham") la dung to hop MAC DINH ma
 * banner/Tong quat/Bao cao doanh thu hien khi moi mo trang (khong chon gi, thang hien tai) - CHI to
 * hop nay duoc phep doc tat qua daily_snapshot; moi to hop khac (nguoi dung tu doi filter, ke ca bo
 * loc Model moi CHOT 2026-08-12) van tinh song qua reportCache. */
export function isDefaultReportParams(params: { khu_vuc?: string; hang?: string; thang?: string; nhom_san_pham?: string }): boolean {
  return !params.khu_vuc && !params.hang && !params.nhom_san_pham && (!params.thang || params.thang === CURRENT_MONTH_VALUE);
}

const toBucket = (rows: { id: string }[]): SnapshotBucket => ({ ids: rows.map((r) => r.id), count: rows.length });

/** Tinh cac bucket rieng cho khoi "Tong ton"/"Can giai trinh" (Quan ly ton), gioi han theo
 * "khuVucList" NEU khong rong (mang rong = khong gioi han, toan he thong) - khac cac ham con lai
 * trong file nay, o day KHONG gan dieu kien gioi han voi "roleVariant" (isGiamSat) nua, de dung LAI
 * duoc cho snapshot loc theo 1 khu_vuc bat ky (khong chi khu_vuc_phu_trach cua Giam sat) - xem
 * generateKhuVucBacklogSnapshots(). */
async function computeBacklogBuckets(db: D1Database, khuVucList: string[]): Promise<BacklogBuckets> {
  const exclusionClause = khuVucReportExclusionClause("c.khu_vuc");
  const khuVucClause = (khuVucList.length > 0 ? ` AND c.khu_vuc IN (${khuVucList.map(() => "?").join(", ")})` : "") + exclusionClause.sql;
  const khuVucBinds = [...khuVucList, ...exclusionClause.binds];
  // CHOT 2026-08-01: baseline "ton" cua Bao cao ngay 08:00 PHAI dung caseFilterTonAt0800() (khong
  // phai CASE_FILTER_TON/"thoi_gian_hoan_thanh IS NULL" don thuan) - xem chu thich day du trong
  // needGiaiTrinh.ts. join phai truyen CUNG dieu kien nay de giu dung "superset an toan".
  const tonAnchorC = caseFilterTonAt0800("c");
  const joinScope = latestGiaiTrinhJoin(caseFilterTonAt0800());

  const needIdQuery = (needExpr: string) =>
    db
      .prepare(
        `SELECT c.id as id FROM case_dvbh c
         ${joinScope}
         WHERE ${tonAnchorC} AND c.archived_at IS NULL AND c.huy_bo_at IS NULL AND ${needExpr}${khuVucClause}`,
      )
      .bind(...khuVucBinds)
      .all<{ id: string }>();

  const [
    tonRows,
    backlogTongTonRows,
    backlogTrenRow,
    backlogLoKeHoachRows,
    backlogTaiGiaiTrinhRows,
    backlogChuaGt3NgayDmxRows,
    backlogChuaGt5NgayRows,
    backlogDieuHoa1NgayRows,
    backlogLoKeHoachDmx5Rows,
    backlogLoKeHoach14Rows,
    backlogTaiGiaiTrinhDmx5Rows,
    backlogTaiGiaiTrinh14Rows,
    backlogB2bRows,
    backlogNskxRows,
    backlogLocTongBcnRows,
    khuVucReportResult,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT c.id as id, c.khu_vuc as khu_vuc FROM case_dvbh c
         ${joinScope}
         WHERE ${tonAnchorC} AND c.archived_at IS NULL AND c.huy_bo_at IS NULL AND ${NEED_TONG}${khuVucClause}`,
      )
      .bind(...khuVucBinds)
      .all<{ id: string; khu_vuc: string | null }>(),
    db
      .prepare(
        `SELECT c.id as id FROM case_dvbh c
         WHERE ${tonAnchorC} AND c.archived_at IS NULL AND c.huy_bo_at IS NULL${khuVucClause}`,
      )
      .bind(...khuVucBinds)
      .all<{ id: string }>(),
    db
      .prepare(
        `SELECT
           SUM(CASE WHEN ${ageExpr("c.thoi_gian_cskh_tiep_nhan")} >= 3 THEN 1 ELSE 0 END) as tren_3,
           SUM(CASE WHEN ${ageExpr("c.thoi_gian_cskh_tiep_nhan")} >= 5 THEN 1 ELSE 0 END) as tren_5,
           SUM(CASE WHEN ${ageExpr("c.thoi_gian_cskh_tiep_nhan")} >= 7 THEN 1 ELSE 0 END) as tren_7,
           SUM(CASE WHEN ${ageExpr("c.thoi_gian_cskh_tiep_nhan")} >= 14 THEN 1 ELSE 0 END) as tren_14
         FROM case_dvbh c
         WHERE ${tonAnchorC} AND c.archived_at IS NULL AND c.huy_bo_at IS NULL${khuVucClause}`,
      )
      .bind(...khuVucBinds)
      .first<Record<string, number>>(),
    needIdQuery(NEED_LO_KE_HOACH),
    needIdQuery(NEED_TAI_GIAI_TRINH),
    needIdQuery(NEED_DMX_CHUA_GT_3_NGAY),
    needIdQuery(NEED_CHUA_GT_5_NGAY),
    needIdQuery(NEED_DIEU_HOA_1_NGAY),
    needIdQuery(NEED_LO_KE_HOACH_DMX_5_NGAY),
    needIdQuery(NEED_LO_KE_HOACH_14_NGAY),
    needIdQuery(NEED_TAI_GIAI_TRINH_DMX_5_NGAY),
    needIdQuery(NEED_TAI_GIAI_TRINH_14_NGAY),
    needIdQuery(NEED_B2B_1_NGAY),
    needIdQuery(NEED_NSKX_2_NGAY),
    needIdQuery(NEED_LOC_TONG_BCN_1_NGAY),
    // Nguon tinh (khong ID-list) cho bang "Bao cao ton theo khu vuc" khi nhom theo Khu vuc - 1 truy
    // van GROUP BY duy nhat, tuong tu computeBacklogByKhuVuc() (cases.ts) nhung dung tonAnchorC/
    // joinScope thay vi "song", va luon co dim=khu_vuc (khong nhan dim khac - dung tien le da chot).
    db
      .prepare(
        `SELECT c.khu_vuc as nhom,
           COUNT(*) as tong_ton,
           SUM(CASE WHEN ${ageExpr("c.thoi_gian_cskh_tiep_nhan")} >= 3 THEN 1 ELSE 0 END) as tren_3,
           SUM(CASE WHEN ${ageExpr("c.thoi_gian_cskh_tiep_nhan")} >= 5 THEN 1 ELSE 0 END) as tren_5,
           SUM(CASE WHEN ${ageExpr("c.thoi_gian_cskh_tiep_nhan")} >= 7 THEN 1 ELSE 0 END) as tren_7,
           SUM(CASE WHEN ${ageExpr("c.thoi_gian_cskh_tiep_nhan")} >= 14 THEN 1 ELSE 0 END) as tren_14,
           SUM(CASE WHEN lg.case_id IS NOT NULL THEN 1 ELSE 0 END) as da_giai_trinh,
           SUM(CASE WHEN ${NEED_LO_KE_HOACH} THEN 1 ELSE 0 END) as lo_ke_hoach,
           SUM(CASE WHEN ${NEED_TAI_GIAI_TRINH} THEN 1 ELSE 0 END) as cho_giai_trinh_lai,
           SUM(CASE WHEN ${NEED_DMX_CHUA_GT_3_NGAY} THEN 1 ELSE 0 END) as dmx_chua_gt_3_ngay,
           SUM(CASE WHEN ${NEED_CHUA_GT_5_NGAY} THEN 1 ELSE 0 END) as chua_gt_5_ngay,
           SUM(CASE WHEN ${NEED_DIEU_HOA_1_NGAY} THEN 1 ELSE 0 END) as dieu_hoa_1_ngay,
           SUM(CASE WHEN ${NEED_B2B_1_NGAY} THEN 1 ELSE 0 END) as b2b_1_ngay,
           SUM(CASE WHEN ${NEED_NSKX_2_NGAY} THEN 1 ELSE 0 END) as nskx_2_ngay,
           SUM(CASE WHEN EXISTS (SELECT 1 FROM settings_ly_do sld WHERE sld.ten_ly_do = lg.ly_do_cham AND sld.thuoc_thieu_linh_kien = 1) THEN 1 ELSE 0 END) as thieu_linh_kien
         FROM case_dvbh c
         ${joinScope}
         WHERE ${tonAnchorC} AND c.archived_at IS NULL AND c.huy_bo_at IS NULL AND c.khu_vuc IS NOT NULL${khuVucClause}
         GROUP BY c.khu_vuc`,
      )
      .bind(...khuVucBinds)
      .all<{ nhom: string } & Record<string, number>>(),
  ]);

  const tonCanGiaiTrinhByKhuVuc: Record<string, SnapshotBucket> = {};
  {
    const byKv = new Map<string, string[]>();
    for (const r of tonRows.results) {
      const kv = r.khu_vuc ?? "—";
      const arr = byKv.get(kv) ?? [];
      arr.push(r.id);
      byKv.set(kv, arr);
    }
    for (const [kv, ids] of byKv) tonCanGiaiTrinhByKhuVuc[kv] = { ids, count: ids.length };
  }

  const khuVucReportRows: Record<string, KhuVucReportRow> = {};
  for (const r of khuVucReportResult.results) {
    khuVucReportRows[r.nhom] = {
      tong_ton: r.tong_ton ?? 0,
      tren_3: r.tren_3 ?? 0,
      tren_5: r.tren_5 ?? 0,
      tren_7: r.tren_7 ?? 0,
      tren_14: r.tren_14 ?? 0,
      da_giai_trinh: r.da_giai_trinh ?? 0,
      lo_ke_hoach: r.lo_ke_hoach ?? 0,
      cho_giai_trinh_lai: r.cho_giai_trinh_lai ?? 0,
      dmx_chua_gt_3_ngay: r.dmx_chua_gt_3_ngay ?? 0,
      chua_gt_5_ngay: r.chua_gt_5_ngay ?? 0,
      dieu_hoa_1_ngay: r.dieu_hoa_1_ngay ?? 0,
      b2b_1_ngay: r.b2b_1_ngay ?? 0,
      nskx_2_ngay: r.nskx_2_ngay ?? 0,
      thieu_linh_kien: r.thieu_linh_kien ?? 0,
    };
  }

  return {
    tonCanGiaiTrinh: toBucket(tonRows.results),
    tonCanGiaiTrinhByKhuVuc,
    backlogTongTon: toBucket(backlogTongTonRows.results),
    backlogTren3: backlogTrenRow?.tren_3 ?? 0,
    backlogTren5: backlogTrenRow?.tren_5 ?? 0,
    backlogTren7: backlogTrenRow?.tren_7 ?? 0,
    backlogTren14: backlogTrenRow?.tren_14 ?? 0,
    backlogLoKeHoach: toBucket(backlogLoKeHoachRows.results),
    backlogTaiGiaiTrinh: toBucket(backlogTaiGiaiTrinhRows.results),
    backlogChuaGt3NgayDmx: toBucket(backlogChuaGt3NgayDmxRows.results),
    backlogChuaGt5Ngay: toBucket(backlogChuaGt5NgayRows.results),
    backlogDieuHoa1Ngay: toBucket(backlogDieuHoa1NgayRows.results),
    backlogLoKeHoachDmx5: toBucket(backlogLoKeHoachDmx5Rows.results),
    backlogLoKeHoach14: toBucket(backlogLoKeHoach14Rows.results),
    backlogTaiGiaiTrinhDmx5: toBucket(backlogTaiGiaiTrinhDmx5Rows.results),
    backlogTaiGiaiTrinh14: toBucket(backlogTaiGiaiTrinh14Rows.results),
    backlogB2b: toBucket(backlogB2bRows.results),
    backlogNskx: toBucket(backlogNskxRows.results),
    backlogLocTongBcn: toBucket(backlogLocTongBcnRows.results),
    khuVucReportRows,
  };
}

/** Tinh THAT SU 1 snapshot (khong qua bang daily_snapshot) cho 1 role_variant + khu vuc phu trach
 * (chi dung khi la "giam_sat"). Dung SELECT c.id (khong phai COUNT(*)) cho 4 bucket de luu lai danh
 * sach case id lam baseline doi chieu delta; KPI/pivot/doanh thu tinh voi bo loc mac dinh (thang hien
 * tai, khong khu_vuc/hang rieng - "scope" ben duoi da la gioi han khu vuc phu trach cua Giam sat, tuong
 * duong scopeByKhuVuc() ma cac route nay dung khi tinh song). */
export async function computeSnapshotPayload(db: D1Database, roleVariant: RoleVariant, khuVucList: string[]): Promise<DailySnapshotPayload> {
  const isGiamSat = roleVariant === "giam_sat";
  const exclusionC = khuVucReportExclusionClause("c.khu_vuc");
  const exclusionLap = khuVucReportExclusionClause("lap.khu_vuc");
  const khuVucClause = (isGiamSat ? ` AND c.khu_vuc IN (${khuVucList.map(() => "?").join(", ")})` : "") + exclusionC.sql;
  const khuVucClauseLap = (isGiamSat ? ` AND lap.khu_vuc IN (${khuVucList.map(() => "?").join(", ")})` : "") + exclusionLap.sql;
  const khuVucBinds = [...(isGiamSat ? khuVucList : []), ...exclusionC.binds];
  const khuVucBindsLap = [...(isGiamSat ? khuVucList : []), ...exclusionLap.binds];
  const { start, end } = currentMonthBoundsVN();
  const scope: string[] | null = isGiamSat ? khuVucList : null;

  const caLapWhere =
    roleVariant === "giam_sat"
      ? "gl.chot_danh_gia_lap IS NULL"
      : roleVariant === "qc"
        ? "gl.chot_danh_gia_lap IS NOT NULL AND gl.qc_chot IS NULL"
        : "(gl.chot_danh_gia_lap IS NULL OR gl.qc_chot IS NULL)";
  // CHOT 2026-08-02: badge sidebar "Ca lap" dem theo THANG HIEN TAI (lap.thoi_gian_hoan_thanh, dung
  // cot "thang" ma CaLapModule.tsx/routes/caLap.ts /danh-sach da dung), khong con la tong so ca lap
  // CHUA XU LY tu truoc den nay - tranh con so tich luy vo han qua cac thang.

  const pivotDimKeys = Object.keys(PIVOT_DIMS);

  const [linhKienRows, caLapRows, khaoSatRows, doanhThuRow, kpis, pivotResults, revenueByKhuVuc, revenueByHang, revenueByKtv, backlogBuckets] = await Promise.all([
    db
      .prepare(
        `SELECT c.id as id FROM case_dvbh c
         ${missingPartsJoin(CASE_FILTER_TON)}
         WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND c.huy_bo_at IS NULL${khuVucClause}`,
      )
      .bind(...khuVucBinds)
      .all<{ id: string }>(),
    db
      .prepare(
        `${CA_LAP_CTE} SELECT lap.id as id FROM lap LEFT JOIN giai_trinh_lap gl ON gl.case_id = lap.id WHERE lap.thoi_gian_hoan_thanh >= ? AND lap.thoi_gian_hoan_thanh < ? AND lap.gap_days <= ${NGUONG_NGAY_LAP} AND ${caLapWhere}${khuVucClauseLap}`,
      )
      .bind(start, end, ...khuVucBindsLap)
      .all<{ id: string }>(),
    db
      .prepare(
        `SELECT c.id as id FROM case_dvbh c
         WHERE c.archived_at IS NULL AND c.huy_bo_at IS NULL AND ${RECENT_OR_OPEN_CONDITION} AND ${NEED_SURVEY_CONDITION}${khuVucClause}`,
      )
      .bind(...khuVucBinds)
      .all<{ id: string }>(),
    db
      .prepare(
        `SELECT SUM(${REVENUE_EXPR_C}) as tong FROM case_dvbh c
         WHERE c.thoi_gian_hoan_thanh >= ? AND c.thoi_gian_hoan_thanh < ? AND ${kpiEligibleClause("c.")}${khuVucClause}`,
      )
      .bind(start, end, ...khuVucBinds)
      .first<{ tong: number | null }>(),
    computeDashboardKpis(db, { thang: CURRENT_MONTH_VALUE }, scope),
    Promise.all(pivotDimKeys.map((dimKey) => computeDashboardPivot(db, { dimKey, thang: CURRENT_MONTH_VALUE }, scope))),
    computeRevenue(db, { dim: "khu_vuc", thang: CURRENT_MONTH_VALUE }, scope),
    computeRevenue(db, { dim: "hang", thang: CURRENT_MONTH_VALUE }, scope),
    computeRevenue(db, { dim: "ky_thuat_vien", thang: CURRENT_MONTH_VALUE }, scope),
    computeBacklogBuckets(db, isGiamSat ? khuVucList : []),
  ]);

  const pivotByDim: Record<string, TrendRow[]> = {};
  pivotDimKeys.forEach((dimKey, i) => {
    pivotByDim[dimKey] = pivotResults[i].rows;
  });

  return {
    ...backlogBuckets,
    thieuLinhKien: toBucket(linhKienRows.results),
    caLap: toBucket(caLapRows.results),
    canKhaoSat: toBucket(khaoSatRows.results),
    doanhThuThang: doanhThuRow?.tong ?? 0,
    kpis,
    pivotByDim,
    revenueByKhuVuc,
    revenueByHang,
    revenueByKtv,
  };
}

// Dung chung cho ca DailySnapshotPayload (scope theo vai_tro) LAN BacklogBuckets (scope theo 1
// khu_vuc bat ky, xem generateKhuVucBacklogSnapshots) - bang daily_snapshot chi luu JSON text, khong
// rang buoc shape theo scope_key namespace nao.
export async function upsertSnapshot(db: D1Database, ngay: string, scopeKey: string, generatedAt: string, generatedBy: string, payload: unknown): Promise<void> {
  await db
    .prepare(
      `INSERT INTO daily_snapshot (ngay, scope_key, generated_at, generated_by, payload) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(ngay, scope_key) DO UPDATE SET generated_at = excluded.generated_at, generated_by = excluded.generated_by, payload = excluded.payload`,
    )
    .bind(ngay, scopeKey, generatedAt, generatedBy, JSON.stringify(payload))
    .run();
}

/** Orchestrator chay o cron 08:00 VN (index.ts) VA o endpoint "Lam moi bao cao" (Admin). Tinh + luu
 * lai snapshot cho: 1 ban "khac" (moi vai tro ngoai Giam sat/QC), 1 ban "qc", va 1 ban rieng cho MOI
 * khu_vuc_phu_trach PHAN BIET cua cac user vai_tro=Giam sat (2 Giam sat trung khu vuc dung chung 1
 * scope_key, khoi tinh lai). Tung buoc boc try/catch rieng (giong dung convention reportWarmup.ts) -
 * 1 scope loi khong duoc chan cac scope con lai. */
export async function generateDailySnapshot(db: D1Database, generatedBy: string): Promise<void> {
  const ngay = getVnDateStr();
  const generatedAt = nowVN();

  const tasks: { scopeKey: string; roleVariant: RoleVariant; khuVucList: string[] }[] = [
    { scopeKey: buildSnapshotScopeKey("khac", []), roleVariant: "khac", khuVucList: [] },
    { scopeKey: buildSnapshotScopeKey("qc", []), roleVariant: "qc", khuVucList: [] },
  ];

  try {
    const giamSatUsers = await db.prepare("SELECT khu_vuc_phu_trach FROM users WHERE vai_tro = 'Giam sat'").all<{ khu_vuc_phu_trach: string | null }>();
    const seen = new Set<string>();
    for (const u of giamSatUsers.results) {
      const scope = fromJsonArray(u.khu_vuc_phu_trach);
      if (scope.length === 0) continue;
      const scopeKey = buildSnapshotScopeKey("giam_sat", scope);
      if (seen.has(scopeKey)) continue;
      seen.add(scopeKey);
      tasks.push({ scopeKey, roleVariant: "giam_sat", khuVucList: scope });
    }
  } catch (err) {
    console.error("generateDailySnapshot: loi khi lay danh sach Giam sat", err);
  }

  for (const task of tasks) {
    try {
      const payload = await computeSnapshotPayload(db, task.roleVariant, task.khuVucList);
      await upsertSnapshot(db, ngay, task.scopeKey, generatedAt, generatedBy, payload);
    } catch (err) {
      console.error(`generateDailySnapshot: loi khi tinh/luu scope ${task.scopeKey}`, err);
    }
  }
}

export interface SnapshotForUser {
  generatedAt: string;
  generatedBy: string;
  payload: DailySnapshotPayload;
}

/** Doc snapshot 08:00 cua NGAY HOM NAY cho dung scope cua "user" - tu-heal (tinh+luu ngay tai cho)
 * neu chua co dong nao (lan dau trien khai, hoac Giam sat moi duoc gan khu vuc giua ngay) HOAC neu
 * dong da co nhung THIEU field moi (xem isStalePayload duoi day - phong khi 1 dong duoc sinh ra
 * TRUOC 1 lan deploy them field vao DailySnapshotPayload, vd them backlogXxx/tonCanGiaiTrinhByKhuVuc
 * cho Quan ly ton 2026-08-01: dong cu doc len thieu field, cac route doc thang field do se throw khi
 * gap object undefined - coi nhu CHUA CO snapshot hop le va tinh lai NGAY, tranh phai doi cron hom
 * sau hoac nguoi dung tu bam "Lam moi bao cao" moi het loi sau MOI lan deploy them field). Tra null
 * cho Giam sat CHUA duoc gan khu_vuc_phu_trach nao (khong co snapshot y nghia). Dung CHUNG cho ca
 * getDailyReportWithDelta (banner) lan cac route /kpis, /pivot, /revenue*, /cases/backlog-daily (bo
 * loc mac dinh). */
export async function getSnapshotForUser(db: D1Database, user: AppUser): Promise<SnapshotForUser | null> {
  const roleVariant = roleVariantOf(user.vai_tro);
  const isGiamSat = roleVariant === "giam_sat";
  const khuVucList = isGiamSat ? user.khu_vuc_phu_trach : [];
  if (isGiamSat && khuVucList.length === 0) return null;

  const ngay = getVnDateStr();
  const scopeKey = buildSnapshotScopeKey(roleVariant, khuVucList);

  let row = await db
    .prepare("SELECT generated_at, generated_by, payload FROM daily_snapshot WHERE ngay = ? AND scope_key = ?")
    .bind(ngay, scopeKey)
    .first<{ generated_at: string; generated_by: string; payload: string }>();

  // "backlogLocTongBcn" la field moi nhat duoc them (the canh bao "Loc tong, BCN >1 ngay",
  // 2026-08-12) - dung lam co hieu "payload du field hien tai chua". Chi can kiem tra field MOI NHAT
  // vi payload luon duoc GHI DE nguyen khoi (khong merge tung phan) moi lan generate, nen field cu
  // hon chac chan co mat neu field moi nhat co mat. QUAN TRONG: MOI lan them field moi vao
  // BacklogBuckets/DailySnapshotPayload, PHAI cap nhat lai ten field o CA 3 cho kiem tra nay (xem
  // getBacklogBucketsForKhuVuc/getBacklogDailyForKhuVuc ben duoi) - neu quen, snapshot cu (sinh TRUOC
  // luc them field) se bi coi la "du field" oan, lam cac ham doc field moi (vd resolvedOf() trong
  // computeBacklogDeltaPayload) nem loi "Cannot read properties of undefined" khi doc phai field
  // khong ton tai trong payload cu - da xay ra thuc te 2026-08-12 (backlogLocTongBcn) lam "Bao cao ton
  // theo khu vuc" hien trong khong 1 dong nao (khuVucStats bi disable khi showDailyCols nhung
  // backlogDaily lai loi ngam, khong co du lieu nao thay the).
  if (row && !(JSON.parse(row.payload) as Partial<DailySnapshotPayload>).backlogLocTongBcn) {
    row = null;
  }

  if (!row) {
    const generatedAt = nowVN();
    const payload = await computeSnapshotPayload(db, roleVariant, khuVucList);
    await upsertSnapshot(db, ngay, scopeKey, generatedAt, "auto", payload);
    row = { generated_at: generatedAt, generated_by: "auto", payload: JSON.stringify(payload) };
  }

  return { generatedAt: row.generated_at, generatedBy: row.generated_by, payload: JSON.parse(row.payload) };
}

// D1 gioi han DUNG 100 tham so bind/cau lenh (xem developers.cloudflare.com/d1/platform/limits/,
// giong chu thich CHUNK_SIZE_SERI o lib/caLapRefresh.ts - loi that da gap production 2026-07-29).
// Chunk id can chua them 1-2 bind "since" (caLap nhanh "khac" can ca ngay_giai_trinh LAN ngay_qc) nen
// de 98 (khong phai 100) cho chac chan khong vuot, du o nhanh nao.
const ID_CHUNK_SIZE = 98;

/** Dem so case_id (trong "ids") co dong log moi hon "since" trong 1 bang - dung lam "da xu ly trong
 * ngay" cho 1 bucket. "tsCondSql" la dieu kien tren cot ngay (vd "ngay_giai_trinh > ?"), co the la
 * OR nhieu cot (vd ca_lap nhanh "khac" phai xet ca ngay_giai_trinh LAN ngay_qc - xem caLap.ts 2 route
 * /gs va /qc ghi 2 cot thoi gian khac nhau) nen nhan "sinceBinds" rieng thay vi co dinh 1 gia tri.
 * Chia "ids" thanh nhieu chunk ID_CHUNK_SIZE roi cong don - moi chunk la 1 tap con case_id RIENG
 * BIET cua "ids" (von da khong trung lap, la case_dvbh.id) nen cong tong cac COUNT(DISTINCT) tung
 * chunk khong bi dem trung. */
async function countResolved(db: D1Database, table: string, tsCondSql: string, ids: string[], sinceBinds: string[]): Promise<number> {
  let total = 0;
  for (let i = 0; i < ids.length; i += ID_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + ID_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    const row = await db
      .prepare(`SELECT COUNT(DISTINCT case_id) as n FROM ${table} WHERE case_id IN (${placeholders}) AND (${tsCondSql})`)
      .bind(...chunk, ...sinceBinds)
      .first<{ n: number }>();
    total += row?.n ?? 0;
  }
  return total;
}

export interface DailyReportBucketResult {
  baseline: number;
  resolved: number;
  remaining: number;
}

export interface DailyReportWithDeltaPayload {
  scope: "khu_vuc" | "toan_he_thong";
  khuVucList: string[];
  generatedAt: string;
  generatedBy: string;
  tonCanGiaiTrinh: DailyReportBucketResult;
  thieuLinhKien: DailyReportBucketResult;
  caLap: DailyReportBucketResult;
  canKhaoSat: DailyReportBucketResult;
  doanhThuThang: number | null;
}

const EMPTY_BUCKET: DailyReportBucketResult = { baseline: 0, resolved: 0, remaining: 0 };

function toResult(base: SnapshotBucket, resolved: number): DailyReportBucketResult {
  return { baseline: base.count, resolved, remaining: base.count - resolved };
}

/** Ham GOI TU dashboard.ts (route GET /api/dashboard/daily-report) - doc snapshot qua
 * getSnapshotForUser() (tu-heal san), roi doi chieu voi log MOI HON moc snapshot de ra "da xu ly
 * trong ngay" cho 4 bucket. Doanh thu KHONG co delta (chi doi qua import, khong doi qua thao tac
 * nguoi dung trong ngay) - dong bang nguyen so, chi gate hien/an theo canViewRevenue cua NGUOI DANG
 * XEM (khac scope_key luu san, vi 1 snapshot "khac" co the duoc doc boi ca vai tro thay duoc doanh
 * thu lan khong). */
export async function getDailyReportWithDelta(db: D1Database, user: AppUser): Promise<DailyReportWithDeltaPayload> {
  const roleVariant = roleVariantOf(user.vai_tro);
  const isGiamSat = roleVariant === "giam_sat";
  const khuVucList = isGiamSat ? user.khu_vuc_phu_trach : [];
  // CHOT 2026-08-01: doi tu ROLES_XEM_TOAN_BO sang hasModule() de khop dung quyen vao module "Bao
  // cao doanh thu" (truoc day thieu "Giam sat" o day du revenue.ts van cho Giam sat vao module -
  // hasModule() gom dung ca 2 phia tu 1 nguon).
  const canViewRevenue = hasModule(user, "revenue");

  const snap = await getSnapshotForUser(db, user);
  if (!snap) {
    return {
      scope: "khu_vuc",
      khuVucList: [],
      generatedAt: nowVN(),
      generatedBy: "auto",
      tonCanGiaiTrinh: EMPTY_BUCKET,
      thieuLinhKien: EMPTY_BUCKET,
      caLap: EMPTY_BUCKET,
      canKhaoSat: EMPTY_BUCKET,
      doanhThuThang: canViewRevenue ? 0 : null,
    };
  }

  const { payload: snapshot, generatedAt, generatedBy } = snap;
  const since = generatedAt;

  const caLapTsCond = roleVariant === "giam_sat" ? "ngay_giai_trinh > ?" : roleVariant === "qc" ? "ngay_qc > ?" : "(ngay_giai_trinh > ? OR ngay_qc > ?)";
  const caLapBinds = roleVariant === "khac" ? [since, since] : [since];

  const [tonResolved, linhKienResolved, caLapResolved, khaoSatResolved] = await Promise.all([
    countResolved(db, "giai_trinh", "ngay_giai_trinh > ?", snapshot.tonCanGiaiTrinh.ids, [since]),
    countResolved(db, "giai_trinh", "ngay_giai_trinh > ?", snapshot.thieuLinhKien.ids, [since]),
    countResolved(db, "giai_trinh_lap", caLapTsCond, snapshot.caLap.ids, caLapBinds),
    countResolved(db, "vi_pham", "ngay_ghi_nhan > ?", snapshot.canKhaoSat.ids, [since]),
  ]);

  return {
    scope: isGiamSat ? "khu_vuc" : "toan_he_thong",
    khuVucList,
    generatedAt,
    generatedBy,
    tonCanGiaiTrinh: toResult(snapshot.tonCanGiaiTrinh, tonResolved),
    thieuLinhKien: toResult(snapshot.thieuLinhKien, linhKienResolved),
    caLap: toResult(snapshot.caLap, caLapResolved),
    canKhaoSat: toResult(snapshot.canKhaoSat, khaoSatResolved),
    doanhThuThang: canViewRevenue ? snapshot.doanhThuThang : null,
  };
}

export interface BacklogDailyPayload {
  generatedAt: string;
  generatedBy: string;
  tongTon: DailyReportBucketResult;
  tren3: number;
  tren5: number;
  tren7: number;
  tren14: number;
  canGiaiTrinh: {
    tong: DailyReportBucketResult;
    loKeHoach: DailyReportBucketResult;
    taiGiaiTrinh: DailyReportBucketResult;
    chuaGt3NgayDmx: DailyReportBucketResult;
    chuaGt5Ngay: DailyReportBucketResult;
    dieuHoa: DailyReportBucketResult;
    loKeHoachDmx5: DailyReportBucketResult;
    loKeHoach14: DailyReportBucketResult;
    taiGiaiTrinhDmx5: DailyReportBucketResult;
    taiGiaiTrinh14: DailyReportBucketResult;
    // CHOT 2026-08-01: "2 chi tieu phu" - khong cong vao "tong" (xem NEED_TONG), nhung van dong bang/
    // co delta nhu cac nhanh con lai thay vi doc song qua /cases/counts nhu truoc.
    b2b: DailyReportBucketResult;
    nskx: DailyReportBucketResult;
    // CHOT 2026-08-12: chi tieu phu moi "Loc tong, BCN >1 ngay" - cung kieu b2b/nskx.
    locTongBcn: DailyReportBucketResult;
  };
  byKhuVuc: Record<string, DailyReportBucketResult>;
  // Cot tinh (khong delta) cho bang "Bao cao ton theo khu vuc" khi nhom theo Khu vuc - xem
  // KhuVucReportRow trong computeBacklogBuckets().
  khuVucRows: Record<string, KhuVucReportRow>;
  // CHOT 2026-08-03: "Can giai trinh (tong luy ke)" / "Da giai trinh (trong thang)" - cong don SUM
  // theo TUNG NGAY tu giai_trinh_daily_log (chot 17h30, migration 0040) tu ngay 01 thang nay den hom
  // nay, theo khu_vuc. MOI ngay la 1 baseline rieng nen 1 ca con ton nhieu ngay lien tiep se duoc dem
  // NHIEU LAN (dung y "tong khoi luong phat sinh moi ngay cong don", KHONG phai "so ca khac nhau
  // trong thang" - da xac nhan voi chu he thong). Chi co y nghia khi nhom theo Khu vuc (log KHONG luu
  // theo Tinh/Doi tac/Hang/...).
  byKhuVucMonthly: Record<string, { canGiaiTrinhLuyKe: number; daGiaiTrinhThang: number }>;
}

// "Ngay loai tru" khoi luy ke/ty le giai trinh thang (CHOT 2026-08-03, xem migration
// 0046_giai_trinh_exclude_ngay.sql) - 2 nguon: (1) MOI Chu nhat, quy tac cung khong luu DB, tinh qua
// getUTCDay() tren "YYYY-MM-DD" (an toan vi day la ngay lich thuan, khong gio - khong lech mui gio);
// (2) danh sach settings_giai_trinh_exclude_ngay do Admin them tay, khu_vuc = '__ALL__' nghia la loai
// tru CA HE THONG ngay do. Dung chung cho ca vong lap cong SUM tu giai_trinh_daily_log LAN nhanh
// "hom nay chua chot, cong gia tri song" trong computeBacklogDeltaPayload ben duoi.
function buildNgayExcludedChecker(exclusionRows: { ngay: string; khu_vuc: string }[]): (ngay: string, khuVuc: string) => boolean {
  const manualSet = new Set(exclusionRows.map((r) => `${r.ngay}|${r.khu_vuc}`));
  const allSet = new Set(exclusionRows.filter((r) => r.khu_vuc === "__ALL__").map((r) => r.ngay));
  return (ngay: string, khuVuc: string) => {
    const isSunday = new Date(`${ngay}T00:00:00Z`).getUTCDay() === 0;
    return isSunday || allSet.has(ngay) || manualSet.has(`${ngay}|${khuVuc}`);
  };
}

/** Dung chung boi getBacklogDailyWithDelta (scope theo vai_tro) LAN getBacklogDailyForKhuVuc (scope
 * theo 1 khu_vuc bat ky nguoi dung tu loc) - tinh delta "da xu ly trong ngay" cho tat ca bucket cua
 * Quan ly ton tu 1 "BacklogBuckets" baseline + moc "generatedAt" da co san (khong quan tam baseline
 * do lay tu dau). */
async function computeBacklogDeltaPayload(
  db: D1Database,
  s: BacklogBuckets,
  generatedAt: string,
  generatedBy: string,
  // BAT BUOC truyen dung 1 khu_vuc khi ham nay duoc goi RIENG cho 1 khu_vuc (getBacklogDailyForKhuVuc)
  // roi merge nhieu payload lai (mergeBacklogDailyPayloads, Object.assign theo khoa khu_vuc) - neu
  // khong loc, moi lan goi se doc + tra ve ca "byKhuVucMonthly" cua TAT CA khu_vuc (khong chi khu_vuc
  // dang xu ly), khien lan goi SAU GHI DE mat phan "cong them hom nay" cua khu_vuc TRUOC do (da xay ra
  // thuc te, chu he thong phat hien qua so "Da giai trinh (trong thang)" thap bat thuong hon ca
  // "Da giai trinh (trong ngay)" cung dong). undefined = khong loc (dung cho getBacklogDailyWithDelta,
  // "s" da la toan he thong nen khong co nguy co ghi de cheo).
  khuVucFilter?: string,
): Promise<BacklogDailyPayload> {
  const since = generatedAt;
  const resolvedOf = (bucket: SnapshotBucket) => countResolved(db, "giai_trinh", "ngay_giai_trinh > ?", bucket.ids, [since]);

  const khuVucEntries = Object.entries(s.tonCanGiaiTrinhByKhuVuc);

  const [
    tongResolved,
    tonCanGiaiTrinhResolved,
    loKeHoachResolved,
    taiGiaiTrinhResolved,
    chuaGt3Resolved,
    chuaGt5Resolved,
    dieuHoaResolved,
    loKeHoachDmx5Resolved,
    loKeHoach14Resolved,
    taiGiaiTrinhDmx5Resolved,
    taiGiaiTrinh14Resolved,
    b2bResolved,
    nskxResolved,
    locTongBcnResolved,
    khuVucResolvedList,
  ] = await Promise.all([
    resolvedOf(s.backlogTongTon),
    resolvedOf(s.tonCanGiaiTrinh),
    resolvedOf(s.backlogLoKeHoach),
    resolvedOf(s.backlogTaiGiaiTrinh),
    resolvedOf(s.backlogChuaGt3NgayDmx),
    resolvedOf(s.backlogChuaGt5Ngay),
    resolvedOf(s.backlogDieuHoa1Ngay),
    resolvedOf(s.backlogLoKeHoachDmx5),
    resolvedOf(s.backlogLoKeHoach14),
    resolvedOf(s.backlogTaiGiaiTrinhDmx5),
    resolvedOf(s.backlogTaiGiaiTrinh14),
    resolvedOf(s.backlogB2b),
    resolvedOf(s.backlogNskx),
    resolvedOf(s.backlogLocTongBcn),
    Promise.all(khuVucEntries.map(([, bucket]) => resolvedOf(bucket))),
  ]);

  // "Can giai trinh (tong luy ke)" / "Da giai trinh (trong thang)" - doc giai_trinh_daily_log tu ngay
  // 01 thang nay den hom nay (xem giai thich o BacklogDailyPayload.byKhuVucMonthly). Hom nay CHUA co
  // dong log (truoc 17h30, hoac cron 17h30 chua chay) thi cong them baseline/resolved TINH SONG cua
  // hom nay vao 2 tong luy ke - da xac nhan voi chu he thong: truoc 17h30 "Da giai trinh (trong ngay)"
  // van tinh song nhu cu, sau 17h30 moi khop dung so da chot (khong doi nua).
  const today = getVnDateStr();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [{ results: monthLogRows }, { results: exclusionRows }] = await Promise.all([
    db
      .prepare(
        `SELECT ngay, khu_vuc, can_giai_trinh, da_giai_trinh FROM giai_trinh_daily_log WHERE ngay >= ? AND ngay <= ?${
          khuVucFilter ? " AND khu_vuc = ?" : ""
        }`,
      )
      .bind(monthStart, today, ...(khuVucFilter ? [khuVucFilter] : []))
      .all<{ ngay: string; khu_vuc: string; can_giai_trinh: number; da_giai_trinh: number }>(),
    db
      .prepare(`SELECT ngay, khu_vuc FROM settings_giai_trinh_exclude_ngay WHERE ngay >= ? AND ngay <= ?`)
      .bind(monthStart, today)
      .all<{ ngay: string; khu_vuc: string }>(),
  ]);
  const isNgayExcluded = buildNgayExcludedChecker(exclusionRows);

  const byKhuVucMonthly: Record<string, { canGiaiTrinhLuyKe: number; daGiaiTrinhThang: number }> = {};
  const todayFrozenResolved = new Map<string, number>(); // khu_vuc -> da_giai_trinh DA CHOT cua hom nay (neu co)
  for (const r of monthLogRows) {
    if (isNgayExcluded(r.ngay, r.khu_vuc)) {
      if (r.ngay === today) todayFrozenResolved.set(r.khu_vuc, r.da_giai_trinh);
      continue;
    }
    const acc = byKhuVucMonthly[r.khu_vuc] ?? { canGiaiTrinhLuyKe: 0, daGiaiTrinhThang: 0 };
    acc.canGiaiTrinhLuyKe += r.can_giai_trinh;
    acc.daGiaiTrinhThang += r.da_giai_trinh;
    byKhuVucMonthly[r.khu_vuc] = acc;
    if (r.ngay === today) todayFrozenResolved.set(r.khu_vuc, r.da_giai_trinh);
  }

  const byKhuVuc: Record<string, DailyReportBucketResult> = {};
  khuVucEntries.forEach(([kv, bucket], i) => {
    const liveResolved = khuVucResolvedList[i];
    const frozenResolved = todayFrozenResolved.get(kv);
    byKhuVuc[kv] = toResult(bucket, frozenResolved ?? liveResolved);

    if (frozenResolved === undefined && !isNgayExcluded(today, kv)) {
      const acc = byKhuVucMonthly[kv] ?? { canGiaiTrinhLuyKe: 0, daGiaiTrinhThang: 0 };
      acc.canGiaiTrinhLuyKe += bucket.count;
      acc.daGiaiTrinhThang += liveResolved;
      byKhuVucMonthly[kv] = acc;
    }
  });

  return {
    generatedAt,
    generatedBy,
    tongTon: toResult(s.backlogTongTon, tongResolved),
    tren3: s.backlogTren3,
    tren5: s.backlogTren5,
    tren7: s.backlogTren7,
    tren14: s.backlogTren14,
    canGiaiTrinh: {
      tong: toResult(s.tonCanGiaiTrinh, tonCanGiaiTrinhResolved),
      loKeHoach: toResult(s.backlogLoKeHoach, loKeHoachResolved),
      taiGiaiTrinh: toResult(s.backlogTaiGiaiTrinh, taiGiaiTrinhResolved),
      chuaGt3NgayDmx: toResult(s.backlogChuaGt3NgayDmx, chuaGt3Resolved),
      chuaGt5Ngay: toResult(s.backlogChuaGt5Ngay, chuaGt5Resolved),
      dieuHoa: toResult(s.backlogDieuHoa1Ngay, dieuHoaResolved),
      loKeHoachDmx5: toResult(s.backlogLoKeHoachDmx5, loKeHoachDmx5Resolved),
      loKeHoach14: toResult(s.backlogLoKeHoach14, loKeHoach14Resolved),
      taiGiaiTrinhDmx5: toResult(s.backlogTaiGiaiTrinhDmx5, taiGiaiTrinhDmx5Resolved),
      taiGiaiTrinh14: toResult(s.backlogTaiGiaiTrinh14, taiGiaiTrinh14Resolved),
      b2b: toResult(s.backlogB2b, b2bResolved),
      nskx: toResult(s.backlogNskx, nskxResolved),
      locTongBcn: toResult(s.backlogLocTongBcn, locTongBcnResolved),
    },
    byKhuVuc,
    khuVucRows: s.khuVucReportRows,
    byKhuVucMonthly,
  };
}

/** Ham GOI TU cases.ts (route GET /api/cases/backlog-daily, KHONG kem "khu_vuc") - CHI dung khi
 * Quan ly ton KHONG co bo loc phu nao dang bat (xem isFrozenEligible o frontend) - doc CUNG 1
 * snapshot 08:00 voi banner Tong quat (tai dung getSnapshotForUser(), khong tinh rieng). Tra null
 * neu khong co snapshot y nghia (Giam sat chua gan khu vuc). */
export async function getBacklogDailyWithDelta(db: D1Database, user: AppUser): Promise<BacklogDailyPayload | null> {
  const snap = await getSnapshotForUser(db, user);
  if (!snap) return null;
  return computeBacklogDeltaPayload(db, snap.payload, snap.generatedAt, snap.generatedBy);
}

// Tra ca "generatedAt" cung buckets (khac ban truoc chi tra BacklogBuckets) - getBacklogSnapshotIds
// BAT BUOC dung dung "generatedAt" nay lam "since" khi loc theo khu_vuc, khong duoc dung generatedAt
// cua snapshot theo vai_tro (getSnapshotForUser) - 2 snapshot nay tinh o 2 nhanh cron khac nhau
// (generateDailySnapshot vs generateKhuVucBacklogSnapshots), generated_at co the lech nhau vai giay
// toi vai chuc giay. Neu dung lech "since", cases.ts GET "/" (drill-down "Danh sach chi tiet") se dem
// case "da giai trinh" khac voi so "remaining" hien tren StatCard (bug: chu he thong bao "Tong can
// giai trinh" 1 nhung danh sach hien 2 dong) - moi giai trinh duoc ghi trong khoang lech giua 2 moc
// generated_at se bi tinh KHONG NHAT QUAN giua 2 noi.
export async function getBacklogBucketsForKhuVuc(db: D1Database, khuVuc: string): Promise<{ buckets: BacklogBuckets; generatedAt: string }> {
  const ngay = getVnDateStr();
  const scopeKey = buildKhuVucFilterScopeKey(khuVuc);

  let row = await db
    .prepare("SELECT generated_at, generated_by, payload FROM daily_snapshot WHERE ngay = ? AND scope_key = ?")
    .bind(ngay, scopeKey)
    .first<{ generated_at: string; generated_by: string; payload: string }>();

  // "backlogLocTongBcn" - field MOI NHAT cua BacklogBuckets, xem chu thich day du o getSnapshotForUser().
  if (row && !(JSON.parse(row.payload) as Partial<BacklogBuckets>).backlogLocTongBcn) {
    row = null;
  }

  if (row) {
    return { buckets: JSON.parse(row.payload), generatedAt: row.generated_at };
  } else {
    const generatedAt = nowVN();
    const buckets = await computeBacklogBuckets(db, [khuVuc]);
    await upsertSnapshot(db, ngay, scopeKey, generatedAt, "auto", buckets);
    return { buckets, generatedAt };
  }
}

/** Tra dung tap ID da chot luc 08:00 cho drill-down cua Quan ly ton, KEM "since" (generatedAt cua
 * DUNG snapshot da sinh ra tap ID do) - cases.ts GET "/" phai dung "since" nay (khong phai
 * getSnapshotForUser rieng) de loc "da giai trinh sau moc dong bang", neu khong 2 con so (StatCard
 * "remaining" vs so dong danh sach) se lech nhau xem chu thich o getBacklogBucketsForKhuVuc().
 * Ho tro ca khi loc theo khu vuc, nhom khu vuc QLDVBH, hoac mac dinh.
 *
 * "sinceByKhuVuc" (CHOT 2026-08-12, fix tiep bug so lieu lech khi loc "Tat ca DVBH"): nhom
 * QLDVBH gom NHIEU snapshot rieng (1 snapshot/khu_vuc, xem getBacklogBucketsForKhuVuc) - BINH
 * THUONG deu chung 1 generatedAt (cung 1 lan chay generateKhuVucBacklogSnapshots), nhung KHONG
 * PHAI luon dung: 1 khu_vuc MOI xuat hien lan dau trong ngay (import moi thang do) se chua co dong
 * snapshot hom nay, tu-heal rieng le tai thoi diem request DAU TIEN cham toi no - generatedAt cua
 * rieng khu_vuc do co the SAU nhieu gio so voi cac khu_vuc con lai trong nhom. Truoc day ham nay
 * chi tra 1 "since" DUY NHAT (lay tu khu_vuc DAU TIEN doc duoc, thu tu SELECT DISTINCT khong dam
 * bao on dinh) va dung CHUNG cho toan bo ID cua ca nhom - neu khu_vuc tu-heal rieng khong phai la
 * khu_vuc dau tien, cac ca THUOC KHU_VUC DO trong danh sach drill-down se bi loc theo since SAI
 * (cua khu_vuc khac), lam so dong danh sach lech voi StatCard "remaining" (von tinh dung tung
 * khu_vuc qua getBacklogDailyForKhuVucGroup). Tra them map "sinceByKhuVuc" (rong tru nhanh QLDVBH)
 * de cases.ts loc CHINH XAC tung dong theo DUNG since cua khu_vuc dong do. */
export async function getBacklogSnapshotIds(
  db: D1Database,
  user: AppUser,
  khuVucFilter: string | undefined,
  category: string
): Promise<{ ids: string[]; since: string; sinceByKhuVuc: Record<string, string> } | null> {
  let bucketsList: BacklogBuckets[] = [];
  let since: string | null = null;
  const sinceByKhuVuc: Record<string, string> = {};

  if (khuVucFilter === QLDVBH_FILTER_VALUE) {
    // Nhóm các khu vực QLDVBH
    const { results } = await db.prepare("SELECT DISTINCT khu_vuc FROM case_dvbh WHERE khu_vuc LIKE '%qldvbh%'").all<{ khu_vuc: string }>();
    let list = results.map((r) => r.khu_vuc);
    const roleVariant = roleVariantOf(user.vai_tro);
    if (roleVariant === "giam_sat") {
      const scope = user.khu_vuc_phu_trach;
      list = list.filter((kv) => scope.includes(kv));
    }
    for (const kv of list) {
      const { buckets, generatedAt } = await getBacklogBucketsForKhuVuc(db, kv);
      bucketsList.push(buckets);
      sinceByKhuVuc[kv] = generatedAt;
      if (since === null) since = generatedAt;
    }
  } else if (khuVucFilter && khuVucFilter !== QLDVBH_FILTER_VALUE && !khuVucFilter.includes(",")) {
    // Một khu vực đơn lẻ
    const { buckets, generatedAt } = await getBacklogBucketsForKhuVuc(db, khuVucFilter);
    bucketsList.push(buckets);
    since = generatedAt;
  } else {
    // Snapshot mặc định theo phạm vi phân quyền của user - 1 dong snapshot DUY NHAT (du co the gom
    // nhieu khu_vuc thuc te trong "khuVucList" cua no), nen KHONG can granularity theo tung
    // khu_vuc - moi ID deu dung chung dung 1 "since" nay.
    const snap = await getSnapshotForUser(db, user);
    if (!snap) return null;
    bucketsList.push(snap.payload);
    since = snap.generatedAt;
  }

  // Gom và lọc trùng tất cả case_id từ các buckets
  const allIds = new Set<string>();
  for (const b of bucketsList) {
    const buckets: Record<string, SnapshotBucket> = {
      tong: b.tonCanGiaiTrinh,
      lo_ke_hoach: b.backlogLoKeHoach,
      tai_giai_trinh: b.backlogTaiGiaiTrinh,
      dmx_chua_gt_3_ngay: b.backlogChuaGt3NgayDmx,
      chua_gt_5_ngay: b.backlogChuaGt5Ngay,
      dieu_hoa: b.backlogDieuHoa1Ngay,
      lo_ke_hoach_dmx_5: b.backlogLoKeHoachDmx5,
      lo_ke_hoach_14: b.backlogLoKeHoach14,
      tai_giai_trinh_dmx_5: b.backlogTaiGiaiTrinhDmx5,
      tai_giai_trinh_14: b.backlogTaiGiaiTrinh14,
      b2b: b.backlogB2b,
      nskx: b.backlogNskx,
      loc_tong_bcn: b.backlogLocTongBcn,
    };
    const bucket = buckets[category];
    if (bucket && bucket.ids) {
      for (const id of bucket.ids) {
        allIds.add(id);
      }
    }
  }

  return { ids: Array.from(allIds), since: since as string, sinceByKhuVuc };
}

/** scope_key on dinh cho snapshot Quan ly ton loc theo DUNG 1 khu_vuc bat ky (khong gan voi
 * vai_tro/khu_vuc_phu_trach nhu buildSnapshotScopeKey - day la khi nguoi dung TU CHON 1 khu_vuc o bo
 * loc, xem BacklogModule.tsx isSingleKhuVucOnly). Namespace rieng "khu-vuc-loc|" de khong dung do voi
 * "giam_sat|"/"khac|all"/"qc|all" da co. */
function buildKhuVucFilterScopeKey(khuVuc: string): string {
  return `khu-vuc-loc|${khuVuc}`;
}

/** Orchestrator MOI (2026-08-01) - tinh + luu bucket Quan ly ton RIENG cho TUNG khu_vuc CO THAT
 * trong du lieu (khac cac scope theo vai_tro o generateDailySnapshot), de nguoi dung loc dung 1
 * khu_vuc cu the o Quan ly ton van thay dong bang/delta thay vi roi ve so song. Goi CUNG luc voi
 * generateDailySnapshot() (cron 08:00 + "Lam moi bao cao" trong Import data). CHI tinh bucket backlog
 * (khong tinh lai kpis/pivot/revenue rieng cho tung khu_vuc - qua ton kem, khong ai doc toi). */
export async function generateKhuVucBacklogSnapshots(db: D1Database, generatedBy: string): Promise<void> {
  const ngay = getVnDateStr();
  const generatedAt = nowVN();

  const { results } = await db.prepare("SELECT DISTINCT khu_vuc FROM case_dvbh WHERE khu_vuc IS NOT NULL").all<{ khu_vuc: string }>();
  for (const { khu_vuc } of results) {
    try {
      const buckets = await computeBacklogBuckets(db, [khu_vuc]);
      await upsertSnapshot(db, ngay, buildKhuVucFilterScopeKey(khu_vuc), generatedAt, generatedBy, buckets);
    } catch (err) {
      console.error(`generateKhuVucBacklogSnapshots: loi khi tinh/luu khu vuc ${khu_vuc}`, err);
    }
  }
}

/** Ham GOI TU cases.ts (route GET /api/cases/backlog-daily?khu_vuc=...) - doc/tu-heal snapshot Quan
 * ly ton cho DUNG 1 khu_vuc (nguoi dung loc dung 1 khu_vuc, khong loc gi khac them - xem
 * isSingleKhuVucOnly o frontend). KHONG kiem tra quyen xem o day (ham nay khong biet gi ve user) -
 * route PHAI tu kiem tra qua scopeByKhuVuc TRUOC khi goi ham nay. */
export async function getBacklogDailyForKhuVuc(db: D1Database, khuVuc: string): Promise<BacklogDailyPayload> {
  const ngay = getVnDateStr();
  const scopeKey = buildKhuVucFilterScopeKey(khuVuc);

  let row = await db
    .prepare("SELECT generated_at, generated_by, payload FROM daily_snapshot WHERE ngay = ? AND scope_key = ?")
    .bind(ngay, scopeKey)
    .first<{ generated_at: string; generated_by: string; payload: string }>();

  // "backlogLocTongBcn" - field MOI NHAT cua BacklogBuckets, xem chu thich day du o getSnapshotForUser().
  if (row && !(JSON.parse(row.payload) as Partial<BacklogBuckets>).backlogLocTongBcn) {
    row = null;
  }

  let buckets: BacklogBuckets;
  let generatedAt: string;
  let generatedBy: string;
  if (row) {
    buckets = JSON.parse(row.payload);
    generatedAt = row.generated_at;
    generatedBy = row.generated_by;
  } else {
    generatedAt = nowVN();
    generatedBy = "auto";
    buckets = await computeBacklogBuckets(db, [khuVuc]);
    await upsertSnapshot(db, ngay, scopeKey, generatedAt, generatedBy, buckets);
  }

  return computeBacklogDeltaPayload(db, buckets, generatedAt, generatedBy, khuVuc);
}

function sumDailyReportBucket(list: DailyReportBucketResult[]): DailyReportBucketResult {
  return list.reduce(
    (acc, b) => ({ baseline: acc.baseline + b.baseline, resolved: acc.resolved + b.resolved, remaining: acc.remaining + b.remaining }),
    { baseline: 0, resolved: 0, remaining: 0 },
  );
}

/** Cong don nhieu BacklogDailyPayload (moi cai ung voi DUNG 1 khu_vuc rieng le, tu
 * getBacklogDailyForKhuVuc) thanh 1 payload GOP - dung khi nguoi dung loc theo gia tri ao
 * QLDVBH_FILTER_VALUE ("Tat ca DVBH") thay vi 1 khu_vuc don le (CHOT 2026-08-01, chu he thong phat
 * hien "Tat ca DVBH" truoc do bi roi ve so song vi khong khop dieu kien isSingleKhuVucOnly). Tai su
 * dung snapshot da co san cho TUNG khu_vuc thanh vien (khong tinh song) - "Dau ngay/Da xu ly" cua ca
 * nhom = TONG cua tung khu_vuc thanh vien (khong phai tinh lai tu dau). generatedAt/By lay tu payload
 * DAU TIEN trong danh sach (thuong giong het nhau giua cac khu_vuc vi generateKhuVucBacklogSnapshots()
 * tinh CA LOAT khu_vuc trong CUNG 1 lan chay, dung chung 1 nowVN()). */
function mergeBacklogDailyPayloads(payloads: BacklogDailyPayload[]): BacklogDailyPayload | null {
  if (payloads.length === 0) return null;
  const byKhuVuc: Record<string, DailyReportBucketResult> = {};
  const khuVucRows: Record<string, KhuVucReportRow> = {};
  const byKhuVucMonthly: Record<string, { canGiaiTrinhLuyKe: number; daGiaiTrinhThang: number }> = {};
  for (const p of payloads) {
    Object.assign(byKhuVuc, p.byKhuVuc);
    Object.assign(khuVucRows, p.khuVucRows);
    Object.assign(byKhuVucMonthly, p.byKhuVucMonthly);
  }
  return {
    generatedAt: payloads[0].generatedAt,
    generatedBy: payloads[0].generatedBy,
    tongTon: sumDailyReportBucket(payloads.map((p) => p.tongTon)),
    tren3: payloads.reduce((acc, p) => acc + p.tren3, 0),
    tren5: payloads.reduce((acc, p) => acc + p.tren5, 0),
    tren7: payloads.reduce((acc, p) => acc + p.tren7, 0),
    tren14: payloads.reduce((acc, p) => acc + p.tren14, 0),
    canGiaiTrinh: {
      tong: sumDailyReportBucket(payloads.map((p) => p.canGiaiTrinh.tong)),
      loKeHoach: sumDailyReportBucket(payloads.map((p) => p.canGiaiTrinh.loKeHoach)),
      taiGiaiTrinh: sumDailyReportBucket(payloads.map((p) => p.canGiaiTrinh.taiGiaiTrinh)),
      chuaGt3NgayDmx: sumDailyReportBucket(payloads.map((p) => p.canGiaiTrinh.chuaGt3NgayDmx)),
      chuaGt5Ngay: sumDailyReportBucket(payloads.map((p) => p.canGiaiTrinh.chuaGt5Ngay)),
      dieuHoa: sumDailyReportBucket(payloads.map((p) => p.canGiaiTrinh.dieuHoa)),
      loKeHoachDmx5: sumDailyReportBucket(payloads.map((p) => p.canGiaiTrinh.loKeHoachDmx5)),
      loKeHoach14: sumDailyReportBucket(payloads.map((p) => p.canGiaiTrinh.loKeHoach14)),
      taiGiaiTrinhDmx5: sumDailyReportBucket(payloads.map((p) => p.canGiaiTrinh.taiGiaiTrinhDmx5)),
      taiGiaiTrinh14: sumDailyReportBucket(payloads.map((p) => p.canGiaiTrinh.taiGiaiTrinh14)),
      b2b: sumDailyReportBucket(payloads.map((p) => p.canGiaiTrinh.b2b)),
      nskx: sumDailyReportBucket(payloads.map((p) => p.canGiaiTrinh.nskx)),
      locTongBcn: sumDailyReportBucket(payloads.map((p) => p.canGiaiTrinh.locTongBcn)),
    },
    byKhuVuc,
    khuVucRows,
    byKhuVucMonthly,
  };
}

/** Ham GOI TU cases.ts (route GET /api/cases/backlog-daily?khu_vuc=__QLDVBH__) - doc/tu-heal snapshot
 * rieng cho TUNG khu_vuc trong "khuVucList" (qua getBacklogDailyForKhuVuc, tai su dung nguyen ven) roi
 * cong don thanh 1 payload GOP. KHONG kiem tra quyen xem o day - route PHAI tu loc "khuVucList" theo
 * scopeByKhuVuc TRUOC khi goi ham nay (giong dung nguyen tac cua getBacklogDailyForKhuVuc). Tra null
 * neu danh sach rong (vd Giam sat khong phu trach khu_vuc nao thuoc nhom dang loc). */
export async function getBacklogDailyForKhuVucGroup(db: D1Database, khuVucList: string[]): Promise<BacklogDailyPayload | null> {
  if (khuVucList.length === 0) return null;
  const payloads = await Promise.all(khuVucList.map((kv) => getBacklogDailyForKhuVuc(db, kv)));
  return mergeBacklogDailyPayloads(payloads);
}

/** Doc snapshot "khac|all" (08:00 VN) CUA NGAY HOM NAY + tinh so ca da giai trinh tu do den luc goi -
 * dung chung giua chotGiaiTrinhDailyLog (cron 17h30) va route xem truoc anh Telegram cho Admin (xem
 * routes/settings.ts). Tra null neu snapshot 08:00 chua chay (KHONG tu-heal - xem chu thich
 * chotGiaiTrinhDailyLog ve ly do). */
export async function computeTonDailyEntries(
  db: D1Database,
): Promise<{ ngay: string; entries: [string, SnapshotBucket][]; resolvedList: number[] } | null> {
  const ngay = getVnDateStr();
  const scopeKey = buildSnapshotScopeKey("khac", []);

  const row = await db
    .prepare("SELECT generated_at, payload FROM daily_snapshot WHERE ngay = ? AND scope_key = ?")
    .bind(ngay, scopeKey)
    .first<{ generated_at: string; payload: string }>();
  if (!row) return null;

  const payload: DailySnapshotPayload = JSON.parse(row.payload);
  const since = row.generated_at;
  const entries = Object.entries(payload.tonCanGiaiTrinhByKhuVuc) as [string, SnapshotBucket][];

  // Log lich su nay do ty le GIAI TRINH, nen chi tinh log giai_trinh moi; viec dong ca khong
  // thay the mot luot giai trinh trong chi tieu nay (khac voi StatCard Quan ly ton o tren).
  const resolvedList = await Promise.all(entries.map(([, bucket]) => countResolved(db, "giai_trinh", "ngay_giai_trinh > ?", bucket.ids, [since])));

  return { ngay, entries, resolvedList };
}

/** Chay o cron 17h30 VN (index.ts DAILY_LOG_1730_CRON) - "chot" ty le giai trinh trong ngay theo
 * khu vuc vao bang giai_trinh_daily_log (migration 0040), LICH SU VINH VIEN (khong ghi de, khong co
 * duong sua tay - xem chu thich bang), roi gui anh PNG tom tat 7 nhom QLDVBH/KDDV qua Telegram (CHOT
 * 2026-08-06 - truoc gui text liet ke toan bo khu_vuc, bi phan nan "qua xau, qua nhieu thong tin";
 * xem lib/reportImage.ts va lib/telegram.ts). Neu chua co snapshot 08:00 (vd cron loi/chua chay) thi
 * bo qua, KHONG tu-heal (tu-heal se tinh baseline SAI moc gio, lam sai lech y nghia "baseline 08:00"
 * cua log). */
export async function chotGiaiTrinhDailyLog(db: D1Database): Promise<void> {
  const computed = await computeTonDailyEntries(db);
  if (!computed) {
    console.error("chotGiaiTrinhDailyLog: chua co snapshot 08:00 hom nay (scope khac|all) - bo qua chot 17h30");
    return;
  }
  const { ngay, entries, resolvedList } = computed;

  for (let i = 0; i < entries.length; i++) {
    const [khuVuc, bucket] = entries[i];
    try {
      await db
        .prepare(
          `INSERT INTO giai_trinh_daily_log (ngay, khu_vuc, can_giai_trinh, da_giai_trinh) VALUES (?, ?, ?, ?)
           ON CONFLICT(ngay, khu_vuc) DO NOTHING`,
        )
        .bind(ngay, khuVuc, bucket.count, resolvedList[i])
        .run();
    } catch (err) {
      console.error(`chotGiaiTrinhDailyLog: loi khi ghi khu vuc ${khuVuc}`, err);
    }
  }

  // GUI ANH TOM TAT QUA TELEGRAM SAU KHI CHOT XONG (CHOT 2026-08-06 - xem lib/reportImage.ts)
  try {
    const { mb, mn, kddv } = buildBaocaoTonRows(entries, resolvedList);
    const dateParts = ngay.split("-");
    const ngayFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

    const png = await renderBaocaoTonImage(mb, mn, kddv, ngayFormatted);
    await sendTelegramPhoto(TELEGRAM_BOT_ID, TELEGRAM_CHAT_ID, png);
  } catch (err) {
    console.error("[Telegram] Loi tien trinh gui anh bao cao:", err instanceof Error ? err.message : String(err));
  }
}
