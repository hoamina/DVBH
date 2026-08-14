import { Hono } from "hono";
import type { Env, AppUser } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { CA_LAP_CTE, NGUONG_NGAY_LAP } from "./caLap";
import { khuVucReportExclusionClause } from "../lib/filterParams";
import { cachedReport, buildReportKey } from "../lib/reportCache";
import { computeTranhChapCount } from "./tranhChap";
import { getDailyReportWithDelta } from "../lib/dailySnapshot";
import { NEED_SURVEY_CONDITION } from "./survey";

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

/** Tach tu notifications.get("/count") - xem chu thich route ben duoi.
 *
 * CHOT 2026-08-01 (chu he thong phat hien chuong thong bao bi lech logic voi Quan ly ton/Tong
 * quat): truoc day "canGiaiTrinh"/"caThieuLinhKien"/phan "canKhaoSat" cua "khaoSat"/phan
 * "can_danh_gia" cua "caLap" deu tu tinh RIENG 1 cong thuc SONG (vd "canGiaiTrinh" dung "chua tung
 * giai trinh", khac han NEED_TONG 5 nhanh dung o moi noi khac) - vua sai logic, vua khong "dong
 * bang" theo Bao cao 08:00 nhu phan con lai cua he thong (badge sidebar tung hien so KHAC voi so
 * "Tong can giai trinh" hien ngay trong trang Quan ly ton, gay hieu nham). Gio doc THANG tu
 * getDailyReportWithDelta() (dung CHUNG ham voi GET /dashboard/daily-report - chinh la nguon du
 * lieu chuong thong bao "an theo") lay .remaining cua 4 bucket tonCanGiaiTrinh/thieuLinhKien/
 * caLap/canKhaoSat - dam bao MOI noi hien dung 1 con so nhat quan. "choQc" (cho QC chot cap 2) va
 * "danhGiaNapGas"/"tranhChap" KHONG co bucket dong bang tuong ung nen giu nguyen tinh song. */
export async function computeNotificationsCount(db: D1Database, user: AppUser, scope: string[] | null): Promise<NotificationsCountPayload> {
  const scopeClauseCBase = khuVucWhereClause(scope, "c.khu_vuc");
  const scopeClauseLapBase = khuVucWhereClause(scope, "lap.khu_vuc");
  const exclusionC = khuVucReportExclusionClause("c.khu_vuc");
  const exclusionLap = khuVucReportExclusionClause("lap.khu_vuc");
  const scopeClauseC = { sql: scopeClauseCBase.sql + exclusionC.sql, binds: [...scopeClauseCBase.binds, ...exclusionC.binds] };
  const scopeClauseLap = { sql: scopeClauseLapBase.sql + exclusionLap.sql, binds: [...scopeClauseLapBase.binds, ...exclusionLap.binds] };
  const tranhChapScope = user.la_ksnb_doi_tac ? null : scope;

  const [dailyReport, choQc, danhGiaNapGas, tranhChap] = await Promise.all([
    getDailyReportWithDelta(db, user),
    // Phai JOIN case_dvbh + loc theo khu_vuc giong het tab "cho-qc" cua survey.ts, neu khong so
    // dem o chuong thong bao se lon hon danh sach that nguoi dung bi gioi han khu vuc xem duoc.
    // Khong co bucket dong bang tuong ung (chua nam trong Bao cao 08:00) nen giu tinh song.
    db
      .prepare(
        `SELECT COUNT(*) as n FROM vi_pham v
         INNER JOIN case_dvbh c ON c.id = v.case_id
         WHERE v.ket_qua_cap_1 IS NOT NULL AND v.ket_qua_cap_1 != 'Khong loi' AND v.chot_bo_cap_2 IS NULL${scopeClauseC.sql}`,
      )
      .bind(...scopeClauseC.binds)
      .first<{ n: number }>(),
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
    computeTranhChapCount(db, tranhChapScope, user.la_ksnb_doi_tac),
  ]);

  // CHOT 2026-08-07: "khaoSat" badge chi can dem tong ca vi pham con can khao sat trong thang hien tai
  // (theo phan quyen moi vai tro, co nghia la ap dung scopeClauseC nhu cu).
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const thangStr = now.toISOString().slice(0, 7); // e.g. "2026-08"
  const y = parseInt(thangStr.slice(0, 4), 10);
  const m = parseInt(thangStr.slice(5, 7), 10);
  const startMonth = `${thangStr}-01`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const endMonth = `${nextY}-${String(nextM).padStart(2, "0")}-01`;

  const surveyCountRow = await db
    .prepare(
      `SELECT COUNT(*) as n FROM case_dvbh c
       WHERE c.archived_at IS NULL AND c.huy_bo_at IS NULL
         AND ${NEED_SURVEY_CONDITION}
         AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?
         ${scopeClauseC.sql}`,
    )
    .bind(startMonth, endMonth, ...scopeClauseC.binds)
    .first<{ n: number }>();

  const khaoSat = surveyCountRow?.n ?? 0;

  return {
    canGiaiTrinh: dailyReport.tonCanGiaiTrinh.remaining,
    choQc: choQc?.n ?? 0,
    caThieuLinhKien: dailyReport.thieuLinhKien.remaining,
    khaoSat,
    // dailyReport.caLap da tu tinh theo dung "vai_tro" (roleVariantOf trong dailySnapshot.ts: Giam
    // sat = "can_danh_gia", QC = "cho_qc", con lai = ca hai) - khop dung ban chat "can_danh_gia"/
    // "cho_qc" ca nhan hoa cua ban song truoc day, khong can tu cong lai o day nua.
    caLap: dailyReport.caLap.remaining,
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
    () => computeNotificationsCount(c.env.DB, user, scope),
  );
  return c.json(data);
});

export default notifications;
