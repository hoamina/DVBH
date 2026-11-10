import { useEffect, useState } from "react";
import { tr } from "../../i18n/tr";
import { ApiError } from "../../api/client";

/** Thanh bao "du lieu bao cao dang tai" (2026-11-10, chu he thong: "khi bao cao dang load muc Tong quat, Doanh thu thi moi thu
 * nhu bi loi, do cung khong canh bao") - dinh tren cung man hinh bao cao, hien khi co request bao cao dang chay (sau 300 ms de
 * khong nhay khi cache tra ngay), qua 8 s thi them dong "bao cao nang". Request loi -> bao do + nut "Thử lại". */
export function BaoCaoDangTai({ dangTai, loi, onThuLai }: { dangTai: boolean; loi?: unknown; onThuLai?: () => void }) {
  const [hien, setHien] = useState(false);
  const [lau, setLau] = useState(false);
  useEffect(() => {
    if (!dangTai) {
      setHien(false);
      setLau(false);
      return;
    }
    const t1 = setTimeout(() => setHien(true), 300);
    const t2 = setTimeout(() => setLau(true), 8000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [dangTai]);

  if (loi && !dangTai) {
    const msg = loi instanceof ApiError ? (loi.detail ?? loi.message) : loi instanceof Error ? loi.message : String(loi);
    return (
      <div role="alert" className="sticky top-0 z-20 mb-3 flex items-center justify-between gap-2 flex-wrap rounded-lg border border-[var(--coral-500)]/50 bg-[var(--coral-100)] px-3 py-2 text-sm text-[var(--coral-600)]">
        <span>
          ⚠️ {tr("Không tải được dữ liệu báo cáo.")} <span className="opacity-70">{msg}</span>
        </span>
        {onThuLai && (
          <button onClick={onThuLai} className="focus-ring rounded-md border border-current px-2 py-0.5 text-xs font-semibold">
            {tr("Thử lại")}
          </button>
        )}
      </div>
    );
  }
  if (!hien) return null;
  return (
    <div role="status" aria-live="polite" className="sticky top-0 z-20 mb-3 flex items-center gap-2 rounded-lg border border-[var(--amber-500)]/50 bg-[var(--amber-100)] px-3 py-2 text-sm text-[var(--ink-700)] shadow-sm">
      <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span>
        <b className="font-semibold">{tr("Dữ liệu báo cáo đang tải, vui lòng chờ một chút…")}</b>
        {lau && <span className="block text-xs opacity-80">{tr("Báo cáo đang được tính lại nên có thể mất vài chục giây — không cần tải lại trang.")}</span>}
      </span>
    </div>
  );
}
