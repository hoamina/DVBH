import { useQuery } from "@tanstack/react-query";
import { Select } from "../components/ui/Select";
import { KhuVucFilterControl } from "./KhuVucFilterControl";
import { Btn } from "../components/ui/Btn";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { QLDVBH_FILTER_VALUE, CURRENT_MONTH_VALUE } from "../constants";

export interface DashboardFilters {
  khu_vuc: string;
  hang: string;
  thang: string;
}

export const ALL_KHU_VUC = "Tất cả khu vực";
export const ALL_HANG = "Tất cả hãng";
export const ALL_THANG = "Tất cả các tháng";

export function FilterBar({
  filters,
  setFilters,
  onExport,
}: {
  filters: DashboardFilters;
  setFilters: (f: DashboardFilters) => void;
  onExport?: () => void;
}) {
  const auth = useAuth();
  const myAreas = auth.status === "authenticated" ? auth.user.khu_vuc_phu_trach : [];

  const { data } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ khuVuc: string[]; hang: string[] }>("/dashboard/filters"),
  });
  const { data: monthsData } = useQuery({
    queryKey: ["dashboard-months"],
    queryFn: () => api.get<{ months: string[] }>("/dashboard/months"),
  });

  const khuVucOptions = [
    ALL_KHU_VUC,
    { value: QLDVBH_FILTER_VALUE, label: "Tất cả QLDVBH (MB/MN...)" },
    ...(data?.khuVuc ?? []),
  ];
  const thangOptions = [
    ALL_THANG,
    { value: CURRENT_MONTH_VALUE, label: "Tháng hiện tại" },
    ...(monthsData?.months ?? []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <KhuVucFilterControl value={filters.khu_vuc} onChange={(v) => setFilters({ ...filters, khu_vuc: v })} options={khuVucOptions} myAreas={myAreas} />
      <Select value={filters.hang} onChange={(v) => setFilters({ ...filters, hang: v })} options={[ALL_HANG, ...(data?.hang ?? [])]} />
      <Select value={filters.thang} onChange={(v) => setFilters({ ...filters, thang: v })} options={thangOptions} />
      {onExport && (
        <div className="ml-auto">
          <Btn variant="ghost" size="sm" onClick={onExport}>
            ⬇ Xuất Excel
          </Btn>
        </div>
      )}
    </div>
  );
}
