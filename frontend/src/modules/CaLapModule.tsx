import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "../components/ui/Tabs";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { Select } from "../components/ui/Select";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { StatCard } from "../components/ui/StatCard";
import { Modal } from "../components/ui/Modal";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import { Card } from "../components/ui/Card";
import { ChartCanvas } from "../components/chart/ChartCanvas";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { api, buildQuery } from "../api/client";
import { useToast } from "../components/ui/Toast";
import {
  fmtDateTime,
  CA_LAP_META,
  type CaLapListRow,
  type CaLapStableRow,
  type GiaiTrinhLapRow,
  type BlacklistSerialRow,
  type CaLapLoai,
} from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { CASE_FIELD_LABELS } from "../lib/caseFieldLabels";
import { trangThaiLapOf, trangThaiKeyOf } from "../lib/caLapStatus";
import { fetchWithHashCache } from "../lib/staticListCache";
import { QLDVBH_FILTER_VALUE } from "../constants";
import { useAuth, type VaiTro } from "../auth/AuthContext";
import { ImportUploader } from "../components/ImportUploader";

interface BlacklistImportSummary {
  thanhCong: number;
  boQua: number;
  errors: string[];
}

const VIEWS = [
  { key: "tong-quan", label: "Tổng quan" },
  { key: "danh-sach", label: "Danh sách ca lặp" },
  { key: "blacklist", label: "Blacklist serial" },
];

const TRANG_THAI_TABS = [
  { key: "", label: "Tất cả" },
  { key: "can-danh-gia", label: "Cần đánh giá" },
  { key: "cho-qc", label: "Chờ QC" },
  { key: "da-chot", label: "Đã chốt" },
  { key: "qua-han-lap", label: "Quá hạn lặp" },
];

const TRANG_THAI_LABELS: Record<string, string> = { "can-danh-gia": "Cần đánh giá", "cho-qc": "Chờ QC", "da-chot": "Đã chốt" };

function pct(a: number | undefined, b: number | undefined) {
  return b ? Math.round(((a ?? 0) / b) * 1000) / 10 : 0;
}

interface KpiResponse {
  tongLap: number;
  daChot: number;
  choQc: number;
  quaHanLap: number;
}

interface TongQuanKpi {
  tongCanRaSoat: number;
  tongSerialChuan: number;
  tySerialSai: number;
  tongLap: number;
  serialLapCount: number;
  quaHanLap: number;
  daGiaiTrinh: number;
  chuaGiaiTrinh: number;
  ktvLienQuan: number;
  loiLapDaChot: number;
  tyLeLoiLap: number;
  gsRate: number;
  qcRate: number;
}
interface KhuVucRow {
  nhom: string;
  raSoat: number;
  valid_serial: number;
  serial_sai: number;
  ty_le_serial_sai: number;
  lap_n: number;
  serial_lap: number;
  con_dong: number;
  da_giai_trinh: number;
  loi_chot: number;
  gs_chua: number;
  qc_chua: number;
}
interface KtvRow {
  nhom: string;
  raSoat: number;
  lap_n: number;
  da_giai_trinh: number;
  loi_chot: number;
}
interface TongQuanResponse {
  thang: string;
  kpi: TongQuanKpi;
  khuVuc: KhuVucRow[];
  ktvTable: KtvRow[];
  charts: {
    trend: { ngay: string; so_ca: number }[];
    trangThai: { trang_thai: string; so_ca: number }[];
    topKtv: { nhom: string; so_ca: number }[];
    loaiChot: { loai: CaLapLoai; so_ca: number }[];
    topTinh: { nhom: string; so_ca: number }[];
  };
}

function conDongColor(rate: number) {
  if (rate >= 60) return "var(--coral-500)";
  if (rate >= 30) return "var(--amber-500)";
  return "var(--teal-500)";
}

export function CaLapModule({ openCase, role }: { openCase: (id: string) => void; role: VaiTro | null }) {
  const addToast = useToast();
  const qc = useQueryClient();
  const auth = useAuth();
  const myAreas = auth.status === "authenticated" ? auth.user.khu_vuc_phu_trach : [];
  const [view, setView] = useState("tong-quan");
  const [khuVucFilter, setKhuVucFilter] = useState("");
  const [thang, setThang] = useState(() => new Date().toISOString().slice(0, 7));
  const [trangThai, setTrangThai] = useState(() => (role === "Giam sat" ? "can-danh-gia" : role === "QC" ? "cho-qc" : ""));
  const [page, setPage] = useState(1);
  const [addBlacklistOpen, setAddBlacklistOpen] = useState(false);
  const [newSerial, setNewSerial] = useState("");
  const [deleteConfirmRow, setDeleteConfirmRow] = useState<BlacklistSerialRow | null>(null);
  const [sortBy, setSortBy] = useState("thoi_gian_hoan_thanh");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const pageSize = 20;

  const { data: khuVucOptions } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ khuVuc: string[]; hang: string[] }>("/dashboard/filters"),
  });
  const { data: monthOptions } = useQuery({
    queryKey: ["dashboard-months"],
    queryFn: () => api.get<{ months: string[] }>("/dashboard/months"),
  });

  const { data: tq } = useQuery({
    queryKey: ["ca-lap-tong-quan", khuVucFilter, thang],
    queryFn: () => api.get<TongQuanResponse>(`/ca-lap/tong-quan${buildQuery({ khu_vuc: khuVucFilter, thang })}`),
    enabled: view !== "blacklist",
  });

  // Danh sach ca lap tach lam 2 phan (xem backend/src/routes/caLap.ts): "list" ON DINH (cache theo
  // hash /ca-lap/version, chi doi khi import/blacklist kich hoat tinh lai) + "status" DONG (giai_trinh_lap,
  // luon tai moi vi nho va thay doi thuong xuyen hon). Loc trang thai + phan trang + KPI gop lam o FE
  // ben duoi thay vi goi lai server moi lan doi tab/trang - xem "phuong an toi uu nhat" da thong nhat.
  const listCacheKey = `ca-lap-list-${thang}-${khuVucFilter || "all"}`;
  const {
    data: listData,
    isLoading: listLoading,
    isError: listError,
    refetch: refetchList,
  } = useQuery({
    queryKey: ["ca-lap-list", khuVucFilter, thang],
    queryFn: () =>
      fetchWithHashCache<{ rows: CaLapStableRow[] }>(
        listCacheKey,
        "/ca-lap/version",
        `/ca-lap/danh-sach/list${buildQuery({ khu_vuc: khuVucFilter, thang })}`,
      ),
    enabled: view === "danh-sach",
  });
  const {
    data: statusData,
    isLoading: statusLoading,
    isError: statusError,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ["ca-lap-status", khuVucFilter, thang],
    queryFn: () => api.get<{ rows: GiaiTrinhLapRow[] }>(`/ca-lap/danh-sach/status${buildQuery({ khu_vuc: khuVucFilter, thang })}`),
    enabled: view === "danh-sach",
  });

  const mergedRows: CaLapListRow[] = useMemo(() => {
    const statusByCase = new Map((statusData?.rows ?? []).map((s) => [s.case_id, s]));
    return (listData?.rows ?? []).map((r) => {
      const s = statusByCase.get(r.id);
      return {
        ...r,
        gt_id: s?.id ?? null,
        chot_danh_gia_lap: s?.chot_danh_gia_lap ?? null,
        chot_hinh_thuc_xu_ly: s?.chot_hinh_thuc_xu_ly ?? null,
        dien_giai_lap: s?.dien_giai_lap ?? null,
        nguoi_giai_trinh: s?.nguoi_giai_trinh ?? null,
        ngay_giai_trinh: s?.ngay_giai_trinh ?? null,
        qc_chot: s?.qc_chot ?? null,
        qc_ghi_chu: s?.qc_ghi_chu ?? null,
        nguoi_qc: s?.nguoi_qc ?? null,
        ngay_qc: s?.ngay_qc ?? null,
      } as CaLapListRow;
    });
  }, [listData, statusData]);

  const filteredRows = useMemo(
    () => (trangThai ? mergedRows.filter((r) => trangThaiKeyOf(r) === trangThai) : mergedRows),
    [mergedRows, trangThai],
  );
  // Sap xep client-side (khong goi lai server) - toan bo danh sach ca lap trong thang da nam san o
  // FE qua fetchWithHashCache (xem chu thich o /ca-lap/danh-sach/list phia backend), nen sap xep tai
  // day tranh phai them tham so sortBy vao endpoint dang cache theo hash /version.
  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortBy];
      const bv = (b as unknown as Record<string, unknown>)[sortBy];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filteredRows, sortBy, sortDir]);
  const pagedRows = useMemo(() => sortedRows.slice((page - 1) * pageSize, page * pageSize), [sortedRows, page]);

  const danhSachKpi: KpiResponse = useMemo(() => {
    let tongLap = 0;
    let daChot = 0;
    let choQc = 0;
    let quaHanLap = 0;
    for (const r of mergedRows) {
      if (trangThaiKeyOf(r) === "qua-han-lap") {
        quaHanLap++;
        continue;
      }
      tongLap++;
      if (r.qc_chot) daChot++;
      else if (r.chot_danh_gia_lap) choQc++;
    }
    return { tongLap, daChot, choQc, quaHanLap };
  }, [mergedRows]);

  const isLoading = listLoading || statusLoading;
  const isError = listError || statusError;
  function refetch() {
    refetchList();
    refetchStatus();
  }

  const { data: blacklistData } = useQuery({
    queryKey: ["ca-lap-blacklist"],
    queryFn: () => api.get<{ rows: BlacklistSerialRow[] }>("/ca-lap/blacklist"),
    enabled: view === "blacklist",
  });

  const addBlacklistMutation = useMutation({
    mutationFn: () => api.post("/ca-lap/blacklist", { seri_san_pham: newSerial }),
    onSuccess: () => {
      addToast(`Đã thêm serial ${newSerial} vào blacklist`);
      setNewSerial("");
      setAddBlacklistOpen(false);
      qc.invalidateQueries({ queryKey: ["ca-lap-blacklist"] });
      qc.invalidateQueries({ queryKey: ["ca-lap-list"] });
      qc.invalidateQueries({ queryKey: ["ca-lap-status"] });
      qc.invalidateQueries({ queryKey: ["ca-lap-tong-quan"] });
    },
    onError: () => addToast("Không thể thêm serial vào blacklist, thử lại sau."),
  });

  const toggleBlacklistMutation = useMutation({
    mutationFn: ({ id, bat_tat }: { id: number; bat_tat: boolean }) => api.patch(`/ca-lap/blacklist/${id}`, { bat_tat }),
    onSuccess: () => {
      addToast("Đã cập nhật blacklist serial");
      qc.invalidateQueries({ queryKey: ["ca-lap-blacklist"] });
      qc.invalidateQueries({ queryKey: ["ca-lap-list"] });
      qc.invalidateQueries({ queryKey: ["ca-lap-status"] });
      qc.invalidateQueries({ queryKey: ["ca-lap-tong-quan"] });
    },
  });

  const deleteBlacklistMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/ca-lap/blacklist/${id}`),
    onSuccess: () => {
      addToast("Đã xoá serial khỏi blacklist");
      setDeleteConfirmRow(null);
      qc.invalidateQueries({ queryKey: ["ca-lap-blacklist"] });
      qc.invalidateQueries({ queryKey: ["ca-lap-list"] });
      qc.invalidateQueries({ queryKey: ["ca-lap-status"] });
      qc.invalidateQueries({ queryKey: ["ca-lap-tong-quan"] });
    },
    onError: () => addToast("Không thể xoá serial, thử lại sau."),
  });

  // Khop dung cot hien tren PaginatedTable "Danh sach ca lap" ben duoi (mang "columns").
  const CA_LAP_EXPORT_LABELS: Record<string, string> = {
    ...CASE_FIELD_LABELS,
    gap_days: "Khoảng cách (ngày)",
    prior_id: "Ca trước",
    prior_ht: "Hoàn thành ca trước",
    chot_hinh_thuc_xu_ly: "Chốt hình thức xử lý",
    dien_giai_lap: "Diễn giải lặp",
    nguoi_giai_trinh: "Người giải trình",
    ngay_giai_trinh: "Ngày giải trình",
    qc_chot: "QC chốt",
    qc_ghi_chu: "Ghi chú QC",
    nguoi_qc: "Người QC",
    ngay_qc: "Ngày QC",
  };

  // Khop dung thead cua bang "Bao cao theo khu vuc" o duoi.
  const CA_LAP_KHU_VUC_EXPORT_LABELS: Record<string, string> = {
    nhom: "Khu vực",
    raSoat: "Tổng cần rà soát",
    valid_serial: "Serial chuẩn",
    serial_sai: "Serial sai",
    ty_le_serial_sai: "Tỷ lệ sai",
    lap_n: "Ca lặp",
    serial_lap: "Serial lặp",
    con_dong: "Tồn đọng",
    da_giai_trinh: "Đã giải trình",
    loi_chot: "Lỗi lặp đã chốt",
    gs_chua: "Chờ GS xử lý",
    qc_chua: "Chờ QC xử lý",
  };

  async function handleExport() {
    const all = await api.get<{ rows: CaLapListRow[] }>(
      `/ca-lap/danh-sach${buildQuery({ khu_vuc: khuVucFilter, thang, trang_thai: trangThai, export: true })}`,
    );
    await exportRowsToExcel(all.rows, `ca_lap_${thang}.xlsx`, "Data", CA_LAP_EXPORT_LABELS);
  }

  const columns: Column<CaLapListRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{r.id}</span> },
    { key: "seri_san_pham", header: "Serial", render: (r) => <span className="font-mono text-xs">{r.seri_san_pham}</span> },
    { key: "khach_hang", header: "Khách hàng", render: (r) => r.khach_hang ?? "—" },
    { key: "khu_vuc", header: "Khu vực", render: (r) => r.khu_vuc ?? "—" },
    { key: "ky_thuat_vien", header: "KTV", render: (r) => r.ky_thuat_vien ?? "—" },
    { key: "hoan_thanh", header: "Hoàn thành", sortKey: "thoi_gian_hoan_thanh", render: (r) => <span className="text-xs">{fmtDateTime(r.thoi_gian_hoan_thanh)}</span> },
    { key: "prior_id", header: "Ca trước", render: (r) => <span className="font-mono text-xs">{r.prior_id}</span> },
    { key: "gap_days", header: "Khoảng cách (ngày)", render: (r) => <span className="font-mono">{r.gap_days.toFixed(1)}</span> },
    {
      key: "trang_thai",
      header: "Trạng thái",
      render: (r) => {
        const t = trangThaiLapOf(r);
        return <Badge tone={t.tone}>{t.label}</Badge>;
      },
    },
    { key: "chot_hinh_thuc_xu_ly", header: "Chốt hình thức xử lý", render: (r) => <span className="text-xs">{r.chot_hinh_thuc_xu_ly ?? "—"}</span> },
    { key: "nguoi_giai_trinh", header: "Người giải trình", render: (r) => <span className="text-xs">{r.nguoi_giai_trinh ?? "—"}</span> },
  ];

  const blacklistColumns: Column<BlacklistSerialRow>[] = [
    { key: "seri_san_pham", header: "Serial", render: (r) => <span className="font-mono text-sm">{r.seri_san_pham}</span> },
    { key: "nguoi_them", header: "Người thêm", render: (r) => r.nguoi_them },
    { key: "ngay_them", header: "Ngày thêm", render: (r) => <span className="text-xs">{fmtDateTime(r.ngay_them)}</span> },
    {
      key: "bat_tat",
      header: "Bật / Tắt",
      render: (r) => <ToggleSwitch checked={!!r.bat_tat} onChange={() => toggleBlacklistMutation.mutate({ id: r.id, bat_tat: !r.bat_tat })} />,
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <button
          type="button"
          onClick={() => setDeleteConfirmRow(r)}
          className="text-xs font-semibold text-[var(--coral-500)] hover:underline"
        >
          🗑 Xoá
        </button>
      ),
    },
  ];

  const kpi = danhSachKpi;
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

  return (
    <div className="anim-in">
      <Tabs active={view} onChange={setView} tabs={VIEWS} />

      {view === "tong-quan" && (
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {khuVucFilterSelect}
            {thangSelect}
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <StatCard label="Tổng ca cần rà soát" value={tq?.kpi.tongCanRaSoat ?? 0} tone="ocean" sub="Ca đã đóng trong kỳ đã chọn" />
            <StatCard label="Ca serial chuẩn" value={tq?.kpi.tongSerialChuan ?? 0} tone="ocean" sub="Serial hợp lệ, không blacklist" />
            <StatCard label="Tỷ lệ serial sai" value={`${tq?.kpi.tySerialSai ?? 0}%`} tone="amber" sub="Rỗng, quá ngắn (≤4 ký tự) hoặc bị blacklist" />
            <StatCard label="Tổng ca lặp" value={tq?.kpi.tongLap ?? 0} tone="coral" sub={`${tq?.kpi.quaHanLap ?? 0} ca quá hạn lặp (loại khỏi lặp)`} />
            <StatCard label="Serial phát lặp" value={tq?.kpi.serialLapCount ?? 0} tone="amber" sub="Số serial duy nhất bị lặp" />
            <StatCard label="Đã giải trình" value={tq?.kpi.daGiaiTrinh ?? 0} tone="teal" sub={`${pct(tq?.kpi.daGiaiTrinh, tq?.kpi.tongLap)}% tổng ca lặp`} />
            <StatCard label="Chưa giải trình" value={tq?.kpi.chuaGiaiTrinh ?? 0} tone="amber" sub="Cần giám sát xử lý" />
            <StatCard label="KTV liên quan" value={tq?.kpi.ktvLienQuan ?? 0} tone="ocean" sub="Kỹ thuật viên có ca lặp" />
            <StatCard label="Lỗi lặp đã chốt" value={tq?.kpi.loiLapDaChot ?? 0} tone="coral" sub={`Tỷ lệ lỗi lặp ${tq?.kpi.tyLeLoiLap ?? 0}%`} />
            <StatCard label="Tỷ lệ GS đã đánh giá" value={`${tq?.kpi.gsRate ?? 0}%`} tone="ocean" />
            <StatCard label="Tỷ lệ QC đã đánh giá" value={`${tq?.kpi.qcRate ?? 0}%`} tone="ocean" />
          </div>

          <Card className="p-4 mb-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <div className="font-display font-bold text-sm">Báo cáo theo khu vực</div>
                <div className="text-xs text-[var(--ink-400)] mt-0.5">Sắp xếp theo số ca tồn đọng (chưa giải trình)</div>
              </div>
              <Btn variant="ghost" size="sm" onClick={() => exportRowsToExcel(tq?.khuVuc ?? [], `ca_lap_khu_vuc_${thang}.xlsx`, "Data", CA_LAP_KHU_VUC_EXPORT_LABELS)}>
                ⬇ Xuất Excel
              </Btn>
            </div>
            <div className="overflow-x-auto">
              <table className="dense w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                    <th className="py-2 pr-3">Khu vực</th>
                    <th className="py-2 pr-3">Tổng cần rà soát</th>
                    <th className="py-2 pr-3">Serial chuẩn</th>
                    <th className="py-2 pr-3">Serial sai</th>
                    <th className="py-2 pr-3">Tỷ lệ sai</th>
                    <th className="py-2 pr-3">Ca lặp</th>
                    <th className="py-2 pr-3">Serial lặp</th>
                    <th className="py-2 pr-3" style={{ minWidth: 140 }}>
                      Tồn đọng
                    </th>
                    <th className="py-2 pr-3">Đã giải trình</th>
                    <th className="py-2 pr-3">Lỗi lặp đã chốt</th>
                    <th className="py-2 pr-3">Cần GS / QC xử lý</th>
                  </tr>
                </thead>
                <tbody>
                  {(tq?.khuVuc ?? []).map((r) => {
                    const rate = pct(r.con_dong, r.lap_n);
                    const color = conDongColor(rate);
                    return (
                      <tr key={r.nhom} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                        <td className="py-2 pr-3 font-semibold">{r.nhom}</td>
                        <td className="py-2 pr-3 font-mono">{r.raSoat}</td>
                        <td className="py-2 pr-3 font-mono">{r.valid_serial}</td>
                        <td className="py-2 pr-3 font-mono">{r.serial_sai}</td>
                        <td className="py-2 pr-3 font-mono" style={{ color: r.ty_le_serial_sai >= 30 ? "var(--coral-500)" : undefined }}>
                          {r.ty_le_serial_sai}%
                        </td>
                        <td className="py-2 pr-3 font-mono">{r.lap_n}</td>
                        <td className="py-2 pr-3 font-mono">{r.serial_lap}</td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold" style={{ color }}>
                              {r.con_dong}
                            </span>
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden min-w-[50px]">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, rate)}%`, background: color }} />
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-3 font-mono">{r.da_giai_trinh}</td>
                        <td className="py-2 pr-3 font-mono">{r.loi_chot}</td>
                        <td className="py-2 pr-3 font-mono">
                          {r.gs_chua} / {r.qc_chua}
                        </td>
                      </tr>
                    );
                  })}
                  {(tq?.khuVuc ?? []).length === 0 && (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-[var(--ink-400)] text-sm">
                        Không có dữ liệu.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-4 mb-4">
            <div className="font-display font-bold text-sm mb-3">10 KTV có nhiều ca lặp nhất</div>
            <div className="overflow-x-auto">
              <table className="dense w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                    <th className="py-2 pr-3">Kỹ thuật viên</th>
                    <th className="py-2 pr-3">Tổng ca cần rà soát</th>
                    <th className="py-2 pr-3">Tổng ca lặp</th>
                    <th className="py-2 pr-3">Đã giải trình</th>
                    <th className="py-2 pr-3">Lỗi đã chốt</th>
                  </tr>
                </thead>
                <tbody>
                  {(tq?.ktvTable ?? []).slice(0, 10).map((r) => (
                    <tr key={r.nhom} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                      <td className="py-2 pr-3 font-semibold">{r.nhom}</td>
                      <td className="py-2 pr-3 font-mono">{r.raSoat}</td>
                      <td className="py-2 pr-3 font-mono">{r.lap_n}</td>
                      <td className="py-2 pr-3 font-mono">{r.da_giai_trinh}</td>
                      <td className="py-2 pr-3 font-mono">{r.loi_chot}</td>
                    </tr>
                  ))}
                  {(tq?.ktvTable ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[var(--ink-400)] text-sm">
                        Không có dữ liệu.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card className="p-4">
              <div className="font-display font-bold text-sm mb-3">Xu hướng ca lặp theo ngày hoàn thành</div>
              <ChartCanvas
                type="line"
                data={{
                  labels: (tq?.charts.trend ?? []).map((r) => r.ngay.slice(5)),
                  datasets: [{ label: "Số ca", data: (tq?.charts.trend ?? []).map((r) => r.so_ca), borderColor: "#0E7C6B", backgroundColor: "rgba(14,124,107,.12)", fill: true, tension: 0.3, pointRadius: 3 }],
                }}
              />
            </Card>
            <Card className="p-4">
              <div className="font-display font-bold text-sm mb-3">Trạng thái giải trình (ca lặp ≤45 ngày)</div>
              <ChartCanvas
                type="doughnut"
                height={220}
                data={{
                  labels: (tq?.charts.trangThai ?? []).map((r) => TRANG_THAI_LABELS[r.trang_thai] ?? r.trang_thai),
                  datasets: [{ data: (tq?.charts.trangThai ?? []).map((r) => r.so_ca), backgroundColor: ["#C97A2B", "#0E7C6B", "#2F8F5B"] }],
                }}
              />
            </Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="font-display font-bold text-sm mb-3">Top KTV theo số ca lặp</div>
              <ChartCanvas
                type="bar"
                height={200}
                data={{
                  labels: (tq?.charts.topKtv ?? []).map((r) => (r.nhom.length > 16 ? r.nhom.slice(0, 16) + "…" : r.nhom)),
                  datasets: [{ label: "Số ca", data: (tq?.charts.topKtv ?? []).map((r) => r.so_ca), backgroundColor: "#0E7C6B", borderRadius: 4 }],
                }}
                options={{ indexAxis: "y" as const }}
              />
            </Card>
            <Card className="p-4">
              <div className="font-display font-bold text-sm mb-3">Loại lỗi đã chốt</div>
              <ChartCanvas
                type="pie"
                height={200}
                data={{
                  labels: (tq?.charts.loaiChot ?? []).map((r) => CA_LAP_META[r.loai]?.label ?? r.loai),
                  datasets: [{ data: (tq?.charts.loaiChot ?? []).map((r) => r.so_ca), backgroundColor: ["#0E7C6B", "#C97A2B", "#5B6B8C", "#B23A32", "#2F8F5B", "#8A9994"] }],
                }}
              />
            </Card>
            <Card className="p-4">
              <div className="font-display font-bold text-sm mb-3">Top tỉnh có ca lặp</div>
              <ChartCanvas
                type="bar"
                height={200}
                data={{
                  labels: (tq?.charts.topTinh ?? []).map((r) => r.nhom),
                  datasets: [{ label: "Số ca", data: (tq?.charts.topTinh ?? []).map((r) => r.so_ca), backgroundColor: "#C97A2B", borderRadius: 4 }],
                }}
              />
            </Card>
          </div>
        </div>
      )}

      {view === "danh-sach" && (
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {khuVucFilterSelect}
            {thangSelect}
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <StatCard label="Tổng ca lặp (≤45 ngày)" value={kpi?.tongLap ?? 0} tone="coral" />
            <StatCard label="Chờ QC" value={kpi?.choQc ?? 0} tone="amber" />
            <StatCard label="Đã chốt" value={kpi?.daChot ?? 0} tone="teal" />
            <StatCard label="Quá hạn lặp (loại khỏi thống kê)" value={kpi?.quaHanLap ?? 0} tone="gray" />
          </div>

          <div className="flex items-center justify-between mb-1">
            <div />
            <Btn variant="ghost" size="sm" onClick={handleExport}>
              ⬇ Xuất Excel
            </Btn>
          </div>
          <Tabs
            active={trangThai}
            onChange={(k) => {
              setTrangThai(k);
              setPage(1);
            }}
            tabs={TRANG_THAI_TABS}
          />
          <PaginatedTable
            columns={columns}
            rows={pagedRows}
            isLoading={isLoading}
            isError={isError}
            onRetry={refetch}
            page={page}
            pageSize={pageSize}
            total={filteredRows.length}
            onPageChange={setPage}
            onRowClick={(r) => openCase(r.id)}
            rowKey={(r) => r.id}
            emptyText="Không có ca lặp nào trong phạm vi đã lọc."
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={(newSortBy, newSortDir) => {
              setSortBy(newSortBy);
              setSortDir(newSortDir);
              setPage(1);
            }}
          />
        </div>
      )}

      {view === "blacklist" && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-[var(--ink-600)]">Serial trong danh sách này sẽ bị loại khỏi phát hiện ca lặp (vd: hàng demo, hàng cho mượn quay vòng nhiều khách).</div>
            <Btn size="sm" onClick={() => setAddBlacklistOpen(true)}>
              + Thêm serial
            </Btn>
          </div>
          <ImportUploader<BlacklistImportSummary>
            description={
              <>
                Nhập hàng loạt serial vào blacklist từ file Excel/CSV (1 cột <b className="font-mono">seri_san_pham</b>). Serial đã có sẽ tự bật lại nếu trước đó bị tắt.
              </>
            }
            templateUrl="/api/ca-lap/blacklist/template"
            previewUrl="/ca-lap/blacklist/preview"
            commitUrl="/ca-lap/blacklist/commit"
            buildBody={(rows) => ({ rows })}
            renderSummary={(s) => (
              <div className="grid grid-cols-2 gap-3 mb-2">
                <StatCard label="Sẵn sàng ghi" value={s.thanhCong} tone="teal" />
                <StatCard label="Dòng trống bỏ qua" value={s.boQua} tone={s.boQua > 0 ? "amber" : "gray"} />
              </div>
            )}
            getErrors={(s) => s.errors}
            successMessage={(s) => `Import thành công: ${s.thanhCong} serial vào blacklist`}
            invalidateKeys={[["ca-lap-blacklist"], ["ca-lap-list"], ["ca-lap-status"], ["ca-lap-tong-quan"]]}
          />
          <PaginatedTable
            columns={blacklistColumns}
            rows={blacklistData?.rows ?? []}
            isLoading={false}
            isError={false}
            page={1}
            pageSize={200}
            total={blacklistData?.rows.length ?? 0}
            onPageChange={() => {}}
            rowKey={(r) => r.id}
            emptyText="Chưa có serial nào trong blacklist."
          />
        </div>
      )}

      <Modal open={addBlacklistOpen} onClose={() => setAddBlacklistOpen(false)} title="Thêm serial vào blacklist">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Serial sản phẩm</label>
            <input
              value={newSerial}
              onChange={(e) => setNewSerial(e.target.value)}
              className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm font-mono"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setAddBlacklistOpen(false)}>
              Hủy
            </Btn>
            <Btn onClick={() => addBlacklistMutation.mutate()} disabled={!newSerial.trim() || addBlacklistMutation.isPending}>
              Thêm
            </Btn>
          </div>
        </div>
      </Modal>

      {deleteConfirmRow && (
        <Modal open onClose={() => setDeleteConfirmRow(null)} title="Xác nhận xoá blacklist" width="max-w-md">
          <div className="text-sm text-[var(--ink-600)] mb-4">
            Xoá hẳn serial <span className="font-mono font-semibold">{deleteConfirmRow.seri_san_pham}</span> khỏi danh sách blacklist? Serial này sẽ được tính lại là ca lặp bình thường nếu phát hiện trùng trong tương lai.
          </div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setDeleteConfirmRow(null)}>
              Hủy
            </Btn>
            <Btn variant="danger" onClick={() => deleteBlacklistMutation.mutate(deleteConfirmRow.id)} disabled={deleteBlacklistMutation.isPending}>
              {deleteBlacklistMutation.isPending ? "Đang xoá…" : "Xác nhận xoá"}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
