import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Select } from "./ui/Select";
import { CacheBanner } from "./ui/CacheBanner";
import { PaginatedTable, type Column } from "./ui/PaginatedTable";
import { api } from "../api/client";
import { getCachedEntry, setCachedEntry, type CacheEntry } from "../lib/closedDataCache";

/**
 * Tab "Ca da dong" dung chung cho Backlog va MissingParts: chon 1 thang, cache toan bo
 * ket qua thang do (IndexedDB, xem closedDataCache.ts) roi phan trang thuan phia client -
 * tranh phai goi lai server moi lan doi trang, va tranh keo het lich su ve cung luc.
 */
export function ClosedCasesTab<T>({
  cacheKeyPrefix,
  buildUrl,
  columns,
  rowKey,
  onRowClick,
  emptyText = "Không có ca nào trong tháng này.",
}: {
  cacheKeyPrefix: string;
  buildUrl: (thang: string) => string;
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  onRowClick: (row: T) => void;
  emptyText?: string;
}) {
  const { data: monthsData } = useQuery({
    queryKey: ["dashboard-months"],
    queryFn: () => api.get<{ months: string[] }>("/dashboard/months"),
  });

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [thang, setThang] = useState(currentMonth);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const qc = useQueryClient();
  const cacheKey = `${cacheKeyPrefix}-${thang}`;

  // So mot gia tri "phien ban du lieu" re (MAX(updated_at) qua index, xem backend/src/routes/cases.ts)
  // truoc khi quyet dinh dung cache hay tai lai - tu dong phat hien thang cu bi sua (vd GHI_DE tu
  // import lai) ma khong can nguoi dung tu doan roi bam "Dong bo lai" thu cong.
  const { data: entry, isLoading, isError, refetch } = useQuery({
    queryKey: ["closed-cases", cacheKeyPrefix, thang],
    queryFn: async (): Promise<CacheEntry<T[]>> => {
      const { version } = await api.get<{ version: string }>("/cases/data-version");
      const cached = await getCachedEntry<T[]>(cacheKey);
      if (cached && cached.version === version) return cached;
      const res = await api.get<{ rows: T[] }>(buildUrl(thang));
      return setCachedEntry(cacheKey, res.rows, version);
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const [{ version }, res] = await Promise.all([
        api.get<{ version: string }>("/cases/data-version"),
        api.get<{ rows: T[] }>(buildUrl(thang)),
      ]);
      return setCachedEntry(cacheKey, res.rows, version);
    },
    onSuccess: (newEntry) => {
      qc.setQueryData(["closed-cases", cacheKeyPrefix, thang], newEntry);
      setPage(1);
    },
  });

  const allRows = entry?.data ?? [];
  const pagedRows = allRows.slice((page - 1) * pageSize, page * pageSize);

  const monthOptions = (monthsData?.months ?? []).map((m) => ({ value: m, label: m }));
  if (!monthOptions.some((o) => o.value === currentMonth)) {
    monthOptions.unshift({ value: currentMonth, label: `${currentMonth} (hiện tại)` });
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-[var(--ink-400)]">Tháng:</span>
        <Select
          value={thang}
          onChange={(v) => {
            setThang(v);
            setPage(1);
          }}
          options={monthOptions}
        />
      </div>
      {entry && <CacheBanner cachedAt={entry.cachedAt} onSync={() => syncMutation.mutate()} isSyncing={syncMutation.isPending} />}
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
        onRowClick={onRowClick}
        rowKey={rowKey}
        emptyText={emptyText}
      />
    </div>
  );
}
