import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { NEED_SURVEY_CONDITION, RECENT_OR_OPEN_CONDITION } from "./survey";
import { CA_LAP_CTE, NGUONG_NGAY_LAP } from "./caLap";

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

  const [canGiaiTrinh, choQc, caThieuLinhKien, canKhaoSat, caLapCanDanhGia, caLapChoQc] = await Promise.all([
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
    // Dung dung dieu kien BASE_JOIN + trang_thai=dang-ton mac dinh cua missingParts.ts.
    c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM case_dvbh c
       INNER JOIN (
         SELECT case_id, ly_do_cham FROM (
           SELECT gt.case_id, gt.ly_do_cham, ROW_NUMBER() OVER (PARTITION BY gt.case_id ORDER BY gt.ngay_giai_trinh DESC, gt.id DESC) AS rn
           FROM giai_trinh gt
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
    c.env.DB.prepare(
      `${CA_LAP_CTE}
       SELECT COUNT(*) as n FROM lap LEFT JOIN giai_trinh_lap gl ON gl.case_id = lap.id
       WHERE lap.gap_days <= ${NGUONG_NGAY_LAP} AND gl.chot_danh_gia_lap IS NULL${scopeClauseLap.sql}`,
    )
      .bind(...scopeClauseLap.binds)
      .first<{ n: number }>(),
    c.env.DB.prepare(
      `${CA_LAP_CTE}
       SELECT COUNT(*) as n FROM lap LEFT JOIN giai_trinh_lap gl ON gl.case_id = lap.id
       WHERE lap.gap_days <= ${NGUONG_NGAY_LAP} AND gl.chot_danh_gia_lap IS NOT NULL AND gl.qc_chot IS NULL${scopeClauseLap.sql}`,
    )
      .bind(...scopeClauseLap.binds)
      .first<{ n: number }>(),
  ]);

  const role = user.vai_tro;
  const khaoSat =
    role === "QC" ? (choQc?.n ?? 0) : role === "CSKH" || role === "TN CSKH" ? (canKhaoSat?.n ?? 0) : (canKhaoSat?.n ?? 0) + (choQc?.n ?? 0);
  const caLap = role === "Giam sat" ? (caLapCanDanhGia?.n ?? 0) : role === "QC" ? (caLapChoQc?.n ?? 0) : (caLapCanDanhGia?.n ?? 0) + (caLapChoQc?.n ?? 0);

  return c.json({
    canGiaiTrinh: canGiaiTrinh?.n ?? 0,
    choQc: choQc?.n ?? 0,
    caThieuLinhKien: caThieuLinhKien?.n ?? 0,
    khaoSat,
    caLap,
  });
});

export default notifications;
