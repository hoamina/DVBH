import type { ReactNode } from "react";

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold text-[var(--ink-400)] uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium text-[var(--ink-900)]">{value}</div>
    </div>
  );
}
