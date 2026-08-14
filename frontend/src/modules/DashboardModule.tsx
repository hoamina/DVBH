import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { shortKhuVuc } from "../lib/khuVucShortLabel";

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
  tyGiaiTrinh: number;
  tyViPham: number;
  tyDaKhaoSat: number;
}

interface PivotRow {
  nhom: string;
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
}

function pct(a: number, b: number) {
  return b ? Math.round((a / b) * 1000) / 10 : 0;
}

const ALL_MODEL = "Tất cả Model";

export function DashboardModule({ onNavigate }: { onNavigate?: (module: string) => void } = {}) {
  const [filters, setFilters] = useLocalStorageState<DashboardFilters>("filters:dashboard", { khu_vuc: ALL_KHU_VUC, hang: ALL_HANG, thang: CURRENT_MONTH_VALUE });
  const [pivotDim, setPivotDim] = useLocalStorageState("filters:dashboard-pivot-dim", "khu_vuc");
  // CHOT 2026-08-12: bo loc "Model" rieng cho the "Tong quan" (khong dua vao FilterBar/DashboardFilters
  // dung chung voi RevenueModule - tranh hien Select thua o Bao cao doanh thu, noi khong ai yeu cau) -
  // ap dung dong thoi cho ca "Filter tong" (kpi) lan "Bang pivot phan tich da chieu" qua filterParams.
  const [modelFilter, setModelFilter] = useLocalStorageState("filters:dashboard-model", ALL_MODEL);

  const { data: dailyReport } = useQuery({
    queryKey: ["daily-report"],
    queryFn: () => api.get<DailyReport>("/dashboard/daily-report"),
  });
  const { data: modelOptionsData } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ nhomSanPham: (string | null)[] }>("/dashboard/filters"),
  });

  const filterParams = {
    khu_vuc: filters.khu_vuc !== ALL_KHU_VUC ? filters.khu_vuc : undefined,
    hang: filters.hang !== ALL_HANG ? filters.hang : undefined,
    thang: filters.thang,
    nhom_san_pham: modelFilter !== ALL_MODEL ? modelFilter : undefined,
  };
  const query = buildQuery(filterParams);

  const { data: kpi } = useQuery({ queryKey: ["dashboard-kpis", query], queryFn: () => api.get<Kpis>(`/dashboard/kpis${query}`) });
  const { data: pivot } = useQuery({
    queryKey: ["dashboard-pivot", pivotDim, query],
    queryFn: () => api.get<{ rows: PivotRow[] }>(`/dashboard/pivot${buildQuery({ ...filterParams, dim: pivotDim })}`),
  });
  const { data: pivotKtv } = useQuery({
    queryKey: ["dashboard-pivot", "ky_thuat_vien", query],
    queryFn: () => api.get<{ rows: PivotRow[] }>(`/dashboard/pivot${buildQuery({ ...filterParams, dim: "ky_thuat_vien" })}`),
  });

  // Dong "Tong cong" dau bang pivot - cong don cac cot so tren cac dong dang hien (tu doi theo
  // pivotDim/bo loc hien tai), roi tinh lai 3 cot ty le tu tong tu so/mau so (khong cong trung binh
  // % tung dong).
  const pivotTotal = useMemo(() => {
    const rows = pivot?.rows ?? [];
    const sum = (key: keyof PivotRow) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
    return {
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
  const sortedPivotRows = [...(pivot?.rows ?? [])].sort((a, b) => a.nhom.localeCompare(b.nhom, "vi"));

  // KTV chi xet nhung ai co du luong (>=5 ca) de tranh nhieu do mau nho, lay top 10 nhieu ca nhat sap theo ty le SLA tang dan (thap nhat truoc)
  const ktvRanked = [...(pivotKtv?.rows ?? [])]
    .filter((r) => r.total >= 5)
    .sort((a, b) => pct(a.sla_ok, a.dung_han_tinh) - pct(b.sla_ok, b.dung_han_tinh))
    .slice(0, 10);

  return (
    <div className="anim-in">
      {dailyReport && (
        <Card className="p-4 mb-4 border-[var(--coral-500)]/40 bg-gradient-to-br from-[var(--coral-100)]/50 to-transparent">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <div className="font-display font-bold text-sm flex items-center gap-2">
              📊 Báo cáo nhanh vấn đề trong ngày
              {dailyReport.scope === "khu_vuc" && dailyReport.khuVucList.length > 0 && (
                <span className="text-xs font-normal text-[var(--ink-400)]">— {dailyReport.khuVucList.map(shortKhuVuc).join(", ")}</span>
              )}
            </div>
          </div>
          <div className="text-xs text-[var(--ink-400)] mb-3">
            Báo cáo được cập nhật lúc: {fmtGeneratedAt(dailyReport.generatedAt)} bởi{" "}
            {dailyReport.generatedBy === "auto" ? "tự động" : dailyReport.generatedBy}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <button onClick={() => onNavigate?.("backlog")} className="focus-ring text-left rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 hover:border-[var(--coral-500)] transition-colors">
              <div className="text-xs text-[var(--ink-400)] mb-1">Tồn &gt;3 ngày cần giải trình</div>
              <div className="text-xl font-bold text-[var(--coral-500)]">{dailyReport.tonCanGiaiTrinh.remaining}</div>
              <div className="text-[11px] text-[var(--ink-400)] mt-0.5">
                Đầu ngày: {dailyReport.tonCanGiaiTrinh.baseline} · Đã xử lý: {dailyReport.tonCanGiaiTrinh.resolved}
              </div>
            </button>
            <button onClick={() => onNavigate?.("missing-parts")} className="focus-ring text-left rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 hover:border-[var(--amber-500)] transition-colors">
              <div className="text-xs text-[var(--ink-400)] mb-1">Ca thiếu linh kiện tồn đọng</div>
              <div className="text-xl font-bold text-[var(--amber-500)]">{dailyReport.thieuLinhKien.remaining}</div>
              <div className="text-[11px] text-[var(--ink-400)] mt-0.5">
                Đầu ngày: {dailyReport.thieuLinhKien.baseline} · Đã xử lý: {dailyReport.thieuLinhKien.resolved}
              </div>
            </button>
            <button onClick={() => onNavigate?.("ca-lap")} className="focus-ring text-left rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 hover:border-[var(--coral-500)] transition-colors">
              <div className="text-xs text-[var(--ink-400)] mb-1">Ca lặp cần xử lý</div>
              <div className="text-xl font-bold text-[var(--coral-500)]">{dailyReport.caLap.remaining}</div>
              <div className="text-[11px] text-[var(--ink-400)] mt-0.5">
                Đầu ngày: {dailyReport.caLap.baseline} · Đã xử lý: {dailyReport.caLap.resolved}
              </div>
            </button>
            <button onClick={() => onNavigate?.("survey")} className="focus-ring text-left rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 hover:border-[var(--coral-500)] transition-colors">
              <div className="text-xs text-[var(--ink-400)] mb-1">Ca cần khảo sát</div>
              <div className="text-xl font-bold text-[var(--coral-500)]">{dailyReport.canKhaoSat.remaining}</div>
              <div className="text-[11px] text-[var(--ink-400)] mt-0.5">
                Đầu ngày: {dailyReport.canKhaoSat.baseline} · Đã xử lý: {dailyReport.canKhaoSat.resolved}
              </div>
            </button>
            {dailyReport.doanhThuThang !== null && (
              <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                <div className="text-xs text-[var(--ink-400)] mb-1">Doanh thu tháng này</div>
                <div className="text-xl font-bold text-[var(--teal-500)]">{fmtVND(dailyReport.doanhThuThang)}</div>
              </div>
            )}
          </div>
        </Card>
      )}
      <FilterBar filters={filters} setFilters={setFilters} />
      <div className="flex flex-wrap items-center gap-2 -mt-3 mb-4">
        <span className="text-xs font-semibold text-[var(--ink-400)]">Model:</span>
        <Select
          value={modelFilter}
          onChange={setModelFilter}
          options={[ALL_MODEL, ...(modelOptionsData?.nhomSanPham.filter((v): v is string => !!v) ?? [])]}
        />
      </div>
      <div className="flex flex-wrap gap-3 mb-4">
        <StatCard label="Tổng số ca" value={kpi?.total ?? 0} tone="ocean" sub={`${kpi?.hoanThanh ?? 0} đã hoàn thành`} />
        <StatCard label="Tỷ lệ đạt SLA" value={`${kpi?.tySla ?? 0}%`} tone="teal" sub="Hẹn xử lý đúng hạn" />
        <StatCard label="Tỷ lệ xử lý ≤24h" value={`${kpi?.ty24h ?? 0}%`} tone="ocean" sub="Từ lúc tiếp nhận" />
        <StatCard label="Ca tồn đọng" value={kpi?.ton ?? 0} tone="amber" sub={`${kpi?.tyGiaiTrinh ?? 0}% đã giải trình`} />
        <StatCard label="Nghi ngờ vi phạm" value={kpi?.nghiNgo ?? 0} tone="coral" sub={`Vi phạm ${kpi?.tyViPham ?? 0}% · Đã khảo sát ${kpi?.tyDaKhaoSat ?? 0}%`} />
      </div>

      <Card className="p-4 mb-4">
        <div className="font-display font-bold text-sm mb-1">10 KTV có tỷ lệ SLA thấp nhất</div>
        <div className="text-xs text-[var(--ink-400)] mb-3">Chỉ xét KTV có từ 5 ca trở lên trong kỳ lọc hiện tại</div>
        <ChartCanvas
          type="bar"
          data={{
            labels: ktvRanked.map((r) => r.nhom),
            datasets: [{ label: "Tỷ lệ SLA (%)", data: ktvRanked.map((r) => pct(r.sla_ok, r.dung_han_tinh)), backgroundColor: "#D84C4C", borderRadius: 6 }],
          }}
          options={{ indexAxis: "y" as const }}
        />
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="font-display font-bold text-sm">Bảng pivot phân tích đa chiều</div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--ink-400)] text-xs font-semibold">Nhóm theo:</span>
            <Select
              value={pivotDim}
              onChange={setPivotDim}
              options={[
                { value: "khu_vuc", label: "Khu vực" },
                { value: "tinh", label: "Tỉnh" },
                { value: "doi_tac", label: "Đối tác" },
                { value: "hang", label: "Hãng" },
                { value: "ky_thuat_vien", label: "KTV" },
              ]}
            />
            <Btn
              variant="ghost"
              size="sm"
              onClick={() =>
                exportRowsToExcel(
                  pivotDim === "khu_vuc" ? sortedPivotRows.map((r) => ({ ...r, nhom: shortKhuVuc(r.nhom) })) : sortedPivotRows,
                  `pivot_${pivotDim}.xlsx`,
                  "Data",
                  {
                    nhom: "Nhóm",
                    sla_ok: "Đạt SLA",
                    dung_han_tinh: "Số ca tính SLA",
                    duoi_24h_count: "Đạt ≤24h",
                    co_tinh_24h: "Số ca tính ≤24h",
                    nghi_ngo: "Nghi ngờ vi phạm",
                    total: "Số ca đã đóng",
                    ht_tinh_kpi: "Số ca HT tính KPIS",
                    loi_120p: LOAI_LOI_META["Loi 120 phut"].label,
                    loi_qua_han_24h: LOAI_LOI_META["Hen qua 24h"].label,
                    loi_lo_ke_hoach: LOAI_LOI_META["Loi lo ke hoach"].label,
                    loi_kh_hen_lai: LOAI_LOI_META["KH hen lai"].label,
                  },
                )
              }
            >
              ⬇ Xuất Excel
            </Btn>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="dense w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                <th className="py-2 pr-3">Nhóm</th>
                <th className="py-2 pr-3">Tỷ lệ SLA</th>
                <th className="py-2 pr-3">Tỷ lệ ≤24h</th>
                <th className="py-2 pr-3">Tỷ lệ nghi ngờ VP</th>
                <th className="py-2 pr-3 border-l border-[var(--line)] pl-3">Số ca đã đóng</th>
                <th className="py-2 pr-3">Số ca HT tính KPIS</th>
                <th className="py-2 pr-3">Đạt SLA</th>
                <th className="py-2 pr-3">Đạt ≤24h</th>
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
                  <td className="py-2 pr-3">Tổng cộng</td>
                  <td className="py-2 pr-3 font-mono">{pct(pivotTotal.sla_ok, pivotTotal.dung_han_tinh)}%</td>
                  <td className="py-2 pr-3 font-mono">{pct(pivotTotal.duoi_24h_count, pivotTotal.co_tinh_24h)}%</td>
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
                  <td colSpan={8 + LOAI_LOI_KEYS.length} className="py-8 text-center text-[var(--ink-400)] text-sm">
                    Không có dữ liệu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
