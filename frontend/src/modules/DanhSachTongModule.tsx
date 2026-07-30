import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs } from "../components/ui/Tabs";
import { Select } from "../components/ui/Select";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { api, buildQuery } from "../api/client";
import { fmtDateTime, fmtVND, type CaseRow, type Paged } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { CASE_FIELD_LABELS } from "../lib/caseFieldLabels";
import { useAuth } from "../auth/AuthContext";
import { useDaDongChunked } from "../hooks/useDaDongChunked";
import { QLDVBH_FILTER_VALUE } from "../constants";

const PAGE_SIZE = 20;

function monthValue(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(offset: number): string {
  const [y, m] = monthValue(offset).split("-");
  return `${m}/${y}`;
}

// 3 "file" thang rieng biet (hien tai + 2 thang truoc) + 1 "file" ca dang ton - moi tab la 1 tap
// du lieu doc lap, co nut Xuat Excel rieng, thay vi gop chung tat ca vao 1 bang dai nhu truoc.
const MONTH_TABS = [
  { key: "thang-0", label: `Tháng ${monthLabel(0)} (hiện tại)`, thang: monthValue(0) },
  { key: "thang-1", label: `Tháng ${monthLabel(1)}`, thang: monthValue(1) },
  { key: "thang-2", label: `Tháng ${monthLabel(2)}`, thang: monthValue(2) },
];
const TABS = [...MONTH_TABS, { key: "dang-ton", label: "Ca đang tồn" }];

export function DanhSachTongModule({ openCase }: { openCase: (id: string) => void }) {
  const auth = useAuth();
  const myAreas = auth.status === "authenticated" ? auth.user.khu_vuc_phu_trach : [];
  const [tab, setTab] = useState(MONTH_TABS[0].key);
  const [page, setPage] = useState(1);
  const [khuVucFilter, setKhuVucFilter] = useState("");
  const [hangFilter, setHangFilter] = useState("");

  const { data: filterOptions } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ khuVuc: string[]; hang: string[] }>("/dashboard/filters"),
  });

  const monthTab = MONTH_TABS.find((t) => t.key === tab);

  // Snapshot R2 tung ngay (xem hooks/useDaDongChunked.ts + backend/src/lib/daDongDayChunks.ts) -
  // hook tu quan ly cache IndexedDB + hash-diff + rate-limit, roi phan trang + loc khu_vuc/hang
  // thuan phia client (khong con dinh kem vao request server nua).
  const {
    rows: monthRowsAll,
    isLoading: monthLoading,
    isError: monthError,
    refetch: monthRefetch,
    throttled: monthThrottled,
  } = useDaDongChunked(monthTab?.thang ?? MONTH_TABS[0].thang, !!monthTab);

  // Ca dang ton co the doi bat cu luc nao - giu phan trang server-side + luon fetch moi, khong
  // cache toan bo nhu 3 tab thang (von la du lieu da chot, khong doi nua).
  const {
    data: openData,
    isLoading: openLoading,
    isError: openError,
    refetch: openRefetch,
  } = useQuery({
    queryKey: ["cases-tong-hop-dang-ton", page, khuVucFilter, hangFilter],
    queryFn: () => api.get<Paged<CaseRow>>(`/cases/tong-hop${buildQuery({ trang_thai: "dang-ton", page, pageSize: PAGE_SIZE, khu_vuc: khuVucFilter, hang: hangFilter })}`),
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
    return rows;
  }, [monthRowsAll, khuVucFilter, hangFilter]);
  const pagedMonthRows = monthRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleExport() {
    if (tab === "dang-ton") {
      const all = await api.get<{ rows: CaseRow[] }>(`/cases/tong-hop${buildQuery({ trang_thai: "dang-ton", export: true, khu_vuc: khuVucFilter, hang: hangFilter })}`);
      await exportRowsToExcel(all.rows, "danh_sach_tong_dang_ton.xlsx", "Data", CASE_FIELD_LABELS);
    } else {
      await exportRowsToExcel(monthRows, `danh_sach_tong_thang_${monthTab!.thang}.xlsx`, "Data", CASE_FIELD_LABELS);
    }
  }

  const columns: Column<CaseRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{r.id}</span> },
    { key: "khach_hang", header: "Khách hàng", render: (r) => r.khach_hang ?? "—" },
    { key: "khu_vuc", header: "Khu vực", render: (r) => r.khu_vuc ?? "—" },
    { key: "hang", header: "Hãng", render: (r) => r.hang ?? "—" },
    { key: "nhom_san_pham", header: "Model", render: (r) => r.nhom_san_pham ?? "—" },
    { key: "ky_thuat_vien", header: "KTV", render: (r) => r.ky_thuat_vien ?? "—" },
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
  ];

  return (
    <div className="anim-in">
      <div className="text-sm text-[var(--ink-600)] mb-4">
        Danh sách ca đã đóng theo từng tháng ({monthLabel(2)} – {monthLabel(0)}) và ca đang tồn đọng — mỗi tab là 1 tệp riêng, dùng để đối chiếu hoặc làm báo cáo.
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
      {tab !== "dang-ton" && monthThrottled.length > 0 && (
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
        />
      )}
    </div>
  );
}
