import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs } from "../components/ui/Tabs";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { StatCard } from "../components/ui/StatCard";
import { ChartCanvas } from "../components/chart/ChartCanvas";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { ClosedCasesTab } from "../components/ClosedCasesTab";
import { api, buildQuery } from "../api/client";
import { fmtDateTime, type CaseRow, type Paged } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { useAuth } from "../auth/AuthContext";
import { QLDVBH_FILTER_VALUE } from "../constants";

interface TongTonStats {
  tong: number;
  tren1: number;
  tren3: number;
  tren7: number;
  tren14: number;
  daGiaiTrinh: number;
}

interface BacklogStats {
  tongTon: TongTonStats;
  aging: { duoi1: number; tu1den3: number; tu3den7: number; tu7den14: number; tren14: number };
  byReason: { ly_do: string; n: number }[];
}

interface CanGiaiTrinhCounts {
  can_giai_trinh_tong: number;
  lo_ke_hoach: number;
  tai_giai_trinh: number;
  chua_gt_3_ngay: number;
  chua_gt_5_ngay: number;
  dieu_hoa: number;
  b2b: number;
  da_giai_trinh: number;
}

interface KhuVucRow {
  nhom: string;
  tong_ton: number;
  tren_3: number;
  tren_7: number;
  tren_14: number;
  da_giai_trinh: number;
  can_giai_trinh_tong: number;
  lo_ke_hoach: number;
  cho_giai_trinh_lai: number;
  chua_gt_3_ngay: number;
  chua_gt_5_ngay: number;
  dieu_hoa_1_ngay: number;
  b2b_1_ngay: number;
  thieu_linh_kien: number;
}

interface FiltersData {
  khuVuc: string[];
  hang: string[];
  tinh: string[];
  doiTac: string[];
  nhomSanPham: string[];
  nhomKh: string[];
  nganh: string[];
}

const REPORT_DIM_OPTIONS = [
  { value: "khu_vuc", label: "Khu vực" },
  { value: "tinh", label: "Tỉnh" },
  { value: "doi_tac", label: "Đối tác" },
  { value: "hang", label: "Hãng" },
  { value: "nhom_san_pham", label: "Model" },
  { value: "nhom_kh", label: "Nhóm KH" },
  { value: "nganh", label: "Ngành" },
];

// Cac bo loc dung chung cho CA the bao cao (bieu do + bang pivot + danh sach chi tiet) - moi field
// map thang toi 1 cot REPORT_DIMS ben backend (xem filterParams.ts sharedReportFilters). "khu_vuc"
// rieng vi co gia tri ao QLDVBH_FILTER_VALUE.
const FILTER_FIELDS: { key: string; label: string; optionsKey: keyof FiltersData }[] = [
  { key: "tinh", label: "Tỉnh", optionsKey: "tinh" },
  { key: "doi_tac", label: "Đối tác", optionsKey: "doiTac" },
  { key: "hang", label: "Hãng", optionsKey: "hang" },
  { key: "nhom_san_pham", label: "Model", optionsKey: "nhomSanPham" },
  { key: "nhom_kh", label: "Nhóm KH", optionsKey: "nhomKh" },
  { key: "nganh", label: "Ngành", optionsKey: "nganh" },
];

const VIEWS = [
  { key: "bao-cao", label: "Báo cáo" },
  { key: "danh-sach", label: "Danh sách chi tiết" },
];

// "Nhom" thay the ca TABS (tab don) lan AGE_BUCKETS (loc tuoi) truoc day - 1 dieu khien duy nhat
// cho danh sach chi tiet, dung chung dinh nghia voi cac tile bao cao (needGiaiTrinh.ts o backend).
const NHOM_OPTIONS = [
  { value: "ton-hien-tai", label: "Tổng tồn hiện tại" },
  { value: "can-giai-trinh:tong", label: "Cần giải trình (tổng)" },
  { value: "can-giai-trinh:lo_ke_hoach", label: "— Lỡ kế hoạch" },
  { value: "can-giai-trinh:tai_giai_trinh", label: "— Cần tái giải trình" },
  { value: "can-giai-trinh:chua_gt_3_ngay", label: "— Chưa giải trình >3 ngày (cảnh báo sớm)" },
  { value: "can-giai-trinh:chua_gt_5_ngay", label: "— Chưa giải trình >5 ngày (ưu tiên xử lý)" },
  { value: "can-giai-trinh:dieu_hoa", label: "— Điều hòa >1 ngày" },
  { value: "can-giai-trinh:b2b", label: "— B2B >1 ngày" },
  { value: "da-giai-trinh", label: "Đã giải trình" },
  { value: "da-dong", label: "Ca đã đóng" },
];

const TON_TUOI_OPTIONS = [
  { value: "", label: "Tất cả tuổi tồn" },
  { value: "1", label: "Trên 1 ngày" },
  { value: "3", label: "Trên 3 ngày" },
  { value: "7", label: "Trên 7 ngày" },
  { value: "14", label: "Trên 14 ngày" },
];

export function BacklogModule({ openCase }: { openCase: (id: string) => void }) {
  const auth = useAuth();
  const myAreas = auth.status === "authenticated" ? auth.user.khu_vuc_phu_trach : [];
  const [view, setView] = useState("bao-cao");
  const [page, setPage] = useState(1);
  const [reportDim, setReportDim] = useState("khu_vuc");
  const [nhomKey, setNhomKey] = useState("can-giai-trinh:tong");
  const [dsTuoiTu, setDsTuoiTu] = useState("");
  const [idSearch, setIdSearch] = useState("");

  const [khuVucFilter, setKhuVucFilter] = useState("");
  const [dimFilters, setDimFilters] = useState<Record<string, string>>({
    tinh: "",
    doi_tac: "",
    hang: "",
    nhom_san_pham: "",
    nhom_kh: "",
    nganh: "",
  });
  const pageSize = 10;

  const sharedFilterParams = { khu_vuc: khuVucFilter, ...dimFilters };

  const [dsTab, dsCategory] = nhomKey.split(":");

  const { data: filtersData } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<FiltersData>("/dashboard/filters"),
  });
  const { data: stats } = useQuery({
    queryKey: ["backlog-stats", sharedFilterParams],
    queryFn: () => api.get<BacklogStats>(`/cases/backlog-stats${buildQuery(sharedFilterParams)}`),
  });
  const { data: counts } = useQuery({
    queryKey: ["backlog-counts", sharedFilterParams],
    queryFn: () => api.get<CanGiaiTrinhCounts>(`/cases/counts${buildQuery(sharedFilterParams)}`),
  });
  const { data: khuVucStats } = useQuery({
    queryKey: ["backlog-by-khu-vuc", reportDim, sharedFilterParams],
    queryFn: () => api.get<{ rows: KhuVucRow[] }>(`/cases/backlog-by-khu-vuc${buildQuery({ dim: reportDim, ...sharedFilterParams })}`),
  });

  const listParams = {
    tab: dsTab,
    category: dsTab === "can-giai-trinh" ? dsCategory : undefined,
    tuoi_tu: dsTab === "ton-hien-tai" ? dsTuoiTu || undefined : undefined,
    id: idSearch || undefined,
    page,
    pageSize,
    ...sharedFilterParams,
  };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["backlog-list", listParams],
    queryFn: () => api.get<Paged<CaseRow>>(`/cases${buildQuery(listParams)}`),
    enabled: view === "danh-sach" && dsTab !== "da-dong",
  });

  function goToDanhSach(nhom: string, tuoiTu?: string) {
    setNhomKey(nhom);
    setDsTuoiTu(tuoiTu ?? "");
    setIdSearch("");
    setPage(1);
    setView("danh-sach");
  }

  // Drill-down tu 1 dong bang pivot: gan gia tri dong do vao dung bo loc chung ung voi cot dang
  // nhom (vd dang nhom theo "tinh" -> bam dong "Ha Noi" se set bo loc Tinh = "Ha Noi"), roi chuyen
  // sang Danh sach chi tiet voi nhom/tuoi tuong ung.
  function drillDown(value: string, nhom: string, tuoiTu?: string) {
    if (reportDim === "khu_vuc") {
      setKhuVucFilter(value);
    } else {
      setDimFilters((f) => ({ ...f, [reportDim]: value }));
    }
    goToDanhSach(nhom, tuoiTu);
  }

  async function handleExport() {
    const all = await api.get<{ rows: CaseRow[] }>(`/cases${buildQuery({ ...listParams, page: undefined, pageSize: undefined, export: true })}`);
    await exportRowsToExcel(all.rows, "quan_ly_ton.xlsx");
  }

  const columns: Column<CaseRow>[] = [
    { key: "id", header: "ID", render: (c) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{c.id}</span> },
    { key: "khach_hang", header: "Khách hàng", render: (c) => c.khach_hang ?? "—" },
    { key: "khu_vuc", header: "Khu vực", render: (c) => c.khu_vuc ?? "—" },
    { key: "tiep_nhan", header: "Tiếp nhận", render: (c) => <span className="text-xs">{fmtDateTime(c.thoi_gian_cskh_tiep_nhan)}</span> },
    { key: "du_kien", header: "Dự kiến HT", render: (c) => <span className="text-xs">{fmtDateTime(c.last_ngay_du_kien_hoan_thanh)}</span> },
    {
      key: "ly_do",
      header: "Lý do tồn gần nhất",
      render: (c) => (c.last_ly_do_cham ? <Badge tone="ocean">{c.last_ly_do_cham}</Badge> : <span className="text-[var(--ink-400)] text-xs italic">Chưa giải trình</span>),
    },
    { key: "action", header: "", render: () => <span className="text-[var(--ocean-500)] text-xs font-semibold">Xem / giải trình →</span> },
  ];

  const closedColumns: Column<CaseRow>[] = [
    { key: "id", header: "ID", render: (c) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{c.id}</span> },
    { key: "khach_hang", header: "Khách hàng", render: (c) => c.khach_hang ?? "—" },
    { key: "khu_vuc", header: "Khu vực", render: (c) => c.khu_vuc ?? "—" },
    { key: "hoan_thanh", header: "Hoàn thành", render: (c) => <span className="text-xs">{fmtDateTime(c.thoi_gian_hoan_thanh)}</span> },
    {
      key: "ly_do",
      header: "Lý do tồn gần nhất",
      render: (c) => (c.last_ly_do_cham ? <Badge tone="ocean">{c.last_ly_do_cham}</Badge> : <span className="text-[var(--ink-400)] text-xs italic">Chưa giải trình</span>),
    },
    { key: "action", header: "", render: () => <span className="text-[var(--ocean-500)] text-xs font-semibold">Xem →</span> },
  ];

  const tongTon = stats?.tongTon;
  const aging = stats?.aging;
  const byReason = stats?.byReason ?? [];

  return (
    <div className="anim-in">
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <KhuVucFilterControl
          value={khuVucFilter}
          onChange={setKhuVucFilter}
          options={[
            { value: "", label: "Tất cả khu vực" },
            { value: QLDVBH_FILTER_VALUE, label: "Tất cả DVBH (MB/MN...)" },
            ...(filtersData?.khuVuc.map((k) => ({ value: k, label: k })) ?? []),
          ]}
          myAreas={myAreas}
        />
        {FILTER_FIELDS.map((f) => (
          <Select
            key={f.key}
            value={dimFilters[f.key]}
            onChange={(v) => setDimFilters((prev) => ({ ...prev, [f.key]: v }))}
            options={[{ value: "", label: `Tất cả ${f.label.toLowerCase()}` }, ...(filtersData?.[f.optionsKey].map((v) => ({ value: v, label: v })) ?? [])]}
          />
        ))}
      </div>

      <Tabs active={view} onChange={setView} tabs={VIEWS} />

      {view === "bao-cao" ? (
        <>
          <div className="mb-1 mt-4 text-xs font-semibold text-[var(--ink-400)] uppercase tracking-wide">Tồn hiện tại</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <StatCard label="Tổng tồn hiện tại" value={tongTon?.tong ?? 0} tone="ocean" onClick={() => goToDanhSach("ton-hien-tai")} />
            <StatCard label="Tồn trên 1 ngày" value={tongTon?.tren1 ?? 0} tone="teal" onClick={() => goToDanhSach("ton-hien-tai", "1")} />
            <StatCard label="Tồn trên 3 ngày" value={tongTon?.tren3 ?? 0} tone="amber" onClick={() => goToDanhSach("ton-hien-tai", "3")} />
            <StatCard label="Tồn trên 7 ngày" value={tongTon?.tren7 ?? 0} tone="amber" onClick={() => goToDanhSach("ton-hien-tai", "7")} />
            <StatCard label="Tồn trên 14 ngày" value={tongTon?.tren14 ?? 0} tone="coral" onClick={() => goToDanhSach("ton-hien-tai", "14")} />
            <StatCard label="Đã giải trình" value={tongTon?.daGiaiTrinh ?? 0} tone="teal" onClick={() => goToDanhSach("da-giai-trinh")} />
          </div>

          <div className="mb-1 text-xs font-semibold text-[var(--ink-400)] uppercase tracking-wide">Cần giải trình</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
            <StatCard label="Tổng cần giải trình" value={counts?.can_giai_trinh_tong ?? 0} tone="coral" onClick={() => goToDanhSach("can-giai-trinh:tong")} />
            <StatCard label="Lỡ kế hoạch" value={counts?.lo_ke_hoach ?? 0} tone="coral" onClick={() => goToDanhSach("can-giai-trinh:lo_ke_hoach")} />
            <StatCard label="Cần tái giải trình" value={counts?.tai_giai_trinh ?? 0} tone="amber" onClick={() => goToDanhSach("can-giai-trinh:tai_giai_trinh")} />
            <StatCard label="Chưa giải trình >3 ngày (cảnh báo sớm)" value={counts?.chua_gt_3_ngay ?? 0} tone="amber" onClick={() => goToDanhSach("can-giai-trinh:chua_gt_3_ngay")} />
            <StatCard label="Chưa giải trình >5 ngày (ưu tiên xử lý)" value={counts?.chua_gt_5_ngay ?? 0} tone="coral" onClick={() => goToDanhSach("can-giai-trinh:chua_gt_5_ngay")} />
            <StatCard label="Điều hòa >1 ngày" value={counts?.dieu_hoa ?? 0} tone="ocean" onClick={() => goToDanhSach("can-giai-trinh:dieu_hoa")} />
            <StatCard label="B2B >1 ngày" value={counts?.b2b ?? 0} tone="ocean" onClick={() => goToDanhSach("can-giai-trinh:b2b")} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card className="p-4">
              <div className="font-display font-bold text-sm mb-3">Phân bố tuổi ca tồn</div>
              <ChartCanvas
                type="bar"
                data={{
                  labels: ["Dưới 1 ngày", "1–3 ngày", "3–7 ngày", "7–14 ngày", "Trên 14 ngày"],
                  datasets: [
                    {
                      label: "Số ca",
                      data: [aging?.duoi1 ?? 0, aging?.tu1den3 ?? 0, aging?.tu3den7 ?? 0, aging?.tu7den14 ?? 0, aging?.tren14 ?? 0],
                      backgroundColor: ["#159C93", "#1591C9", "#D98A1F", "#D98A1F", "#D84C4C"],
                      borderRadius: 6,
                    },
                  ],
                }}
              />
            </Card>
            <Card className="p-4">
              <div className="font-display font-bold text-sm mb-3">Cơ cấu ca tồn theo lý do chậm gần nhất</div>
              <ChartCanvas
                type="doughnut"
                height={220}
                data={{
                  labels: byReason.map((r) => r.ly_do),
                  datasets: [{ data: byReason.map((r) => r.n), backgroundColor: ["#1591C9", "#159C93", "#D98A1F", "#D84C4C", "#8B5CF6", "#EC4899", "#64748B", "#22C55E", "#F59E0B", "#0EA5E9"] }],
                }}
              />
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <div className="font-display font-bold text-sm">Báo cáo tồn theo {REPORT_DIM_OPTIONS.find((d) => d.value === reportDim)?.label.toLowerCase()}</div>
                <div className="text-xs text-[var(--ink-400)] mt-0.5">Bấm vào 1 ô số để lọc thẳng xuống danh sách chi tiết.</div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Select value={reportDim} onChange={setReportDim} options={REPORT_DIM_OPTIONS} />
                <Btn variant="ghost" size="sm" onClick={() => exportRowsToExcel(khuVucStats?.rows ?? [], "bao_cao_ton.xlsx")}>
                  ⬇ Xuất Excel
                </Btn>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="dense w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                    <th className="py-2 pr-3">{REPORT_DIM_OPTIONS.find((d) => d.value === reportDim)?.label}</th>
                    <th className="py-2 pr-3">Tổng tồn</th>
                    <th className="py-2 pr-3">Trên 3 ngày</th>
                    <th className="py-2 pr-3">Trên 7 ngày</th>
                    <th className="py-2 pr-3">Trên 14 ngày</th>
                    <th className="py-2 pr-3 border-l border-[var(--line)] pl-3">Đã giải trình</th>
                    <th className="py-2 pr-3 border-l border-[var(--line)] pl-3 font-bold">Cần giải trình (tổng)</th>
                    <th className="py-2 pr-3">Lỡ kế hoạch</th>
                    <th className="py-2 pr-3">Tái giải trình</th>
                    <th className="py-2 pr-3">Chưa GT &gt;3 ngày</th>
                    <th className="py-2 pr-3">Chưa GT &gt;5 ngày</th>
                    <th className="py-2 pr-3">Điều hòa &gt;1 ngày</th>
                    <th className="py-2 pr-3">B2B &gt;1 ngày</th>
                    <th className="py-2 pr-3">Thiếu linh kiện</th>
                  </tr>
                </thead>
                <tbody>
                  {(khuVucStats?.rows ?? []).map((r) => (
                    <tr key={r.nhom} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                      <td className="py-2 pr-3 font-semibold">{r.nhom}</td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.nhom, "ton-hien-tai", "1")}>
                          {r.tong_ton}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.nhom, "ton-hien-tai", "3")}>
                          {r.tren_3}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.nhom, "ton-hien-tai", "7")}>
                          {r.tren_7}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.nhom, "ton-hien-tai", "14")}>
                          {r.tren_14}
                        </button>
                      </td>
                      <td className="py-2 pr-3 border-l border-[var(--line)] pl-3 font-mono">{r.da_giai_trinh}</td>
                      <td className="py-2 pr-3 border-l border-[var(--line)] pl-3 font-mono font-bold">
                        <button className="text-[var(--coral-600)] hover:underline" onClick={() => drillDown(r.nhom, "can-giai-trinh:tong")}>
                          {r.can_giai_trinh_tong}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.nhom, "can-giai-trinh:lo_ke_hoach")}>
                          {r.lo_ke_hoach}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.nhom, "can-giai-trinh:tai_giai_trinh")}>
                          {r.cho_giai_trinh_lai}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.nhom, "can-giai-trinh:chua_gt_3_ngay")}>
                          {r.chua_gt_3_ngay}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.nhom, "can-giai-trinh:chua_gt_5_ngay")}>
                          {r.chua_gt_5_ngay}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.nhom, "can-giai-trinh:dieu_hoa")}>
                          {r.dieu_hoa_1_ngay}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.nhom, "can-giai-trinh:b2b")}>
                          {r.b2b_1_ngay}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono">{r.thieu_linh_kien}</td>
                    </tr>
                  ))}
                  {(khuVucStats?.rows ?? []).length === 0 && (
                    <tr>
                      <td colSpan={14} className="py-8 text-center text-[var(--ink-400)] text-sm">
                        Không có dữ liệu.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-xs font-semibold text-[var(--ink-400)]">Nhóm:</span>
            <Select
              value={nhomKey}
              onChange={(v) => {
                setNhomKey(v);
                setDsTuoiTu("");
                setPage(1);
              }}
              options={NHOM_OPTIONS}
            />
            {dsTab === "ton-hien-tai" && (
              <Select
                value={dsTuoiTu}
                onChange={(v) => {
                  setDsTuoiTu(v);
                  setPage(1);
                }}
                options={TON_TUOI_OPTIONS}
              />
            )}
            {dsTab !== "da-dong" && (
              <input
                type="text"
                value={idSearch}
                onChange={(e) => {
                  setIdSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm theo ID…"
                className="focus-ring w-40 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            )}
            {dsTab !== "da-dong" && (
              <div className="ml-auto">
                <Btn variant="ghost" size="sm" onClick={handleExport}>
                  ⬇ Xuất Excel
                </Btn>
              </div>
            )}
          </div>
          {dsTab === "da-dong" ? (
            <ClosedCasesTab<CaseRow>
              cacheKeyPrefix="backlog-da-dong"
              buildUrl={(thang) => `/cases${buildQuery({ tab: "da-dong", thang, id: idSearch || undefined, ...sharedFilterParams })}`}
              columns={closedColumns}
              rowKey={(c) => c.id}
              onRowClick={(c) => openCase(c.id)}
            />
          ) : (
            <PaginatedTable
              columns={columns}
              rows={data?.rows ?? []}
              isLoading={isLoading}
              isError={isError}
              onRetry={refetch}
              page={page}
              pageSize={pageSize}
              total={data?.total ?? 0}
              onPageChange={setPage}
              onRowClick={(c) => openCase(c.id)}
              rowKey={(c) => c.id}
              emptyText="Không có ca nào trong nhóm này."
            />
          )}
        </div>
      )}
    </div>
  );
}
