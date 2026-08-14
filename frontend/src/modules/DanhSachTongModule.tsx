import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs } from "../components/ui/Tabs";
import { Select } from "../components/ui/Select";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { KtvNameWithPhone, KTV_PHONE_EDIT_ROLES } from "../components/KtvNameWithPhone";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { api, buildQuery } from "../api/client";
import { fmtDateTime, fmtVND, type CaseRow, type Paged } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { CASE_FIELD_LABELS } from "../lib/caseFieldLabels";
import { useAuth } from "../auth/AuthContext";
import { useDaDongChunked } from "../hooks/useDaDongChunked";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { QLDVBH_FILTER_VALUE } from "../constants";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { IdSerialSearchInput } from "../components/IdSerialSearchInput";

const PAGE_SIZE = 20;

function currentMonthValue(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
}
function formatThangLabel(thang: string): string {
  const [y, m] = thang.split("-");
  return `${m}/${y}`;
}

// CHOT 2026-07-30: bo the "Ca luu tru" rieng - gop hoan toan vao day. Snapshot R2 tung ngay (xem
// hooks/useDaDongChunked.ts) van giu nguyen du lieu cho MOI ngay ca da dong tu truoc den nay, KHONG
// phu thuoc case do sau nay co bi cron danh dau archived_at hay khong (xem computeDayRows() trong
// backend/src/lib/daDongDayChunks.ts - loc theo thoi_gian_hoan_thanh, khong loc archived_at) - nen
// chi can cho phep chon BAT KY thang nao (khong con gioi han co dinh "thang hien tai + 2 thang
// truoc") la du thay the "Ca luu tru" hoan toan, khong mat kha nang xem/xuat du lieu cu.
const TABS = [
  { key: "thang", label: "Theo tháng" },
  { key: "dang-ton", label: "Ca đang tồn" },
];

export function DanhSachTongModule({ openCase }: { openCase: (id: string) => void }) {
  const auth = useAuth();
  const myAreas = auth.status === "authenticated" ? auth.user.khu_vuc_phu_trach : [];
  const role = auth.status === "authenticated" ? auth.user.vai_tro : null;
  const [tab, setTab] = useLocalStorageState("filters:danh-sach-tong-tab", TABS[0].key);
  const [thang, setThang] = useLocalStorageState("filters:danh-sach-tong-thang", currentMonthValue());
  const [page, setPage] = useState(1);
  const [khuVucFilter, setKhuVucFilter] = useLocalStorageState("filters:danh-sach-tong-khu-vuc", "");
  const [hangFilter, setHangFilter] = useLocalStorageState("filters:danh-sach-tong-hang", "");
  const [idSearch, setIdSearch] = useState("");

  // CHOT 2026-08-01: "full_khu_vuc=true" - Danh sach tong la noi DUY NHAT van con hien 2 khu_vuc bi
  // an khoi moi bao cao khac (xem KHU_VUC_AN_KHOI_BAO_CAO), nen can danh sach khu_vuc DAY DU cho bo
  // loc, khac queryKey rieng voi cac module khac (deu dung "dashboard-filters" khong tham so).
  const { data: filterOptions } = useQuery({
    queryKey: ["dashboard-filters", "full"],
    queryFn: () => api.get<{ khuVuc: string[]; hang: string[] }>("/dashboard/filters?full_khu_vuc=true"),
  });
  // Danh sach thang thuc su co ca da dong (xem computeDashboardMonths trong dashboard.ts) - dung
  // chung queryKey "dashboard-months" voi CaLapModule/NapGasModule nen tan dung cache co san, khong
  // ton them request. Luon dam bao thang hien tai co mat trong danh sach (du chua co ca nao dong)
  // de nguoi dung luon chon duoc, giong pattern da co o 2 module tren.
  const { data: monthsData } = useQuery({
    queryKey: ["dashboard-months"],
    queryFn: () => api.get<{ months: string[] }>("/dashboard/months"),
  });
  const currentMonth = currentMonthValue();
  const monthOptions = (monthsData?.months ?? []).map((m) => ({
    value: m,
    label: `Tháng ${formatThangLabel(m)}${m === currentMonth ? " (hiện tại)" : ""}`,
  }));
  if (!monthOptions.some((o) => o.value === currentMonth)) {
    monthOptions.unshift({ value: currentMonth, label: `Tháng ${formatThangLabel(currentMonth)} (hiện tại)` });
  }

  // Snapshot R2 tung ngay (xem hooks/useDaDongChunked.ts + backend/src/lib/daDongDayChunks.ts) -
  // hook tu quan ly cache IndexedDB + hash-diff + rate-limit, roi phan trang + loc khu_vuc/hang
  // thuan phia client (khong con dinh kem vao request server nua).
  const {
    rows: monthRowsAll,
    isLoading: monthLoading,
    isError: monthError,
    refetch: monthRefetch,
    throttled: monthThrottled,
  } = useDaDongChunked(thang, tab === "thang");

  // Ca dang ton co the doi bat cu luc nao - giu phan trang server-side + luon fetch moi, khong
  // cache toan bo nhu tab "Theo thang" (von la du lieu da chot, khong doi nua).
  const {
    data: openData,
    isLoading: openLoading,
    isError: openError,
    refetch: openRefetch,
  } = useQuery({
    queryKey: ["cases-tong-hop-dang-ton", page, khuVucFilter, hangFilter, idSearch],
    queryFn: () =>
      api.get<Paged<CaseRow>>(`/cases/tong-hop${buildQuery({ trang_thai: "dang-ton", page, pageSize: PAGE_SIZE, khu_vuc: khuVucFilter, hang: hangFilter, id: idSearch || undefined })}`),
    enabled: tab === "dang-ton",
  });

  const monthRows = useMemo(() => {
    let rows = monthRowsAll;
    if (khuVucFilter === QLDVBH_FILTER_VALUE) {
      rows = rows.filter((r) => (r.khu_vuc ?? "").includes("qldvbh"));
    } else if (khuVucFilter) {
      const set = new Set(
        khuVucFilter
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      );
      rows = rows.filter((r) => r.khu_vuc && set.has(r.khu_vuc));
    }
    if (hangFilter) {
      rows = rows.filter((r) => r.hang === hangFilter);
    }
    const q = idSearch.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.id.toLowerCase().includes(q) || (r.seri_san_pham ?? "").toLowerCase().includes(q));
    return rows;
  }, [monthRowsAll, khuVucFilter, hangFilter, idSearch]);
  const pagedMonthRows = monthRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // CHOT 2026-08-03: rieng Admin, "Danh sach tong" van xuat duoc cot Link hinh anh (can tra cuu anh
  // khi xu ly khieu nai/doi soat) - moi noi xuat Excel khac trong app van loai bo cot nay theo mac
  // dinh (xem exportExcel.ts EXCLUDED_EXPORT_FIELDS).
  const isAdmin = auth.status === "authenticated" && auth.user.vai_tro === "Admin";
  const exportOptions = isAdmin ? { includeFields: ["link_hinh_anh"] } : undefined;

  async function handleExport() {
    if (tab === "dang-ton") {
      const all = await api.get<{ rows: CaseRow[] }>(`/cases/tong-hop${buildQuery({ trang_thai: "dang-ton", export: true, khu_vuc: khuVucFilter, hang: hangFilter, id: idSearch || undefined })}`);
      await exportRowsToExcel(all.rows.map((r) => ({ ...r, khu_vuc: shortKhuVuc(r.khu_vuc) })), "danh_sach_tong_dang_ton.xlsx", "Data", CASE_FIELD_LABELS, exportOptions);
    } else {
      await exportRowsToExcel(monthRows.map((r) => ({ ...r, khu_vuc: shortKhuVuc(r.khu_vuc) })), `danh_sach_tong_thang_${thang}.xlsx`, "Data", CASE_FIELD_LABELS, exportOptions);
    }
  }

  const columns: Column<CaseRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{r.id}</span> },
    { key: "khach_hang", header: "Khách hàng", render: (r) => r.khach_hang ?? "—" },
    { key: "hang", header: "Hãng", render: (r) => r.hang ?? "—" },
    { key: "nhom_san_pham", header: "Model", render: (r) => r.nhom_san_pham ?? "—" },
    { key: "ky_thuat_vien", header: "KTV", render: (r) => <KtvNameWithPhone kyThuatVien={r.ky_thuat_vien} canEdit={!!role && KTV_PHONE_EDIT_ROLES.includes(role)} /> },
    {
      key: "trang_thai",
      header: "Trạng thái",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={r.thoi_gian_hoan_thanh ? "teal" : "amber"}>{r.thoi_gian_hoan_thanh ? "Đã hoàn thành" : "Đang tồn"}</Badge>
          {r.huy_bo_at && <Badge tone="gray">🚫 Đã hủy</Badge>}
        </div>
      ),
    },
    { key: "thoi_gian_hoan_thanh", header: "Thời gian hoàn thành", render: (r) => <span className="text-xs">{fmtDateTime(r.thoi_gian_hoan_thanh)}</span> },
    {
      key: "dt_tong",
      header: "DT tổng",
      render: (r) => <span className="font-mono">{fmtVND((r.dt_san_pham ?? 0) + (r.dt_linh_kien ?? 0) + (r.dt_dich_vu ?? 0))}</span>,
    },
    { key: "khu_vuc", header: "Khu vực", render: (r) => shortKhuVuc(r.khu_vuc) },
  ];

  return (
    <div className="anim-in">
      <div className="text-sm text-[var(--ink-600)] mb-4">
        Danh sách ca đã đóng theo từng tháng bất kỳ (kể cả tháng cũ đã lưu trữ) và ca đang tồn đọng — chọn tháng ở bộ lọc bên dưới, mỗi lượt xem là 1 tệp riêng, dùng để đối
        chiếu hoặc làm báo cáo.
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
            ...(filterOptions?.khuVuc.map((k) => ({ value: k, label: k })) ?? []),
          ]}
          myAreas={myAreas}
        />
        <Select
          value={hangFilter}
          onChange={(v) => {
            setHangFilter(v);
            setPage(1);
          }}
          options={[{ value: "", label: "Tất cả hãng" }, ...(filterOptions?.hang.map((h) => ({ value: h, label: h })) ?? [])]}
        />
        {tab === "thang" && (
          <Select
            value={thang}
            onChange={(v) => {
              setThang(v);
              setPage(1);
            }}
            options={monthOptions}
          />
        )}
        <IdSerialSearchInput
          value={idSearch}
          onChange={(v) => {
            setIdSearch(v);
            setPage(1);
          }}
        />
      </div>
      <Tabs
        active={tab}
        onChange={(k) => {
          setTab(k);
          setPage(1);
        }}
        tabs={TABS}
      />
      <div className="flex justify-end mb-2 mt-4">
        <Btn variant="ghost" size="sm" onClick={handleExport}>
          ⬇ Xuất Excel
        </Btn>
      </div>
      {tab === "thang" && monthThrottled.length > 0 && (
        <div className="text-xs text-[var(--ink-400)] italic mb-2">
          {monthThrottled.length} ngày đang chờ đồng bộ (đã đạt giới hạn tải, tự thử lại sau ít phút) — vẫn hiển thị dữ liệu đã lưu gần nhất.
        </div>
      )}
      {tab === "dang-ton" ? (
        <PaginatedTable
          columns={columns}
          rows={openData?.rows ?? []}
          isLoading={openLoading}
          isError={openError}
          onRetry={openRefetch}
          page={page}
          pageSize={PAGE_SIZE}
          total={openData?.total ?? 0}
          onPageChange={setPage}
          onRowClick={(r) => openCase(r.id)}
          rowKey={(r) => r.id}
          emptyText="Không có ca đang tồn."
          storageKey="danh-sach-tong"
        />
      ) : (
        <PaginatedTable
          columns={columns}
          rows={pagedMonthRows}
          isLoading={monthLoading}
          isError={monthError}
          onRetry={monthRefetch}
          page={page}
          pageSize={PAGE_SIZE}
          total={monthRows.length}
          onPageChange={setPage}
          onRowClick={(r) => openCase(r.id)}
          rowKey={(r) => r.id}
          emptyText="Không có ca nào trong tháng này."
          storageKey="danh-sach-tong-thang"
        />
      )}
    </div>
  );
}
