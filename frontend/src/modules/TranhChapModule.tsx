import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { StatCard } from "../components/ui/StatCard";
import { Tabs } from "../components/ui/Tabs";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { api, buildQuery } from "../api/client";
import { fmtDateTime, type Paged } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { CASE_FIELD_LABELS } from "../lib/caseFieldLabels";
import { useAuth } from "../auth/AuthContext";
import { QLDVBH_FILTER_VALUE } from "../constants";

interface TranhChapCase {
  id: string;
  khach_hang: string | null;
  khu_vuc: string | null;
  last_ly_do_cham: string | null;
  thoi_gian_hoan_thanh: string | null;
  da_giai_trinh: number;
}

interface KhuVucRow {
  nhom: string;
  tong: number;
  da_giai_trinh: number;
  chua_giai_trinh: number;
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

const TRANG_THAI_OPTIONS = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "da-giai-trinh", label: "Đã giải trình" },
  { value: "chua-giai-trinh", label: "Chưa giải trình" },
];

const VIEWS = [
  { key: "tong-quan", label: "Tổng quan" },
  { key: "danh-sach", label: "Danh sách chi tiết" },
];

export function TranhChapModule({ openCase }: { openCase: (id: string) => void }) {
  const auth = useAuth();
  const myAreas = auth.status === "authenticated" ? auth.user.khu_vuc_phu_trach : [];
  const [view, setView] = useState("tong-quan");
  const [page, setPage] = useState(1);
  const [khuVucFilter, setKhuVucFilter] = useState("");
  const [reportDim, setReportDim] = useState("khu_vuc");
  const [drillDim, setDrillDim] = useState("khu_vuc");
  const [drillValue, setDrillValue] = useState("");
  const [trangThai, setTrangThai] = useState("");
  const [thang, setThang] = useState(() => new Date().toISOString().slice(0, 7));
  const pageSize = 10;

  // Chi gui dim/dim_value cho danh sach chi tiet khi drill-down tu 1 dong KHONG phai khu_vuc -
  // khu_vuc da co san co che loc rieng (khuVucFilter) tu truoc gio.
  const dimFilter = drillDim !== "khu_vuc" ? { dim: drillDim, dim_value: drillValue } : {};

  const { data: khuVucOptions } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ khuVuc: string[]; hang: string[] }>("/dashboard/filters"),
  });
  const { data: monthOptions } = useQuery({
    queryKey: ["dashboard-months"],
    queryFn: () => api.get<{ months: string[] }>("/dashboard/months"),
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["tranh-chap", page, khuVucFilter, thang, drillDim, drillValue, trangThai],
    queryFn: () =>
      api.get<Paged<TranhChapCase> & { chuaGiaiTrinh: number }>(
        `/tranh-chap${buildQuery({ page, pageSize, khu_vuc: khuVucFilter, thang, trang_thai: trangThai, ...dimFilter })}`,
      ),
    enabled: view === "danh-sach",
  });
  const { data: khuVucStats } = useQuery({
    queryKey: ["tranh-chap-by-khu-vuc", khuVucFilter, reportDim, thang],
    queryFn: () => api.get<{ rows: KhuVucRow[] }>(`/tranh-chap/by-khu-vuc${buildQuery({ khu_vuc: khuVucFilter, dim: reportDim, thang })}`),
    enabled: view === "tong-quan",
  });

  const tongQuanKpi = (khuVucStats?.rows ?? []).reduce(
    (acc, r) => ({ tong: acc.tong + r.tong, daGiaiTrinh: acc.daGiaiTrinh + r.da_giai_trinh, chuaGiaiTrinh: acc.chuaGiaiTrinh + r.chua_giai_trinh }),
    { tong: 0, daGiaiTrinh: 0, chuaGiaiTrinh: 0 },
  );

  function drillDown(value: string, trangThaiFilter?: string) {
    if (reportDim === "khu_vuc") {
      setKhuVucFilter(value);
      setDrillDim("khu_vuc");
      setDrillValue("");
    } else {
      setDrillDim(reportDim);
      setDrillValue(value);
    }
    setTrangThai(trangThaiFilter ?? "");
    setPage(1);
    setView("danh-sach");
  }

  // Bam StatCard "Chua giai trinh" (ca o Tong quan lan Danh sach chi tiet) -> chuyen sang Danh sach
  // chi tiet VOI filter chua-giai-trinh da ap san.
  function goToChuaGiaiTrinh() {
    setDrillDim("khu_vuc");
    setDrillValue("");
    setTrangThai("chua-giai-trinh");
    setPage(1);
    setView("danh-sach");
  }

  // Khop dung cot hien tren PaginatedTable "columns" ben duoi (rows thuc te la nguyen CaseRow +
  // cac field last_ly_do_cham/da_giai_trinh, xem SELECT_COLS o backend/src/routes/tranhChap.ts).
  const EXPORT_LABELS: Record<string, string> = {
    ...CASE_FIELD_LABELS,
    last_ly_do_cham: "Lý do quá hạn (tranh chấp)",
    da_giai_trinh: "Đã giải trình",
  };

  const KHU_VUC_EXPORT_LABELS: Record<string, string> = {
    nhom: REPORT_DIM_OPTIONS.find((d) => d.value === reportDim)?.label ?? "Nhóm",
    tong: "Tổng ca",
    da_giai_trinh: "Đã giải trình",
    chua_giai_trinh: "Chưa giải trình",
  };

  async function handleExport() {
    const all = await api.get<Paged<TranhChapCase>>(
      `/tranh-chap${buildQuery({ page: 1, pageSize: 5000, khu_vuc: khuVucFilter, thang, trang_thai: trangThai, ...dimFilter })}`,
    );
    await exportRowsToExcel(all.rows, `ca_tranh_chap_${thang}.xlsx`, "Data", EXPORT_LABELS);
  }

  const columns: Column<TranhChapCase>[] = [
    { key: "id", header: "ID", render: (c) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{c.id}</span> },
    { key: "khach_hang", header: "Khách hàng", render: (c) => c.khach_hang ?? "—" },
    { key: "khu_vuc", header: "Khu vực", render: (c) => c.khu_vuc ?? "—" },
    {
      key: "ly_do",
      header: "Lý do quá hạn (tranh chấp)",
      render: (c) => (c.last_ly_do_cham ? <Badge tone="coral">{c.last_ly_do_cham}</Badge> : <span className="text-[var(--ink-400)] text-xs italic">—</span>),
    },
    {
      key: "trang_thai_gt",
      header: "Trạng thái giải trình",
      render: (c) => (c.da_giai_trinh ? <Badge tone="ocean">Đã giải trình</Badge> : <Badge tone="coral">Chưa giải trình</Badge>),
    },
    { key: "hoan_thanh", header: "Hoàn thành", render: (c) => <span className="text-xs">{fmtDateTime(c.thoi_gian_hoan_thanh)}</span> },
    { key: "action", header: "", render: () => <span className="text-[var(--ocean-500)] text-xs font-semibold">Xem →</span> },
  ];

  const khuVucFilterSelect = (
    <KhuVucFilterControl
      value={khuVucFilter}
      onChange={(v) => {
        setKhuVucFilter(v);
        setPage(1);
      }}
      options={[
        { value: "", label: "Tất cả khu vực" },
        { value: QLDVBH_FILTER_VALUE, label: "Tất cả DVBH (MB/MN...)" },
        ...(khuVucOptions?.khuVuc.map((k) => ({ value: k, label: k })) ?? []),
      ]}
      myAreas={myAreas}
    />
  );
  const thangSelect = (
    <Select
      value={thang}
      onChange={(v) => {
        setThang(v);
        setPage(1);
      }}
      options={monthOptions?.months.map((m) => ({ value: m, label: m })) ?? [{ value: thang, label: thang }]}
    />
  );
  const trangThaiSelect = (
    <Select
      value={trangThai}
      onChange={(v) => {
        setTrangThai(v);
        setPage(1);
      }}
      options={TRANG_THAI_OPTIONS}
    />
  );

  return (
    <div className="anim-in">
      <div className="text-sm text-[var(--ink-600)] mb-4">
        Danh sách ca có <b>"Lý do quá hạn"</b> (điền bởi CRM khi đóng ca) thuộc nhóm được đánh dấu "thuộc tranh chấp" trong Settings — chỉ
        tính ca đã <b>đóng</b> (Hoàn thành XLSC hoặc Không hoàn thành XLSC), cố định theo lần import gần nhất — quản lý theo khu vực +
        tháng đóng, giống module Đánh giá nạp gas.
      </div>

      <Tabs active={view} onChange={setView} tabs={VIEWS} />

      {view === "tong-quan" ? (
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {khuVucFilterSelect}
            {thangSelect}
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <StatCard label="Tổng ca tranh chấp" value={tongQuanKpi.tong} tone="amber" sub="Đã đóng trong tháng đã chọn" />
            <StatCard label="Đã giải trình" value={tongQuanKpi.daGiaiTrinh} tone="teal" />
            <StatCard label="Chưa giải trình" value={tongQuanKpi.chuaGiaiTrinh} tone="coral" sub="Bấm để xem danh sách" onClick={goToChuaGiaiTrinh} />
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <div className="font-display font-bold text-sm">Báo cáo tranh chấp theo {REPORT_DIM_OPTIONS.find((d) => d.value === reportDim)?.label.toLowerCase()}</div>
                <div className="text-xs text-[var(--ink-400)] mt-0.5">Bấm vào 1 ô số để lọc thẳng xuống danh sách chi tiết.</div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={reportDim} onChange={setReportDim} options={REPORT_DIM_OPTIONS} />
                <Btn variant="ghost" size="sm" onClick={() => exportRowsToExcel(khuVucStats?.rows ?? [], `bao_cao_tranh_chap_${thang}.xlsx`, "Data", KHU_VUC_EXPORT_LABELS)}>
                  ⬇ Xuất Excel
                </Btn>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="dense w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                    <th className="py-2 pr-3">{REPORT_DIM_OPTIONS.find((d) => d.value === reportDim)?.label}</th>
                    <th className="py-2 pr-3">Tổng ca</th>
                    <th className="py-2 pr-3">Đã giải trình</th>
                    <th className="py-2 pr-3">Chưa giải trình</th>
                  </tr>
                </thead>
                <tbody>
                  {(khuVucStats?.rows ?? []).map((r) => (
                    <tr key={r.nhom} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                      <td className="py-2 pr-3 font-semibold">{r.nhom}</td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.nhom)}>
                          {r.tong}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.nhom, "da-giai-trinh")}>
                          {r.da_giai_trinh}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono" style={{ color: r.chua_giai_trinh > 0 ? "var(--coral-500)" : undefined }}>
                        <button className="hover:underline" onClick={() => drillDown(r.nhom, "chua-giai-trinh")}>
                          {r.chua_giai_trinh}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(khuVucStats?.rows ?? []).length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-[var(--ink-400)] text-sm">
                        Không có dữ liệu.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {khuVucFilterSelect}
            {thangSelect}
            {trangThaiSelect}
          </div>

          <div className="flex items-center justify-between mb-1">
            <div />
            <Btn variant="ghost" size="sm" onClick={handleExport}>
              ⬇ Xuất Excel
            </Btn>
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <StatCard label="Ca tranh chấp trong tháng" value={data?.total ?? 0} tone="amber" />
            <StatCard label="Chưa giải trình" value={data?.chuaGiaiTrinh ?? 0} tone="coral" onClick={goToChuaGiaiTrinh} />
          </div>

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
            emptyText="Không có ca tranh chấp trong tháng này."
          />
        </div>
      )}
    </div>
  );
}
