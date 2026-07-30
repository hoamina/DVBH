import { useEffect, useRef, useState, type ReactNode } from "react";
import { Card } from "./Card";
import { Btn } from "./Btn";
import { LoadingInline } from "./LoadingInline";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  /** Neu co, header cot nay co the bam de sap xep (xem sortBy/sortDir/onSortChange o PaginatedTableProps). */
  sortKey?: string;
}

const MIN_COL_WIDTH = 60;

function loadColWidths(storageKey: string | undefined): Record<string, number> {
  if (!storageKey || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`col-widths:${storageKey}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

interface PaginatedTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onRowClick?: (row: T) => void;
  emptyText?: string;
  rowKey: (row: T) => string | number;
  /** Sap xep (tuy chon) - chi cot co Column.sortKey moi hien header bam duoc, chi khi onSortChange duoc truyen vao. */
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSortChange?: (sortBy: string, sortDir: "asc" | "desc") => void;
  /** Bat tinh nang keo doi rong tung cot (o mep phai header), luu theo key nay vao localStorage
   * cua trinh duyet - CHI luu cuc bo tren may nguoi dung, khong dong bo len server, moi bang
   * (moi "storageKey" khac nhau) nho do rong rieng. Bo qua prop nay se giu nguyen hanh vi cu
   * (do rong cot tu dong theo noi dung, khong keo duoc). */
  storageKey?: string;
}

export function PaginatedTable<T>({
  columns,
  rows,
  isLoading,
  isError,
  onRetry,
  page,
  pageSize,
  total,
  onPageChange,
  onRowClick,
  emptyText = "Không có dữ liệu.",
  rowKey,
  sortBy,
  sortDir,
  onSortChange,
  storageKey,
}: PaginatedTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => loadColWidths(storageKey));
  const dragState = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // Doi bang (storageKey doi) - doc lai do rong da luu rieng cho bang moi thay vi giu do rong cua
  // bang truoc do.
  useEffect(() => {
    setColWidths(loadColWidths(storageKey));
  }, [storageKey]);

  function handleSortClick(col: Column<T>) {
    if (!col.sortKey || !onSortChange) return;
    if (sortBy === col.sortKey) {
      onSortChange(col.sortKey, sortDir === "asc" ? "desc" : "asc");
    } else {
      onSortChange(col.sortKey, "asc");
    }
  }

  function handleResizeStart(e: React.MouseEvent, colKey: string, startWidth: number) {
    e.preventDefault();
    e.stopPropagation();
    dragState.current = { key: colKey, startX: e.clientX, startWidth };

    function onMove(ev: MouseEvent) {
      if (!dragState.current) return;
      // Bat key/startX/startWidth ra bien local NGAY o day (khong doc lai dragState.current ben
      // trong callback updater ben duoi) - React co the hoan lai viec goi callback updater cua
      // setState sang sau (vd nhieu su kien mousemove/mouseup don don trong 1 tick), luc do
      // dragState.current co the da bi onUp() gan ve null mat roi, gay TypeError "Cannot read
      // properties of null (reading 'key')" va crash toan bo app (khong co error boundary).
      const { key, startX, startWidth } = dragState.current;
      const next = Math.max(MIN_COL_WIDTH, startWidth + (ev.clientX - startX));
      setColWidths((prev) => ({ ...prev, [key]: next }));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dragState.current = null;
      if (!storageKey) return;
      setColWidths((prev) => {
        try {
          window.localStorage.setItem(`col-widths:${storageKey}`, JSON.stringify(prev));
        } catch {
          /* localStorage day/private mode - tinh nang phu, bo qua loi */
        }
        return prev;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="dense w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--ink-400)] text-xs uppercase bg-slate-50 border-b border-[var(--line)]">
              {columns.map((col) => {
                const sortable = !!col.sortKey && !!onSortChange;
                const isActive = sortable && sortBy === col.sortKey;
                const width = colWidths[col.key];
                return (
                  <th
                    key={col.key}
                    style={storageKey ? { width, maxWidth: width, position: "relative" } : undefined}
                    className={`py-2.5 px-3 ${col.className ?? ""} ${sortable ? "cursor-pointer select-none hover:text-[var(--ink-600)]" : ""}`}
                    onClick={sortable ? () => handleSortClick(col) : undefined}
                  >
                    {col.header}
                    {isActive && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
                    {storageKey && (
                      <span
                        onMouseDown={(e) => handleResizeStart(e, col.key, width ?? (e.currentTarget.parentElement as HTMLElement).offsetWidth)}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-0 right-0 h-full w-2 cursor-col-resize select-none hover:bg-[var(--ocean-300)]/60"
                        title="Kéo để đổi độ rộng cột"
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={columns.length} className="py-4 px-3 text-center">
                  <LoadingInline className="text-sm font-semibold text-[var(--ink-600)] justify-center" />
                </td>
              </tr>
            )}
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b border-[var(--line)] last:border-0">
                  {columns.map((col) => (
                    <td key={col.key} className="py-3 px-3">
                      <div className="h-3.5 rounded bg-slate-100 animate-pulse" style={{ width: `${40 + ((i * 13) % 50)}%` }} />
                    </td>
                  ))}
                </tr>
              ))}

            {!isLoading && isError && (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center">
                  <div className="text-sm text-[var(--coral-500)] font-semibold mb-2">Không tải được dữ liệu.</div>
                  {onRetry && (
                    <Btn size="sm" variant="ghost" onClick={onRetry}>
                      Thử lại
                    </Btn>
                  )}
                </td>
              </tr>
            )}

            {!isLoading && !isError && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-[var(--ink-400)] text-sm">
                  {emptyText}
                </td>
              </tr>
            )}

            {!isLoading &&
              !isError &&
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={`border-b border-[var(--line)] last:border-0 hover:bg-slate-50 ${onRowClick ? "cursor-pointer" : ""}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => {
                    const width = colWidths[col.key];
                    return (
                      <td
                        key={col.key}
                        style={storageKey && width ? { width, maxWidth: width, overflow: "hidden" } : undefined}
                        className={`py-2 px-3 ${col.className ?? ""}`}
                      >
                        {col.render(row)}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-3 py-2.5 border-t border-[var(--line)] text-xs text-[var(--ink-400)]">
        <span>{total} dòng</span>
        <div className="flex gap-1">
          <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            ‹
          </Btn>
          <span className="px-2 py-1.5">
            {page}/{totalPages}
          </span>
          <Btn variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            ›
          </Btn>
        </div>
      </div>
    </Card>
  );
}
