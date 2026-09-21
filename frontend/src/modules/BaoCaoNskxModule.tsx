import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "../components/ui/Card";
import { StatCard } from "../components/ui/StatCard";
import { Select } from "../components/ui/Select";
import { Tabs } from "../components/ui/Tabs";
import { ChartCanvas } from "../components/chart/ChartCanvas";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { api, buildQuery } from "../api/client";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { useAuth } from "../auth/AuthContext";
import { QLDVBH_FILTER_VALUE, CURRENT_MONTH_VALUE } from "../constants";
import { shortKhuVuc } from "../lib/khuVucShortLabel";

const ALL_KHU_VUC = "Tất cả khu vực";

interface BaoCaoNskxFilters {
  thang: string;
  khu_vuc: string;
}

interface TongQuanPayload {
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

interface DaChieuRow {
  nhom: string;
  total: number;
  sla_ok: number;
  dung_han_tinh: number;
  nghi_ngo: number;
}

interface AgingPayload {
  bucket0_1: number;
  bucket2_3: number;
  bucket4Plus: number;
}

interface XuHuongPayload {
  rows: { ngay: string; soCa: number }[];
}

const DIM_OPTIONS = [
  { value: "khu_vuc", label: "Khu vực" },
  { value: "ky_thuat_vien", label: "Kỹ thuật viên" },
];

export function BaoCaoNskxModule() {
  const auth = useAuth();
  const myAreas = auth.status === "authenticated" ? auth.user.khu_vuc_phu_trach : [];
  const [tab, setTab] = useState<"tong-quan" | "da-chieu" | "aging">("tong-quan");
  const [filters, setFilters] = useLocalStorageState<BaoCaoNskxFilters>("filters:bao-cao-nskx", {
    thang: CURRENT_MONTH_VALUE,
    khu_vuc: ALL_KHU_VUC,
  });
  const [dim, setDim] = useLocalStorageState<string>("filters:bao-cao-nskx:dim", "khu_vuc");

  const apiParams = {
    thang: filters.thang !== CURRENT_MONTH_VALUE ? filters.thang : undefined,
    khu_vuc: filters.khu_vuc !== ALL_KHU_VUC ? filters.khu_vuc : undefined,
  };

  const { data: filterOptions } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ khuVuc: string[] }>("/dashboard/filters"),
  });
  const { data: monthOptions } = useQuery({
    queryKey: ["dashboard-months"],
    queryFn: () => api.get<{ months: string[] }>("/dashboard/months"),
  });

  const khuVucOptions = [
    ALL_KHU_VUC,
    { value: QLDVBH_FILTER_VALUE, label: "Tất cả QLDVBH (MB/MN...)" },
    ...(filterOptions?.khuVuc ?? []).map((k) => ({ value: k, label: k })),
  ];
  const thangOptions = [{ value: CURRENT_MONTH_VALUE, label: "Tháng hiện tại" }, ...(monthOptions?.months ?? [])];

  const { data: tongQuan } = useQuery({
    queryKey: ["bao-cao-nskx-tong-quan", apiParams],
    queryFn: () => api.get<TongQuanPayload>(`/bao-cao-nskx/tong-quan${buildQuery(apiParams)}`),
  });
  const { data: xuHuong } = useQuery({
    queryKey: ["bao-cao-nskx-xu-huong"],
    queryFn: () => api.get<XuHuongPayload>("/bao-cao-nskx/xu-huong"),
    enabled: tab === "tong-quan",
  });
  const { data: daChieu } = useQuery({
    queryKey: ["bao-cao-nskx-da-chieu", apiParams, dim],
    queryFn: () => api.get<{ rows: DaChieuRow[] }>(`/bao-cao-nskx/da-chieu${buildQuery({ ...apiParams, dim })}`),
    enabled: tab === "da-chieu",
  });
  const { data: aging } = useQuery({
    queryKey: ["bao-cao-nskx-aging", apiParams],
    queryFn: () => api.get<AgingPayload>(`/bao-cao-nskx/aging${buildQuery(apiParams)}`),
    enabled: tab === "aging",
  });

  const dimLabel = DIM_OPTIONS.find((o) => o.value === dim)?.label ?? "Nhóm";
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");

  return (
    <div className="anim-in">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <KhuVucFilterControl value={filters.khu_vuc} onChange={(v) => setFilters({ ...filters, khu_vuc: v })} options={khuVucOptions} myAreas={myAreas} />
        <Select value={filters.thang} onChange={(v) => setFilters({ ...filters, thang: v })} options={thangOptions} />
      </div>

      <Tabs
        tabs={[
          { key: "tong-quan", label: "Tổng quan" },
          { key: "da-chieu", label: "Đa chiều" },
          { key: "aging", label: "Phân bố tuổi" },
        ]}
        active={tab}
        onChange={(k) => setTab(k as typeof tab)}
      />

      {tab === "tong-quan" && (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            <StatCard label="Tổng số ca NSKX" value={tongQuan?.total ?? 0} tone="ocean" sub={`${tongQuan?.hoanThanh ?? 0} đã hoàn thành`} />
            <StatCard label="Tỷ lệ đạt SLA" value={`${tongQuan?.tySla ?? 0}%`} tone="teal" sub="Hẹn xử lý đúng hạn" />
            <StatCard label="Tỷ lệ xử lý ≤24h" value={`${tongQuan?.ty24h ?? 0}%`} tone="ocean" sub="Từ lúc tiếp nhận" />
            <StatCard label="Ca tồn đọng" value={tongQuan?.ton ?? 0} tone="amber" sub={`${tongQuan?.tyGiaiTrinh ?? 0}% đã giải trình`} muted={!tongQuan?.ton} />
            <StatCard label="Nghi ngờ vi phạm" value={tongQuan?.nghiNgo ?? 0} tone="coral" sub={`Vi phạm ${tongQuan?.tyViPham ?? 0}% · Đã khảo sát ${tongQuan?.tyDaKhaoSat ?? 0}%`} muted={!tongQuan?.nghiNgo} />
          </div>
          <Card className="p-4">
            <div className="font-display font-bold text-sm mb-3">Xu hướng số ca NSKX cần giải trình (≥2 ngày, 30 ngày gần nhất)</div>
            {(xuHuong?.rows ?? []).length === 0 ? (
              <div className="py-8 text-center text-[var(--ink-400)] text-sm">Chưa có dữ liệu lịch sử.</div>
            ) : (
              <ChartCanvas
                type="line"
                data={{
                  labels: (xuHuong?.rows ?? []).map((r) => r.ngay.slice(5)),
                  datasets: [
                    {
                      label: "Số ca cần giải trình",
                      data: (xuHuong?.rows ?? []).map((r) => r.soCa),
                      borderColor: "#E8604C",
                      backgroundColor: "#E8604C",
                      tension: 0.25,
                    },
                  ],
                }}
              />
            )}
          </Card>
        </>
      )}

      {tab === "da-chieu" && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="font-display font-bold text-sm">Phân tích theo</div>
            <Select value={dim} onChange={setDim} options={DIM_OPTIONS} />
          </div>
          <ChartCanvas
            type="bar"
            height={240}
            data={{
              labels: (daChieu?.rows ?? []).map((r) => (dim === "khu_vuc" ? shortKhuVuc(r.nhom) : r.nhom)),
              datasets: [{ label: "Tổng số ca", data: (daChieu?.rows ?? []).map((r) => r.total), backgroundColor: "#0F3D5C", borderRadius: 6 }],
            }}
          />
          <table className="dense w-full text-sm mt-4">
            <thead>
              <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                <th className="py-2 pr-3">{dimLabel}</th>
                <th className="py-2 pr-3">Tổng số ca</th>
                <th className="py-2 pr-3">Tỷ lệ SLA</th>
                <th className="py-2 pr-3">Nghi ngờ vi phạm</th>
              </tr>
            </thead>
            <tbody>
              {(daChieu?.rows ?? []).map((r) => (
                <tr key={r.nhom} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                  <td className="py-2 pr-3 font-semibold">{dim === "khu_vuc" ? shortKhuVuc(r.nhom) : r.nhom}</td>
                  <td className="py-2 pr-3 font-mono">{r.total}</td>
                  <td className="py-2 pr-3 font-mono">{pct(r.sla_ok, r.dung_han_tinh)}</td>
                  <td className="py-2 pr-3 font-mono">{r.nghi_ngo}</td>
                </tr>
              ))}
              {(daChieu?.rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[var(--ink-400)] text-sm">
                    Không có dữ liệu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "aging" && (
        <Card className="p-4">
          <div className="font-display font-bold text-sm mb-3">Phân bố tuổi ca NSKX đang tồn</div>
          <ChartCanvas
            type="bar"
            height={240}
            data={{
              labels: ["0-1 ngày", "2-3 ngày", "≥4 ngày"],
              datasets: [
                {
                  label: "Số ca",
                  data: [aging?.bucket0_1 ?? 0, aging?.bucket2_3 ?? 0, aging?.bucket4Plus ?? 0],
                  backgroundColor: ["#159C93", "#E8B03D", "#E8604C"],
                  borderRadius: 6,
                },
              ],
            }}
            options={{ plugins: { legend: { display: false } } }}
          />
        </Card>
      )}
    </div>
  );
}
