import type { ReactNode } from "react";

export type BadgeTone = "ocean" | "teal" | "amber" | "coral" | "gray";

const TONE_MAP: Record<BadgeTone, [string, string]> = {
  ocean: ["bg-[var(--ocean-100)] text-[var(--ocean-800)]", "bg-[var(--ocean-500)] text-white"],
  teal: ["bg-[var(--teal-100)] text-[var(--teal-500)]", "bg-[var(--teal-500)] text-white"],
  amber: ["bg-[var(--amber-100)] text-[var(--amber-500)]", "bg-[var(--amber-500)] text-white"],
  coral: ["bg-[var(--coral-100)] text-[var(--coral-500)]", "bg-[var(--coral-500)] text-white"],
  gray: ["bg-slate-100 text-slate-600", "bg-slate-500 text-white"],
};

export function Badge({ children, tone = "ocean", solid = false }: { children: ReactNode; tone?: BadgeTone; solid?: boolean }) {
  const cls = TONE_MAP[tone][solid ? 1 : 0];
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${cls}`}>{children}</span>;
}

/** Suy ra tong mau tu chuoi trang thai vi pham (khop voi mockup statusTone). */
export function statusTone(status: string): BadgeTone {
  if (status.includes("đã xác nhận")) return "coral";
  if (status.includes("chờ QC")) return "amber";
  if (status.includes("Nghi ngờ")) return "ocean";
  if (status.includes("Không vi phạm")) return "teal";
  return "gray";
}
