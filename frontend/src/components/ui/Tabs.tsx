export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

export function Tabs({ tabs, active, onChange }: { tabs: TabItem[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="flex items-center gap-1 border-b border-[var(--line)] mb-4 overflow-x-auto">
      {tabs.map((t) => {
        const isActive = active === t.key;
        // Chi hien badge khi count > 0 - tab "rong" (0) khong can hien "(0)" gay roi mat, vua giup
        // hang tab gon hon vua lam tab co du lieu THUC SU noi bat (giong bao hieu "co tin nhan moi").
        const hasCount = !!t.count;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`focus-ring px-3 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${
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
