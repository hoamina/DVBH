import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { StatCard } from "../components/ui/StatCard";
import { Tabs } from "../components/ui/Tabs";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { useMissingPartsDaDongChunked, type MissingPartClosedCase } from "../hooks/useMissingPartsDaDongChunked";
import { api, buildQuery } from "../api/client";
import { fmtDate, fmtDateTime, fmtVND, type Paged } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { CASE_FIELD_LABELS } from "../lib/caseFieldLabels";
import { useAuth } from "../auth/AuthContext";
import { QLDVBH_FILTER_VALUE } from "../constants";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { IdSerialSearchInput } from "../components/IdSerialSearchInput";
import { isVipKh, vipRowClassName, VipBadge } from "../lib/vipHighlight";

// Tab "Da dong" cua man Thieu linh kien: chon 1 thang, dung useMissingPartsDaDongChunked (chunk R2
// theo ngay dung chung voi cases.ts) roi loc khu_vuc/dim + phan trang thuan phia client - thay the
// ClosedCasesTab (mo hinh cache theo request cu).
function MissingPartsDaDongList({
  columns,
  khuVucFilter,
  dimFilter,
  onRowClick,
}: {
  columns: Column<MissingPartClosedCase>[];
  khuVucFilter: string;
  dimFilter: { dim?: string; dim_value?: string };
  onRowClick: (c: MissingPartClosedCase) => void;
}) {
  const { data: monthsData } = useQuery({
    queryKey: ["dashboard-months"],
    queryFn: () => api.get<{ months: string[] }>("/dashboard/months"),
  });
  const currentMonth = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
  const [thang, setThang] = useState(currentMonth);
  const [page, setPage] = useState(1);
  const [idSearch, setIdSearch] = useState("");
  const pageSize = 10;

  const { rows: allRows, isLoading, isError, refetch, throttled } = useMissingPartsDaDongChunked(thang);

  const rows = useMemo(() => {
    let r = allRows;
    if (khuVucFilter === QLDVBH_FILTER_VALUE) {
      r = r.filter((row) => (row.khu_vuc ?? "").includes("qldvbh"));
    } else if (khuVucFilter) {
      const set = new Set(
        khuVucFilter
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      );
      r = r.filter((row) => row.khu_vuc && set.has(row.khu_vuc));
    }
    if (dimFilter.dim && dimFilter.dim_value && dimFilter.dim !== "khu_vuc") {
      const key = dimFilter.dim as keyof MissingPartClosedCase;
      r = r.filter((row) => row[key] === dimFilter.dim_value);
    }
    const q = idSearch.trim().toLowerCase();
    if (q) r = r.filter((row) => row.id.toLowerCase().includes(q) || (row.seri_san_pham ?? "").toLowerCase().includes(q));
    return r;
  }, [allRows, khuVucFilter, dimFilter, idSearch]);

  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  const monthOptions = (monthsData?.months ?? []).map((m) => ({ value: m, label: m }));
  if (!monthOptions.some((o) => o.value === currentMonth)) {
    monthOptions.unshift({ value: currentMonth, label: `${currentMonth} (hiện tại)` });
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-semibold text-[var(--ink-400)]">Tháng:</span>
        <Select
          value={thang}
          onChange={(v) => {
            setThang(v);
            setPage(1);
          }}
          options={monthOptions}
        />
        <IdSerialSearchInput
          value={idSearch}
          onChange={(v) => {
            setIdSearch(v);
            setPage(1);
          }}
        />
      </div>
      {throttled.length > 0 && (
        <div className="text-xs text-[var(--ink-400)] italic mb-2">
          {throttled.length} ngày đang chờ đồng bộ (đã đạt giới hạn tải, tự thử lại sau ít phút) — vẫn hiển thị dữ liệu đã lưu gần nhất.
        </div>
      )}
      <PaginatedTable
        columns={columns}
        rows={pagedRows}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        page={page}
        pageSize={pageSize}
        total={rows.length}
        onPageChange={setPage}
        onRowClick={onRowClick}
        rowKey={(c) => c.id}
        emptyText="Không có ca thiếu linh kiện đã đóng trong tháng này."
        storageKey="missing-parts-closed"
      />
    </div>
  );
}

interface MissingPartCase {
  id: string;
  khach_hang: string | null;
  nhom_kh: string | null;
  khu_vuc: string | null;
  ky_thuat_vien: string | null;
  last_ly_do_cham: string | null;
  last_linh_kien_thieu: string | null;
  last_ngay_yeu_cau_co_hang: string | null;
  last_ngay_du_kien_hoan_thanh: string | null;
  thoi_gian_hoan_thanh: string | null;
  dt_linh_kien: number | null;
  tuoi_ton: number | null;
}

interface KhuVucRow {
  nhom: string;
  tong_ton: number;
  tren_3: number;
  tren_5: number;
  tren_7: number;
  tren_14: number;
  tong_gia_tri_linh_kien: number;
  so_ma_linh_kien: number;
  lo_ke_hoach: number;
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

const VIEWS = [
  { key: "bao-cao", label: "Báo cáo" },
  { key: "danh-sach", label: "Danh sách chi tiết" },
];

const AGE_BUCKETS: { key: string; label: string; tuoiTu?: string; tuoiDen?: string }[] = [
  { key: "", label: "Tất cả tuổi tồn" },
  { key: "gt-1", label: "Tồn trên 1 ngày", tuoiTu: "1" },
  { key: "gt-3", label: "Tồn trên 3 ngày", tuoiTu: "3" },
  { key: "gt-5", label: "Tồn trên 5 ngày", tuoiTu: "5" },
  { key: "gt-7", label: "Tồn trên 7 ngày", tuoiTu: "7" },
  { key: "custom", label: "Tùy chỉnh…" },
];

const KHU_VUC_BUCKET_COLS: { key: keyof KhuVucRow; label: string; tuoiTu?: string }[] = [
  { key: "tren_3", label: "Trên 3 ngày", tuoiTu: "3" },
  { key: "tren_5", label: "Trên 5 ngày", tuoiTu: "5" },
  { key: "tren_7", label: "Trên 7 ngày", tuoiTu: "7" },
  { key: "tren_14", label: "Trên 14 ngày", tuoiTu: "14" },
];

export function MissingPartsModule({ openCase }: { openCase: (id: string, tab?: string) => void }) {
  const auth = useAuth();
  const myAreas = auth.status === "authenticated" ? auth.user.khu_vuc_phu_trach : [];
  const [view, setView] = useLocalStorageState("filters:missing-parts-view", "bao-cao");
  const [trangThai, setTrangThai] = useLocalStorageState("filters:missing-parts-trang-thai", "dang-ton");
  const [page, setPage] = useState(1);
  const [khuVucFilter, setKhuVucFilter] = useLocalStorageState("filters:missing-parts-khu-vuc", "");
  // CHOT 2026-08-12: bo loc chung "Model"/"Doi tac" - doc lap voi reportDim (dim CHI dung de nhom
  // bang pivot/drill-down, khong phai bo loc dai han) - ap dung dong thoi cho ca bao cao pivot lan
  // "Danh sach chi tiet", giong y nghia cua khuVucFilter.
  const [modelFilter, setModelFilter] = useLocalStorageState("filters:missing-parts-model", "");
  const [doiTacFilter, setDoiTacFilter] = useLocalStorageState("filters:missing-parts-doi-tac", "");
  const [reportDim, setReportDim] = useLocalStorageState("filters:missing-parts-report-dim", "khu_vuc");
  const [drillDim, setDrillDim] = useState("khu_vuc");
  const [drillValue, setDrillValue] = useState("");
  const [ageBucketKey, setAgeBucketKey] = useLocalStorageState("filters:missing-parts-age-bucket", "gt-3");
  const [tuoiTuCustom, setTuoiTuCustom] = useState("");
  const [tuoiDenCustom, setTuoiDenCustom] = useState("");
  const [idSearch, setIdSearch] = useState("");
  // CHOT 2026-08-12: nut filter nhanh "Loc tong, BCN" (gop 2 Model, khong the chon qua Select don gia
  // tri modelFilter o tren) - rieng biet, loai tru lan nhau voi modelFilter (chon 1 trong 2).
  const [quickFilterLocTongBcn, setQuickFilterLocTongBcn] = useState(false);
  const pageSize = 10;

  // Chi gui dim/dim_value cho danh sach chi tiet khi drill-down tu 1 dong KHONG phai khu_vuc -
  // khu_vuc da co san co che loc rieng (khuVucFilter) tu truoc gio.
  const dimFilter = drillDim !== "khu_vuc" ? { dim: drillDim, dim_value: drillValue } : {};

  const ageRange =
    ageBucketKey === "custom"
      ? { tuoiTu: tuoiTuCustom || undefined, tuoiDen: tuoiDenCustom || undefined }
      : { tuoiTu: AGE_BUCKETS.find((b) => b.key === ageBucketKey)?.tuoiTu, tuoiDen: AGE_BUCKETS.find((b) => b.key === ageBucketKey)?.tuoiDen };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["missing-parts", page, khuVucFilter, modelFilter, doiTacFilter, quickFilterLocTongBcn, ageRange.tuoiTu, ageRange.tuoiDen, drillDim, drillValue, idSearch],
    queryFn: () =>
      api.get<Paged<MissingPartCase>>(
        `/missing-parts${buildQuery({
          page,
          pageSize,
          khu_vuc: khuVucFilter,
          nhom_san_pham: quickFilterLocTongBcn ? undefined : modelFilter,
          nhom_san_pham_group: quickFilterLocTongBcn ? "loc_tong_bcn" : undefined,
          doi_tac: doiTacFilter,
          tuoi_tu: ageRange.tuoiTu,
          tuoi_den: ageRange.tuoiDen,
          id: idSearch || undefined,
          ...dimFilter,
        })}`,
      ),
    enabled: view === "danh-sach" && trangThai === "dang-ton",
  });
  const { data: khuVucOptions } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ khuVuc: string[]; hang: string[]; nhomSanPham: (string | null)[]; doiTac: (string | null)[] }>("/dashboard/filters"),
  });
  // CHOT 2026-08-12: dem rieng so ca "Loc tong, BCN" cho nut filter nhanh (doc lap voi modelFilter -
  // luon hien dung so ca thuc te thuoc nhom nay du dang chon Model nao khac tren Select), chi tra
  // theo khu_vuc/doi_tac dang loc (giong "Ca dang cho linh kien" dung chung 1 kieu voi bo loc chung).
  const { data: locTongBcnStats } = useQuery({
    queryKey: ["missing-parts-by-khu-vuc", khuVucFilter, doiTacFilter, "nhom_san_pham", "loc-tong-bcn-quick-count"],
    queryFn: () => api.get<{ rows: KhuVucRow[] }>(`/missing-parts/by-khu-vuc${buildQuery({ khu_vuc: khuVucFilter, doi_tac: doiTacFilter, dim: "nhom_san_pham" })}`),
  });
  const locTongBcnCount = (locTongBcnStats?.rows ?? []).filter((r) => r.nhom === "Lọc tổng").reduce((s, r) => s + r.tong_ton, 0);
  const { data: khuVucStats } = useQuery({
    queryKey: ["missing-parts-by-khu-vuc", khuVucFilter, modelFilter, doiTacFilter, reportDim],
    queryFn: () =>
      api.get<{ rows: KhuVucRow[] }>(`/missing-parts/by-khu-vuc${buildQuery({ khu_vuc: khuVucFilter, nhom_san_pham: modelFilter, doi_tac: doiTacFilter, dim: reportDim })}`),
  });

  // Dong "Tong cong" dau bang - cong don cac cot so tren cac dong dang hien. "so_ma_linh_kien" KHONG
  // cong duoc (COUNT DISTINCT ma linh kien - 1 ma co the xuat hien o nhieu nhom khac nhau, cong don
  // se bi dem trung), de trong (—) thay vi hien so sai.
  const khuVucTotal = useMemo(() => {
    const rows = khuVucStats?.rows ?? [];
    const sum = (key: keyof KhuVucRow) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
    return {
      tong_ton: sum("tong_ton"),
      tren_3: sum("tren_3"),
      tren_5: sum("tren_5"),
      tren_7: sum("tren_7"),
      tren_14: sum("tren_14"),
      tong_gia_tri_linh_kien: sum("tong_gia_tri_linh_kien"),
      lo_ke_hoach: sum("lo_ke_hoach"),
    };
  }, [khuVucStats]);

  // Cot dau tien sap A-Z.
  const sortedKhuVucRows = [...(khuVucStats?.rows ?? [])].sort((a, b) => a.nhom.localeCompare(b.nhom, "vi"));

  function drillDown(value: string, opts?: { tuoiTu?: string; tuoiDen?: string }) {
    if (reportDim === "khu_vuc") {
      setKhuVucFilter(value);
      setDrillDim("khu_vuc");
      setDrillValue("");
    } else {
      setDrillDim(reportDim);
      setDrillValue(value);
    }
    setTrangThai("dang-ton");
    setPage(1);
    if (opts) {
      const preset = AGE_BUCKETS.find((b) => b.tuoiTu === opts.tuoiTu && b.tuoiDen === opts.tuoiDen);
      setAgeBucketKey(preset?.key ?? "custom");
      setTuoiTuCustom(opts.tuoiTu ?? "");
      setTuoiDenCustom(opts.tuoiDen ?? "");
    } else {
      setAgeBucketKey("");
    }
    setView("danh-sach");
  }

  // Khop dung cot hien tren PaginatedTable "columns" ben duoi (rows thuc te la nguyen CaseRow +
  // cac field last_* tu giai_trinh, xem SELECT_COLS o backend/src/routes/missingParts.ts).
  const EXPORT_LABELS: Record<string, string> = {
    ...CASE_FIELD_LABELS,
    last_linh_kien_thieu: "Linh kiện thiếu",
    last_ngay_yeu_cau_co_hang: "Ngày yêu cầu có hàng",
    last_ngay_du_kien_hoan_thanh: "Ngày dự kiến HT",
    last_ly_do_cham: "Lý do tồn gần nhất",
    tuoi_ton: "Tuổi tồn",
  };

  // Khop dung thead cua bang pivot "Bao cao linh kien ton theo ..." o duoi (cot "nhom" doi ten theo
  // dim dang chon).
  const KHU_VUC_EXPORT_LABELS: Record<string, string> = {
    nhom: REPORT_DIM_OPTIONS.find((d) => d.value === reportDim)?.label ?? "Nhóm",
    tong_ton: "Tổng tồn",
    ...Object.fromEntries(KHU_VUC_BUCKET_COLS.map((c) => [c.key, c.label])),
    tong_gia_tri_linh_kien: "Giá trị linh kiện dự kiến",
    so_ma_linh_kien: "Số mã linh kiện",
    lo_ke_hoach: "Lỡ kế hoạch",
  };

  async function handleExport() {
    const all = await api.get<Paged<MissingPartCase>>(
      `/missing-parts${buildQuery({
        page: 1,
        pageSize: 5000,
        khu_vuc: khuVucFilter,
        nhom_san_pham: quickFilterLocTongBcn ? undefined : modelFilter,
        nhom_san_pham_group: quickFilterLocTongBcn ? "loc_tong_bcn" : undefined,
        doi_tac: doiTacFilter,
        tuoi_tu: ageRange.tuoiTu,
        tuoi_den: ageRange.tuoiDen,
        id: idSearch || undefined,
        ...dimFilter,
      })}`,
    );
    await exportRowsToExcel(all.rows.map((r) => ({ ...r, khu_vuc: shortKhuVuc(r.khu_vuc) })), "ca_thieu_linh_kien.xlsx", "Data", EXPORT_LABELS);
  }

  const totalDtLinhKien = (data?.rows ?? []).reduce((s, r) => s + (r.dt_linh_kien ?? 0), 0);
  const soMaLinhKien = new Set((data?.rows ?? []).map((r) => r.last_linh_kien_thieu).filter(Boolean)).size;

  const columns: Column<MissingPartCase>[] = [
    { key: "id", header: "ID", render: (c) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{c.id}</span> },
    {
      key: "khach_hang",
      header: "Khách hàng",
      render: (c) => (
        <>
          {isVipKh(c.nhom_kh) && <VipBadge />}
          {c.khach_hang ?? "—"}
        </>
      ),
    },
    { key: "ky_thuat_vien", header: "Kỹ thuật viên", render: (c) => <span className="text-xs">{c.ky_thuat_vien ?? "—"}</span> },
    {
      key: "linh_kien",
      header: "Linh kiện thiếu",
      render: (c) => (c.last_linh_kien_thieu ? <Badge tone="amber">{c.last_linh_kien_thieu}</Badge> : <span className="text-[var(--ink-400)] text-xs italic">Chưa chọn</span>),
    },
    { key: "ngay_yeu_cau", header: "Ngày yêu cầu có hàng", render: (c) => <span className="text-xs">{fmtDate(c.last_ngay_yeu_cau_co_hang)}</span> },
    { key: "ngay_du_kien", header: "Ngày dự kiến HT", render: (c) => <span className="text-xs">{fmtDate(c.last_ngay_du_kien_hoan_thanh)}</span> },
    { key: "last_ly_do_cham", header: "Lý do tồn gần nhất", render: (c) => <span className="text-xs">{c.last_ly_do_cham ?? "—"}</span> },
    {
      key: "tuoi_ton",
      header: "Tuổi tồn",
      render: (c) =>
        (c.tuoi_ton ?? 0) > 7 ? (
          <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-[var(--coral-500)] text-white">{c.tuoi_ton}</span>
        ) : (
          <span className="font-mono text-xs">{c.tuoi_ton ?? "—"}</span>
        ),
    },
    { key: "khu_vuc", header: "Khu vực", render: (c) => shortKhuVuc(c.khu_vuc) },
    { key: "action", header: "", render: () => <span className="text-[var(--ocean-500)] text-xs font-semibold">Xem →</span> },
  ];

  const closedColumns: Column<MissingPartClosedCase>[] = [
    { key: "id", header: "ID", render: (c) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{c.id}</span> },
    { key: "khach_hang", header: "Khách hàng", render: (c) => c.khach_hang ?? "—" },
    {
      key: "linh_kien",
      header: "Linh kiện thiếu",
      render: (c) => (c.last_linh_kien_thieu ? <Badge tone="amber">{c.last_linh_kien_thieu}</Badge> : <span className="text-[var(--ink-400)] text-xs italic">Chưa chọn</span>),
    },
    { key: "hoan_thanh", header: "Hoàn thành", render: (c) => <span className="text-xs">{fmtDateTime(c.thoi_gian_hoan_thanh)}</span> },
    { key: "khu_vuc", header: "Khu vực", render: (c) => shortKhuVuc(c.khu_vuc) },
    { key: "action", header: "", render: () => <span className="text-[var(--ocean-500)] text-xs font-semibold">Xem →</span> },
  ];

  return (
    <div className="anim-in">
      <div className="text-sm text-[var(--ink-600)] mb-4">
        Danh sách ca có lý do được đánh dấu <b>“thuộc nhóm thiếu linh kiện”</b> trong Settings — theo dõi tách riêng để kiểm soát tồn kho / cấp hàng.
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-1">
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
        <Select
          value={modelFilter}
          onChange={(v) => {
            setModelFilter(v);
            setQuickFilterLocTongBcn(false);
            setPage(1);
          }}
          options={[
            { value: "", label: "Tất cả Model" },
            ...(khuVucOptions?.nhomSanPham.filter((v): v is string => !!v).map((v) => ({ value: v, label: v })) ?? []),
          ]}
        />
        <Select
          value={doiTacFilter}
          onChange={(v) => {
            setDoiTacFilter(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "Tất cả đối tác" },
            ...(khuVucOptions?.doiTac.filter((v): v is string => !!v).map((v) => ({ value: v, label: v })) ?? []),
          ]}
        />
        {view === "danh-sach" && trangThai !== "da-dong" && (
          <>
            <Select
              value={ageBucketKey}
              onChange={(v) => {
                setAgeBucketKey(v);
                setPage(1);
              }}
              options={AGE_BUCKETS.map((b) => ({ value: b.key, label: b.label }))}
            />
            {ageBucketKey === "custom" && (
              <>
                <input
                  type="number"
                  min={0}
                  value={tuoiTuCustom}
                  onChange={(e) => setTuoiTuCustom(e.target.value)}
                  placeholder="Từ (ngày)"
                  className="focus-ring w-24 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
                <input
                  type="number"
                  min={0}
                  value={tuoiDenCustom}
                  onChange={(e) => setTuoiDenCustom(e.target.value)}
                  placeholder="Đến (ngày)"
                  className="focus-ring w-24 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
              </>
            )}
            <IdSerialSearchInput
              value={idSearch}
              onChange={(v) => {
                setIdSearch(v);
                setPage(1);
              }}
            />
          </>
        )}
      </div>

      <Tabs active={view} onChange={setView} tabs={VIEWS} />

      {view === "bao-cao" ? (
        <Card className="p-4 mt-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <div className="font-display font-bold text-sm">Báo cáo linh kiện tồn theo {REPORT_DIM_OPTIONS.find((d) => d.value === reportDim)?.label.toLowerCase()}</div>
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
                    "bao_cao_linh_kien_ton.xlsx",
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
                  <th className="py-2 pr-3">Tổng tồn</th>
                  {KHU_VUC_BUCKET_COLS.map((col) => (
                    <th key={col.key} className="py-2 pr-3">
                      {col.label}
                    </th>
                  ))}
                  <th className="py-2 pr-3 border-l border-[var(--line)] pl-3">Giá trị linh kiện dự kiến</th>
                  <th className="py-2 pr-3">Số mã linh kiện</th>
                  <th className="py-2 pr-3">Lỡ kế hoạch</th>
                </tr>
              </thead>
              <tbody>
                {sortedKhuVucRows.length > 0 && (
                  <tr className="border-b border-[var(--line)] bg-slate-50 font-bold">
                    <td className="py-2 pr-3">Tổng cộng</td>
                    <td className="py-2 pr-3 font-mono">{khuVucTotal.tong_ton}</td>
                    <td className="py-2 pr-3 font-mono">{khuVucTotal.tren_3}</td>
                    <td className="py-2 pr-3 font-mono">{khuVucTotal.tren_5}</td>
                    <td className="py-2 pr-3 font-mono">{khuVucTotal.tren_7}</td>
                    <td className="py-2 pr-3 font-mono">{khuVucTotal.tren_14}</td>
                    <td className="py-2 pr-3 border-l border-[var(--line)] pl-3 font-mono">{fmtVND(khuVucTotal.tong_gia_tri_linh_kien)}</td>
                    <td className="py-2 pr-3 font-mono text-[var(--ink-400)]" title="Không cộng được (đếm mã linh kiện khác nhau, có thể trùng giữa các nhóm)">
                      —
                    </td>
                    <td className="py-2 pr-3 font-mono">{khuVucTotal.lo_ke_hoach}</td>
                  </tr>
                )}
                {sortedKhuVucRows.map((r) => (
                  <tr key={r.nhom} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                    <td className="py-2 pr-3 font-semibold">{reportDim === "khu_vuc" ? shortKhuVuc(r.nhom) : r.nhom}</td>
                    <td className="py-2 pr-3 font-mono">
                      <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.nhom, { tuoiTu: "1" })}>
                        {r.tong_ton}
                      </button>
                    </td>
                    {KHU_VUC_BUCKET_COLS.map((col) => (
                      <td key={col.key} className="py-2 pr-3 font-mono">
                        <button className="text-[var(--ocean-600)] hover:underline" onClick={() => drillDown(r.nhom, { tuoiTu: col.tuoiTu })}>
                          {r[col.key]}
                        </button>
                      </td>
                    ))}
                    <td className="py-2 pr-3 border-l border-[var(--line)] pl-3 font-mono">{fmtVND(r.tong_gia_tri_linh_kien)}</td>
                    <td className="py-2 pr-3 font-mono">{r.so_ma_linh_kien}</td>
                    <td className="py-2 pr-3 font-mono">{r.lo_ke_hoach}</td>
                  </tr>
                ))}
                {sortedKhuVucRows.length === 0 && (
                  <tr>
                    <td colSpan={5 + KHU_VUC_BUCKET_COLS.length} className="py-8 text-center text-[var(--ink-400)] text-sm">
                      Không có dữ liệu.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <div />
            {trangThai === "dang-ton" && (
              <Btn variant="ghost" size="sm" onClick={handleExport}>
                ⬇ Xuất Excel
              </Btn>
            )}
          </div>
          {trangThai === "dang-ton" && (
            <div className="flex flex-wrap gap-3 mb-4">
              <StatCard label="Ca đang chờ linh kiện" value={data?.total ?? 0} tone="amber" />
              <StatCard
                label="Ca tồn >7 ngày"
                value={khuVucTotal.tren_7}
                tone="coral"
                muted={!khuVucTotal.tren_7}
                onClick={() => {
                  setAgeBucketKey("gt-7");
                  setPage(1);
                }}
              />
              <StatCard label="Mã linh kiện đang thiếu (trang này)" value={soMaLinhKien} tone="coral" />
              <StatCard label="Giá trị linh kiện dự kiến (trang này)" value={fmtVND(totalDtLinhKien)} tone="ocean" />
              {/* CHOT 2026-08-12: nut filter nhanh Model = "Loc tong" HOAC "Loc nuoc BCN" - modelFilter
                  (Select don gia tri) khong the giu ca 2 cung luc nen tach rieng 1 cong tac boolean. */}
              <StatCard
                label="Lọc tổng"
                value={locTongBcnCount}
                tone="amber"
                muted={!locTongBcnCount}
                active={quickFilterLocTongBcn}
                onClick={() => {
                  setQuickFilterLocTongBcn((prev) => !prev);
                  setModelFilter("");
                  setPage(1);
                }}
              />
            </div>
          )}
          <Tabs
            active={trangThai}
            onChange={(k) => {
              setTrangThai(k);
              setPage(1);
            }}
            tabs={[
              { key: "dang-ton", label: "Đang tồn" },
              { key: "da-dong", label: "Đã đóng" },
            ]}
          />
          {trangThai === "da-dong" ? (
            <MissingPartsDaDongList columns={closedColumns} khuVucFilter={khuVucFilter} dimFilter={dimFilter} onRowClick={(c) => openCase(c.id, "giai-trinh")} />
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
              onRowClick={(c) => openCase(c.id, "giai-trinh")}
              rowKey={(c) => c.id}
              rowClassName={(c) => (isVipKh(c.nhom_kh) ? vipRowClassName(c.nhom_kh) : (c.tuoi_ton ?? 0) > 7 ? "bg-[var(--coral-100)]" : "")}
              emptyText="Không có ca thiếu linh kiện."
              storageKey="missing-parts-list"
            />
          )}
        </div>
      )}
    </div>
  );
}
