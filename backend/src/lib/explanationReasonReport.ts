import { khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { khuVucAdHocClause, khuVucReportExclusionClause } from "./filterParams";

export async function computeExplanationReasons(db: D1Database, thang: string, scope: string[] | null, areaParam?: string) {
    const [year, month] = thang.split("-").map(Number);
    const start = `${thang}-01`;
    const end = `${year + (month === 12 ? 1 : 0)}-${String(month % 12 + 1).padStart(2, "0")}-01`;
    const permission = khuVucWhereClause(scope, "c.khu_vuc");
    const area = khuVucAdHocClause("c.khu_vuc", areaParam);
    const exclusion = khuVucReportExclusionClause("c.khu_vuc");
    const { results } = await db.prepare(`
      SELECT c.khu_vuc, c.ky_thuat_vien AS tram, COALESCE(NULLIF(trim(g.ly_do_cham), ''), 'Không ghi lý do') AS ly_do, COUNT(*) AS so_ca
      FROM giai_trinh g
      INNER JOIN case_dvbh c ON c.id = g.case_id
      WHERE g.ngay_giai_trinh >= ? AND g.ngay_giai_trinh < ?
        AND c.archived_at IS NULL AND c.huy_bo_at IS NULL
        AND g.rowid = (SELECT g1.rowid FROM giai_trinh g1 WHERE g1.case_id = c.id
          AND g1.ngay_giai_trinh >= ? AND g1.ngay_giai_trinh < ? ORDER BY g1.ngay_giai_trinh DESC, g1.id DESC LIMIT 1)
        ${permission.sql}${area.sql}${exclusion.sql}
      GROUP BY c.khu_vuc, c.ky_thuat_vien, COALESCE(NULLIF(trim(g.ly_do_cham), ''), 'Không ghi lý do')
      ORDER BY c.khu_vuc, so_ca DESC
    `).bind(start, end, start, end, ...permission.binds, ...area.binds, ...exclusion.binds).all();
    return { rows: results };
}
