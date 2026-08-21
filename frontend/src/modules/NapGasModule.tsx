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
import { fmtDateTime, type Paged, NAP_GAS_DANH_GIA_META, NAP_GAS_PHI_DICH_VU_META, type NapGasDanhGiaLoai, type NapGasPhiDichVuLoai } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { CASE_FIELD_LABELS } from "../lib/caseFieldLabels";
import { useAuth } from "../auth/AuthContext";
import { QLDVBH_FILTER_VALUE } from "../constants";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { IdSerialSearchInput } from "../components/IdSerialSearchInput";
import { usePersonDirectory, formatPersonDisplay } from "../lib/personDisplay";

interface NapGasCase {
  id: string;
  khach_hang: string | null;
  khu_vuc: string | null;
  ky_thuat_vien: string | null;
  thoi_gian_hoan_thanh: string | null;
  danh_gia_nap_gas: NapGasDanhGiaLoai | null;
  phi_dich_vu: NapGasPhiDichVuLoai | null;
  nguoi_chot: string | null;
  ngay_chot: string | null;
  da_danh_gia: number;
}

interface KhuVucRow {
  nhom: string;
  tong: number;
  da_danh_gia: number;
  chua_danh_gia: number;
  tu_nap_gas: number;
  khong_nap_gas: number;
  gui_ve_hang_nap_gas: number;
  tu_nap_gas_thay_block: number;
  sua_chua_khac: number;
  kiem_tra: number;
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
  { value: "da-danh-gia", label: "Đã đánh giá" },
  { value: "chua-danh-gia", label: "Chưa đánh giá" },
];

// Cot phan loai danh gia nap gas trong bang bao cao theo khu vuc - moi phan tu 1 cot rieng, khop
// dung yeu cau "liet ke cac phan loai danh gia nap gas theo tung cot".
const DANH_GIA_BREAKDOWN_COLS: { key: keyof KhuVucRow; loai: NapGasDanhGiaLoai }[] = [
  { key: "tu_nap_gas", loai: "Tu nap gas" },
  { key: "khong_nap_gas", loai: "Khong nap gas" },
  { key: "gui_ve_hang_nap_gas", loai: "Gui ve Hang nap gas" },
  { key: "tu_nap_gas_thay_block", loai: "Tu nap gas thay Block" },
  { key: "sua_chua_khac", loai: "Sua chua khac" },
  { key: "kiem_tra", loai: "Kiem tra" },
];

const VIEWS = [
  { key: "tong-quan", label: "Tổng quan" },
  { key: "danh-sach", label: "Danh sách chi tiết" },
];

export function NapGasModule({ openCase }: { openCase: (id: string, tab?: string) => void }) {
  const personDir = usePersonDirectory();
  const auth = useAuth();
  const myAreas = auth.status === "authenticated" ? auth.user.khu_vuc_phu_trach : [];
  const [view, setView] = useLocalStorageState("filters:nap-gas-view", "tong-quan");
  const [page, setPage] = useState(1);
  const [khuVucFilter, setKhuVucFilter] = useLocalStorageState("filters:nap-gas-khu-vuc", "");
  const [reportDim, setReportDim] = useLocalStorageState("filters:nap-gas-report-dim", "khu_vuc");
  const [drillDim, setDrillDim] = useState("khu_vuc");
  const [drillValue, setDrillValue] = useState("");
  const [trangThai, setTrangThai] = useLocalStorageState("filters:nap-gas-trang-thai", "");
  const [thang, setThang] = useLocalStorageState("filters:nap-gas-thang", new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7));
  const [idSearch, setIdSearch] = useState("");
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
    queryKey: ["nap-gas", page, khuVucFilter, thang, drillDim, drillValue, trangThai, idSearch],
    queryFn: () =>
      api.get<Paged<NapGasCase> & { chuaDanhGia: number }>(
        `/nap-gas${buildQuery({ page, pageSize, khu_vuc: khuVucFilter, thang, trang_thai: trangThai, id: idSearch || undefined, ...dimFilter })}`,
      ),
    enabled: view === "danh-sach",
  });
  const { data: khuVucStats } = useQuery({
    queryKey: ["nap-gas-by-khu-vuc", khuVucFilter, reportDim, thang],
    queryFn: () => api.get<{ rows: KhuVucRow[] }>(`/nap-gas/by-khu-vuc${buildQuery({ khu_vuc: khuVucFilter, dim: reportDim, thang })}`),
    enabled: view === "tong-quan",
  });

  // Cot dau tien sap A-Z.
  const sortedKhuVucRows = [...(khuVucStats?.rows ?? [])].sort((a, b) => a.nhom.localeCompare(b.nhom, "vi"));

  const tongQuanKpi = sortedKhuVucRows.reduce(
    (acc, r) => ({ tong: acc.tong + r.tong, daDanhGia: acc.daDanhGia + r.da_danh_gia, chuaDanhGia: acc.chuaDanhGia + r.chua_danh_gia }),
    { tong: 0, daDanhGia: 0, chuaDanhGia: 0 },
  );

  // Dong "Tong cong" dau bang - cong don tat ca cot so (bao gom cac cot phan loai danh gia) tren cac
  // dong dang hien.
  const khuVucTotalBreakdown = Object.fromEntries(
    DANH_GIA_BREAKDOWN_COLS.map((col) => [col.key, sortedKhuVucRows.reduce((acc, r) => acc + (Number(r[col.key]) || 0), 0)]),
  ) as Record<string, number>;

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

  // Bam StatCard "Chua danh gia" (ca o Tong quan lan Danh sach chi tiet) -> chuyen sang Danh sach
  // chi tiet VOI filter chua-danh-gia da ap san, khop yeu cau "an vao nut ca chua danh gia se
  // chuyen sang filter danh sach chua danh gia nap gas".
  function goToChuaDanhGia() {
    setDrillDim("khu_vuc");
    setDrillValue("");
    setTrangThai("chua-danh-gia");
    setPage(1);
    setView("danh-sach");
  }

  // Khop dung cot hien tren PaginatedTable "columns" ben duoi (rows thuc te la nguyen CaseRow +
  // cac field danh_gia_nap_gas/phi_dich_vu/nguoi_chot/ngay_chot/da_danh_gia, xem SELECT_COLS o
  // backend/src/routes/napGas.ts).
  const EXPORT_LABELS: Record<string, string> = {
    ...CASE_FIELD_LABELS,
    danh_gia_nap_gas: "Đánh giá nạp gas",
    phi_dich_vu: "Phí dịch vụ",
    nguoi_chot: "Người chốt",
    ngay_chot: "Ngày chốt",
    da_danh_gia: "Đã đánh giá",
  };

  const KHU_VUC_EXPORT_LABELS: Record<string, string> = {
    nhom: REPORT_DIM_OPTIONS.find((d) => d.value === reportDim)?.label ?? "Nhóm",
    tong: "Tổng ca",
    da_danh_gia: "Đã đánh giá",
    chua_danh_gia: "Chưa đánh giá",
    ...Object.fromEntries(DANH_GIA_BREAKDOWN_COLS.map((col) => [col.key, NAP_GAS_DANH_GIA_META[col.loai].label])),
  };

  async function handleExport() {
    const all = await api.get<Paged<NapGasCase>>(
      `/nap-gas${buildQuery({ page: 1, pageSize: 5000, khu_vuc: khuVucFilter, thang, trang_thai: trangThai, id: idSearch || undefined, ...dimFilter })}`,
    );
    await exportRowsToExcel(all.rows.map((r) => ({ ...r, khu_vuc: shortKhuVuc(r.khu_vuc) })), `danh_gia_nap_gas_${thang}.xlsx`, "Data", EXPORT_LABELS);
  }

  const columns: Column<NapGasCase>[] = [
    { key: "id", header: "ID", render: (c) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{c.id}</span> },
    { key: "khach_hang", header: "Khách hàng", render: (c) => c.khach_hang ?? "—" },
    { key: "ky_thuat_vien", header: "Kỹ thuật viên", render: (c) => <span className="text-xs">{c.ky_thuat_vien ?? "—"}</span> },
    {
      key: "danh_gia_nap_gas",
      header: "Đánh giá nạp gas",
      render: (c) => (c.danh_gia_nap_gas ? <Badge tone="ocean">{NAP_GAS_DANH_GIA_META[c.danh_gia_nap_gas].label}</Badge> : <Badge tone="coral">Chưa đánh giá</Badge>),
    },
    { key: "phi_dich_vu", header: "Phí dịch vụ", render: (c) => (c.phi_dich_vu ? NAP_GAS_PHI_DICH_VU_META[c.phi_dich_vu].label : "—") },
    { key: "nguoi_chot", header: "Người chốt", render: (c) => (c.nguoi_chot ? formatPersonDisplay(c.nguoi_chot, personDir) : "—") },
    { key: "ngay_chot", header: "Ngày chốt", render: (c) => <span className="text-xs">{fmtDateTime(c.ngay_chot)}</span> },
    { key: "hoan_thanh", header: "Hoàn thành", render: (c) => <span className="text-xs">{fmtDateTime(c.thoi_gian_hoan_thanh)}</span> },
    { key: "khu_vuc", header: "Khu vực", render: (c) => shortKhuVuc(c.khu_vuc) },
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
        Danh sách ca được import đánh dấu <b>"Nghi ngờ nạp gas"</b> — cố định theo lần import gần nhất (không tự đổi
        cho đến khi có import mới). Chỉ tính ca đã <b>"Hoàn thành XLSC"</b> (nguồn dữ liệu này chỉ được điền khi CRM
        đóng ca) — quản lý theo khu vực + tháng đóng, giống module Ca lặp. Đánh giá nạp gas được chốt trong popup chi
        tiết ca (tab "Đánh giá nạp gas").
      </div>

      <Tabs active={view} onChange={setView} tabs={VIEWS} />

      {view === "tong-quan" ? (
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {khuVucFilterSelect}
            {thangSelect}
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <StatCard label="Tổng ca nghi ngờ nạp gas" value={tongQuanKpi.tong} tone="amber" sub="Hoàn thành XLSC trong tháng đã chọn" />
            <StatCard label="Đã đánh giá" value={tongQuanKpi.daDanhGia} tone="teal" />
            <StatCard label="Chưa đánh giá" value={tongQuanKpi.chuaDanhGia} tone="coral" sub="Bấm để xem danh sách" onClick={goToChuaDanhGia} />
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <div className="font-display font-bold text-sm">Báo cáo nghi ngờ nạp gas theo {REPORT_DIM_OPTIONS.find((d) => d.value === reportDim)?.label.toLowerCase()}</div>
                <div className="text-xs text-[var(--ink-400)] mt-0.5">Bấm vào 1 ô số để lọc thẳng xuống danh sách chi tiết.</div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={reportDim} onChange={setReportDim} options={REPORT_DIM_OPTIONS} />
                <Btn
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    exportRowsToExcel(
                      reportDim === "khu_vuc" ? sortedKhuVucRows.map((r) => ({ ...r, nhom: shortKhuVuc(r.nhom) })) : sortedKhuVucRows,
                      `bao_cao_nap_gas_${thang}.xlsx`,
                      "Data",
                      KHU_VUC_EXPORT_LABELS,
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
                    <th className="py-2 pr-3">{REPORT_DIM_OPTIONS.find((d) => d.value === reportDim)?.label}</th>
                    <th className="py-2 pr-3">Tổng ca</th>
                    <th className="py-2 pr-3">Đã đánh giá</th>
                    <th className="py-2 pr-3">Chưa đánh giá</th>
                    {DANH_GIA_BREAKDOWN_COLS.map((col) => (
                      <th key={col.key} className="py-2 pr-3 whitespace-nowrap">
                        {NAP_GAS_DANH_GIA_META[col.loai].label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedKhuVucRows.length > 0 && (
                    <tr className="border-b border-[var(--line)] bg-slate-50 font-bold">
                      <td className="py-2 pr-3">Tổng cộng</td>
                      <td className="py-2 pr-3 font-mono">{tongQuanKpi.tong}</td>
                      <td className="py-2 pr-3 font-mono">{tongQuanKpi.daDanhGia}</td>
                      <td className="py-2 pr-3 font-mono">{tongQuanKpi.chuaDanhGia}</td>
                      {DANH_GIA_BREAKDOWN_COLS.map((col) => (
                        <td key={col.key} className="py-2 pr-3 font-mono">
                          {khuVucTotalBreakdown[col.key]}
                        </td>
                      ))}
                    </tr>
                  )}
                  {sortedKhuVucRows.map((r) => (
                    <tr key={r.nhom} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                      <td className="py-2 pr-3 font-semibold">{reportDim === "khu_vuc" ? shortKhuVuc(r.nhom) : r.nhom}</td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.nhom)}>
                          {r.tong}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.nhom, "da-danh-gia")}>
                          {r.da_danh_gia}
                        </button>
                      </td>
                      <td className="py-2 pr-3 font-mono" style={{ color: r.chua_danh_gia > 0 ? "var(--coral-500)" : undefined }}>
                        <button className="hover:underline" onClick={() => drillDown(r.nhom, "chua-danh-gia")}>
                          {r.chua_danh_gia}
                        </button>
                      </td>
                      {DANH_GIA_BREAKDOWN_COLS.map((col) => (
                        <td key={col.key} className="py-2 pr-3 font-mono">
                          {r[col.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {sortedKhuVucRows.length === 0 && (
                    <tr>
                      <td colSpan={4 + DANH_GIA_BREAKDOWN_COLS.length} className="py-8 text-center text-[var(--ink-400)] text-sm">
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
            <IdSerialSearchInput
              value={idSearch}
              onChange={(v) => {
                setIdSearch(v);
                setPage(1);
              }}
            />
          </div>

          <div className="flex items-center justify-between mb-1">
            <div />
            <Btn variant="ghost" size="sm" onClick={handleExport}>
              ⬇ Xuất Excel
            </Btn>
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <StatCard label="Ca nghi ngờ nạp gas trong tháng" value={data?.total ?? 0} tone="amber" />
            <StatCard label="Chưa đánh giá" value={data?.chuaDanhGia ?? 0} tone="coral" onClick={goToChuaDanhGia} />
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
            onRowClick={(c) => openCase(c.id, "nap-gas")}
            rowKey={(c) => c.id}
            emptyText="Không có ca nghi ngờ nạp gas trong tháng này."
            storageKey="nap-gas-list"
          />
        </div>
      )}
    </div>
  );
}
