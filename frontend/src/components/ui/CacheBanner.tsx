import { Btn } from "./Btn";
import { fmtDateTime } from "../../types";

export function CacheBanner({ cachedAt, onSync, isSyncing }: { cachedAt: string; onSync: () => void; isSyncing: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap mb-3 px-3 py-2 rounded-lg bg-slate-100 text-xs text-[var(--ink-600)]">
      <span>
        📦 Dữ liệu đã hoàn thành, đang được lưu cache trên máy bạn — cập nhật lần cuối: <b className="font-semibold">{fmtDateTime(cachedAt)}</b>
      </span>
      <Btn variant="ghost" size="sm" onClick={onSync} disabled={isSyncing}>
        {isSyncing ? "Đang đồng bộ…" : "🔄 Đồng bộ lại"}
      </Btn>
    </div>
  );
}
