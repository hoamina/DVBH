import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { NEED_SURVEY_CONDITION, RECENT_OR_OPEN_CONDITION } from "./survey";
import { CA_LAP_CTE, NGUONG_NGAY_LAP } from "./caLap";
import { CASE_FILTER_TON } from "../lib/needGiaiTrinh";

const notifications = new Hono<{ Bindings: Env }>();
notifications.use("*", verifySessionMiddleware, loadUser);

// GET /api/notifications/count - so ca can xu ly theo tung module, dung cho ca chuong thong bao
// (TopBar) lan badge so luong tren sidebar (Sidebar.tsx). "khaoSat"/"caLap" ca nhan hoa theo vai
// tro dang nhap (CSKH/TN CSKH thay "can khao sat", QC thay "cho QC", vai tro khac thay tong ca hai -
// giong cach da lam voi mac dinh tab trang_thai cua module Ca lap).
notifications.get("/count", async (c) => {
  const user = c.get("user");
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "khu_vuc");
  const scopeClauseC = khuVucWhereClause(scope, "c.khu_vuc");
  const scopeClauseLap = khuVucWhereClause(scope, "lap.khu_vuc");

  const [canGiaiTrinh, choQc, caThieuLinhKien, canKhaoSat, caLapCounts] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM case_dvbh
       WHERE thoi_gian_hoan_thanh IS NULL AND archived_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM giai_trinh g WHERE g.case_id = case_dvbh.id)${scopeClause.sql}`,
    )
      .bind(...scopeClause.binds)
      .first<{ n: number }>(),
    // Phai JOIN case_dvbh + loc theo khu_vuc giong het tab "cho-qc" cua survey.ts, neu khong so
    // dem o chuong thong bao se lon hon danh sach that nguoi dung bi gioi han khu vuc xem duoc.
    c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM vi_pham v
       INNER JOIN case_dvbh c ON c.id = v.case_id
       WHERE v.ket_qua_cap_1 IS NOT NULL AND v.ket_qua_cap_1 != 'Khong loi' AND v.chot_bo_cap_2 IS NULL${scopeClauseC.sql}`,
    )
      .bind(...scopeClauseC.binds)
      .first<{ n: number }>(),
    // Dung dung dieu kien baseJoin() + trang_thai=dang-ton mac dinh cua missingParts.ts. Subquery
    // gioi han vao dung tap case DANG TON (CASE_FILTER_TON, khop het WHERE ben duoi) thay vi quet
    // toan bo bang giai_trinh - xem giai thich an toan o latestGiaiTrinhJoin() trong needGiaiTrinh.ts.
    c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM case_dvbh c
       INNER JOIN (
         SELECT case_id, ly_do_cham FROM (
           SELECT gt.case_id, gt.ly_do_cham, ROW_NUMBER() OVER (PARTITION BY gt.case_id ORDER BY gt.ngay_giai_trinh DESC, gt.id DESC) AS rn
           FROM giai_trinh gt
           WHERE gt.case_id IN (SELECT id FROM case_dvbh WHERE ${CASE_FILTER_TON})
         ) WHERE rn = 1
       ) lg ON lg.case_id = c.id
       INNER JOIN settings_ly_do sld ON sld.ten_ly_do = lg.ly_do_cham AND sld.thuoc_thieu_linh_kien = 1
       WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL${scopeClauseC.sql}`,
    )
      .bind(...scopeClauseC.binds)
      .first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM case_dvbh c
       WHERE c.archived_at IS NULL AND ${RECENT_OR_OPEN_CONDITION} AND ${NEED_SURVEY_CONDITION}${scopeClauseC.sql}`,
    )
      .bind(...scopeClauseC.binds)
      .first<{ n: number }>(),
    // Gop 2 truy van "can danh gia"/"cho QC" cua Ca lap thanh 1 - CA_LAP_CTE dung window function
    // LAG() quet TOAN BO lich su case_dvbh (khong dung duoc index de rut gon), rat ton kem neu chay
    // 2 lan cho cung 1 request (phat hien qua Cloudflare D1 usage: rows read vuot xa binh thuong -
    // endpoint nay bi poll moi 60s tu Sidebar/TopBar nen nhan chi phi len rat nhieu lan/ngay).
    c.env.DB.prepare(
      `${CA_LAP_CTE}
       SELECT
         SUM(CASE WHEN gl.chot_danh_gia_lap IS NULL THEN 1 ELSE 0 END) as can_danh_gia,
         SUM(CASE WHEN gl.chot_danh_gia_lap IS NOT NULL AND gl.qc_chot IS NULL THEN 1 ELSE 0 END) as cho_qc
       FROM lap LEFT JOIN giai_trinh_lap gl ON gl.case_id = lap.id
       WHERE lap.gap_days <= ${NGUONG_NGAY_LAP}${scopeClauseLap.sql}`,
    )
      .bind(...scopeClauseLap.binds)
      .first<{ can_danh_gia: number; cho_qc: number }>(),
  ]);

  const role = user.vai_tro;
  const khaoSat =
    role === "QC" ? (choQc?.n ?? 0) : role === "CSKH" || role === "TN CSKH" ? (canKhaoSat?.n ?? 0) : (canKhaoSat?.n ?? 0) + (choQc?.n ?? 0);
  const caLapCanDanhGia = caLapCounts?.can_danh_gia ?? 0;
  const caLapChoQc = caLapCounts?.cho_qc ?? 0;
  const caLap = role === "Giam sat" ? caLapCanDanhGia : role === "QC" ? caLapChoQc : caLapCanDanhGia + caLapChoQc;

  return c.json({
    canGiaiTrinh: canGiaiTrinh?.n ?? 0,
    choQc: choQc?.n ?? 0,
    caThieuLinhKien: caThieuLinhKien?.n ?? 0,
    khaoSat,
    caLap,
  });
});

export default notifications;
