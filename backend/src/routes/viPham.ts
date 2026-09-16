import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { bumpVersions } from "../lib/dataVersions";
import { cachedReport, buildReportKey } from "../lib/reportCache";
import {
  khuVucReportExclusionClause,
  khuVucAdHocClause,
  dimAdHocClause,
  dayRangeBounds,
  nguonCrmClause,
  extraDimFiltersFromParams,
} from "../lib/filterParams";
import { RECENT_OR_OPEN_CONDITION, OVERDUE_SURVEY_CONDITION } from "../lib/surveyConditions";
import { uploadPublicImage } from "../lib/googleDrive";
import { toJsonArray } from "../lib/jsonArray";
import { pushViPhamToVipham } from "../lib/viPhamBenNgoai";
import { nowVN } from "../lib/vnTime";
import { loadKetQuaCap1ValidValues, isGhiChuBatBuocForKetQuaCap1 } from "../lib/ketQuaCap1";
import { nextSequentialId } from "../lib/idCounter";
import { syncViPhamFromSheet } from "../lib/viPhamSheetSync";

const viPham = new Hono<{ Bindings: Env }>();
viPham.use("*", verifySessionMiddleware, loadUser);

const XAC_NHAN_EXPR = "COALESCE(v.chot_bo_cap_2, CASE WHEN v.ket_qua_cap_1 != 'Khong loi' THEN 1 ELSE 0 END) = 1";

// KHONG them gio "00:00:00" vao bound - xem giai thich chi tiet o monthBounds() trong cases.ts.
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

// Khop dung 4 cot loi_* tren case_dvbh voi ten loai_loi tren vi_pham - dung chung cho ca nghiNgo lan
// canKhaoSat (xem computeViPhamFunnel) va cho 4 index tung phan trong migration 0045.
const FLAG_BRANCHES: { flagCol: string; loaiLoi: string }[] = [
  { flagCol: "loi_120p", loaiLoi: "Loi 120 phut" },
  { flagCol: "loi_qua_han_24h", loaiLoi: "Hen qua 24h" },
  { flagCol: "loi_lo_ke_hoach", loaiLoi: "Loi lo ke hoach" },
  { flagCol: "loi_kh_hen_lai", loaiLoi: "KH hen lai" },
];

export interface ViPhamFunnelParams {
  thang?: string;
  khu_vuc?: string;
  tinh?: string;
  quan_huyen?: string;
  ky_thuat_vien?: string;
  ngay_goi_tu?: string;
  ngay_goi_den?: string;
  nguon_crm?: string;
  // Index signature bat buoc de truyen truc tiep vao buildReportKey() - xem lib/reportCache.ts.
  [key: string]: string | undefined;
}

export interface ViPhamFunnelPayload {
  tongCaMo: number;
  nghiNgo: number;
  khongCanGoi: number;
  daGoi: number;
  quaHanChuaXuLy: number;
  chuaXuLy: number;
  // "cho_goi_lai" DUNG NGHIA: cuoc goi GAN NHAT cua ca bi tich can_goi_lai=1 - CHOT 2026-08-22 lan 3
  // (sua lai tu dinh nghia rong ban dau "co bat ky cuoc goi nao", phat hien SAI qua vi du that ca
  // 1291772 - xem chu thich day du o computeViPhamFunnel va o khoi 5 cua computeSurveyKhuVucReport).
  choGoiLai: number;
  // Da co cuoc goi, cuoc goi GAN NHAT khong phai can_goi_lai=1 (thuong da thanh cong), nhung case
  // van con_khao_sat=1 vi con 1 loai loi KHAC chua tung duoc goi lan nao.
  conLoiChuaGoi: number;
  viPhamCap1: number;
  qcDaChot: number;
}

// Tach rieng phan tinh toan cua /funnel - dung chung cho compute-on-miss va warm-up (R7).
// CHOT 2026-08-22: viet lai tu 4 chi so (nghiNgo/canKhaoSat/choQc/daXuLy) thanh 8 chi so theo yeu
// cau chu he thong - moi chi so la 1 lan dem RIENG, co gang re nhat co the:
//   - tongCaMo/nghiNgo/quaHanChuaXuLy/chuaXuLy: chi doc case_dvbh, gioi han theo THANG
//     (thoi_gian_cskh_tiep_nhan) qua index co san (idx_case_thoi_gian_tiep_nhan cho tongCaMo; 4
//     index rieng tung cot loi_* migration 0045 cho nghiNgo, UNION thay OR - xem FLAG_BRANCHES;
//     idx_case_can_khao_sat_thang migration 0097 cho quaHanChuaXuLy/chuaXuLy - "chua xu ly" o day
//     la phan CON LAI sau khi tach rieng "qua han chua xu ly", KHONG gom chung, theo dung yeu cau
//     chu he thong "da co bo dem rieng cac ca qua han roi").
//   - khongCanGoi/daGoi: doc ket_qua_goi, CROSS JOIN ep drive tu ket_qua_goi (bang nho) truoc roi
//     moi tra case_dvbh theo PK - cung ky thuat da dung cho GET /survey (cho-qc/da-xu-ly, xem
//     survey.ts). "khongCanGoi" = cuoc goi co ket_qua_cuoc_goi = 'Khong can khao sat' (CSKH danh
//     gia khong can goi); "daGoi" = co IT NHAT 1 ban ghi ket_qua_goi (bat ky ket qua) - theo dung
//     dinh nghia chu he thong yeu cau, co the trung lap voi khongCanGoi (khongCanGoi la 1 tap con
//     cua daGoi ve mat du lieu, ca 2 deu la con so co y nghia rieng, khong yeu cau loai tru nhau).
//   - viPhamCap1/qcDaChot: doc vi_pham, CROSS JOIN ep drive tu vi_pham (bang nho) - cung ky thuat.
//
// CHOT 2026-08-22 (rao soat lech so lieu voi /survey/bao-cao-khu-vuc): ban dau ham nay CHI nhan
// "thang", trong khi computeSurveyKhuVucReport (bang "Bao cao khao sat theo khu vuc") con ap dung
// THEM khu_vuc/tinh/quan_huyen/ky_thuat_vien/ngay_goi_tu-den/nguon_crm/cac REPORT_DIMS khac - 2 bao
// cao dung CHUNG 1 thanh bo loc tren UI (tab "Bao cao") nhung chi Phau nhan dung "thang" khi goi API,
// nen bat ky bo loc nao trong so con lai dang duoc chon (vd "Ngay goi tu/den" con luu tu lan truoc
// trong localStorage) se lam 2 bao cao lech nhau ma khong ai nhan ra - day la nguyen nhan THAT SU cua
// "553 vs 0", KHONG phai lech thang nhu phan tich truoc do (phan tich truoc dung cho 1 van de KHAC -
// cong thuc cho_khao_sat = can_khao_sat - da_khao_sat cua bang khu vuc, xem sua o computeSurveyKhuVucReport).
// Fix: nhan THEM DUNG bo loc nhu computeSurveyKhuVucReport, dung lai cac ham dung chung tu
// lib/filterParams.ts (da chuyen tu routes/survey.ts sang de dung lai duoc o day).
export async function computeViPhamFunnel(db: D1Database, params: ViPhamFunnelParams, scope: string[] | null): Promise<ViPhamFunnelPayload> {
  const scopeClauseCBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusionC = khuVucReportExclusionClause("c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", params.khu_vuc);
  const tinhClause = dimAdHocClause("c.tinh", "tinh", params.tinh);
  const quanHuyenSql = params.tinh && params.quan_huyen ? " AND c.quan_huyen = ?" : "";
  const quanHuyenBinds = params.tinh && params.quan_huyen ? [params.quan_huyen] : [];
  const ktvSql = params.ky_thuat_vien ? " AND c.ky_thuat_vien = ?" : "";
  const ktvBinds = params.ky_thuat_vien ? [params.ky_thuat_vien] : [];
  const extraClause = extraDimFiltersFromParams(params);
  const nguonCrm = nguonCrmClause(params.nguon_crm);
  const scopeClauseC = {
    sql: scopeClauseCBase.sql + exclusionC.sql + khuVucClause.sql + tinhClause.sql + quanHuyenSql + ktvSql + extraClause.sql + nguonCrm.sql,
    binds: [...scopeClauseCBase.binds, ...exclusionC.binds, ...khuVucClause.binds, ...tinhClause.binds, ...quanHuyenBinds, ...ktvBinds, ...extraClause.binds, ...nguonCrm.binds],
  };
  const ngayGoiRange = dayRangeBounds(params.ngay_goi_tu, params.ngay_goi_den);
  const { start, end } = ngayGoiRange ?? monthBounds(params.thang || new Date().toISOString().slice(0, 7));

  const latestCanGoiLaiC = `(SELECT k.can_goi_lai FROM ket_qua_goi k WHERE k.case_id = c.id ORDER BY k.ngay_gio_thuc_hien DESC LIMIT 1)`;
  const hasAnyCallC = `EXISTS (SELECT 1 FROM ket_qua_goi k WHERE k.case_id = c.id)`;

  const [tongCaMo, nghiNgo, khongCanGoi, daGoi, quaHanChuaXuLy, chuaXuLy, choGoiLai, conLoiChuaGoi, viPhamCap1, qcDaChot] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) as n FROM case_dvbh c
         WHERE c.archived_at IS NULL AND c.huy_bo_at IS NULL
           AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC.sql}`,
      )
      .bind(start, end, ...scopeClauseC.binds)
      .first<{ n: number }>(),

    db
      .prepare(
        `SELECT COUNT(*) as n FROM (
           ${FLAG_BRANCHES.map(
             (b) =>
               `SELECT c.id FROM case_dvbh c
                WHERE c.archived_at IS NULL AND c.huy_bo_at IS NULL AND c.${b.flagCol} = 1
                  AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC.sql}`,
           ).join(" UNION ")}
         )`,
      )
      .bind(...FLAG_BRANCHES.flatMap(() => [start, end, ...scopeClauseC.binds]))
      .first<{ n: number }>(),

    db
      .prepare(
        `SELECT COUNT(DISTINCT k.case_id) as n
         FROM ket_qua_goi k CROSS JOIN case_dvbh c ON c.id = k.case_id
         WHERE k.ket_qua_cuoc_goi = 'Không cần khảo sát'
           AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC.sql}`,
      )
      .bind(start, end, ...scopeClauseC.binds)
      .first<{ n: number }>(),

    db
      .prepare(
        `SELECT COUNT(DISTINCT k.case_id) as n
         FROM ket_qua_goi k CROSS JOIN case_dvbh c ON c.id = k.case_id
         WHERE c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC.sql}`,
      )
      .bind(start, end, ...scopeClauseC.binds)
      .first<{ n: number }>(),

    db
      .prepare(
        `SELECT COUNT(*) as n FROM case_dvbh c
         WHERE c.archived_at IS NULL AND c.huy_bo_at IS NULL AND c.can_khao_sat = 1
           AND ${OVERDUE_SURVEY_CONDITION}
           AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC.sql}`,
      )
      .bind(start, end, ...scopeClauseC.binds)
      .first<{ n: number }>(),

    db
      .prepare(
        `SELECT COUNT(*) as n FROM case_dvbh c
         WHERE c.archived_at IS NULL AND c.huy_bo_at IS NULL AND c.can_khao_sat = 1
           AND ${RECENT_OR_OPEN_CONDITION}
           AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC.sql}`,
      )
      .bind(start, end, ...scopeClauseC.binds)
      .first<{ n: number }>(),

    db
      .prepare(
        // choGoiLai DUNG NGHIA (CHOT 2026-08-22 lan 3, sua tu dinh nghia rong ban dau): cuoc goi
        // GAN NHAT cua ca bi tich can_goi_lai=1 - KHONG con la "co bat ky cuoc goi nao". Tap con cua
        // chuaXuLy, cung RECENT_OR_OPEN_CONDITION.
        `SELECT COUNT(*) as n FROM case_dvbh c
         WHERE c.archived_at IS NULL AND c.huy_bo_at IS NULL AND c.can_khao_sat = 1
           AND ${RECENT_OR_OPEN_CONDITION}
           AND ${latestCanGoiLaiC} = 1
           AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC.sql}`,
      )
      .bind(start, end, ...scopeClauseC.binds)
      .first<{ n: number }>(),

    db
      .prepare(
        // conLoiChuaGoi (them 2026-08-22 lan 3): da co cuoc goi, cuoc goi GAN NHAT khong phai
        // can_goi_lai=1 (thuong da thanh cong), nhung case van con_khao_sat=1 vi con loai loi KHAC
        // chua tung duoc goi - vi du that ca 1291772 (120p+24h da goi xong, "Lo ke hoach" chua goi).
        `SELECT COUNT(*) as n FROM case_dvbh c
         WHERE c.archived_at IS NULL AND c.huy_bo_at IS NULL AND c.can_khao_sat = 1
           AND ${RECENT_OR_OPEN_CONDITION}
           AND ${hasAnyCallC} AND ${latestCanGoiLaiC} IS NOT 1
           AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC.sql}`,
      )
      .bind(start, end, ...scopeClauseC.binds)
      .first<{ n: number }>(),

    db
      .prepare(
        `SELECT COUNT(DISTINCT v.case_id) as n FROM vi_pham v CROSS JOIN case_dvbh c ON c.id = v.case_id
         WHERE v.ket_qua_cap_1 IS NOT NULL AND v.ket_qua_cap_1 != 'Khong loi'
           AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC.sql}`,
      )
      .bind(start, end, ...scopeClauseC.binds)
      .first<{ n: number }>(),

    db
      .prepare(
        `SELECT COUNT(DISTINCT v.case_id) as n FROM vi_pham v CROSS JOIN case_dvbh c ON c.id = v.case_id
         WHERE v.chot_bo_cap_2 IS NOT NULL
           AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC.sql}`,
      )
      .bind(start, end, ...scopeClauseC.binds)
      .first<{ n: number }>(),
  ]);

  return {
    tongCaMo: tongCaMo?.n ?? 0,
    nghiNgo: nghiNgo?.n ?? 0,
    khongCanGoi: khongCanGoi?.n ?? 0,
    daGoi: daGoi?.n ?? 0,
    quaHanChuaXuLy: quaHanChuaXuLy?.n ?? 0,
    chuaXuLy: chuaXuLy?.n ?? 0,
    choGoiLai: choGoiLai?.n ?? 0,
    conLoiChuaGoi: conLoiChuaGoi?.n ?? 0,
    viPhamCap1: viPhamCap1?.n ?? 0,
    qcDaChot: qcDaChot?.n ?? 0,
  };
}

// GET /api/vi-pham/funnel?thang=YYYY-MM - 10 chi so xu ly vi pham trong thang (xem chu thich day du
// o computeViPhamFunnel). Doc qua reportCache (xem lib/reportCache.ts), "thang" nam trong cache
// key. "funnel-v5" - choGoiLai sua lai dung nghia goc (cuoc goi GAN NHAT tich can_goi_lai=1, khong
// phai "co bat ky cuoc goi nao"), them "conLoiChuaGoi" (CHOT 2026-08-22 lan 3, phat hien qua vi du
// that ca 1291772) nen doi hau to key de ep tinh lai ngay, tranh serve nham envelope cu gia tri cu.
// Them domain "ket_qua_goi" (khongCanGoi/daGoi/choGoiLai/conLoiChuaGoi doc bang nay) - da cap nhat
// YEU_CAU_BAO_CAO_TINH_SAN.md tuong ung.
viPham.get("/funnel", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params: ViPhamFunnelParams = {
    thang: c.req.query("thang"),
    khu_vuc: c.req.query("khu_vuc"),
    tinh: c.req.query("tinh"),
    quan_huyen: c.req.query("quan_huyen"),
    ky_thuat_vien: c.req.query("ky_thuat_vien"),
    ngay_goi_tu: c.req.query("ngay_goi_tu"),
    ngay_goi_den: c.req.query("ngay_goi_den"),
    nguon_crm: c.req.query("nguon_crm"),
  };
  const key = buildReportKey("vi-pham/funnel-v5", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases", "vi_pham", "ket_qua_goi"], () => computeViPhamFunnel(c.env.DB, params, scope));
  return c.json(payload);
});

export interface ViPhamLeaderboardParams {
  by?: string;
  // CHOT 2026-08-22: leaderboard gioi han theo THANG dang xem (giong /funnel), khong con "khong
  // gioi han thang" nhu ban dau - xem chu thich day du o computeViPhamLeaderboard() ben duoi.
  thang?: string;
  // Index signature bat buoc de truyen truc tiep vao buildReportKey() (Record<string, string |
  // undefined>) - xem lib/reportCache.ts.
  [key: string]: string | undefined;
}

// Tach rieng phan tinh toan cua /leaderboard - dung chung cho compute-on-miss va warm-up (R7).
// Moi dong tra them "tong_ca" (tong so ca cua KTV do / tong so ca trong cac khu vuc gia sat do phu
// trach, TRONG THANG dang xem) va "ty_le_vi_pham" (%, = so_vi_pham/tong_ca) - CHOT: bieu do Top 10
// chuyen tu so vi pham tuyet doi sang ty le, nhung TIEU CHI chon+sap xep Top 10 van la so_vi_pham
// tuyet doi cao nhat (khong doi), chi doi gia tri hien thi tren truc.
//
// CHOT 2026-08-22 (rao soat lag): 2 thay doi so voi ban goc.
//   1. Gioi han theo THANG (thoi_gian_cskh_tiep_nhan, giong dung field da dung o /funnel) thay vi
//      "khong gioi han thang" nhu truoc - vua la quyet dinh nghiep vu (ty le vi pham/tong ca trong
//      1 thang cu the co y nghia hon ty le tren tong lich su, giong huong /funnel da lam), vua sua
//      luon van de hieu nang: ban khong gioi han thang do EXPLAIN QUERY PLAN tren production doc
//      duoc toi 1.349.143 rows_read/3s cho MOI lan tinh (nhanh "giam-sat", CROSS JOIN theo khu_vuc
//      nhan len theo tung cap Giam sat x khu vuc). Gioi han thang khong tu dong lam re di neu giu
//      nguyen cau truc join cu (van con nhanh "SEARCH c USING INDEX idx_case_thoi_gian_tiep_nhan"
//      quet ca thang roi loc theo khu_vuc sau, do da co WHERE date-range - van ~277K rows_read) -
//      PHAI ket hop voi thay doi #2 ben duoi moi that su giai quyet goc re.
//   2. Nhanh "giam-sat" viet lai qua 2 CTE (tong hop truoc theo khu_vuc, roi moi JOIN voi
//      users/json_each) thay vi join truc tiep case_dvbh theo khu_vuc trong vong lap tung Giam sat -
//      CTE dau tien ("confirmed_by_khu_vuc") drive tu vi_pham (CROSS JOIN ep thu tu, bang nho) giong
//      nhanh "ktv"; CTE thu hai ("total_by_khu_vuc") 1 lan GROUP BY khu_vuc tren case_dvbh (van phai
//      quet, nhung CHI 1 LAN cho ca bao cao thay vi lap lai theo tung Giam sat nhu truoc). Da doi
//      chieu KET QUA (so_vi_pham/tong_ca) khop 100% voi ban goc truoc khi doi, chi khac cach truy
//      van. Do 2 CTE nay dung LEFT JOIN (de khong mat khu_vuc co tong_ca nhung chua co vi pham thang
//      nay), gom lai bang HAVING so_vi_pham > 0 de giu dung hanh vi INNER JOIN cu (Giam sat khong co
//      vi pham nao trong thang se khong xuat hien, dung nghia leaderboard).
//   Nhanh "ktv" cung can CROSS JOIN (khong chi giam-sat) - EXPLAIN xac nhan INNER JOIN + date-range
//   moi van khien planner drive tu case_dvbh qua idx_case_ky_thuat_vien (khong loc duoc theo thang o
//   buoc seek, quet ~108K rows_read); CROSS JOIN ep drive tu vi_pham dua ve ~11.5K rows_read.
//   Do luong tren production: 1.349.143 (goc, khong gioi han thang) -> 44.518 rows_read (gioi han
//   thang + CTE) cho nhanh giam-sat; ~108.316 -> ~11.537 rows_read cho nhanh ktv.
export async function computeViPhamLeaderboard(db: D1Database, params: ViPhamLeaderboardParams, scope: string[] | null): Promise<{ rows: unknown[] }> {
  const by = params.by === "giam-sat" ? "giam-sat" : "ktv";
  const { start, end } = monthBounds(params.thang || new Date().toISOString().slice(0, 7));
  const scopeClauseCBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusionC = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClauseC = { sql: scopeClauseCBase.sql + exclusionC.sql, binds: [...scopeClauseCBase.binds, ...exclusionC.binds] };

  function withTyLe<T extends { so_vi_pham: number; tong_ca: number }>(rows: T[]): (T & { ty_le_vi_pham: number })[] {
    return rows.map((r) => ({ ...r, ty_le_vi_pham: r.tong_ca ? Math.round((r.so_vi_pham / r.tong_ca) * 1000) / 10 : 0 }));
  }

  if (by === "ktv") {
    const scopeClauseC2Base = khuVucWhereClause(scope, "c2.khu_vuc");
    const exclusionC2 = khuVucReportExclusionClause("c2.khu_vuc");
    const scopeClauseC2 = { sql: scopeClauseC2Base.sql + exclusionC2.sql, binds: [...scopeClauseC2Base.binds, ...exclusionC2.binds] };
    // CROSS JOIN ... ON - xem chu thich day du o tren (drive tu vi_pham thay vi de planner tu chon
    // case_dvbh, ~9x it rows_read hon voi cung dieu kien loc).
    const { results } = await db.prepare(
      `SELECT c.ky_thuat_vien as nhom, COUNT(*) as so_vi_pham,
         (SELECT COUNT(*) FROM case_dvbh c2 WHERE c2.ky_thuat_vien = c.ky_thuat_vien
            AND c2.archived_at IS NULL AND c2.huy_bo_at IS NULL
            AND c2.thoi_gian_cskh_tiep_nhan >= ? AND c2.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC2.sql}) as tong_ca
       FROM vi_pham v CROSS JOIN case_dvbh c ON c.id = v.case_id
       WHERE ${XAC_NHAN_EXPR} AND c.ky_thuat_vien IS NOT NULL
         AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC.sql}
       GROUP BY c.ky_thuat_vien
       ORDER BY so_vi_pham DESC
       LIMIT 10`,
    )
      .bind(start, end, ...scopeClauseC2.binds, start, end, ...scopeClauseC.binds)
      .all<{ nhom: string; so_vi_pham: number; tong_ca: number }>();
    return { rows: withTyLe(results) };
  }

  const scopeClauseC2Base = khuVucWhereClause(scope, "c2.khu_vuc");
  const exclusionC2 = khuVucReportExclusionClause("c2.khu_vuc");
  const scopeClauseC2 = { sql: scopeClauseC2Base.sql + exclusionC2.sql, binds: [...scopeClauseC2Base.binds, ...exclusionC2.binds] };
  // 2 CTE + LEFT JOIN + HAVING - xem chu thich day du o tren giai thich vi sao (thay the ban join
  // truc tiep case_dvbh theo khu_vuc trong vong lap Giam sat, ~30x it rows_read hon).
  const { results } = await db.prepare(
    `WITH confirmed_by_khu_vuc AS (
       SELECT c.khu_vuc as khu_vuc, COUNT(*) as so_vi_pham
       FROM vi_pham v CROSS JOIN case_dvbh c ON c.id = v.case_id
       WHERE ${XAC_NHAN_EXPR} AND c.khu_vuc IS NOT NULL
         AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC.sql}
       GROUP BY c.khu_vuc
     ),
     total_by_khu_vuc AS (
       SELECT c2.khu_vuc as khu_vuc, COUNT(*) as tong_ca
       FROM case_dvbh c2
       WHERE c2.archived_at IS NULL AND c2.huy_bo_at IS NULL AND c2.khu_vuc IS NOT NULL
         AND c2.thoi_gian_cskh_tiep_nhan >= ? AND c2.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC2.sql}
       GROUP BY c2.khu_vuc
     )
     SELECT u.email as giam_sat_email, u.ten as giam_sat,
       COALESCE(SUM(confirmed_by_khu_vuc.so_vi_pham), 0) as so_vi_pham,
       COALESCE(SUM(total_by_khu_vuc.tong_ca), 0) as tong_ca
     FROM users u, json_each(u.khu_vuc_phu_trach) jv
     LEFT JOIN confirmed_by_khu_vuc ON confirmed_by_khu_vuc.khu_vuc = jv.value
     LEFT JOIN total_by_khu_vuc ON total_by_khu_vuc.khu_vuc = jv.value
     WHERE u.vai_tro = 'Giam sat'
     GROUP BY u.email
     HAVING so_vi_pham > 0
     ORDER BY so_vi_pham DESC
     LIMIT 10`,
  )
    .bind(start, end, ...scopeClauseC.binds, start, end, ...scopeClauseC2.binds)
    .all<{ giam_sat_email: string; giam_sat: string | null; so_vi_pham: number; tong_ca: number }>();
  return { rows: withTyLe(results) };
}

// GET /api/vi-pham/leaderboard?by=ktv|giam-sat - top 10 nhieu vi pham da xac nhan nhat. Doc qua
// reportCache, "by" nam trong cache key. "leaderboard-v2" (khong phai "leaderboard") - CHOT
// 2026-08-20: doi shape payload (them tong_ca/ty_le_vi_pham) nhung reportCache chi invalidate theo
// version-tag domain (khong theo deploy code), nen key cu se tiep tuc tra ve envelope THIEU 2 truong
// moi cho toi khi domain "vi_pham"/"cases" tinh co bump - doi ten key ep tinh lai ngay, tranh phai
// cho 1 write tinh co xay ra. Neu doi shape payload lan nua trong tuong lai, lai doi hau to version.
viPham.get("/leaderboard", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params: ViPhamLeaderboardParams = { by: c.req.query("by"), thang: c.req.query("thang") };
  const key = buildReportKey("vi-pham/leaderboard-v2", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases", "vi_pham"], () => computeViPhamLeaderboard(c.env.DB, params, scope));
  return c.json(payload);
});

// POST /api/vi-pham/backfill-push-vipham?from=YYYY-MM-DD HH:MM:SS&limit=200 - chi Admin, chay THU
// CONG (yeu cau 2026-09-13: bao lai toan bo vi pham ghi nhan tu 0h 1/9 sang vipham app, phong khi
// mot so lan push truoc day that bai/chua co binding luc do). CHI bao lai su kien "nghi_ngo_moi" (ban
// ghi goc) - khop dieu kien push that o routes/survey.ts POST /calls (bo qua ket_qua_cap_1 = 'Khong
// loi', vi ban goc cung khong push cho truong hop nay). Idempotent 2 lop: (1) query loai tru cac
// vi_pham DA co it nhat 1 lan push "nghi_ngo_moi" thanh cong trong vi_pham_push_log (migration 0109)
// nen goi lai an toan, moi lan chi con xu ly phan con thieu - dung "remaining" de biet con hay het
// giong backfill-crm-hash; (2) phia nhan (vipham app, xem handleNghiNgoMoi trong nhanViPham.ts) tu no
// dung INSERT OR IGNORE khoa theo vi_pham_id nen du co goi trung (vd 2 lan cung 1 dot backfill) cung
// khong tao dong trung/khong gui thong bao KTV lap lai - AN TOAN de goi lai nhieu lan.
viPham.post("/backfill-push-vipham", requireRole("Admin"), async (c) => {
  const from = c.req.query("from") || "2026-09-01 00:00:00";
  const limitParam = Number(c.req.query("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 200;

  const { results } = await c.env.DB.prepare(
    `SELECT v.id, v.case_id, v.loai_loi, v.ket_qua_cap_1, v.nguoi_ghi_nhan, v.ngay_ghi_nhan,
            cd.khach_hang, cd.khu_vuc, cd.ky_thuat_vien, cd.seri_san_pham, kg.ghi_chu
     FROM vi_pham v
     JOIN case_dvbh cd ON cd.id = v.case_id
     LEFT JOIN ket_qua_goi kg ON kg.id = v.ket_qua_goi_id
     WHERE v.ngay_ghi_nhan >= ? AND v.ket_qua_cap_1 IS NOT NULL AND v.ket_qua_cap_1 != 'Khong loi'
       AND NOT EXISTS (
         SELECT 1 FROM vi_pham_push_log pl
         WHERE pl.vi_pham_id = v.id AND pl.loai_su_kien = 'nghi_ngo_moi' AND pl.ok = 1
       )
     ORDER BY v.id LIMIT ?`,
  )
    .bind(from, limit)
    .all<{
      id: string;
      case_id: string;
      loai_loi: string;
      ket_qua_cap_1: string;
      nguoi_ghi_nhan: string;
      ngay_ghi_nhan: string;
      khach_hang: string | null;
      khu_vuc: string | null;
      ky_thuat_vien: string | null;
      seri_san_pham: string | null;
      ghi_chu: string | null;
    }>();

  for (const row of results) {
    await pushViPhamToVipham(c.env, {
      loai_su_kien: "nghi_ngo_moi",
      vi_pham_id: row.id,
      case_id: row.case_id,
      loai_loi: row.loai_loi,
      ket_qua_cap_1: row.ket_qua_cap_1,
      khach_hang: row.khach_hang,
      khu_vuc: row.khu_vuc,
      ky_thuat_vien: row.ky_thuat_vien,
      seri_san_pham: row.seri_san_pham,
      ngay_ghi_nhan: row.ngay_ghi_nhan,
      nguoi_ghi_nhan: row.nguoi_ghi_nhan,
      ghi_chu: row.ghi_chu,
    });
  }

  const remainingRow = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM vi_pham v
     WHERE v.ngay_ghi_nhan >= ? AND v.ket_qua_cap_1 IS NOT NULL AND v.ket_qua_cap_1 != 'Khong loi'
       AND NOT EXISTS (
         SELECT 1 FROM vi_pham_push_log pl
         WHERE pl.vi_pham_id = v.id AND pl.loai_su_kien = 'nghi_ngo_moi' AND pl.ok = 1
       )`,
  )
    .bind(from)
    .first<{ n: number }>();

  return c.json({ processed: results.length, remaining: remainingRow?.n ?? 0 });
});

// POST /api/vi-pham/case/:caseId - tao vi_pham THU CONG ngay trong tab "Vi pham" cua CaseDetail.tsx
// (them 2026-09-16, yeu cau chu he thong). Moi vai tro TRU Viewer duoc tao (quyen rong hon cac route
// khac trong file nay, dung theo yeu cau) - loai_loi LUON = 'Khac' (xem migration 0113): day la kenh
// ghi nhan vi pham KHONG thuoc 4 loai SLA tu dong (loi_120p/qua_han_24h/lo_ke_hoach/kh_hen_lai, cac
// loai do da co co che tu dong phat hien + luong CSKH khao sat rieng, khong can/khong nen tao thu
// cong trung voi luong do). Luon vao "cho QC" (chot_bo_cap_2 = NULL) du nguoi tao la ai - CHOT voi
// chu he thong: an toan hon vi quyen tao rat rong, gom ca CSKH/TN CSKH khong thuoc nhom QC/Giam sat,
// de QC van kiem tra lai truoc khi tinh la vi pham chinh thuc.
viPham.post(
  "/case/:caseId",
  requireRole("Admin", "QC", "Giam sat", "TBP DVBH", "CSKH", "TN CSKH", "TBP CSKH", "KSNB Doi tac"),
  async (c) => {
    const caseId = c.req.param("caseId")!;
    const body = await c.req.json<{ ket_qua_cap_1?: string; ghi_chu?: string; ngay_ghi_nhan?: string }>();
    const ketQuaCap1 = body.ket_qua_cap_1?.trim();
    if (!ketQuaCap1) return c.json({ error: "INVALID_BODY" }, 400);
    // Khong duoc tao "Khong loi" qua duong nay - day la kenh GHI NHAN VI PHAM, khac PATCH /:id/cap2
    // (QC co the sua ket_qua_cap_1 cua 1 vi pham DA TON TAI, cung chan gia tri nay - xem tren).
    if (ketQuaCap1 === "Khong loi") return c.json({ error: "INVALID_KET_QUA_CAP_1" }, 400);

    const validValues = await loadKetQuaCap1ValidValues(c.env.DB);
    if (!validValues.has(ketQuaCap1)) return c.json({ error: "INVALID_KET_QUA_CAP_1" }, 400);

    // Bat buoc Ghi chu khi danh muc danh dau bat_buoc_ghi_chu=1 (vd "Lỗi khác") - cung quy tac voi CSKH
    // ghi nhan qua dien thoai (xem SurveyCallWorkspace.tsx batBuocGhiChuByTenLoi) VA la dieu kien BAT
    // BUOC cua PARTNER_API_GUIDE.md muc 9.1.1 khi bao "nghi_ngo_moi" sang app vipham voi 1 loi khong ro
    // mo ta. Dung cot bat_buoc_ghi_chu thay vi so sanh chuoi cung (xem isGhiChuBatBuocForKetQuaCap1).
    const ghiChu = body.ghi_chu?.trim() || null;
    if ((await isGhiChuBatBuocForKetQuaCap1(c.env.DB, ketQuaCap1)) && !ghiChu) return c.json({ error: "GHI_CHU_BAT_BUOC" }, 400);

    const caseRow = await c.env.DB.prepare("SELECT id, khu_vuc, khach_hang, ky_thuat_vien, seri_san_pham FROM case_dvbh WHERE id = ?")
      .bind(caseId)
      .first<{ id: string; khu_vuc: string | null; khach_hang: string | null; ky_thuat_vien: string | null; seri_san_pham: string | null }>();
    if (!caseRow) return c.json({ error: "NOT_FOUND" }, 404);

    // Mirror POST /survey/calls - CSKH/TN CSKH/Giam sat/KSNB Doi tac bi gioi han khu_vuc khong duoc
    // ghi nhan vi pham cho ca ngoai pham vi phu trach, du biet duoc case_id.
    const scope = scopeByKhuVuc(c);
    if (scope !== null && !scope.includes(String(caseRow.khu_vuc))) {
      return c.json({ error: "FORBIDDEN_KHU_VUC" }, 403);
    }

    const user = c.get("user");
    const viPhamId = await nextSequentialId(c.env.DB, "vi_pham", "L", 6);
    const ngayGhiNhan = body.ngay_ghi_nhan?.trim() || nowVN();

    const result = await c.env.DB.prepare(
      `INSERT INTO vi_pham (id, ket_qua_goi_id, case_id, loai_loi, ket_qua_cap_1, ghi_chu, nguoi_ghi_nhan, ngay_ghi_nhan)
       VALUES (?, NULL, ?, 'Khac', ?, ?, ?, ?)
       ON CONFLICT(case_id, loai_loi, ket_qua_cap_1) DO NOTHING`,
    )
      .bind(viPhamId, caseId, ketQuaCap1, ghiChu, user.email, ngayGhiNhan)
      .run();
    if (!result.meta.changes) return c.json({ error: "DUPLICATE" }, 409);

    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["vi_pham"]));
    // Bao sang app vipham nhu 1 "nghi ngo moi" (giong het luong CSKH ghi nhan qua dien thoai, xem
    // routes/survey.ts POST /calls) - waitUntil, khong doi phan hoi.
    c.executionCtx.waitUntil(
      pushViPhamToVipham(c.env, {
        loai_su_kien: "nghi_ngo_moi",
        vi_pham_id: viPhamId,
        case_id: caseId,
        loai_loi: "Khac",
        ket_qua_cap_1: ketQuaCap1,
        khach_hang: caseRow.khach_hang,
        khu_vuc: caseRow.khu_vuc,
        ky_thuat_vien: caseRow.ky_thuat_vien,
        seri_san_pham: caseRow.seri_san_pham,
        ngay_ghi_nhan: ngayGhiNhan,
        nguoi_ghi_nhan: user.email,
        ghi_chu: ghiChu,
      }),
    );

    return c.json({ id: viPhamId }, 201);
  },
);

// POST /api/vi-pham/sync-sheet - dong bo thu cong (Admin) tu Google Sheet "vi_pham_ngoai" (link cau
// hinh o Settings > sheet-urls) - tu dong 1 lan/ngay qua cron (xem index.ts VI_PHAM_SHEET_SYNC_CRON).
viPham.post("/sync-sheet", requireRole("Admin"), async (c) => {
  const user = c.get("user");
  const result = await syncViPhamFromSheet(c.env, user.email);
  if (!result.ok) {
    if (result.reason === "MISSING_SHEET_URL") return c.json({ error: "MISSING_SHEET_URL" }, 400);
    return c.json({ error: "FETCH_FAILED", message: result.message }, 502);
  }
  return c.json(result.summary);
});

// PATCH /api/vi-pham/:id/cap2 - QC chot/bo vi pham cap 2 (final). "ket_qua_cap_1" optional (them
// 2026-09-16, yeu cau chu he thong): cho phep QC sua lai loai loi thuc te truoc khi chot, vi du CSKH
// chon tam "Loi khac" luc goi nhung QC danh gia ky hon thay dung ra la 1 loai loi cu the khac trong
// danh muc "Loai loi vi pham" (settings_loai_vi_pham) - GIU NGUYEN gia tri CSKH da chon neu QC khong
// gui truong nay (backward-compat, khong bat buoc doi UI/API cua ai dang goi endpoint nay ma khong
// biet truong moi). Gia tri cuoi cung (sau khi QC co the da sua) la nguon THAT SU duoc dung de tinh
// bao cao/leaderboard (xem XAC_NHAN_EXPR) VA duoc bao sang app vipham (xem duoi).
viPham.patch("/:id/cap2", requireRole("QC", "Admin"), async (c) => {
  const id = c.req.param("id")!;
  const body = await c.req.json<{ chot: boolean; ket_qua_cap_1?: string }>();
  if (typeof body.chot !== "boolean") return c.json({ error: "INVALID_BODY" }, 400);

  const row = await c.env.DB.prepare("SELECT id, case_id, ket_qua_cap_1 FROM vi_pham WHERE id = ?")
    .bind(id)
    .first<{ id: string; case_id: string; ket_qua_cap_1: string | null }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  // Mirror CHECK chk_cap2_sau_cap1: khong duoc chot cap 2 khi chua co cap 1
  if (row.ket_qua_cap_1 === null) return c.json({ error: "CAP1_CHUA_CO" }, 400);

  let finalKetQuaCap1 = row.ket_qua_cap_1;
  const ketQuaCap1Moi = body.ket_qua_cap_1?.trim();
  if (ketQuaCap1Moi && ketQuaCap1Moi !== row.ket_qua_cap_1) {
    // QC khong duoc doi thanh "Khong loi" qua duong nay - ca da vao hang doi "cho QC" nghia la CSKH
    // da ket luan CO nghi ngo (khac "Khong loi"), doi thanh "Khong loi" phai qua luong khac (sua lai
    // ket qua cuoc goi), khong phai qua PATCH /cap2 nay.
    if (ketQuaCap1Moi === "Khong loi") return c.json({ error: "INVALID_KET_QUA_CAP_1" }, 400);
    const validValues = await loadKetQuaCap1ValidValues(c.env.DB);
    if (!validValues.has(ketQuaCap1Moi)) return c.json({ error: "INVALID_KET_QUA_CAP_1" }, 400);
    finalKetQuaCap1 = ketQuaCap1Moi;
  }

  const user = c.get("user");
  const ngayChot = nowVN();
  await c.env.DB.prepare(
    "UPDATE vi_pham SET chot_bo_cap_2 = ?, nguoi_chot = ?, ngay_chot = ?, ket_qua_cap_1 = ? WHERE id = ?",
  )
    .bind(body.chot ? 1 : 0, user.email, ngayChot, finalKetQuaCap1, id)
    .run();

  // Bump domain "vi_pham" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["vi_pham"]));

  // Bao cho he ngoai "vipham.dichvu3t.workers.dev" moi lan QC chot/bo cap 2 (CHOT 2026-09-11, xem
  // lib/viPhamBenNgoai.ts) - waitUntil, khong doi phan hoi, khong retry (giong het co che "nghi_ngo_moi").
  // "ket_qua_cap_1" them vao payload (2026-09-16) - thieu truong nay thi app vipham se khong bao gio
  // biet QC da sua lai loai loi thuc te (case-lookup KHONG tra ve vi_pham/ket_qua_cap_1, xem
  // routes/partnerApi.ts CASE_LOOKUP_COLUMNS), day la duong DUY NHAT app do nhan duoc gia tri cuoi.
  c.executionCtx.waitUntil(
    pushViPhamToVipham(c.env, {
      loai_su_kien: "cap_nhat",
      nguon_cap_nhat: "qc_chot_cap_2",
      vi_pham_id: id,
      case_id: row.case_id,
      chot_bo_cap_2: body.chot,
      ket_qua_cap_1: finalKetQuaCap1,
      nguoi_chot: user.email,
      ngay_chot: ngayChot,
    }),
  );

  return c.json({ ok: true, ket_qua_cap_1: finalKetQuaCap1 });
});

// POST /api/vi-pham/:id/giai-trinh - Giam sat nhap tay THAY cho KTV (khi KTV khong tu giai trinh qua
// he ngoai "vipham.dichvu3t.workers.dev" - xem migration 0108_vi_pham_giai_trinh.sql). Anh (neu co)
// phai upload truoc qua POST /:id/giai-trinh/anh (ben duoi) de lay URL, roi gui kem trong anh_urls.
viPham.post("/:id/giai-trinh", requireRole("Giam sat", "Admin"), async (c) => {
  const id = c.req.param("id")!;
  const vp = await c.env.DB.prepare("SELECT id, case_id FROM vi_pham WHERE id = ?").bind(id).first<{ id: string; case_id: string }>();
  if (!vp) return c.json({ error: "NOT_FOUND" }, 404);

  const body = await c.req.json<{
    nguoi_giai_trinh?: string;
    ngay_giai_trinh: string;
    noi_dung_giai_trinh?: string;
    ghi_chu?: string;
    anh_urls?: string[];
  }>();
  if (!body.ngay_giai_trinh) return c.json({ error: "INVALID_BODY" }, 400);

  const user = c.get("user");
  const newId = crypto.randomUUID();
  // Khong dien "Nguoi giai trinh" -> mac dinh = chinh GS dang nhap (user.email, giong nguoi_nhap) -
  // GS la nguoi THUC SU viet ban giai trinh nay (thay mat KTV), khong phai KTV.
  const nguoiGiaiTrinh = body.nguoi_giai_trinh?.trim() || user.email;
  const noiDungGiaiTrinh = body.noi_dung_giai_trinh?.trim() || null;
  const ghiChu = body.ghi_chu?.trim() || null;
  const anhUrls = (body.anh_urls ?? []).slice(0, 5);
  await c.env.DB.prepare(
    `INSERT INTO vi_pham_giai_trinh (id, vi_pham_id, case_id, nguon, nguoi_giai_trinh, ngay_giai_trinh, noi_dung_giai_trinh, ghi_chu, anh_urls, nguoi_nhap)
     VALUES (?, ?, ?, 'giam_sat_nhap_tay', ?, ?, ?, ?, ?, ?)`,
  )
    .bind(newId, id, vp.case_id, nguoiGiaiTrinh, body.ngay_giai_trinh, noiDungGiaiTrinh, ghiChu, toJsonArray(anhUrls), user.email)
    .run();

  // Domain rieng "vi_pham_giai_trinh" (2026-09-15), KHONG phai "vi_pham" - dong nay chi ghi bang
  // vi_pham_giai_trinh, bump nham "vi_pham" se xoa cache /funnel, /leaderboard, /counts, /by-khu-vuc
  // vo ich (khong bao cao nao trong so do doc bang nay) - xem giai thich day du o lib/dataVersions.ts.
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["vi_pham_giai_trinh"]));

  // Bao cho he ngoai "vipham.dichvu3t.workers.dev" moi lan GS nhap giai trinh thay TRUC TIEP trong
  // DVBH (CHOT 2026-09-11, xem lib/viPhamBenNgoai.ts) - de vipham luon co ban giai trinh moi nhat cho
  // vi_pham nay du KTV tu nhap qua app hay GS nhap thay o day. KHONG ap dung cho giai trinh den tu
  // chinh vipham qua POST /api/partner/sync/giai-trinh-vi-pham (se vong lai chinh du lieu cua no).
  c.executionCtx.waitUntil(
    pushViPhamToVipham(c.env, {
      loai_su_kien: "cap_nhat",
      nguon_cap_nhat: "giam_sat_giai_trinh",
      vi_pham_id: id,
      case_id: vp.case_id,
      nguoi_giai_trinh: nguoiGiaiTrinh,
      ngay_giai_trinh: body.ngay_giai_trinh,
      noi_dung_giai_trinh: noiDungGiaiTrinh,
      ghi_chu: ghiChu,
      anh_urls: anhUrls,
    }),
  );

  return c.json({ id: newId }, 201);
});

// POST /api/vi-pham/:id/giai-trinh/anh - upload 1 anh bang chung giai trinh len Google Drive - goi
// toi da 5 lan roi gop URL tra ve vao anh_urls khi submit POST /:id/giai-trinh o tren.
// FIX 2026-09-15: truoc dung uploadToDrive() (Service Account rieng, xem lib/googleDrive.ts) - SA
// KHONG co storage quota, Google tra 403 "Service Accounts do not have storage quota" cho MOI file
// (da xac nhan 2026-08-17 khi doi huong settings.ts sang OAuth) nen moi lan GS giai trinh dinh kem
// anh la loi "Khong the tai anh len" 100% cac lan. Doi sang uploadPublicImage() (OAuth uy quyen 1 tai
// khoan Google that, cung pattern voi settings.ts anh linh kien) - tra ve thumbnailUrl thay
// webViewLink, van la 1 URL xem duoc truc tiep, khop dung shape { ok, url } FE dang doc
// (frontend/src/modules/CaseDetail.tsx handleViPhamGiaiTrinhAnh).
viPham.post("/:id/giai-trinh/anh", requireRole("Giam sat", "Admin"), async (c) => {
  const id = c.req.param("id");
  const contentType = c.req.header("Content-Type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return c.json({ error: "INVALID_CONTENT_TYPE" }, 400);
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "EMPTY_FILE" }, 400);

  const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
  const uploaded = await uploadPublicImage(c.env, c.env.DB, bytes, contentType, `giai-trinh-vi-pham-${id}-${Date.now()}.${ext}`);
  return c.json({ ok: true, url: uploaded.thumbnailUrl });
});

export default viPham;
