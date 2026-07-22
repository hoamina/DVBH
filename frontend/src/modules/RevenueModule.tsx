import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StatCard } from "../components/ui/StatCard";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { ChartCanvas } from "../components/chart/ChartCanvas";
import { FilterBar, ALL_KHU_VUC, ALL_HANG, ALL_THANG, type DashboardFilters } from "../components/FilterBar";
import { CURRENT_MONTH_VALUE } from "../constants";
import { api, buildQuery } from "../api/client";
import { fmtVND } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";

interface RevenueByDim {
  totals: { tong: number; dt_san_pham: number; dt_linh_kien: number; dt_dich_vu: number };
  byDim: { nhom: string; so_ca: number; doanh_thu: number }[];
}
interface GiamSatRow {
  giam_sat_email: string;
  giam_sat: string | null;
  khu_vuc: string;
  so_ca: number;
  doanh_thu: number;
}
interface RevenueTrendRow {
  thang: string;
  doanh_thu: number;
}

export function RevenueModule() {
  const [filters, setFilters] = useState<DashboardFilters>({ khu_vuc: ALL_KHU_VUC, hang: ALL_HANG, thang: CURRENT_MONTH_VALUE });
  const filterParams = {
    khu_vuc: filters.khu_vuc !== ALL_KHU_VUC ? filters.khu_vuc : undefined,
    hang: filters.hang !== ALL_HANG ? filters.hang : undefined,
    thang: filters.thang !== ALL_THANG ? filters.thang : undefined,
  };

  const { data: byKhuVuc } = useQuery({
    queryKey: ["revenue-khuvuc", filterParams],
    queryFn: () => api.get<RevenueByDim>(`/revenue${buildQuery({ ...filterParams, dim: "khu_vuc" })}`),
  });
  const { data: byHang } = useQuery({
    queryKey: ["revenue-hang", filterParams],
    queryFn: () => api.get<RevenueByDim>(`/revenue${buildQuery({ ...filterParams, dim: "hang" })}`),
  });
  const { data: giamSat } = useQuery({
    queryKey: ["revenue-giamsat", filterParams],
    queryFn: () => api.get<{ rows: GiamSatRow[] }>(`/revenue/giam-sat${buildQuery(filterParams)}`),
  });
  const { data: trend } = useQuery({
    queryKey: ["revenue-trend", filters.khu_vuc, filters.hang],
    queryFn: () =>
      api.get<{ rows: RevenueTrendRow[] }>(`/revenue/trend${buildQuery({ khu_vuc: filterParams.khu_vuc, hang: filterParams.hang, months: 12 })}`),
  });

  const totals = byKhuVuc?.totals;
  const trendRows = trend?.rows ?? [];

  return (
    <div className="anim-in">
      <FilterBar filters={filters} setFilters={setFilters} />
      <div className="flex flex-wrap gap-3 mb-4">
        <StatCard label="Tổng doanh thu" value={fmtVND(totals?.tong)} tone="ocean" />
        <StatCard label="DT sản phẩm" value={fmtVND(totals?.dt_san_pham)} tone="teal" />
        <StatCard label="DT linh kiện" value={fmtVND(totals?.dt_linh_kien)} tone="amber" />
        <StatCard label="DT dịch vụ" value={fmtVND(totals?.dt_dich_vu)} tone="coral" />
      </div>
      <Card className="p-4 mb-4">
        <div className="font-display font-bold text-sm mb-3">Xu hướng doanh thu theo tháng (12 tháng gần nhất)</div>
        <ChartCanvas
          type="line"
          data={{
            labels: trendRows.map((r) => r.thang),
            datasets: [{ label: "Doanh thu", data: trendRows.map((r) => r.doanh_thu), borderColor: "#D98A1F", backgroundColor: "rgba(217,138,31,0.12)", tension: 0.3, fill: true, pointRadius: 3 }],
          }}
        />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card className="p-4">
          <div className="font-display font-bold text-sm mb-3">Doanh thu theo khu vực</div>
          <ChartCanvas
            type="bar"
            data={{ labels: (byKhuVuc?.byDim ?? []).map((x) => x.nhom), datasets: [{ label: "Doanh thu", data: (byKhuVuc?.byDim ?? []).map((x) => x.doanh_thu), backgroundColor: "#1591C9", borderRadius: 6 }] }}
          />
        </Card>
        <Card className="p-4">
          <div className="font-display font-bold text-sm mb-3">Doanh thu theo hãng</div>
          <ChartCanvas
            type="bar"
            data={{ labels: (byHang?.byDim ?? []).map((x) => x.nhom), datasets: [{ label: "Doanh thu", data: (byHang?.byDim ?? []).map((x) => x.doanh_thu), backgroundColor: "#159C93", borderRadius: 6 }] }}
          />
        </Card>
      </div>
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-display font-bold text-sm">Doanh thu theo Giám sát</div>
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => exportRowsToExcel(giamSat?.rows ?? [], "doanh_thu_giam_sat.xlsx")}
          >
            ⬇ Xuất Excel
          </Btn>
        </div>
        <table className="dense w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
              <th className="py-2 pr-3">Giám sát</th>
              <th className="py-2 pr-3">Khu vực</th>
              <th className="py-2 pr-3">Số ca</th>
              <th className="py-2 pr-3">Doanh thu</th>
              <th className="py-2 pr-3">DT trung bình / ca</th>
            </tr>
          </thead>
          <tbody>
            {(giamSat?.rows ?? []).map((r) => (
              <tr key={`${r.giam_sat_email}-${r.khu_vuc}`} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                <td className="py-2 pr-3 font-semibold">{r.giam_sat ?? r.giam_sat_email}</td>
                <td className="py-2 pr-3">{r.khu_vuc}</td>
                <td className="py-2 pr-3 font-mono">{r.so_ca}</td>
                <td className="py-2 pr-3 font-mono">{fmtVND(r.doanh_thu)}</td>
                <td className="py-2 pr-3 font-mono">{fmtVND(Math.round(r.doanh_thu / r.so_ca))}</td>
              </tr>
            ))}
            {(giamSat?.rows ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[var(--ink-400)] text-sm">
                  Không có dữ liệu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
