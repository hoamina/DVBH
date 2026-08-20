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
import { phuTrachGsSet } from "../lib/scopeDatMua";

const notifications = new Hono<{ Bindings: Env }>();
notifications.use("*", verifySessionMiddleware, loadUser);

// Breakdown theo TUNG LOAI viec cho dat-mua-lk badge (them 2026-08-15, tieu chi UX #1: "moi vai tro
// vao module thay ngay viec can xu ly + so ton dong ro theo tung loai, khong phai so lieu chung
// chung"). Truoc day chi co 1 field "total" gop het cac bucket - Sidebar/module khong the tach rieng
// tung loai viec de hien thi/nhay filter dung dich. "total" van giu de Sidebar hien 1 con so gon.
export interface DatMuaLkBreakdown {
  total: number;
  choTnDuyet: number;
  choTnTraHang: number;
  choKhoThieuLk: number;
  choKhoPxk: number;
  choKhoTraHang: number;
  choKeToanPxk: number;
  choKeToanTraHang: number;
  choQcTraHang: number;
  choTramDuyet: number;
}

const EMPTY_DAT_MUA_LK_BREAKDOWN: DatMuaLkBreakdown = {
  total: 0,
  choTnDuyet: 0,
  choTnTraHang: 0,
  choKhoThieuLk: 0,
  choKhoPxk: 0,
  choKhoTraHang: 0,
  choKeToanPxk: 0,
  choKeToanTraHang: 0,
  choQcTraHang: 0,
  choTramDuyet: 0,
};

export interface NotificationsCountPayload {
  canGiaiTrinh: number;
  choQc: number;
  caThieuLinhKien: number;
  khaoSat: number;
  caLap: number;
  danhGiaNapGas: number;
  tranhChap: number;
  datMuaLk: DatMuaLkBreakdown;
}

// Badge rieng cho module "Dat mua linh kien" (them 2026-08-14, ra soat UX toan dien - module nay
// truoc do KHONG co bat ky tin hieu chu dong nao bao "co viec can xu ly", khac han phan con lai cua
// he thong). Ca nhan hoa THEO BUCKET thuoc quyen xu ly cua nguoi goi (Tram/TN/Kho/Ke toan/QC deu co
// hang doi rieng, khong dung chung 1 cong thuc) - CONG DON neu 1 tai khoan giu nhieu vai tro cung
// luc (vd Admin dung de test). Bucket Tram la DUY NHAT phu thuoc TUNG CA NHAN (chi tinh dong cua Ve
// tinh thuoc dung Tram nay quan ly) - moi bucket con lai (TN/Kho/Ke toan/QC) la hang doi CHUNG toan
// he thong, khong scope theo nguoi xem (khop dung thiet ke "TN thay toan bo" cua module).
// Xay dieu kien "email_gs cua dong don hang lien quan nam trong khu vuc phu trach" (muc F, migration
// 0073) - tra null neu nguoi dung chua duoc Admin gan khu vuc nao (giu nguyen hanh vi "hang doi
// CHUNG" nhu truoc). CHOT 2026-08-15: email_gs gio doc THANG tren dat_don_hang (migration 0075, bo
// khai niem phieu_dat) - alias truyen vao la alias cua CHINH bang dat_don_hang trong cau SELECT.
function gsInClause(gsSet: Set<string> | null, ddhAlias: string): { sql: string; binds: string[] } | null {
  if (gsSet === null || gsSet.size === 0) return gsSet === null ? null : { sql: " AND 1=0", binds: [] };
  const emails = [...gsSet];
  return { sql: ` AND ${ddhAlias}.email_gs IN (${emails.map(() => "?").join(",")})`, binds: emails };
}

export async function computeDatMuaLkBreakdown(db: D1Database, user: AppUser): Promise<DatMuaLkBreakdown> {
  const isTacNghiep = user.vai_tro === "TBP DVBH" || user.vai_tro === "Admin";
  const isKho = !!user.la_kho || user.vai_tro === "Admin";
  const isKeToan = !!user.la_ke_toan || user.vai_tro === "Admin";
  const isQC = user.vai_tro === "QC" || user.vai_tro === "Admin";

  const out: DatMuaLkBreakdown = { ...EMPTY_DAT_MUA_LK_BREAKDOWN };
  const gsSet = await phuTrachGsSet(db, user.email);

  if (isTacNghiep) {
    const clause = gsInClause(gsSet, "ddh");
    const row = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM dat_don_hang ddh
              WHERE ddh.loai_don != 'tra_hang'
              AND (SELECT trang_thai FROM dat_don_hang_log WHERE dat_don_hang_id = ddh.id ORDER BY id DESC LIMIT 1) = 'Cho TN duyet'${clause?.sql ?? ""}) as cho_tn_duyet,
           (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang'
              AND (SELECT trang_thai FROM tra_hang_log WHERE dat_don_hang_id = ddh.id ORDER BY id DESC LIMIT 1) = 'Cho TN duyet tong') as cho_tn_tra_hang`,
      )
      .bind(...(clause?.binds ?? []))
      .first<{ cho_tn_duyet: number; cho_tn_tra_hang: number }>();
    out.choTnDuyet = row?.cho_tn_duyet ?? 0;
    out.choTnTraHang = row?.cho_tn_tra_hang ?? 0;
  }

  if (isKho) {
    const thieuLkClause = gsInClause(gsSet, "ddh");
    const pxkClause = gsInClause(gsSet, "ddh2");
    const traHangClause = gsInClause(gsSet, "ddh");
    const row = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM thieu_lk tlk JOIN dat_don_hang ddh ON ddh.id = tlk.dat_don_hang_id
              WHERE (SELECT trang_thai FROM thieu_lk_log WHERE thieu_lk_id = tlk.id ORDER BY id DESC LIMIT 1) = 'Cho kho xu ly'${thieuLkClause?.sql ?? ""}) as cho_kho_thieu_lk,
           (SELECT COUNT(*) FROM phieu_xuat_kho pxk
              WHERE (SELECT trang_thai FROM phieu_xuat_kho_log WHERE phieu_xuat_kho_id = pxk.id ORDER BY id DESC LIMIT 1) = 'Da chot xong don xuat'
              ${pxkClause ? `AND EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh2 ON ddh2.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = pxk.id${pxkClause.sql})` : ""}) as cho_kho_pxk,
           (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang'
              AND (SELECT trang_thai FROM tra_hang_log WHERE dat_don_hang_id = ddh.id ORDER BY id DESC LIMIT 1) IN ('Cho kho xac nhan', 'Cho kho xac nhan nhap kho')
              ${traHangClause?.sql ?? ""}) as cho_kho_tra_hang`,
      )
      .bind(...(thieuLkClause?.binds ?? []), ...(pxkClause?.binds ?? []), ...(traHangClause?.binds ?? []))
      .first<{ cho_kho_thieu_lk: number; cho_kho_pxk: number; cho_kho_tra_hang: number }>();
    out.choKhoThieuLk = row?.cho_kho_thieu_lk ?? 0;
    out.choKhoPxk = row?.cho_kho_pxk ?? 0;
    out.choKhoTraHang = row?.cho_kho_tra_hang ?? 0;
  }

  if (isKeToan) {
    const pxkClause = gsInClause(gsSet, "ddh2");
    const traHangClause = gsInClause(gsSet, "ddh");
    const row = await db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM phieu_xuat_kho pxk
              WHERE (SELECT trang_thai FROM phieu_xuat_kho_log WHERE phieu_xuat_kho_id = pxk.id ORDER BY id DESC LIMIT 1) = 'Cho ke toan'
              ${pxkClause ? `AND EXISTS (SELECT 1 FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh2 ON ddh2.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = pxk.id${pxkClause.sql})` : ""}) as cho_ke_toan_pxk,
           (SELECT COUNT(*) FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang'
              AND (SELECT trang_thai FROM tra_hang_log WHERE dat_don_hang_id = ddh.id ORDER BY id DESC LIMIT 1) IN ('Cho ke toan duyet mem', 'Cho ke toan xac nhan nhap kho')
              ${traHangClause?.sql ?? ""}) as cho_ke_toan_tra_hang`,
      )
      .bind(...(pxkClause?.binds ?? []), ...(traHangClause?.binds ?? []))
      .first<{ cho_ke_toan_pxk: number; cho_ke_toan_tra_hang: number }>();
    out.choKeToanPxk = row?.cho_ke_toan_pxk ?? 0;
    out.choKeToanTraHang = row?.cho_ke_toan_tra_hang ?? 0;
  }

  if (isQC) {
    const row = await db
      .prepare(
        `SELECT COUNT(*) as n FROM dat_don_hang ddh WHERE ddh.loai_don = 'tra_hang'
           AND (SELECT trang_thai FROM tra_hang_log WHERE dat_don_hang_id = ddh.id ORDER BY id DESC LIMIT 1) = 'Cho QC xac nhan'`,
      )
      .first<{ n: number }>();
    out.choQcTraHang = row?.n ?? 0;
  }

  if (user.la_ktv_dvbh) {
    const isTram = await db.prepare("SELECT 1 as x FROM users WHERE tram_cha = ? LIMIT 1").bind(user.email).first();
    if (isTram) {
      const row = await db
        .prepare(
          `SELECT COUNT(*) as n FROM dat_don_hang ddh JOIN users u ON u.email = ddh.nguoi_tao
             WHERE u.tram_cha = ? AND ddh.loai_don != 'tra_hang'
               AND (SELECT trang_thai FROM dat_don_hang_log WHERE dat_don_hang_id = ddh.id ORDER BY id DESC LIMIT 1) = 'Cho Tram duyet'`,
        )
        .bind(user.email)
        .first<{ n: number }>();
      out.choTramDuyet = row?.n ?? 0;
    }
  }

  out.total =
    out.choTnDuyet + out.choTnTraHang + out.choKhoThieuLk + out.choKhoPxk + out.choKhoTraHang +
    out.choKeToanPxk + out.choKeToanTraHang + out.choQcTraHang + out.choTramDuyet;

  return out;
}

// Doc badge dat-mua-lk qua cache RIENG (khong gop chung key/domain voi phan con lai cua
// computeNotificationsCount o duoi) vi bucket Tram phu thuoc TUNG CA NHAN (danh sach Ve tinh cua
// rieng nguoi goi) - khong the dung chung 1 gia tri cho ca nhom vai_tro nhu khaoSat/caLap. Domain
// them "users" (ngoai "dat_mua_lk") vi cac co flag la_kho/la_ke_toan/la_ktv_dvbh doi (users.ts
// PATCH /:email) cung phai lam cache nay cu di, khong chi rieng ghi vao don hang.
export async function getDatMuaLkBadge(db: D1Database, user: AppUser): Promise<DatMuaLkBreakdown> {
  const capDung = !!(
    user.la_ktv_dvbh ||
    user.la_kho ||
    user.la_ke_toan ||
    user.vai_tro === "TBP DVBH" ||
    user.vai_tro === "Admin" ||
    user.vai_tro === "QC"
  );
  if (!capDung) return EMPTY_DAT_MUA_LK_BREAKDOWN;

  const key = buildReportKey(
    "notifications/count-dat-mua-lk",
    {
      email: user.email,
      vai_tro: user.vai_tro ?? "",
      la_ktv_dvbh: user.la_ktv_dvbh ? "1" : "",
      la_kho: user.la_kho ? "1" : "",
      la_ke_toan: user.la_ke_toan ? "1" : "",
    },
    null,
  );
  return cachedReport(db, key, ["dat_mua_lk", "users"], () => computeDatMuaLkBreakdown(db, user));
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
export async function computeNotificationsCount(db: D1Database, user: AppUser, scope: string[] | null): Promise<Omit<NotificationsCountPayload, "datMuaLk">> {
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
    // CHOT 2026-08-20 (rao soat lag): "CROSS JOIN" - xem giai thich o survey.ts computeSurveyCounts
    // (ep quet vi_pham truoc thay vi de planner tu chon quet gan het case_dvbh), ket qua giong het.
    db
      .prepare(
        `SELECT COUNT(*) as n FROM vi_pham v
         CROSS JOIN case_dvbh c ON c.id = v.case_id
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
    // CHOT 2026-08-20 (rao soat lag): "INDEXED BY idx_case_nghi_ngo_nap_gas" - ep dung index partial
    // co san (migration 0024, WHERE nghi_ngo_nap_gas = 1) thay vi de planner tu chon (D1 Insights do
    // duoc dang quet gan het case_dvbh, ~179k-180k rows/lan, kha nang do khu_vuc IN(...) duoc chon
    // lam duong quet chinh thay vi cot da co index nay).
    db
      .prepare(
        `SELECT COUNT(*) as n FROM case_dvbh c INDEXED BY idx_case_nghi_ngo_nap_gas
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
  // Tai khoan "chi Dat mua linh kien" (vai_tro=NULL co chu dich, xem frontend/src/App.tsx) khong
  // tham gia phan he DVBH chinh nen khong co bucket nao trong cac field con lai - nhung VAN co the
  // la Tram/Kho/Ke toan cua rieng module dat-mua-lk (them 2026-08-14) nen van tinh datMuaLk qua
  // getDatMuaLkBadge (tu bo qua D1 hoan toan neu khong co flag nao ap dung, xem ham do).
  if (!user.vai_tro) {
    const empty: NotificationsCountPayload = {
      canGiaiTrinh: 0,
      choQc: 0,
      caThieuLinhKien: 0,
      khaoSat: 0,
      caLap: 0,
      danhGiaNapGas: 0,
      tranhChap: 0,
      datMuaLk: await getDatMuaLkBadge(c.env.DB, user),
    };
    return c.json(empty);
  }
  const scope = scopeByKhuVuc(c);
  const params = { vai_tro: user.vai_tro ?? "", la_ksnb_doi_tac: user.la_ksnb_doi_tac ? "1" : "" };
  const key = buildReportKey("notifications/count", params, scope);
  const [rest, datMuaLk] = await Promise.all([
    cachedReport(
      c.env.DB,
      key,
      ["cases", "giai_trinh", "vi_pham", "giai_trinh_lap", "blacklist", "nap_gas_danh_gia", "tranh_chap"],
      () => computeNotificationsCount(c.env.DB, user, scope),
    ),
    getDatMuaLkBadge(c.env.DB, user),
  ]);
  const data: NotificationsCountPayload = { ...rest, datMuaLk };
  return c.json(data);
});

export default notifications;
