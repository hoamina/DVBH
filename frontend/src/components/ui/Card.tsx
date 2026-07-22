import type { ReactNode } from "react";

export function Card({ className = "", children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div className={`bg-[var(--surface)] rounded-2xl border border-[var(--line)] shadow-[0_1px_2px_rgba(15,37,54,0.04)] ${className}`} onClick={onClick}>
      {children}
    </div>
  );
}
