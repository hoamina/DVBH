import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { StatCard } from "../components/ui/StatCard";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { ChartCanvas } from "../components/chart/ChartCanvas";
import { FilterBar, ALL_KHU_VUC, ALL_HANG, type DashboardFilters } from "../components/FilterBar";
import { CURRENT_MONTH_VALUE } from "../constants";
import { api, buildQuery } from "../api/client";
import { fmtVND } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { shortKhuVuc } from "../lib/khuVucShortLabel";

interface RevenueByDim {
  totals: { tong: number; dt_san_pham: number; dt_linh_kien: number; dt_dich_vu: number };
  byDim: { nhom: string; so_ca: number; doanh_thu: number }[];
}

export function RevenueModule() {
  const [filters, setFilters] = useLocalStorageState<DashboardFilters>("filters:revenue", { khu_vuc: ALL_KHU_VUC, hang: ALL_HANG, thang: CURRENT_MONTH_VALUE });
  const filterParams = {
    khu_vuc: filters.khu_vuc !== ALL_KHU_VUC ? filters.khu_vuc : undefined,
    hang: filters.hang !== ALL_HANG ? filters.hang : undefined,
    thang: filters.thang,
  };

  const { data: byKhuVuc } = useQuery({
    queryKey: ["revenue-khuvuc", filterParams],
    queryFn: () => api.get<RevenueByDim>(`/revenue${buildQuery({ ...filterParams, dim: "khu_vuc" })}`),
  });
  const { data: byHang } = useQuery({
    queryKey: ["revenue-hang", filterParams],
    queryFn: () => api.get<RevenueByDim>(`/revenue${buildQuery({ ...filterParams, dim: "hang" })}`),
  });
  const { data: byKtv } = useQuery({
    queryKey: ["revenue-ktv", filterParams],
    queryFn: () => api.get<RevenueByDim>(`/revenue${buildQuery({ ...filterParams, dim: "ky_thuat_vien" })}`),
  });

  const totals = byKhuVuc?.totals;

  // Dong "Tong cong" dau bang KTV - cong so_ca/doanh_thu tren cac dong dang hien, tinh lai "DT trung
  // binh/ca" tu tong (khong cong trung binh cua trung binh tung dong).
  const ktvTotal = useMemo(() => {
    const rows = byKtv?.byDim ?? [];
    const soCa = rows.reduce((acc, r) => acc + r.so_ca, 0);
    const doanhThu = rows.reduce((acc, r) => acc + r.doanh_thu, 0);
    return { soCa, doanhThu };
  }, [byKtv]);

  // Cot dau tien (Ky thuat vien) sap A-Z.
  const sortedKtvRows = [...(byKtv?.byDim ?? [])].sort((a, b) => a.nhom.localeCompare(b.nhom, "vi"));

  return (
    <div className="anim-in">
      <FilterBar filters={filters} setFilters={setFilters} />
      <div className="flex flex-wrap gap-3 mb-4">
        <StatCard label="Tổng doanh thu" value={fmtVND(totals?.tong)} tone="ocean" />
        <StatCard label="DT sản phẩm" value={fmtVND(totals?.dt_san_pham)} tone="teal" />
        <StatCard label="DT linh kiện" value={fmtVND(totals?.dt_linh_kien)} tone="amber" />
        <StatCard label="DT dịch vụ" value={fmtVND(totals?.dt_dich_vu)} tone="coral" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card className="p-4">
          <div className="font-display font-bold text-sm mb-3">Doanh thu theo khu vực</div>
          <ChartCanvas
            type="bar"
            data={{ labels: (byKhuVuc?.byDim ?? []).map((x) => shortKhuVuc(x.nhom)), datasets: [{ label: "Doanh thu", data: (byKhuVuc?.byDim ?? []).map((x) => x.doanh_thu), backgroundColor: "#1591C9", borderRadius: 6 }] }}
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
          <div className="font-display font-bold text-sm">Doanh thu theo kỹ thuật viên</div>
          <Btn
            variant="ghost"
            size="sm"
            onClick={() =>
              exportRowsToExcel(sortedKtvRows, "doanh_thu_ky_thuat_vien.xlsx", "Data", {
                nhom: "Kỹ thuật viên",
                so_ca: "Số ca",
                doanh_thu: "Doanh thu",
              })
            }
          >
            ⬇ Xuất Excel
          </Btn>
        </div>
        <table className="dense w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
              <th className="py-2 pr-3">Kỹ thuật viên</th>
              <th className="py-2 pr-3">Số ca</th>
              <th className="py-2 pr-3">Doanh thu</th>
              <th className="py-2 pr-3">DT trung bình / ca</th>
            </tr>
          </thead>
          <tbody>
            {sortedKtvRows.length > 0 && (
              <tr className="border-b border-[var(--line)] bg-slate-50 font-bold">
                <td className="py-2 pr-3">Tổng cộng</td>
                <td className="py-2 pr-3 font-mono">{ktvTotal.soCa}</td>
                <td className="py-2 pr-3 font-mono">{fmtVND(ktvTotal.doanhThu)}</td>
                <td className="py-2 pr-3 font-mono">{ktvTotal.soCa ? fmtVND(Math.round(ktvTotal.doanhThu / ktvTotal.soCa)) : fmtVND(0)}</td>
              </tr>
            )}
            {sortedKtvRows.map((r) => (
              <tr key={r.nhom} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                <td className="py-2 pr-3 font-semibold">{r.nhom}</td>
                <td className="py-2 pr-3 font-mono">{r.so_ca}</td>
                <td className="py-2 pr-3 font-mono">{fmtVND(r.doanh_thu)}</td>
                <td className="py-2 pr-3 font-mono">{fmtVND(Math.round(r.doanh_thu / r.so_ca))}</td>
              </tr>
            ))}
            {sortedKtvRows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-[var(--ink-400)] text-sm">
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
