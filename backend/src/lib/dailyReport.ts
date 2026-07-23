import type { AppUser } from "../types";
import { ROLES_XEM_TOAN_BO } from "../types";
import { NEED_SURVEY_CONDITION, RECENT_OR_OPEN_CONDITION } from "../routes/survey";
import { CA_LAP_CTE, NGUONG_NGAY_LAP } from "../routes/caLap";
import { latestGiaiTrinhJoin, CASE_FILTER_TON, NEED_TONG } from "./needGiaiTrinh";
import { kpiEligibleClause } from "./kpiEligible";

// Giong het baseJoin() cua missingParts.ts: case ma giai_trinh moi nhat co ly_do thuoc nhom
// "thieu linh kien". Dung ROW_NUMBER() (khong phai MAX() + JOIN nguoc) de tranh nhan dong khi
// >=2 ban ghi giai_trinh trung gio - xem giai thich chi tiet o needGiaiTrinh.ts. caseFilterSql
// gioi han subquery vao dung tap case dang xet (xem giai thich an toan/superset o
// latestGiaiTrinhJoin() trong needGiaiTrinh.ts).
function missingPartsJoin(caseFilterSql: string): string {
  return `
  INNER JOIN (
    SELECT case_id, ly_do_cham FROM (
      SELECT gt.case_id, gt.ly_do_cham,
             ROW_NUMBER() OVER (PARTITION BY gt.case_id ORDER BY gt.ngay_giai_trinh DESC, gt.id DESC) AS rn
      FROM giai_trinh gt
      WHERE gt.case_id IN (SELECT id FROM case_dvbh WHERE ${caseFilterSql})
    ) WHERE rn = 1
  ) lg ON lg.case_id = c.id
  INNER JOIN settings_ly_do sld ON sld.ten_ly_do = lg.ly_do_cham AND sld.thuoc_thieu_linh_kien = 1
`;
}

const REVENUE_EXPR_C = "COALESCE(c.dt_san_pham,0) + COALESCE(c.dt_linh_kien,0) + COALESCE(c.dt_dich_vu,0)";

// KHONG them gio "00:00:00" vao bound - xem giai thich chi tiet o monthBounds() trong cases.ts
// (mot so ca co thoi_gian_hoan_thanh chi la ngay thuan, so sanh chuoi voi bound co gio se sai va
// lam doanh thu thang bi thieu dung nhung ca dong vao ngay dau thang).
/** Thang hien tai theo lich VN -> [start, end) de tan dung index thay vi strftime(...) = ?. */
function currentMonthBoundsVN(): { start: string; end: string } {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000); // dich sang gio VN de lay dung nam/thang lich VN
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth() + 1;
  const start = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-01`;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const nextY = mo === 12 ? y + 1 : y;
  const end = `${String(nextY).padStart(4, "0")}-${String(nextMo).padStart(2, "0")}-01`;
  return { start, end };
}

export interface DailyReportPayload {
  scope: "khu_vuc" | "toan_he_thong";
  khuVucList: string[];
  tonTren3Ngay: number;
  thieuLinhKien: number;
  nghiNgoViPham: number;
  caLap: number;
  doanhThuThang: number | null;
}

/**
 * Bao cao nhanh dau ngay: dung chung cho ca thong bao 1 lan/ngay lan the "Bao cao nhanh van de
 * trong ngay" o Tong quat. Vai tro "Giam sat" -> loc dung khu vuc phu trach; vai tro khac -> so
 * tong toan he thong (khong loc khu vuc), dung theo yeu cau nghiep vu.
 */
export async function computeDailyReport(db: D1Database, user: AppUser): Promise<DailyReportPayload> {
  const isGiamSat = user.vai_tro === "Giam sat";
  const khuVucList = isGiamSat ? user.khu_vuc_phu_trach : [];
  // Doanh thu la du lieu tai chinh chi danh cho vai tro co module "Bao cao doanh thu" (khop
  // ROLES_XEM_TOAN_BO) - cac vai tro khac (CSKH, TN CSKH, QC, Giam sat...) khong duoc thay so
  // nay trong banner/toast bao cao nhanh, dung nhu ho khong thay duoc o module Doanh thu.
  const canViewRevenue = !!user.vai_tro && ROLES_XEM_TOAN_BO.includes(user.vai_tro);
  const role = user.vai_tro;

  if (isGiamSat && khuVucList.length === 0) {
    return { scope: "khu_vuc", khuVucList: [], tonTren3Ngay: 0, thieuLinhKien: 0, nghiNgoViPham: 0, caLap: 0, doanhThuThang: canViewRevenue ? 0 : null };
  }

  const khuVucClause = isGiamSat ? ` AND c.khu_vuc IN (${khuVucList.map(() => "?").join(", ")})` : "";
  const khuVucClauseLap = isGiamSat ? ` AND lap.khu_vuc IN (${khuVucList.map(() => "?").join(", ")})` : "";
  const khuVucBinds = isGiamSat ? khuVucList : [];
  const { start, end } = currentMonthBoundsVN();

  // Ca lap: chi chay DUNG 1 truy van khop vai tro dang xem (Giam sat -> can danh gia, QC -> cho
  // QC, con lai -> ca hai) thay vi luon chay ca 2 nhanh roi chon o JS nhu notifications.ts dang
  // lam - trong dailyReport nay khong can giu nguyen pattern cu vi day la code MOI viet, tranh
  // lang phi 1 luot quet CA_LAP_CTE (window function tren toan bo case_dvbh) khong dung toi.
  const caLapWhere =
    role === "Giam sat"
      ? "gl.chot_danh_gia_lap IS NULL"
      : role === "QC"
        ? "gl.chot_danh_gia_lap IS NOT NULL AND gl.qc_chot IS NULL"
        : "(gl.chot_danh_gia_lap IS NULL OR gl.qc_chot IS NULL)";

  const [tonRow, linhKienRow, nghiNgoRow, caLapRow, doanhThuRow] = await Promise.all([
    // "Ca can giai trinh" - dung dung NEED_TONG cua needGiaiTrinh.ts (nguon duy nhat, dung chung
    // voi cases.ts va BacklogModule) thay vi cong thuc rieng nhu truoc, de so lieu banner thong bao
    // nay LUON khop voi tile "Tong can giai trinh" nguoi dung thay khi mo module Quan ly ton.
    db
      .prepare(
        `SELECT COUNT(*) as n FROM case_dvbh c
         ${latestGiaiTrinhJoin(CASE_FILTER_TON)}
         WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND ${NEED_TONG}${khuVucClause}`,
      )
      .bind(...khuVucBinds)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as n FROM case_dvbh c
         ${missingPartsJoin(CASE_FILTER_TON)}
         WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL${khuVucClause}`,
      )
      .bind(...khuVucBinds)
      .first<{ n: number }>(),
    // "Nghi ngo vi pham" gio chi tinh so ca CAN KHAO SAT (dung lai dung dieu kien da dung cho
    // badge sidebar "Quan ly khao sat", xem notifications.ts) - truoc day dem TOAN BO ca tung bi
    // gan co nghi ngo (ke ca da khao sat xong roi), qua rong khong con phan anh dung viec CON PHAI
    // lam.
    db
      .prepare(
        `SELECT COUNT(*) as n FROM case_dvbh c
         WHERE c.archived_at IS NULL AND ${RECENT_OR_OPEN_CONDITION} AND ${NEED_SURVEY_CONDITION}${khuVucClause}`,
      )
      .bind(...khuVucBinds)
      .first<{ n: number }>(),
    // So ca lap can bao cao THEO PHU TRACH (khu vuc cua Giam sat, hoac toan he thong cho vai tro
    // khac) - ca nhan hoa dung vai tro dang xem, giong het logic badge sidebar cua notifications.ts.
    db
      .prepare(`${CA_LAP_CTE} SELECT COUNT(*) as n FROM lap LEFT JOIN giai_trinh_lap gl ON gl.case_id = lap.id WHERE lap.gap_days <= ${NGUONG_NGAY_LAP} AND ${caLapWhere}${khuVucClauseLap}`)
      .bind(...khuVucBinds)
      .first<{ n: number }>(),
    canViewRevenue
      ? db
          .prepare(
            `SELECT SUM(${REVENUE_EXPR_C}) as tong FROM case_dvbh c
             WHERE c.thoi_gian_hoan_thanh >= ? AND c.thoi_gian_hoan_thanh < ? AND ${kpiEligibleClause("c.")}${khuVucClause}`,
          )
          .bind(start, end, ...khuVucBinds)
          .first<{ tong: number | null }>()
      : Promise.resolve(null),
  ]);

  return {
    scope: isGiamSat ? "khu_vuc" : "toan_he_thong",
    khuVucList,
    tonTren3Ngay: tonRow?.n ?? 0,
    thieuLinhKien: linhKienRow?.n ?? 0,
    nghiNgoViPham: nghiNgoRow?.n ?? 0,
    caLap: caLapRow?.n ?? 0,
    doanhThuThang: canViewRevenue ? doanhThuRow?.tong ?? 0 : null,
  };
}
