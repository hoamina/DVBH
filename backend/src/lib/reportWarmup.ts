/**
 * R7 (YEU_CAU_BAO_CAO_TINH_SAN.md): "tinh lai 1 lan duy nhat khi import moi" - ngay sau khi import
 * co GHI_MOI/GHI_DE that su (va SAU khi bumpVersions("cases") da chay xong de version tag moi co
 * hieu luc), tinh san truoc cac bao cao voi BO THAM SO MAC DINH ma nguoi dung hay xem nhat (khong
 * bo loc, thang hien tai, pham vi khong gioi han) - nguoi dung mo bao cao la keo ban tinh san,
 * khong ai phai tra chi phi "nguoi xem dau tien". Cac to hop bo loc khac / pham vi Giam sat van
 * duoc tang version-tag (lazy) cua reportCache.ts tu lo khi co nguoi xem.
 *
 * CHOT 2026-08-01: KHONG con warm dashboard/kpis, dashboard/pivot, dashboard/violation-breakdown,
 * dashboard/sla-trend, dashboard/monthly-trend, revenue, revenue/giam-sat o day nua - 3 bao cao
 * (violation-breakdown/sla-trend/monthly-trend) da bi go bo hoan toan; kpis/pivot/revenue* voi bo
 * loc mac dinh gio doc thang tu bang daily_snapshot ("Bao cao ngay 08:00", xem lib/dailySnapshot.ts)
 * thay vi cachedReport - CHI tinh lai luc cron 08:00 hoac Admin bam "Lam moi bao cao", KHONG con tinh
 * lai o day sau MOI import nua (dung y "dong bang ca ngay tru khi lam moi thu cong").
 *
 * Tham so tung muc PHAI khop DUNG bo params ma route handler tuong ung build tu request mac dinh
 * cua frontend (xem tung route + module frontend) - khac 1 ky tu la lech key, warm vo ich (khong
 * sai du lieu, chi phi cong). Chay TUAN TU tung bao cao (khong Promise.all) de tranh don cung luc
 * ~10 cau quet lon vao D1 trong 1 waitUntil.
 */
import { cachedReport, buildReportKey } from "./reportCache";
import type { DataDomain } from "./dataVersions";
import { computeCasesCounts, computeBacklogStats, computeBacklogByKhuVuc } from "../routes/cases";
import { computeMissingPartsByKhuVuc } from "../routes/missingParts";
import { computeSurveyCounts } from "../routes/survey";
import { computeCaLapTongQuan } from "../routes/caLap";

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
  // xem).
  scope?: string[] | null;
}

export async function warmDefaultReports(db: D1Database): Promise<void> {
  // CaLapModule.tsx LUON gui thang="YYYY-MM" thuc te (khac quy uoc CURRENT_MONTH_VALUE="CURRENT"
  // cua dashboard/revenue) - phai tinh dung gia tri nay de key warm-up khop CHINH XAC voi key
  // request that. Dung gio VN (+7h) thay vi UTC de khop voi gia tri frontend (da sua cung cong thuc).
  const thangCaLap = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);

  const items: WarmItem[] = [
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
        // cache luon, khong ton them. Scope mac dinh null.
        await cachedReport(db, buildReportKey(item.endpoint, item.params, item.scope ?? null), item.domains, item.compute);
      }
    } catch (err) {
      // 1 bao cao warm loi khong duoc lam gay ca chuoi (va cang khong duoc lam fail import da xong) -
      // bao cao do se duoc tinh lai theo co che lazy khi co nguoi xem that.
      console.error(`warmDefaultReports: loi khi warm ${item.endpoint}`, err);
    }
  }
}
