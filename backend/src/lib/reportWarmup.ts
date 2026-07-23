/**
 * R7 (YEU_CAU_BAO_CAO_TINH_SAN.md): "tinh lai 1 lan duy nhat khi import moi" - ngay sau khi import
 * co GHI_MOI/GHI_DE that su (va SAU khi bumpVersions("cases") da chay xong de version tag moi co
 * hieu luc), tinh san truoc cac bao cao voi BO THAM SO MAC DINH ma nguoi dung hay xem nhat (khong
 * bo loc, thang hien tai, pham vi khong gioi han) - nguoi dung mo bao cao la keo ban tinh san,
 * khong ai phai tra chi phi "nguoi xem dau tien". Cac to hop bo loc khac / pham vi Giam sat van
 * duoc tang version-tag (lazy) cua reportCache.ts tu lo khi co nguoi xem.
 *
 * Tham so tung muc PHAI khop DUNG bo params ma route handler tuong ung build tu request mac dinh
 * cua frontend (xem tung route + module frontend) - khac 1 ky tu la lech key, warm vo ich (khong
 * sai du lieu, chi phi cong). Chay TUAN TU tung bao cao (khong Promise.all) de tranh don cung luc
 * ~10 cau quet lon vao D1 trong 1 waitUntil.
 */
import { cachedReport, buildReportKey } from "./reportCache";
import type { DataDomain } from "./dataVersions";
import { CURRENT_MONTH_VALUE } from "./filterParams";
import {
  computeDashboardKpis,
  computeViolationBreakdown,
  computeDashboardPivot,
  computeSlaTrend,
  computeMonthlyTrend,
} from "../routes/dashboard";
import { computeCasesCounts, computeBacklogStats, computeBacklogByKhuVuc } from "../routes/cases";
import { computeMissingPartsByKhuVuc } from "../routes/missingParts";
import { computeSurveyCounts } from "../routes/survey";
import { computeRevenue } from "../routes/revenue";

interface WarmItem {
  endpoint: string;
  params: Record<string, string | undefined>;
  domains: DataDomain[];
  compute: () => Promise<unknown>;
}

export async function warmDefaultReports(db: D1Database): Promise<void> {
  const thang = CURRENT_MONTH_VALUE;
  const items: WarmItem[] = [
    { endpoint: "dashboard/kpis", params: { thang }, domains: ["cases", "vi_pham"], compute: () => computeDashboardKpis(db, { thang }, null) },
    { endpoint: "dashboard/violation-breakdown", params: { thang }, domains: ["cases"], compute: () => computeViolationBreakdown(db, { thang }, null) },
    { endpoint: "dashboard/pivot", params: { dimKey: "khu_vuc", thang }, domains: ["cases"], compute: () => computeDashboardPivot(db, { dimKey: "khu_vuc", thang }, null) },
    { endpoint: "dashboard/pivot", params: { dimKey: "hang", thang }, domains: ["cases"], compute: () => computeDashboardPivot(db, { dimKey: "hang", thang }, null) },
    { endpoint: "dashboard/pivot", params: { dimKey: "ky_thuat_vien", thang }, domains: ["cases"], compute: () => computeDashboardPivot(db, { dimKey: "ky_thuat_vien", thang }, null) },
    { endpoint: "dashboard/sla-trend", params: { days: "14", thang }, domains: ["cases"], compute: () => computeSlaTrend(db, { days: "14", thang }, null) },
    { endpoint: "dashboard/monthly-trend", params: { months: "12" }, domains: ["cases"], compute: () => computeMonthlyTrend(db, { months: "12" }, null) },
    { endpoint: "cases/counts", params: {}, domains: ["cases", "giai_trinh", "settings"], compute: () => computeCasesCounts(db, {}, null) },
    { endpoint: "cases/backlog-stats", params: {}, domains: ["cases", "giai_trinh", "settings"], compute: () => computeBacklogStats(db, {}, null) },
    { endpoint: "cases/backlog-by-khu-vuc", params: { dim: "khu_vuc" }, domains: ["cases", "giai_trinh", "settings"], compute: () => computeBacklogByKhuVuc(db, { dim: "khu_vuc" }, null) },
    { endpoint: "missing-parts/by-khu-vuc", params: { dim: "khu_vuc" }, domains: ["cases", "giai_trinh", "settings"], compute: () => computeMissingPartsByKhuVuc(db, { dim: "khu_vuc" }, null) },
    { endpoint: "survey/counts", params: {}, domains: ["cases", "vi_pham", "ket_qua_goi"], compute: () => computeSurveyCounts(db, {}, null) },
    { endpoint: "revenue", params: { dim: "khu_vuc", thang }, domains: ["cases"], compute: () => computeRevenue(db, { dim: "khu_vuc", thang }, null) },
    { endpoint: "revenue", params: { dim: "hang", thang }, domains: ["cases"], compute: () => computeRevenue(db, { dim: "hang", thang }, null) },
  ];

  for (const item of items) {
    try {
      // cachedReport tu so version tag: sau bump "cases" tag chac chan lech -> compute + luu; neu vi
      // ly do nao do tag van khop (vd 2 import lien tiep, lan truoc vua warm xong) thi tra cache luon,
      // khong ton them.
      await cachedReport(db, buildReportKey(item.endpoint, item.params, null), item.domains, item.compute);
    } catch (err) {
      // 1 bao cao warm loi khong duoc lam gay ca chuoi (va cang khong duoc lam fail import da xong) -
      // bao cao do se duoc tinh lai theo co che lazy khi co nguoi xem that.
      console.error(`warmDefaultReports: loi khi warm ${item.endpoint}`, err);
    }
  }
}
