import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { NEED_SURVEY_CONDITION, RECENT_OR_OPEN_CONDITION } from "./survey";
import { CA_LAP_CTE, NGUONG_NGAY_LAP } from "./caLap";
import { CASE_FILTER_TON } from "../lib/needGiaiTrinh";
import { cachedReport, buildReportKey } from "../lib/reportCache";
import { computeTranhChapCount } from "./tranhChap";

const notifications = new Hono<{ Bindings: Env }>();
notifications.use("*", verifySessionMiddleware, loadUser);

export interface NotificationsCountPayload {
  canGiaiTrinh: number;
  choQc: number;
  caThieuLinhKien: number;
  khaoSat: number;
  caLap: number;
  danhGiaNapGas: number;
  tranhChap: number;
}

/** Tach tu notifications.get("/count") - xem chu thich route ben duoi. "khaoSat"/"caLap" ca nhan
 * hoa theo vai_tro (params.vai_tro) nen KET QUA THAT SU PHU THUOC vai_tro, khong chi phu thuoc
 * scope khu_vuc - route ben duoi dua vai_tro vao cache key vi ly do nay (xem chu thich route).
 * "la_ksnb_doi_tac" (them 2026-07-29): rieng badge "tranhChap" dung pham vi KHONG gioi han khu_vuc
 * cho nguoi co co nay (giong scopeTranhChap() trong tranhChap.ts) - khac voi "scope" chung (theo
 * vai_tro qua ROLES_XEM_TOAN_BO) dung cho moi count con lai. */
export async function computeNotificationsCount(
  db: D1Database,
  params: { vai_tro?: string; la_ksnb_doi_tac?: string },
  scope: string[] | null,
): Promise<NotificationsCountPayload> {
  const scopeClause = khuVucWhereClause(scope, "khu_vuc");
  const scopeClauseC = khuVucWhereClause(scope, "c.khu_vuc");
  const scopeClauseLap = khuVucWhereClause(scope, "lap.khu_vuc");
  const tranhChapScope = params.la_ksnb_doi_tac === "1" ? null : scope;

  const [canGiaiTrinh, choQc, caThieuLinhKien, canKhaoSat, caLapCounts, danhGiaNapGas, tranhChap] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) as n FROM case_dvbh
         WHERE thoi_gian_hoan_thanh IS NULL AND archived_at IS NULL AND huy_bo_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM giai_trinh g WHERE g.case_id = case_dvbh.id)${scopeClause.sql}`,
      )
      .bind(...scopeClause.binds)
      .first<{ n: number }>(),
    // Phai JOIN case_dvbh + loc theo khu_vuc giong het tab "cho-qc" cua survey.ts, neu khong so
    // dem o chuong thong bao se lon hon danh sach that nguoi dung bi gioi han khu vuc xem duoc.
    db
      .prepare(
        `SELECT COUNT(*) as n FROM vi_pham v
         INNER JOIN case_dvbh c ON c.id = v.case_id
         WHERE v.ket_qua_cap_1 IS NOT NULL AND v.ket_qua_cap_1 != 'Khong loi' AND v.chot_bo_cap_2 IS NULL${scopeClauseC.sql}`,
      )
      .bind(...scopeClauseC.binds)
      .first<{ n: number }>(),
    // Dung dung dieu kien baseJoin() + trang_thai=dang-ton mac dinh cua missingParts.ts. Subquery
    // gioi han vao dung tap case DANG TON (CASE_FILTER_TON, khop het WHERE ben duoi) thay vi quet
    // toan bo bang giai_trinh - xem giai thich an toan o latestGiaiTrinhJoin() trong needGiaiTrinh.ts.
    db
      .prepare(
        `SELECT COUNT(*) as n FROM case_dvbh c
         INNER JOIN (
           SELECT case_id, ly_do_cham FROM (
             SELECT gt.case_id, gt.ly_do_cham, ROW_NUMBER() OVER (PARTITION BY gt.case_id ORDER BY gt.ngay_giai_trinh DESC, gt.id DESC) AS rn
             FROM giai_trinh gt
             WHERE gt.case_id IN (SELECT id FROM case_dvbh WHERE ${CASE_FILTER_TON})
           ) WHERE rn = 1
         ) lg ON lg.case_id = c.id
         INNER JOIN settings_ly_do sld ON sld.ten_ly_do = lg.ly_do_cham AND sld.thuoc_thieu_linh_kien = 1
         WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND c.huy_bo_at IS NULL${scopeClauseC.sql}`,
      )
      .bind(...scopeClauseC.binds)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as n FROM case_dvbh c
         WHERE c.archived_at IS NULL AND c.huy_bo_at IS NULL AND ${RECENT_OR_OPEN_CONDITION} AND ${NEED_SURVEY_CONDITION}${scopeClauseC.sql}`,
      )
      .bind(...scopeClauseC.binds)
      .first<{ n: number }>(),
    // Gop 2 truy van "can danh gia"/"cho QC" cua Ca lap thanh 1 - CA_LAP_CTE dung window function
    // LAG() quet TOAN BO lich su case_dvbh (khong dung duoc index de rut gon), rat ton kem neu chay
    // 2 lan cho cung 1 request (phat hien qua Cloudflare D1 usage: rows read vuot xa binh thuong -
    // endpoint nay bi poll moi 60s tu Sidebar/TopBar nen nhan chi phi len rat nhieu lan/ngay).
    // Chi dem ca lap co thoi_gian_hoan_thanh trong THANG HIEN TAI - khop pham vi mac dinh cua trang
    // tong quan Ca lap (monthBounds() khong tham so trong caLap.ts, cung tinh theo UTC qua
    // getUTCFullYear/getUTCMonth), tranh tinh trang badge sidebar va trang tong quan hien 2 con so
    // khac nhau (vd 888 vs 862) gay hieu nham cho nguoi dung. Dung date('now', ...) dang RANGE
    // (khong dung strftime) de tan dung index, va 'now' cua SQLite la UTC nen khop voi cach tinh
    // tren. Day la hang SQL, khong phai bind param, nen KHONG doi thu tu bind hien tai (query nay
    // chi bind scopeClauseLap.binds).
    // Cache: endpoint nay duoc bao boc boi cachedReport voi tag la "ngay VN" (xem route ben duoi),
    // tu het han moi ngay - nen khi sang thang moi, cache cung tu lam moi va badge tu cap nhat theo
    // thang moi ma khong can xu ly gi them.
    db
      .prepare(
        `${CA_LAP_CTE}
         SELECT
           SUM(CASE WHEN gl.chot_danh_gia_lap IS NULL THEN 1 ELSE 0 END) as can_danh_gia,
           SUM(CASE WHEN gl.chot_danh_gia_lap IS NOT NULL AND gl.qc_chot IS NULL THEN 1 ELSE 0 END) as cho_qc
         FROM lap LEFT JOIN giai_trinh_lap gl ON gl.case_id = lap.id
         WHERE lap.gap_days <= ${NGUONG_NGAY_LAP}
           AND lap.thoi_gian_hoan_thanh >= date('now','start of month')
           AND lap.thoi_gian_hoan_thanh < date('now','start of month','+1 month')${scopeClauseLap.sql}`,
      )
      .bind(...scopeClauseLap.binds)
      .first<{ can_danh_gia: number; cho_qc: number }>(),
    // "Danh gia nap gas" - doc tu bang rieng nap_gas_danh_gia (xem migration 0025), KHONG con dua
    // vao bang giai_trinh chung nhu truoc (bang do thiet ke cho "giai trinh ca ton", khac muc dich).
    // Nguon "nghi ngo nap gas" van doc thang tu case_dvbh.nghi_ngo_nap_gas (xem NAP_GAS_ELIGIBLE o
    // routes/napGas.ts - CHI ca "Hoan thanh XLSC", khop dung dieu kien module dung). Chi dem so ca
    // CHUA co dong nap_gas_danh_gia nao - khop dinh nghia "chua danh gia" cua the "Danh gia nap gas
    // (xxx)". KHONG loc theo thang: badge la tong CHUA danh gia tren TOAN BO danh sach co dinh
    // (khong phu thuoc thang dang xem trong module, xem yeu cau goc "danh sach co dinh...cho den
    // khi co import moi"). scopeClauseC (theo c.khu_vuc) da tu dam bao badge chi tinh theo khu vuc
    // nguoi dung dang xem duoc.
    db
      .prepare(
        `SELECT COUNT(*) as n FROM case_dvbh c
         WHERE c.nghi_ngo_nap_gas = 1 AND c.tien_do_hoan_thanh = 'Hoàn thành XLSC'
           AND NOT EXISTS (SELECT 1 FROM nap_gas_danh_gia ndg WHERE ndg.case_id = c.id)${scopeClauseC.sql}`,
      )
      .bind(...scopeClauseC.binds)
      .first<{ n: number }>(),
    computeTranhChapCount(db, tranhChapScope),
  ]);

  const role = params.vai_tro;
  const khaoSat =
    role === "QC" ? (choQc?.n ?? 0) : role === "CSKH" || role === "TN CSKH" ? (canKhaoSat?.n ?? 0) : (canKhaoSat?.n ?? 0) + (choQc?.n ?? 0);
  const caLapCanDanhGia = caLapCounts?.can_danh_gia ?? 0;
  const caLapChoQc = caLapCounts?.cho_qc ?? 0;
  const caLap = role === "Giam sat" ? caLapCanDanhGia : role === "QC" ? caLapChoQc : caLapCanDanhGia + caLapChoQc;

  return {
    canGiaiTrinh: canGiaiTrinh?.n ?? 0,
    choQc: choQc?.n ?? 0,
    caThieuLinhKien: caThieuLinhKien?.n ?? 0,
    khaoSat,
    caLap,
    danhGiaNapGas: danhGiaNapGas?.n ?? 0,
    tranhChap,
  };
}

// GET /api/notifications/count - so ca can xu ly theo tung module, dung cho ca chuong thong bao
// (TopBar) lan badge so luong tren sidebar (Sidebar.tsx). "khaoSat"/"caLap" ca nhan hoa theo vai
// tro dang nhap (CSKH/TN CSKH thay "can khao sat", QC thay "cho QC", vai tro khac thay tong ca hai -
// giong cach da lam voi mac dinh tab trang_thai cua module Ca lap).
// Boc qua cachedReport (xem lib/reportCache.ts) - domain: cases, giai_trinh, vi_pham, giai_trinh_lap,
// blacklist, nap_gas_danh_gia (bang R5 trong YEU_CAU_BAO_CAO_TINH_SAN.md + migration 0025), tranh_chap
// (them 2026-07-29). Key BAT BUOC co them vai_tro (ngoai scope khu_vuc): khaoSat/caLap tra ve GIA TRI
// KHAC NHAU theo vai_tro voi CUNG 1 scope (vd 2 nguoi cung khu vuc nhung 1 nguoi la QC, 1 nguoi la
// CSKH) - thieu vai_tro trong key se lam 1 vai tro doc nham cache cua vai tro kia. "la_ksnb_doi_tac"
// cung phai co trong key vi lam thay doi pham vi (khong gioi han khu_vuc) rieng cho "tranhChap".
notifications.get("/count", async (c) => {
  const user = c.get("user");
  const scope = scopeByKhuVuc(c);
  const params = { vai_tro: user.vai_tro ?? "", la_ksnb_doi_tac: user.la_ksnb_doi_tac ? "1" : "" };
  const key = buildReportKey("notifications/count", params, scope);
  const data = await cachedReport(
    c.env.DB,
    key,
    ["cases", "giai_trinh", "vi_pham", "giai_trinh_lap", "blacklist", "nap_gas_danh_gia", "tranh_chap"],
    () => computeNotificationsCount(c.env.DB, params, scope),
  );
  return c.json(data);
});

export default notifications;
