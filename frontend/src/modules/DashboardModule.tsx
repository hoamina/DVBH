import { useQuocGiaDangXem } from "../lib/phamVi";
import { usePhReportGroups, phGroupForStation, sumReportRows } from "../lib/phReportGroups";
import { isoWeekOf, isoWeekRange, isoWeeksInYear } from "../lib/isoWeek";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BaoCaoDangTai } from "../components/ui/BaoCaoDangTai";
import { StatCard } from "../components/ui/StatCard";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { Btn } from "../components/ui/Btn";
import { ChartCanvas } from "../components/chart/ChartCanvas";
import { FilterBar, ALL_KHU_VUC, ALL_HANG, type DashboardFilters } from "../components/FilterBar";
import { CURRENT_MONTH_VALUE } from "../constants";
import { api, buildQuery } from "../api/client";
import { LOAI_LOI_META, LOAI_LOI_KEYS, fmtVND } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { fmtGeneratedAt } from "../lib/formatSnapshotTime";
import { shortKhuVuc, khuVucGop } from "../lib/khuVucShortLabel";
import { useDiaGioiIndex, gopBangTheoTinh, soSanhTen, useDiaGioiLoc, useOnDiaGioiModeChange, NHAN_CAP_1 } from "../lib/diaGioi";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { tr } from "../i18n/tr";
import { SlaCheDoToggle, useSlaCheDo, type SlaCheDo } from "../components/SlaCheDoToggle";
import { SoSanhSlaCard } from "../components/SoSanhSlaCard";

interface DailyReportBucket {
  baseline: number;
  resolved: number;
  remaining: number;
}

interface DailyReport {
  scope: "khu_vuc" | "toan_he_thong";
  khuVucList: string[];
  generatedAt: string;
  generatedBy: string;
  tonCanGiaiTrinh: DailyReportBucket;
  thieuLinhKien: DailyReportBucket;
  caLap: DailyReportBucket;
  canKhaoSat: DailyReportBucket;
  doanhThuThang: number | null;
}

interface Kpis {
  total: number;
  hoanThanh: number;
  ton: number;
  tonDaGiaiTrinh: number;
  nghiNgo: number;
  xacNhan: number;
  tySla: number;
  ty24h: number;
  tySlaMoi?: number;
  ty24hMoi?: number;
  tyGiaiTrinh: number;
  tyViPham: number;
  tyDaKhaoSat: number;
}

interface PivotRow {
  nhom: string;
  tram?: string;
  sla_8h: number;
  sla_24h: number;
  sla_48h: number;
  sla_72h: number;
  co_tinh_gio: number;
  total: number;
  ht_tinh_kpi: number;
  sla_ok: number;
  dung_han_tinh: number;
  duoi_24h_count: number;
  co_tinh_24h: number;
  nghi_ngo: number;
  loi_120p: number;
  loi_qua_han_24h: number;
  loi_lo_ke_hoach: number;
  loi_kh_hen_lai: number;
  // SLA moi (khong loai tru, 2026-11-20) - dashboardCompute.ts computeDashboardPivot.
  sla_8h_moi?: number;
  sla_24h_moi?: number;
  sla_48h_moi?: number;
  sla_72h_moi?: number;
  co_tinh_gio_moi?: number;
  duoi_24h_moi?: number;
  sla_ok_moi?: number;
  dung_han_tinh_moi?: number;
  co_moc_odoo?: number;
  cu_dh_moi_qh?: number;
  cu_qh_moi_dh?: number;
  tong_gio?: number;
  tong_gio_moi?: number;
}

/** Cong tac SLA moi: thay cac cot SLA / ≤24h / SLA ≤Xh bang ban "moi" de moi phan hien thi + Excel ben duoi giu nguyen code. */
function theoSla<T extends PivotRow>(rows: T[], cheDo: SlaCheDo): T[] {
  if (cheDo === "cu") return rows;
  return rows.map((r) => ({
    ...r,
    sla_ok: r.sla_ok_moi ?? 0,
    dung_han_tinh: r.dung_han_tinh_moi ?? 0,
    duoi_24h_count: r.duoi_24h_moi ?? 0,
    co_tinh_24h: r.co_tinh_gio_moi ?? 0,
    sla_8h: r.sla_8h_moi ?? 0,
    sla_24h: r.sla_24h_moi ?? 0,
    sla_48h: r.sla_48h_moi ?? 0,
    sla_72h: r.sla_72h_moi ?? 0,
    co_tinh_gio: r.co_tinh_gio_moi ?? 0,
  }));
}

function pct(a: number, b: number) {
  return b ? Math.round((a / b) * 1000) / 10 : 0;
}

const ALL_MODEL = "Tất cả Model";

export function DashboardModule({ onNavigate }: { onNavigate?: (module: string) => void } = {}) {
  const [filters, setFilters] = useLocalStorageState<DashboardFilters>("filters:dashboard", { khu_vuc: ALL_KHU_VUC, hang: ALL_HANG, thang: CURRENT_MONTH_VALUE });
  const isPH = useQuocGiaDangXem() === "PH";
  const [phGroups] = usePhReportGroups();
  const [collapseKtv, setCollapseKtv] = useLocalStorageState("filters:dashboard-ph-collapse", false);
  const [week, setWeek] = useLocalStorageState("filters:dashboard-week", "");
  const [weekYear, setWeekYear] = useLocalStorageState("filters:dashboard-week-year", String(new Date(Date.now() + 7 * 3600000).getUTCFullYear()));
  const weekRange: { tu_ngay?: string; den_ngay?: string } = week ? isoWeekRange(Number(weekYear), Number(week)) : {};
  // Ky xem theo tuan (2026-11-18): danh sach tuan cua nam dang chon + nam truoc, moi muc ghi khoang ngay; khong cho chon tuan chua toi.
  const tuanNay = isoWeekOf();
  const laTuanNay = !!week && Number(weekYear) === tuanNay.year && Number(week) === tuanNay.week;
  const chonTuan = (t: { year: number; week: number }) => {
    setWeekYear(String(t.year));
    setWeek(String(t.week));
  };
  const doiTuan = (buoc: number) => {
    if (!week) return;
    const r = isoWeekRange(Number(weekYear), Number(week));
    const moc = new Date(Date.parse(r.tu_ngay) + buoc * 7 * 86400000).toISOString().slice(0, 10);
    const t = isoWeekOf(moc);
    if (t.year > tuanNay.year || (t.year === tuanNay.year && t.week > tuanNay.week)) return;
    chonTuan(t);
  };
  const ngayVn = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const tuanOptions = [tuanNay.year, tuanNay.year - 1].flatMap((y) =>
    Array.from({ length: isoWeeksInYear(y) }, (_, i) => i + 1)
      .filter((w) => y < tuanNay.year || w <= tuanNay.week)
      .reverse()
      .map((w) => {
        const r = isoWeekRange(y, w);
        const den = new Date(Date.parse(r.den_ngay) - 86400000).toISOString().slice(0, 10);
        const nay = y === tuanNay.year && w === tuanNay.week;
        return { value: `${y}-${w}`, label: `${tr("Tuần {0}/{1}", w, y)} · ${ngayVn(r.tu_ngay)}–${ngayVn(den)}${nay ? ` (${tr("tuần này")})` : ""}` };
      }),
  );
  const thangHienThi = (() => {
    const v = filters.thang === CURRENT_MONTH_VALUE ? new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7) : filters.thang;
    return /^\d{4}-\d{2}$/.test(v) ? `${v.slice(5, 7)}/${v.slice(0, 4)}` : v;
  })();
  const [pivotDim, setPivotDim] = useLocalStorageState("filters:dashboard-pivot-dim", "khu_vuc");
  // Loc phu "Tinh" (chon nhieu, "|") cho bang pivot - CHI khi nhom theo KTV (2026-10-23): xem KTV dang xu ly ca o tinh
  // can kiem tra. Gia tri theo che do Dia gioi cu/moi -> doi che do thi xoa loc (gia tri cu khong con nghia).
  const [pivotTinh, setPivotTinh] = useLocalStorageState("filters:dashboard-pivot-tinh", "");
  const diaGioiLoc = useDiaGioiLoc();
  useOnDiaGioiModeChange(() => setPivotTinh(""));
  const groupPH = isPH && collapseKtv && pivotDim === "ky_thuat_vien";
  const pivotDgLoc = pivotDim === "ky_thuat_vien" && pivotTinh ? (diaGioiLoc.buildDgLoc(pivotTinh.split("|")) ?? undefined) : undefined;
  const { mode: dgMode, idx: dgIdx } = useDiaGioiIndex();
  // CHOT 2026-08-12: bo loc "Model" rieng cho the "Tong quan" (khong dua vao FilterBar/DashboardFilters
  // dung chung voi RevenueModule - tranh hien Select thua o Bao cao doanh thu, noi khong ai yeu cau) -
  // ap dung dong thoi cho ca "Filter tong" (kpi) lan "Bang pivot phan tich da chieu" qua filterParams.
  const [modelFilter, setModelFilter] = useLocalStorageState("filters:dashboard-model", ALL_MODEL);

  const { data: modelOptionsData } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ nhomSanPham: (string | null)[] }>("/dashboard/filters"),
  });

  const filterParams = {
    khu_vuc: filters.khu_vuc !== ALL_KHU_VUC ? filters.khu_vuc : undefined,
    hang: filters.hang !== ALL_HANG ? filters.hang : undefined,
    thang: filters.thang,
    ...weekRange,
    nhom_san_pham: modelFilter !== ALL_MODEL ? modelFilter : undefined,
  };
  const query = buildQuery(filterParams);

  // 2026-11-07: man Tong quat KEO 1 LAN - 1 request GET /dashboard/man-tong-quat thay cho 4 (daily-report, kpis, pivot theo dim, pivot
  // KTV); server doc so chot 08:00 1 lan + gom doc cache 1 luot D1. Key bat dau "dashboard-kpis" de cho dang invalidate kpis van lam
  // moi. Rieng pivot co loc phu Tinh (pivotDgLoc) van goi /dashboard/pivot rieng (bo loc tuong tac).
  const manTqQ = useQuery({
    queryKey: ["dashboard-kpis", "man-tong-quat", query, pivotDim],
    queryFn: () =>
      api.get<{ dailyReport: DailyReport; kpis: Kpis; pivot: { rows: PivotRow[] }; pivotKtv: { rows: PivotRow[] } }>(
        `/dashboard/man-tong-quat${buildQuery({ ...filterParams, dim: pivotDim })}`,
      ),
    placeholderData: (prev) => prev,
  });
  const manTq = manTqQ.data;
  const pivotLocTinhQ = useQuery({
    queryKey: ["dashboard-pivot", pivotDim, query, pivotDgLoc, groupPH],
    queryFn: () => api.get<{ rows: PivotRow[] }>(`/dashboard/pivot${buildQuery({ ...filterParams, dim: pivotDim, dg_loc: pivotDgLoc, theo_tram: groupPH ? "1" : undefined })}`),
    enabled: !!pivotDgLoc || groupPH,
  });
  const pivotLocTinh = pivotLocTinhQ.data;
  const dailyReport = manTq?.dailyReport;
  const kpi = manTq?.kpis;
  const pivotGoc = (pivotDgLoc || groupPH) ? pivotLocTinh : manTq?.pivot;
  // SLA cu / moi (2026-11-20): 1 cong tac cho ca the KPI, Top 10 KTV, bang pivot; khoa "cu" khi ky xem truoc 11/2026.
  const sla = useSlaCheDo(week ? weekRange.tu_ngay : filters.thang);
  const pivot = useMemo(() => (pivotGoc ? { rows: theoSla(pivotGoc.rows, sla.apDung) } : undefined), [pivotGoc, sla.apDung]);
  const pivotKtv = useMemo(() => (manTq?.pivotKtv ? { rows: theoSla(manTq.pivotKtv.rows, sla.apDung) } : undefined), [manTq, sla.apDung]);
  const laSlaMoi = sla.apDung === "moi";

  // Dong "Tong cong" dau bang pivot - cong don cac cot so tren cac dong dang hien (tu doi theo
  // pivotDim/bo loc hien tai), roi tinh lai 3 cot ty le tu tong tu so/mau so (khong cong trung binh
  // % tung dong).
  const pivotTotal = useMemo(() => {
    const rows = pivot?.rows ?? [];
    const sum = (key: keyof PivotRow) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
    return {
      sla_8h: sum("sla_8h"),
      sla_24h: sum("sla_24h"),
      sla_48h: sum("sla_48h"),
      sla_72h: sum("sla_72h"),
      co_tinh_gio: sum("co_tinh_gio"),
      total: sum("total"),
      ht_tinh_kpi: sum("ht_tinh_kpi"),
      sla_ok: sum("sla_ok"),
      dung_han_tinh: sum("dung_han_tinh"),
      duoi_24h_count: sum("duoi_24h_count"),
      co_tinh_24h: sum("co_tinh_24h"),
      nghi_ngo: sum("nghi_ngo"),
      loi_120p: sum("loi_120p"),
      loi_qua_han_24h: sum("loi_qua_han_24h"),
      loi_lo_ke_hoach: sum("loi_lo_ke_hoach"),
      loi_kh_hen_lai: sum("loi_kh_hen_lai"),
    };
  }, [pivot]);

  // Cot dau tien (Nhom) sap A-Z - CHI ap dung cho bang pivot day du, KHONG ap dung cho "ktvRanked"
  // ben duoi (bang xep hang Top 10 theo ty le SLA, sap A-Z se lam mat y nghia xep hang).
  // Nhom theo "Tinh" (2026-10-10): server tra cap tho (tinh, tinh_moi), gom theo che do "Dia gioi cu / moi".
  const gopVaSapXep = (rows: PivotRow[]) =>
    pivotDim === "tinh"
      ? gopBangTheoTinh(rows, dgMode, dgIdx).sort((a, b) => soSanhTen(a.nhom, b.nhom))
      : (groupPH
          ? sumReportRows(rows, (r) => phGroupForStation(r.tram, phGroups))
          : pivotDim === "khu_vuc"
            ? sumReportRows(rows, (r) => khuVucGop(r.nhom)) // 2026-11-20: gop khu vuc la (B2B doi ma, CTV/TEST) ve khu vuc chuan
            : [...rows]
        ).sort((a, b) => (a.nhom ?? "").localeCompare(b.nhom ?? "", "vi"));
  const sortedPivotRows = gopVaSapXep(pivot?.rows ?? []);
  // Bao cao so sanh SLA cu / moi dung so GOC (khong qua cong tac), cung nhom + cung bo loc voi bang pivot.
  const soSanhRows = gopVaSapXep(pivotGoc?.rows ?? []);

  // KTV chi xet nhung ai co du luong (>=5 ca) de tranh nhieu do mau nho, lay top 10 nhieu ca nhat sap theo ty le SLA tang dan (thap nhat truoc)
  const ktvRanked = [...(pivotKtv?.rows ?? [])]
    .filter((r) => r.total >= 5)
    .sort((a, b) => pct(a.sla_ok, a.dung_han_tinh) - pct(b.sla_ok, b.dung_han_tinh))
    .slice(0, 10);

  return (
    <div className="anim-in">
      <BaoCaoDangTai
        dangTai={manTqQ.isFetching || pivotLocTinhQ.isFetching}
        loi={manTqQ.error ?? pivotLocTinhQ.error}
        onThuLai={() => {
          void manTqQ.refetch();
          if (pivotDgLoc || groupPH) void pivotLocTinhQ.refetch();
        }}
      />
      {dailyReport && (
        <Card className="p-4 mb-4 border-[var(--coral-500)]/40 bg-gradient-to-br from-[var(--coral-100)]/50 to-transparent">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <div className="font-display font-bold text-sm flex items-center gap-2">
              {tr("📊 Báo cáo nhanh vấn đề trong ngày")}{dailyReport.scope === "khu_vuc" && dailyReport.khuVucList.length > 0 && (
                <span className="text-xs font-normal text-[var(--ink-400)]">— {dailyReport.khuVucList.map(shortKhuVuc).join(", ")}</span>
              )}
            </div>
          </div>
          <div className="text-xs text-[var(--ink-400)] mb-3">
            {tr("Báo cáo được cập nhật lúc:")} {fmtGeneratedAt(dailyReport.generatedAt)}  {tr("bởi")}{" "}
            {dailyReport.generatedBy === "auto" ? tr("tự động") : dailyReport.generatedBy}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <button onClick={() => onNavigate?.("backlog")} className="focus-ring text-left rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 hover:border-[var(--coral-500)] transition-colors">
              <div className="text-xs text-[var(--ink-400)] mb-1">{tr("Tồn >3 ngày cần giải trình")}</div>
              <div className="text-xl font-bold text-[var(--coral-500)]">{dailyReport.tonCanGiaiTrinh.remaining}</div>
              <div className="text-[11px] text-[var(--ink-400)] mt-0.5">
                {tr("Đầu ngày:")} {dailyReport.tonCanGiaiTrinh.baseline}  {tr("· Đã xử lý:")} {dailyReport.tonCanGiaiTrinh.resolved}
              </div>
            </button>
            <button onClick={() => onNavigate?.("missing-parts")} className="focus-ring text-left rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 hover:border-[var(--amber-500)] transition-colors">
              <div className="text-xs text-[var(--ink-400)] mb-1">{tr("Ca thiếu linh kiện tồn đọng")}</div>
              <div className="text-xl font-bold text-[var(--amber-500)]">{dailyReport.thieuLinhKien.remaining}</div>
              <div className="text-[11px] text-[var(--ink-400)] mt-0.5">
                {tr("Đầu ngày:")} {dailyReport.thieuLinhKien.baseline}  {tr("· Đã xử lý:")} {dailyReport.thieuLinhKien.resolved}
              </div>
            </button>
            <button onClick={() => onNavigate?.("ca-lap")} className="focus-ring text-left rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 hover:border-[var(--coral-500)] transition-colors">
              <div className="text-xs text-[var(--ink-400)] mb-1">{tr("Ca lặp cần xử lý")}</div>
              <div className="text-xl font-bold text-[var(--coral-500)]">{dailyReport.caLap.remaining}</div>
              <div className="text-[11px] text-[var(--ink-400)] mt-0.5">
                {tr("Đầu ngày:")} {dailyReport.caLap.baseline}  {tr("· Đã xử lý:")} {dailyReport.caLap.resolved}
              </div>
            </button>
            <button onClick={() => onNavigate?.("survey")} className="focus-ring text-left rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 hover:border-[var(--coral-500)] transition-colors">
              <div className="text-xs text-[var(--ink-400)] mb-1">{tr("Ca cần khảo sát")}</div>
              <div className="text-xl font-bold text-[var(--coral-500)]">{dailyReport.canKhaoSat.remaining}</div>
              <div className="text-[11px] text-[var(--ink-400)] mt-0.5">
                {tr("Đầu ngày:")} {dailyReport.canKhaoSat.baseline}  {tr("· Đã xử lý:")} {dailyReport.canKhaoSat.resolved}
              </div>
            </button>
            {dailyReport.doanhThuThang !== null && (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                <div className="text-xs text-[var(--ink-400)] mb-1">{tr("Doanh thu tháng này")}</div>
                <div className="text-xl font-bold text-[var(--teal-500)]">{fmtVND(dailyReport.doanhThuThang)}</div>
              </div>
            )}
          </div>
        </Card>
      )}
      {/* 2026-11-18 (chu he thong): ky xem RO RANG - cong tac Thang | Tuan; che do Tuan AN o chon thang (truoc day 2 bo chon cung hien,
          khong biet dang xem theo gi), mac dinh tuan hien tai, moi tuan ghi khoang ngay, co ◀ ▶ / "Tuần này". */}
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        renderThang={(oThang) => (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[var(--line)] overflow-hidden text-sm" role="group" aria-label={tr("Xem theo")}>
              {(["thang", "tuan"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => (k === "thang" ? setWeek("") : !week && chonTuan(isoWeekOf()))}
                  className={`px-3 py-1.5 ${(k === "tuan") === !!week ? "bg-[var(--ocean-600)] text-white font-semibold" : "bg-white text-[var(--ink-600)] hover:bg-[var(--surface-100)]"}`}
                >
                  {k === "thang" ? tr("Theo tháng") : tr("Theo tuần")}
                </button>
              ))}
            </div>
            {!week ? (
              oThang
            ) : (
              <>
                <button type="button" className="px-2 py-1.5 rounded-lg border border-[var(--line)] text-sm hover:bg-[var(--surface-100)]" title={tr("Tuần trước")} onClick={() => doiTuan(-1)}>◀</button>
                <Select
                  value={`${weekYear}-${week}`}
                  onChange={(v) => {
                    const [y, w] = v.split("-");
                    chonTuan({ year: Number(y), week: Number(w) });
                  }}
                  options={tuanOptions}
                />
                <button type="button" className="px-2 py-1.5 rounded-lg border border-[var(--line)] text-sm hover:bg-[var(--surface-100)] disabled:opacity-40" title={tr("Tuần sau")} disabled={laTuanNay} onClick={() => doiTuan(1)}>▶</button>
                {!laTuanNay && (
                  <button type="button" className="px-2 py-1.5 rounded-lg text-sm font-semibold text-[var(--ocean-600)] hover:underline" onClick={() => chonTuan(tuanNay)}>
                    {tr("Tuần này")}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      />
      <div className="-mt-2 mb-4 inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-[var(--ocean-100)] px-2.5 py-1 text-xs text-[var(--ocean-800)]">
        <span className="font-semibold">{tr("Đang xem:")}</span>
        {week ? (
          <span>
            {tr("Tuần {0}/{1}", week, weekYear)} · {ngayVn(weekRange.tu_ngay!)} → {ngayVn(new Date(Date.parse(weekRange.den_ngay!) - 86400000).toISOString().slice(0, 10))}
            {laTuanNay ? ` (${tr("tuần này")})` : ""} · {tr("tính theo ngày hoàn thành")}
          </span>
        ) : (
          <span>
            {tr("Tháng {0}", thangHienThi)}
            {filters.thang === CURRENT_MONTH_VALUE ? ` (${tr("tháng hiện tại")})` : ""}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 -mt-3 mb-4">
        <span className="text-xs font-semibold text-[var(--ink-400)]">Model:</span>
        <Select
          value={modelFilter}
          onChange={setModelFilter}
          options={[ALL_MODEL, ...(modelOptionsData?.nhomSanPham.filter((v): v is string => !!v) ?? [])]}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 -mt-2 mb-3">
        <span className="text-xs font-semibold text-[var(--ink-400)]">{tr("Cách tính SLA:")}</span>
        <SlaCheDoToggle value={sla.cheDo} onChange={sla.setCheDo} khoa={sla.khoa} />
        {sla.khoa && <span className="text-xs text-[var(--ink-400)]">{tr("SLA mới chỉ tính từ tháng 11/2026")}</span>}
      </div>
      <div className="flex flex-wrap gap-3 mb-4">
        <StatCard label={tr("Tổng số ca")} value={kpi?.total ?? 0} tone="ocean" sub={tr("{0} đã hoàn thành", kpi?.hoanThanh ?? 0)} />
        <StatCard
          label={laSlaMoi ? tr("Tỷ lệ đạt SLA mới") : tr("Tỷ lệ đạt SLA")}
          value={`${(laSlaMoi ? kpi?.tySlaMoi : kpi?.tySla) ?? 0}%`}
          tone="teal"
          sub={laSlaMoi ? tr("Không loại trừ · so với mốc SLA Odoo") : tr("Hẹn xử lý đúng hạn")}
        />
        <StatCard
          label={tr("Tỷ lệ xử lý ≤24h")}
          value={`${(laSlaMoi ? kpi?.ty24hMoi : kpi?.ty24h) ?? 0}%`}
          tone="ocean"
          sub={laSlaMoi ? tr("Giờ không loại trừ, từ lúc tiếp nhận") : tr("Từ lúc tiếp nhận")}
        />
        <StatCard label={tr("Ca tồn đọng")} value={kpi?.ton ?? 0} tone="amber" sub={tr("{0}% đã giải trình", kpi?.tyGiaiTrinh ?? 0)} />
        <StatCard label={tr("Nghi ngờ vi phạm")} value={kpi?.nghiNgo ?? 0} tone="coral" sub={tr("Vi phạm {0}% · Đã khảo sát {1}%", kpi?.tyViPham ?? 0, kpi?.tyDaKhaoSat ?? 0)} />
      </div>

      <Card className="p-4 mb-4">
        <div className="font-display font-bold text-sm mb-1">{laSlaMoi ? tr("10 KTV có tỷ lệ SLA mới thấp nhất") : tr("10 KTV có tỷ lệ SLA thấp nhất")}</div>
        <div className="text-xs text-[var(--ink-400)] mb-3">{tr("Chỉ xét KTV có từ 5 ca trở lên trong kỳ lọc hiện tại")}</div>
        <ChartCanvas
          type="bar"
          data={{
            labels: ktvRanked.map((r) => r.nhom),
            datasets: [{ label: tr("Tỷ lệ SLA (%)"), data: ktvRanked.map((r) => pct(r.sla_ok, r.dung_han_tinh)), backgroundColor: "#D84C4C", borderRadius: 6 }],
          }}
          options={{ indexAxis: "y" as const }}
        />
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="font-display font-bold text-sm">{tr("Bảng pivot phân tích đa chiều")}</div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--ink-400)] text-xs font-semibold">{tr("Nhóm theo:")}</span>
            <Select
              value={pivotDim}
              onChange={setPivotDim}
              options={[
                { value: "khu_vuc", label: tr("Khu vực") },
                { value: "tinh", label: tr("Tỉnh") },
                { value: "doi_tac", label: tr("Đối tác") },
                { value: "hang", label: tr("Hãng") },
                { value: "nhom_yeu_cau", label: tr("Nhóm yêu cầu") },
                { value: "ky_thuat_vien", label: "KTV" },
              ]}
            />
            {pivotDim === "ky_thuat_vien" && (
              <MultiSelectFilter label={NHAN_CAP_1[diaGioiLoc.mode]} value={pivotTinh} onChange={setPivotTinh} options={diaGioiLoc.tinhOptions} />
            )}
            {isPH && pivotDim === "ky_thuat_vien" && <label className="text-xs flex gap-1 items-center"><input type="checkbox" checked={collapseKtv} onChange={(e) => setCollapseKtv(e.target.checked)} />{tr("Thu gọn theo nhóm PH")}</label>}
            <Btn
              variant="ghost"
              size="sm"
              disabled={manTqQ.isFetching || ((!!pivotDgLoc || groupPH) && pivotLocTinhQ.isFetching)}
              onClick={() =>
                exportRowsToExcel(
                  sortedPivotRows.map((r) => ({
                    nhom: pivotDim === "khu_vuc" ? shortKhuVuc(r.nhom) : r.nhom,
                    ty_le_sla: `${pct(r.sla_ok, r.dung_han_tinh)}%`,
                    ty_le_24h: `${pct(r.duoi_24h_count, r.co_tinh_24h)}%`,
                    ...Object.fromEntries(([8, 24, 48, 72] as const).map((h) => [`ty_le_sla_${h}h`, r.co_tinh_gio ? `${pct(r[`sla_${h}h`], r.co_tinh_gio)}%` : "—"])),
                    co_tinh_gio: r.co_tinh_gio,
                    ty_le_nghi_ngo_vp: `${pct(r.nghi_ngo, r.total)}%`,
                    // "Ty le loi vi pham" dung chung nguon voi "Ty le nghi ngo VP" (nghi_ngo/total) -
                    // theo yeu cau bo sung cot rieng cho bao cao ngoai, khong phai 1 cach tinh khac.
                    ty_le_loi_vi_pham: `${pct(r.nghi_ngo, r.total)}%`,
                    total: r.total,
                    ht_tinh_kpi: r.ht_tinh_kpi,
                    sla_ok: r.sla_ok,
                    dung_han_tinh: r.dung_han_tinh,
                    duoi_24h_count: r.duoi_24h_count,
                    co_tinh_24h: r.co_tinh_24h,
                    nghi_ngo: r.nghi_ngo,
                    loi_120p: r.loi_120p,
                    loi_qua_han_24h: r.loi_qua_han_24h,
                    loi_lo_ke_hoach: r.loi_lo_ke_hoach,
                    loi_kh_hen_lai: r.loi_kh_hen_lai,
                  })),
                  `pivot_${pivotDim}${laSlaMoi ? "_sla_moi" : ""}.xlsx`,
                  "Data",
                  {
                    nhom: "Nhóm",
                    ty_le_sla: laSlaMoi ? "Tỷ lệ SLA mới (không loại trừ)" : "Tỷ lệ SLA",
                    ty_le_24h: "Tỷ lệ ≤24h",
                    ty_le_sla_8h: "Tỷ lệ SLA ≤8h", ty_le_sla_24h: "Tỷ lệ SLA ≤24h", ty_le_sla_48h: "Tỷ lệ SLA ≤48h", ty_le_sla_72h: "Tỷ lệ SLA ≤72h", co_tinh_gio: "Số ca có giờ xử lý hợp lệ",
                    ty_le_nghi_ngo_vp: "Tỷ lệ nghi ngờ VP",
                    ty_le_loi_vi_pham: "Tỷ lệ lỗi vi phạm",
                    total: "Số ca đã đóng",
                    ht_tinh_kpi: "Số ca HT tính KPIS",
                    sla_ok: "Đạt SLA",
                    dung_han_tinh: "Số ca tính SLA",
                    duoi_24h_count: "Đạt ≤24h",
                    co_tinh_24h: "Số ca tính ≤24h",
                    nghi_ngo: "Nghi ngờ vi phạm",
                    loi_120p: LOAI_LOI_META["Loi 120 phut"].label,
                    loi_qua_han_24h: LOAI_LOI_META["Hen qua 24h"].label,
                    loi_lo_ke_hoach: LOAI_LOI_META["Loi lo ke hoach"].label,
                    loi_kh_hen_lai: LOAI_LOI_META["KH hen lai"].label,
                  },
                )
              }
            >
              {tr("⬇ Xuất Excel")}</Btn>
          </div>
        </div>
        <p className="text-xs text-[var(--ink-400)] mb-2">
          {laSlaMoi
            ? tr("Đang xem SLA MỚI (không loại trừ): giờ từ lúc tiếp nhận đến đóng ca; Đúng hạn khi giờ < mốc SLA Odoo, ca không có mốc dùng SLA cũ. SLA ≤Xh và ≤24h tính trên giờ không loại trừ.")
            : tr("SLA 8/24/48/72h: ca tính KPI đã hoàn thành, có số giờ xử lý hợp lệ (0–8760h); cùng mẫu số, không ước lượng khi thiếu giờ. Tỷ lệ ≤24h cũ dùng bucket CRM.")}
        </p>
        <div className="overflow-x-auto">
          <table className="dense w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                <th className="py-2 pr-3">{tr("Nhóm")}</th>
                <th className="py-2 pr-3">{tr("Tỷ lệ SLA")}</th>
                <th className="py-2 pr-3">{tr("Tỷ lệ ≤24h")}</th>
                {[8, 24, 48, 72].map((h) => <th key={h} className="py-2 pr-3">SLA ≤{h}h</th>)}
                <th className="py-2 pr-3">{tr("Tỷ lệ nghi ngờ VP")}</th>
                <th className="py-2 pr-3 border-l border-[var(--line)] pl-3">{tr("Số ca đã đóng")}</th>
                <th className="py-2 pr-3">{tr("Số ca HT tính KPIS")}</th>
                <th className="py-2 pr-3">{tr("Đạt SLA")}</th>
                <th className="py-2 pr-3">{tr("Đạt ≤24h")}</th>
                {LOAI_LOI_KEYS.map((k) => (
                  <th key={k} className="py-2 pr-3">
                    {LOAI_LOI_META[k].short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedPivotRows.length > 0 && (
                <tr className="border-b border-[var(--line)] bg-slate-50 font-bold">
                  <td className="py-2 pr-3">{tr("Tổng cộng")}</td>
                  <td className="py-2 pr-3 font-mono">{pct(pivotTotal.sla_ok, pivotTotal.dung_han_tinh)}%</td>
                  <td className="py-2 pr-3 font-mono">{pct(pivotTotal.duoi_24h_count, pivotTotal.co_tinh_24h)}%</td>
                  {([8, 24, 48, 72] as const).map((h) => <td key={h} className="py-2 pr-3 font-mono" title={tr("{0} ca có giờ xử lý", pivotTotal.co_tinh_gio)}>{pivotTotal.co_tinh_gio ? `${pct(pivotTotal[`sla_${h}h`], pivotTotal.co_tinh_gio)}%` : "—"}</td>)}
                  <td className="py-2 pr-3 font-mono">{pct(pivotTotal.nghi_ngo, pivotTotal.total)}%</td>
                  <td className="py-2 pr-3 border-l border-[var(--line)] pl-3 font-mono">{pivotTotal.total}</td>
                  <td className="py-2 pr-3 font-mono">{pivotTotal.ht_tinh_kpi}</td>
                  <td className="py-2 pr-3 font-mono">{pivotTotal.sla_ok}</td>
                  <td className="py-2 pr-3 font-mono">{pivotTotal.duoi_24h_count}</td>
                  <td className="py-2 pr-3 font-mono">{pivotTotal.loi_120p}</td>
                  <td className="py-2 pr-3 font-mono">{pivotTotal.loi_qua_han_24h}</td>
                  <td className="py-2 pr-3 font-mono">{pivotTotal.loi_lo_ke_hoach}</td>
                  <td className="py-2 pr-3 font-mono">{pivotTotal.loi_kh_hen_lai}</td>
                </tr>
              )}
              {sortedPivotRows.map((r) => (
                <tr key={r.nhom} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                  <td className="py-2 pr-3 font-semibold">{pivotDim === "khu_vuc" ? shortKhuVuc(r.nhom) : r.nhom}</td>
                  <td className="py-2 pr-3 font-mono">{pct(r.sla_ok, r.dung_han_tinh)}%</td>
                  <td className="py-2 pr-3 font-mono">{pct(r.duoi_24h_count, r.co_tinh_24h)}%</td>
                  {([8, 24, 48, 72] as const).map((h) => <td key={h} className="py-2 pr-3 font-mono" title={tr("{0} ca có giờ xử lý", r.co_tinh_gio)}>{r.co_tinh_gio ? `${pct(r[`sla_${h}h`], r.co_tinh_gio)}%` : "—"}</td>)}
                  <td className="py-2 pr-3 font-mono">{pct(r.nghi_ngo, r.total)}%</td>
                  <td className="py-2 pr-3 border-l border-[var(--line)] pl-3 font-mono">{r.total}</td>
                  <td className="py-2 pr-3 font-mono">{r.ht_tinh_kpi}</td>
                  <td className="py-2 pr-3 font-mono">{r.sla_ok}</td>
                  <td className="py-2 pr-3 font-mono">{r.duoi_24h_count}</td>
                  <td className="py-2 pr-3 font-mono">{r.loi_120p}</td>
                  <td className="py-2 pr-3 font-mono">{r.loi_qua_han_24h}</td>
                  <td className="py-2 pr-3 font-mono">{r.loi_lo_ke_hoach}</td>
                  <td className="py-2 pr-3 font-mono">{r.loi_kh_hen_lai}</td>
                </tr>
              ))}
              {sortedPivotRows.length === 0 && (
                <tr>
                  <td colSpan={12 + LOAI_LOI_KEYS.length} className="py-8 text-center text-[var(--ink-400)] text-sm">
                    {tr("Không có dữ liệu.")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {!sla.khoa && <SoSanhSlaCard rows={soSanhRows} nhanNhom={(n) => (pivotDim === "khu_vuc" ? shortKhuVuc(n) : n)} tenFile={`so_sanh_sla_${pivotDim}`} />}
    </div>
  );
}
