import { useMemo, useState } from "react";
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
import { MultiSelectFilter } from "../components/MultiSelectFilter";

// Ten tinh giua 2 nguon lech nhau (CRM "Cần Thơ" / Odoo "Thành phố Cần Thơ", "Tỉnh Hoà Bình", Huế 2 cach ghi) - gom ve
// 1 ten de loc. Ca 2 nguon deu dung 63 tinh cu (do thuc te 2026-10-09).
function chuanHoaTinh(t: string | null): string {
  let s = (t ?? "").normalize("NFC").trim().replace(/^(Tỉnh|Thành phố|TP\.?)\s+/i, "").replace(/Hoà/g, "Hòa");
  if (s === "Thừa Thiên Huế") s = "Huế";
  return s || "(Không rõ tỉnh)";
}

interface RevenueKtvTinhRow {
  nhom: string;
  tinh: string | null;
  so_ca: number;
  doanh_thu: number;
}

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

  // Bo loc Tinh rieng cho bang KTV (2026-10-09). Chua chon tinh -> giu nguyen so lieu cu (dim ky_thuat_vien, dong bo
  // bao cao 08:00); chon tinh -> cong tu dim "ky_thuat_vien_tinh" (KTV x tinh) da chuan hoa ten tinh.
  const [tinhFilter, setTinhFilter] = useState("");
  const { data: byKtvTinh } = useQuery({
    queryKey: ["revenue-ktv-tinh", filterParams],
    queryFn: () => api.get<{ byDim: RevenueKtvTinhRow[] }>(`/revenue${buildQuery({ ...filterParams, dim: "ky_thuat_vien_tinh" })}`),
  });
  const tinhOptions = useMemo(
    () => [...new Set((byKtvTinh?.byDim ?? []).map((r) => chuanHoaTinh(r.tinh)))].sort((a, b) => a.localeCompare(b, "vi")),
    [byKtvTinh],
  );
  const tinhChon = useMemo(() => new Set(tinhFilter.split("|").filter(Boolean)), [tinhFilter]);
  const ktvRows = useMemo(() => {
    if (tinhChon.size === 0) return byKtv?.byDim ?? [];
    const gom = new Map<string, { nhom: string; so_ca: number; doanh_thu: number }>();
    for (const r of byKtvTinh?.byDim ?? []) {
      if (!tinhChon.has(chuanHoaTinh(r.tinh))) continue;
      const g = gom.get(r.nhom) ?? { nhom: r.nhom, so_ca: 0, doanh_thu: 0 };
      g.so_ca += r.so_ca;
      g.doanh_thu += r.doanh_thu ?? 0;
      gom.set(r.nhom, g);
    }
    return [...gom.values()];
  }, [tinhChon, byKtv, byKtvTinh]);

  const totals = byKhuVuc?.totals;

  // Dong "Tong cong" dau bang KTV - cong so_ca/doanh_thu tren cac dong dang hien, tinh lai "DT trung
  // binh/ca" tu tong (khong cong trung binh cua trung binh tung dong).
  const ktvTotal = useMemo(() => {
    const rows = ktvRows;
    const soCa = rows.reduce((acc, r) => acc + r.so_ca, 0);
    const doanhThu = rows.reduce((acc, r) => acc + r.doanh_thu, 0);
    return { soCa, doanhThu };
  }, [ktvRows]);

  // Cot dau tien (Ky thuat vien) sap A-Z.
  const sortedKtvRows = [...ktvRows].sort((a, b) => a.nhom.localeCompare(b.nhom, "vi"));

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
          <div className="font-display font-bold text-sm">
            Doanh thu theo kỹ thuật viên
            {tinhChon.size > 0 && <span className="ml-2 text-xs font-semibold text-[var(--ocean-600)]">· {[...tinhChon].join(", ")}</span>}
          </div>
          <div className="flex items-center gap-2">
            <MultiSelectFilter label="Tỉnh" value={tinhFilter} onChange={setTinhFilter} options={tinhOptions} />
            <Btn
              variant="ghost"
              size="sm"
              onClick={() =>
                exportRowsToExcel(
                  sortedKtvRows.map((r) => ({ ...r, ...(tinhChon.size > 0 ? { tinh: [...tinhChon].join(", ") } : {}) })),
                  tinhChon.size > 0 ? "doanh_thu_ky_thuat_vien_theo_tinh.xlsx" : "doanh_thu_ky_thuat_vien.xlsx",
                  "Data",
                  { nhom: "Kỹ thuật viên", so_ca: "Số ca", doanh_thu: "Doanh thu", tinh: "Tỉnh (bộ lọc)" },
                )
              }
            >
              ⬇ Xuất Excel
            </Btn>
          </div>
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
