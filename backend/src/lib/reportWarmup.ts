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
import { computeRevenue, computeRevenueGiamSat } from "../routes/revenue";
import { computeCaLapTongQuan } from "../routes/caLap";
import { fromJsonArray } from "./jsonArray";

interface WarmItem {
  endpoint: string;
  params: Record<string, string | undefined>;
  domains: DataDomain[];
  compute: () => Promise<unknown>;
  // true neu ham compute() da TU boc cachedReport ben trong (vd computeBacklogStats/
  // computeBacklogByKhuVuc sau R9.3 - moi ham chia nhieu cache block noi bo rieng) - warm-up chi
  // can GOI THANG compute() de kich hoat cac cache noi bo do tu warm, KHONG duoc boc them 1 lop
  // cachedReport(...) o vong lap ben duoi nua, neu khong se tao ra 1 dong cache ngoai "key gop"
  // khong ai doc toi (route that da doc thang tu cac cache con ben trong), ton 1 luot doc + 1
  // luot ghi thua moi lan import ma khong co loi ich gi.
  selfCached?: boolean;
  // Scope dung de tinh key cache (buildReportKey) - PHAI khop dung scope ma closure compute() ben
  // duoi da dung. Mac dinh null (khong gioi han khu_vuc - dung cho da so bao cao Admin/Viewer/...
  // xem). Chi khac null cho cac bao cao rieng theo khu_vuc cua 1 user cu the (vd revenue/giam-sat
  // warm rieng cho tung "Giam sat" - xem duoi).
  scope?: string[] | null;
}

export async function warmDefaultReports(db: D1Database): Promise<void> {
  const thang = CURRENT_MONTH_VALUE;
  // CaLapModule.tsx LUON gui thang="YYYY-MM" thuc te (khac quy uoc CURRENT_MONTH_VALUE="CURRENT"
  // cua dashboard/revenue) - phai tinh dung gia tri nay (cung cong thuc UTC toISOString().slice(0,7)
  // nhu frontend) de key warm-up khop CHINH XAC voi key request that, neu khong warm vo ich.
  const thangCaLap = new Date().toISOString().slice(0, 7);

  // revenue/giam-sat: RevenueModule.tsx goi endpoint nay cho MOI nguoi xem trang Doanh thu (khong
  // rieng vai tro "Giam sat"), voi params { khu_vuc: undefined, hang: undefined, thang: CURRENT }
  // mac dinh. Ket qua phu thuoc scope cua NGUOI GOI (null cho Admin/Viewer/TBP..., rieng
  // khu_vuc_phu_trach cho tung "Giam sat" - xem scopeByKhuVuc.ts) nen 1 warm voi scope=null KHONG
  // du - can warm THEM 1 lan rieng cho tung "Giam sat" that su co trong bang users, neu khong nguoi
  // do van la "nguoi xem dau tien" tra chi phi tinh toan (day chinh la nguyen nhan gay doc D1 bat
  // thuong 2026-07-24, xem YEU_CAU_BAO_CAO_TINH_SAN.md).
  const revenueGiamSatParams = { khu_vuc: undefined, hang: undefined, thang };
  // Boc rieng trong try/catch (khac vong lap warm chinh ben duoi) - neu truy van danh sach "Giam
  // sat" loi, chi mat phan warm rieng cho tung Giam sat (se roi ve lazy compute khi co nguoi xem
  // that), KHONG duoc lam gay ca chuoi warm cac bao cao khac (dashboard/backlog/...).
  let giamSatWarmItems: WarmItem[] = [];
  try {
    const giamSatUsers = await db.prepare("SELECT email, khu_vuc_phu_trach FROM users WHERE vai_tro = 'Giam sat'").all<{ email: string; khu_vuc_phu_trach: string | null }>();
    giamSatWarmItems = giamSatUsers.results.map((u) => {
      const scope = fromJsonArray(u.khu_vuc_phu_trach);
      return {
        endpoint: "revenue/giam-sat",
        params: revenueGiamSatParams,
        domains: ["cases", "users"] as DataDomain[],
        scope,
        compute: () => computeRevenueGiamSat(db, revenueGiamSatParams, scope),
      };
    });
  } catch (err) {
    console.error("warmDefaultReports: loi khi lay danh sach Giam sat de warm revenue/giam-sat", err);
  }

  const items: WarmItem[] = [
    { endpoint: "dashboard/kpis", params: { thang }, domains: ["cases", "vi_pham"], compute: () => computeDashboardKpis(db, { thang }, null) },
    { endpoint: "dashboard/violation-breakdown", params: { thang }, domains: ["cases"], compute: () => computeViolationBreakdown(db, { thang }, null) },
    { endpoint: "dashboard/pivot", params: { dimKey: "khu_vuc", thang }, domains: ["cases"], compute: () => computeDashboardPivot(db, { dimKey: "khu_vuc", thang }, null) },
    { endpoint: "dashboard/pivot", params: { dimKey: "hang", thang }, domains: ["cases"], compute: () => computeDashboardPivot(db, { dimKey: "hang", thang }, null) },
    { endpoint: "dashboard/pivot", params: { dimKey: "ky_thuat_vien", thang }, domains: ["cases"], compute: () => computeDashboardPivot(db, { dimKey: "ky_thuat_vien", thang }, null) },
    { endpoint: "dashboard/sla-trend", params: { days: "14", thang }, domains: ["cases"], compute: () => computeSlaTrend(db, { days: "14", thang }, null) },
    { endpoint: "dashboard/monthly-trend", params: { months: "12" }, domains: ["cases"], compute: () => computeMonthlyTrend(db, { months: "12" }, null) },
    { endpoint: "cases/counts", params: {}, domains: ["cases", "giai_trinh", "settings"], compute: () => computeCasesCounts(db, {}, null) },
    // selfCached: true - computeBacklogStats/computeBacklogByKhuVuc (sau R9.3) tu chia + boc
    // cachedReport noi bo cho tung nhom cot (thuan import vs phu thuoc giai_trinh) - domains o day
    // khong con dung de boc ngoai nua, chi con mang tinh mo ta/tai lieu.
    { endpoint: "cases/backlog-stats", params: {}, domains: ["cases", "giai_trinh", "settings"], compute: () => computeBacklogStats(db, {}, null), selfCached: true },
    {
      endpoint: "cases/backlog-by-khu-vuc",
      params: { dim: "khu_vuc" },
      domains: ["cases", "giai_trinh", "settings"],
      compute: () => computeBacklogByKhuVuc(db, { dim: "khu_vuc" }, null),
      selfCached: true,
    },
    { endpoint: "missing-parts/by-khu-vuc", params: { dim: "khu_vuc" }, domains: ["cases", "giai_trinh", "settings"], compute: () => computeMissingPartsByKhuVuc(db, { dim: "khu_vuc" }, null) },
    { endpoint: "survey/counts", params: {}, domains: ["cases", "vi_pham", "ket_qua_goi"], compute: () => computeSurveyCounts(db, {}, null) },
    { endpoint: "revenue", params: { dim: "khu_vuc", thang }, domains: ["cases"], compute: () => computeRevenue(db, { dim: "khu_vuc", thang }, null) },
    { endpoint: "revenue", params: { dim: "hang", thang }, domains: ["cases"], compute: () => computeRevenue(db, { dim: "hang", thang }, null) },
    // scope=null - dung chung cho Admin/Viewer/TBP DVBH/TBP CSKH (deu thuoc ROLES_XEM_TOAN_BO nen
    // scopeByKhuVuc() tra null). Tung "Giam sat" rieng duoc warm o giamSatWarmItems ben tren.
    { endpoint: "revenue/giam-sat", params: revenueGiamSatParams, domains: ["cases", "users"], scope: null, compute: () => computeRevenueGiamSat(db, revenueGiamSatParams, null) },
    ...giamSatWarmItems,
    // selfCached: true - computeCaLapTongQuan (R9.3) tu chia 2 khoi cache noi bo rieng (thuan
    // import vs phu thuoc giai_trinh_lap). params PHAI khop dung request that cua CaLapModule.tsx
    // (luon gui thang=YYYY-MM, khong gui khu_vuc khi khong loc) - xem thangCaLap o tren.
    { endpoint: "ca-lap/tong-quan", params: { thang: thangCaLap }, domains: ["cases", "giai_trinh_lap", "blacklist"], compute: () => computeCaLapTongQuan(db, { thang: thangCaLap }, null), selfCached: true },
  ];

  for (const item of items) {
    try {
      if (item.selfCached) {
        // Goi thang - ham compute() tu boc cachedReport noi bo cho tung khoi cache con cua no.
        await item.compute();
      } else {
        // cachedReport tu so version tag: sau bump "cases" tag chac chan lech -> compute + luu; neu
        // vi ly do nao do tag van khop (vd 2 import lien tiep, lan truoc vua warm xong) thi tra
        // cache luon, khong ton them. Scope mac dinh null, tru cac item revenue/giam-sat rieng cho
        // tung "Giam sat" (item.scope) - PHAI khop dung scope ma closure compute() da dung.
        await cachedReport(db, buildReportKey(item.endpoint, item.params, item.scope ?? null), item.domains, item.compute);
      }
    } catch (err) {
      // 1 bao cao warm loi khong duoc lam gay ca chuoi (va cang khong duoc lam fail import da xong) -
      // bao cao do se duoc tinh lai theo co che lazy khi co nguoi xem that.
      console.error(`warmDefaultReports: loi khi warm ${item.endpoint}`, err);
    }
  }
}
