import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { CacheBanner } from "../components/ui/CacheBanner";
import { Btn } from "../components/ui/Btn";
import { api, buildQuery } from "../api/client";
import { fmtDateTime, type CaseRow } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { getCachedEntry, setCachedEntry, type CacheEntry } from "../lib/closedDataCache";

const CACHE_KEY = "archived-cases-all";

async function fetchAllArchived(): Promise<CaseRow[]> {
  const res = await api.get<{ rows: CaseRow[] }>(`/cases/archived${buildQuery({ export: true })}`);
  return res.rows;
}

export function ArchivedModule({ openCase }: { openCase: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const qc = useQueryClient();

  const { data: cacheEntry, isLoading, isError, refetch } = useQuery({
    queryKey: ["archived-cache"],
    queryFn: async (): Promise<CacheEntry<CaseRow[]>> => {
      const cached = await getCachedEntry<CaseRow[]>(CACHE_KEY);
      if (cached) return cached;
      const rows = await fetchAllArchived();
      return setCachedEntry(CACHE_KEY, rows);
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const rows = await fetchAllArchived();
      return setCachedEntry(CACHE_KEY, rows);
    },
    onSuccess: (entry) => {
      qc.setQueryData(["archived-cache"], entry);
      setPage(1);
    },
  });

  async function handleExport() {
    await exportRowsToExcel(cacheEntry?.data ?? [], "ca_luu_tru.xlsx");
  }

  const allRows = cacheEntry?.data ?? [];
  const pagedRows = allRows.slice((page - 1) * pageSize, page * pageSize);

  const columns: Column<CaseRow>[] = [
    { key: "id", header: "ID", render: (c) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{c.id}</span> },
    { key: "khach_hang", header: "Khách hàng", render: (c) => c.khach_hang ?? "—" },
    { key: "khu_vuc", header: "Khu vực", render: (c) => c.khu_vuc ?? "—" },
    { key: "hoan_thanh", header: "Hoàn thành", render: (c) => <span className="text-xs">{fmtDateTime(c.thoi_gian_hoan_thanh)}</span> },
    { key: "archived_at", header: "Đã lưu trữ", render: (c) => <span className="text-xs">{fmtDateTime(c.archived_at)}</span> },
  ];

  return (
    <div className="anim-in">
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="text-sm text-[var(--ink-600)]">
          Ca đã hoàn thành quá 3 tháng được tự động chuyển vào lưu trữ (chính sách lưu trữ dữ liệu). Dữ liệu vẫn được giữ nguyên, chỉ ẩn khỏi các danh sách vận hành mặc định.
        </div>
        <Btn variant="ghost" size="sm" onClick={handleExport}>
          ⬇ Xuất Excel
        </Btn>
      </div>
      {cacheEntry && <CacheBanner cachedAt={cacheEntry.cachedAt} onSync={() => syncMutation.mutate()} isSyncing={syncMutation.isPending} />}
      <PaginatedTable
        columns={columns}
        rows={pagedRows}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        page={page}
        pageSize={pageSize}
        total={allRows.length}
        onPageChange={setPage}
        onRowClick={(c) => openCase(c.id)}
        rowKey={(c) => c.id}
        emptyText="Chưa có ca nào được lưu trữ."
      />
    </div>
  );
}
