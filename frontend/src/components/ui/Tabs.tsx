import type { ReactNode } from "react";
export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

/** extra (2026-11-13): noi dung phu nam CUNG HANG ben phai thanh tab (vd "Xem thêm N tab trống") - khong ton 1 hang rieng. */
export function Tabs({ tabs, active, onChange, extra }: { tabs: TabItem[]; active: string; onChange: (key: string) => void; extra?: ReactNode }) {
  if (extra)
    return (
      <div className="flex items-end gap-2 border-b border-[var(--line)] mb-4">
        <div className="flex-1 min-w-0 [&>div]:border-b-0 [&>div]:mb-0">
          <Tabs tabs={tabs} active={active} onChange={onChange} />
        </div>
        <div className="shrink-0 pb-2">{extra}</div>
      </div>
    );
  return (
    // Dien thoai (<768px, 2026-11-07): tab XUONG DONG thay vi cuon ngang (Settings ~2400px, Import ~1200px phai vuot
    // ngang moi thay tab cuoi); tu md tro len giu 1 hang cuon ngang nhu cu.
    <div className="flex flex-wrap md:flex-nowrap items-center gap-x-0.5 md:gap-1 border-b border-[var(--line)] mb-4 md:overflow-x-auto">
      {tabs.map((t) => {
        const isActive = active === t.key;
        // Chi hien badge khi count > 0 - tab "rong" (0) khong can hien "(0)" gay roi mat, vua giup
        // hang tab gon hon vua lam tab co du lieu THUC SU noi bat (giong bao hieu "co tin nhan moi").
        const hasCount = !!t.count;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`focus-ring px-2 md:px-3 py-2 md:py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
              isActive
                ? "border-[var(--ocean-500)] text-[var(--ocean-600)]"
                : hasCount
                  ? "border-transparent text-[var(--ink-700)] hover:text-[var(--ink-900)]"
                  : "border-transparent text-[var(--ink-400)] hover:text-[var(--ink-600)]"
            }`}
          >
            {t.label}
            {hasCount && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--coral-500)] text-white text-[10px] font-bold leading-none">
                {t.count! > 99 ? "99+" : t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
