import { useEffect, useRef, useState, type ReactNode } from "react";
import { Card } from "./Card";
import { Btn } from "./Btn";
import { LoadingInline } from "./LoadingInline";

export interface Column<T> {
  key: string;
  header: ReactNode;
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

interface ColConfig {
  /** Thu tu hien thi cua cac cot dang HIEN (khong bi ghim, khong bi an) - gom ca cot "mac dinh" (von
   * hien san) lan cot "bo sung" da duoc bat them, KHONG phan biet 2 loai nay nua (CHOT 2026-08-13:
   * truoc chi cot "bo sung" moi tat/bat duoc, cot mac dinh luon hien co dinh - gio nguoi dung an duoc
   * CA cot mac dinh, giong dung yeu cau "tat bot cot dang hien thi"). */
  order: string[];
  /** Cac cot nguoi dung DA CHU DONG an (bam tat trong "⚙ Tuy chinh cot") - PHAI luu rieng danh sach
   * nay (khong chi suy tu viec "khong co trong order") de phan biet "chua tung quyet dinh" (cot mac
   * dinh moi, tu dong hien) voi "da tung bam an" (giu an mai, khong bi "song lai" moi lan tai trang -
   * neu khong tach rieng, 1 cot mac dinh bi an se bi missingDefaultKeys coi la "chua quyet dinh" va tu
   * dong them lai vao lan doc sau). */
  hidden: string[];
}

function loadColumnConfig(storageKey: string | undefined): ColConfig {
  if (!storageKey || typeof window === "undefined") return { order: [], hidden: [] };
  try {
    const raw = window.localStorage.getItem(`col-config:${storageKey}`);
    if (!raw) return { order: [], hidden: [] };
    const parsed = JSON.parse(raw) as { order?: string[]; hidden?: string[] };
    return { order: Array.isArray(parsed.order) ? parsed.order : [], hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [] };
  } catch {
    return { order: [], hidden: [] };
  }
}

function saveColumnConfig(storageKey: string, config: ColConfig) {
  try {
    window.localStorage.setItem(`col-config:${storageKey}`, JSON.stringify(config));
  } catch {
    /* localStorage day/private mode - tinh nang phu, bo qua loi */
  }
}

interface PaginatedTableProps<T> {
  /** columns[0] LUON duoc ghim vi tri dau (khong keo/an duoc) - TAT CA cot con lai (columns[1..])
   * deu bat/tat duoc qua "⚙ Tuy chinh cot" (CHOT 2026-08-13: truoc day cac cot nay co dinh, chi
   * optionalColumns moi an/hien duoc - nay mac dinh HIEN nhung nguoi dung van tat duoc, giong dung
   * cach optionalColumns hoat dong, chi khac diem xuat phat mac dinh HIEN thay vi AN). */
  columns: Column<T>[];
  /** Cot bo sung AN mac dinh - nguoi dung tu bat qua nut "⚙" canh cot dau tien (xem settingsGear ben
   * duoi). Chi khac columns[1..] o DIEM XUAT PHAT (AN thay vi HIEN), cung 1 co che bat/tat/keo vi
   * tri sau do. */
  optionalColumns?: Column<T>[];
  /** Cac key trong optionalColumns duoc BAT SAN (hien nhu cot thuong) cho nguoi dung CHUA TUNG tuy
   * chinh bang nay tren may ho (xem hasCustomized trong resolvedOrder) - van la cot "tuy chon" nen
   * nguoi dung van co the tu tat qua "⚙" neu khong can, chi khac cot optional thuong (mac dinh AN)
   * la nhung cot nay mac dinh HIEN. Nguoi dung DA tung tuy chinh (bat/tat/keo BAT KY cot nao) thi GIU
   * NGUYEN lua chon cu, khong ep lai theo danh sach nay nua. */
  defaultVisibleOptionalKeys?: string[];
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
  /** Bat tinh nang keo doi rong tung cot (o mep phai header) + keo doi vi tri cot + chon cot bo
   * sung (khi co optionalColumns) - luu theo key nay vao localStorage cua trinh duyet, CHI luu cuc
   * bo tren may nguoi dung, khong dong bo len server, moi bang (moi "storageKey" khac nhau) nho
   * cau hinh rieng. Bo qua prop nay se giu nguyen hanh vi cu (khong keo/chon cot duoc). */
  storageKey?: string;
}

export function PaginatedTable<T>({
  columns,
  optionalColumns = [],
  defaultVisibleOptionalKeys = [],
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
  const [colConfig, setColConfig] = useState<ColConfig>(() => loadColumnConfig(storageKey));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const dragState = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const draggedColKey = useRef<string | null>(null);

  // Doi bang (storageKey doi) - doc lai cau hinh da luu rieng cho bang moi thay vi giu cau hinh cua
  // bang truoc do.
  useEffect(() => {
    setColWidths(loadColWidths(storageKey));
    setColConfig(loadColumnConfig(storageKey));
  }, [storageKey]);

  useEffect(() => {
    function onClickOutside() {
      setSettingsOpen(false);
    }
    if (settingsOpen) document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, [settingsOpen]);

  const pinnedColumn = columns[0];
  const defaultRestColumns = columns.slice(1);
  const columnMap = new Map<string, Column<T>>();
  for (const col of defaultRestColumns) columnMap.set(col.key, col);
  for (const col of optionalColumns) columnMap.set(col.key, col);

  // Cot HIEN dang hien thi (tru cot ghim) theo dung thu tu. 2 truong hop:
  // - Nguoi dung CHUA TUNG tuy chinh bang nay (order + hidden deu rong - phan biet voi "da tung an
  //   het moi cot" vi luc do hidden se khong rong) - dung mac dinh: TAT CA cot "thuong" (columns[1..])
  //   cong them cac cot optional "bat san" (defaultVisibleOptionalKeys), cot optional con lai AN.
  // - Da tung tuy chinh (bam an/hien it nhat 1 cot, hoac keo doi vi tri) - dung DUNG savedOrder da luu
  //   (loc bo key khong con ton tai), roi tu dong noi them cac cot "thuong" MOI (dev them field sau
  //   nay) vao cuoi NEU chua bi nguoi dung an tay - dam bao field moi khong "bien mat" nhung field
  //   nguoi dung tung an van AN, khong "song lai" moi lan tai trang (khac ban cu, xem CHOT 2026-08-13).
  const knownKeys = new Set(columnMap.keys());
  const hasCustomized = colConfig.order.length > 0 || colConfig.hidden.length > 0;
  const hiddenSet = new Set(colConfig.hidden.filter((k) => knownKeys.has(k)));
  let resolvedOrder: string[];
  if (!storageKey) {
    resolvedOrder = defaultRestColumns.map((c) => c.key);
  } else if (!hasCustomized) {
    resolvedOrder = [...defaultRestColumns.map((c) => c.key), ...defaultVisibleOptionalKeys.filter((k) => knownKeys.has(k))];
  } else {
    const savedOrder = colConfig.order.filter((k) => knownKeys.has(k) && !hiddenSet.has(k));
    const missingDefaultKeys = defaultRestColumns.map((c) => c.key).filter((k) => !savedOrder.includes(k) && !hiddenSet.has(k));
    resolvedOrder = [...savedOrder, ...missingDefaultKeys];
  }
  const visibleRestColumns = resolvedOrder.map((k) => columnMap.get(k)).filter((c): c is Column<T> => !!c);
  const effectiveColumns = pinnedColumn ? [pinnedColumn, ...visibleRestColumns] : visibleRestColumns;
  // Tat ca cot CO THE bat/tat qua "⚙ Tuy chinh cot" - gom CA cot "thuong" (truoc day co dinh, khong
  // an duoc) lan cot optional, tru cot ghim dau tien. Sap theo dung effectiveColumns hien tai truoc
  // (de danh sach trong panel khop thu tu dang hien), roi noi them cac cot dang AN o cuoi.
  const toggleableColumns = [...visibleRestColumns, ...defaultRestColumns.filter((c) => !resolvedOrder.includes(c.key)), ...optionalColumns.filter((c) => !resolvedOrder.includes(c.key))];

  function persist(next: ColConfig) {
    setColConfig(next);
    if (storageKey) saveColumnConfig(storageKey, next);
  }

  function toggleColumn(key: string) {
    if (resolvedOrder.includes(key)) {
      persist({ order: resolvedOrder.filter((k) => k !== key), hidden: [...colConfig.hidden.filter((k) => k !== key), key] });
    } else {
      persist({ order: [...resolvedOrder, key], hidden: colConfig.hidden.filter((k) => k !== key) });
    }
  }

  function handleColumnDrop(targetKey: string) {
    const draggedKey = draggedColKey.current;
    draggedColKey.current = null;
    setDragOverKey(null);
    if (!draggedKey || draggedKey === targetKey) return;
    const withoutDragged = resolvedOrder.filter((k) => k !== draggedKey);
    const targetIdx = withoutDragged.indexOf(targetKey);
    if (targetIdx === -1) return;
    withoutDragged.splice(targetIdx, 0, draggedKey);
    persist({ order: withoutDragged, hidden: colConfig.hidden });
  }

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
              {effectiveColumns.map((col, idx) => {
                const isPinned = idx === 0 && col.key === pinnedColumn?.key;
                const sortable = !!col.sortKey && !!onSortChange;
                const isActive = sortable && sortBy === col.sortKey;
                const width = colWidths[col.key];
                const reorderable = !!storageKey && !isPinned;
                return (
                  <th
                    key={col.key}
                    style={storageKey ? { width, maxWidth: width, position: "relative" } : undefined}
                    className={`py-2.5 px-3 ${col.className ?? ""} ${sortable ? "cursor-pointer select-none hover:text-[var(--ink-600)]" : ""} ${
                      reorderable ? "cursor-grab" : ""
                    } ${dragOverKey === col.key ? "bg-[var(--ocean-100)]" : ""}`}
                    onClick={sortable ? () => handleSortClick(col) : undefined}
                    draggable={reorderable}
                    onDragStart={reorderable ? (e) => { e.stopPropagation(); draggedColKey.current = col.key; } : undefined}
                    onDragOver={
                      reorderable
                        ? (e) => {
                            e.preventDefault();
                            if (draggedColKey.current && draggedColKey.current !== col.key) setDragOverKey(col.key);
                          }
                        : undefined
                    }
                    onDragLeave={reorderable ? () => setDragOverKey((k) => (k === col.key ? null : k)) : undefined}
                    onDrop={reorderable ? (e) => { e.preventDefault(); handleColumnDrop(col.key); } : undefined}
                    onDragEnd={reorderable ? () => { draggedColKey.current = null; setDragOverKey(null); } : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {isActive && <span>{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </span>
                    {isPinned && storageKey && (
                      // CHOT 2026-08-13: nut "⚙" truoc qua nho/mo nhat (chi 1 ky tu mau xam), nhieu
                      // nguoi dung khong biet co the tuy chinh cot - doi sang nut co nen/vien mau
                      // ocean + nhan chu (an tren man hinh rat hep) de noi bat hon han phan header con
                      // lai, dung chung cho MOI bang trong app (component nay dung lai khap noi). MO
                      // RONG 2026-08-13 (lan 2): truoc chi liet ke optionalColumns (an mac dinh) trong
                      // panel - nguoi dung yeu cau ro "tat bot ca cot dang hien thi" (khong chi bat cot
                      // an) giong dung the "Quan ly ton", nen gio liet ke TOAN BO toggleableColumns
                      // (gom ca cot "thuong" truoc day co dinh) - moi cot tru cot ghim dau tien deu bat/
                      // tat duoc.
                      <span className="relative inline-block ml-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSettingsOpen((v) => !v)}
                          className="focus-ring inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[var(--ocean-400)] bg-[var(--ocean-100)] text-[var(--ocean-700)] hover:bg-[var(--ocean-400)] hover:text-white normal-case font-semibold transition-colors"
                          title="Chọn cột hiển thị / ẩn bớt, đổi độ rộng, kéo thả sắp xếp cột"
                        >
                          <span className="text-sm leading-none">⚙</span>
                          <span className="hidden sm:inline whitespace-nowrap">Tùy chỉnh cột</span>
                        </button>
                        {settingsOpen && (
                          <div className="absolute left-0 top-full mt-2 w-64 max-h-96 overflow-y-auto bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-lg py-1.5 z-20 anim-in normal-case font-normal">
                            <div className="px-3 py-1.5 text-xs text-[var(--ink-600)] border-b border-[var(--line)] mb-1">
                              ↔ Kéo đường kẻ giữa 2 tiêu đề để đổi độ rộng · Kéo cả tiêu đề để đổi vị trí cột
                            </div>
                            <div className="px-3 py-1.5 text-[11px] font-semibold text-[var(--ink-400)] uppercase tracking-wide">Cột hiển thị (bỏ tick để ẩn bớt)</div>
                            {toggleableColumns.map((tc) => (
                              <label key={tc.key} className="flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--ink-700)] hover:bg-slate-50 cursor-pointer">
                                <input type="checkbox" checked={resolvedOrder.includes(tc.key)} onChange={() => toggleColumn(tc.key)} className="w-3.5 h-3.5" />
                                {tc.header}
                              </label>
                            ))}
                          </div>
                        )}
                      </span>
                    )}
                    {storageKey && (
                      // CHOT 2026-08-13: them 1 duong ke doc LUON HIEN (khong chi khi hover nua) giua
                      // 2 cot de nguoi dung nhan ra ngay vi tri co the keo - vung bam/keo (w-2.5) van
                      // rong hon duong ke that (chi 1px) de de trung chuot, nen mau dam han khi hover.
                      <span
                        onMouseDown={(e) => handleResizeStart(e, col.key, width ?? (e.currentTarget.parentElement as HTMLElement).offsetWidth)}
                        onClick={(e) => e.stopPropagation()}
                        draggable={false}
                        className="group absolute top-0 right-0 h-full w-2.5 cursor-col-resize select-none flex items-center justify-center hover:bg-[var(--ocean-100)]"
                        title="Kéo để đổi độ rộng cột"
                      >
                        <span className="w-px h-3/5 bg-[var(--ink-400)] group-hover:bg-[var(--ocean-500)]" />
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={effectiveColumns.length} className="py-4 px-3 text-center">
                  <LoadingInline className="text-sm font-semibold text-[var(--ink-600)] justify-center" />
                </td>
              </tr>
            )}
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b border-[var(--line)] last:border-0">
                  {effectiveColumns.map((col) => (
                    <td key={col.key} className="py-3 px-3">
                      <div className="h-3.5 rounded bg-slate-100 animate-pulse" style={{ width: `${40 + ((i * 13) % 50)}%` }} />
                    </td>
                  ))}
                </tr>
              ))}

            {!isLoading && isError && (
              <tr>
                <td colSpan={effectiveColumns.length} className="py-8 text-center">
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
                <td colSpan={effectiveColumns.length} className="py-8 text-center text-[var(--ink-400)] text-sm">
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
                  {effectiveColumns.map((col) => {
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
