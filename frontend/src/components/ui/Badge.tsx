import type { ReactNode } from "react";

export type BadgeTone = "ocean" | "teal" | "amber" | "coral" | "orange" | "gray";
// Them 2026-08-22 - rieng cho tab "Tien trinh chung" (CaseDetail.tsx): can gan MOI nguon log 1 mau
// rieng de phan biet (vd giai trinh vs mua hang truoc day trung mau "ocean"). Tach thanh type RIENG
// (khong nhap thang vao BadgeTone) de khong phai sua lai moi noi khac dang dung "Record<BadgeTone,...>"
// day du 6 gia tri cu (StatCard/Pill/HeroStat/datMuaLinhKien/constants.ts).
export type TimelineTone = "indigo" | "violet" | "sky" | "rose" | "lime" | "cyan" | "fuchsia";
export type AnyBadgeTone = BadgeTone | TimelineTone;

const TONE_MAP: Record<AnyBadgeTone, [string, string]> = {
  ocean: ["bg-[var(--ocean-100)] text-[var(--ocean-800)]", "bg-[var(--ocean-500)] text-white"],
  teal: ["bg-[var(--teal-100)] text-[var(--teal-500)]", "bg-[var(--teal-500)] text-white"],
  amber: ["bg-[var(--amber-100)] text-[var(--amber-500)]", "bg-[var(--amber-500)] text-white"],
  coral: ["bg-[var(--coral-100)] text-[var(--coral-500)]", "bg-[var(--coral-500)] text-white"],
  orange: ["bg-[var(--orange-100)] text-[var(--orange-600)]", "bg-[var(--orange-500)] text-white"],
  gray: ["bg-slate-100 text-slate-600", "bg-slate-500 text-white"],
  indigo: ["bg-[var(--indigo-100)] text-[var(--indigo-700)]", "bg-[var(--indigo-500)] text-white"],
  violet: ["bg-violet-100 text-[var(--violet-600)]", "bg-[var(--violet-500)] text-white"],
  sky: ["bg-sky-100 text-sky-700", "bg-sky-500 text-white"],
  rose: ["bg-rose-100 text-rose-700", "bg-rose-500 text-white"],
  lime: ["bg-lime-100 text-lime-700", "bg-lime-500 text-white"],
  cyan: ["bg-cyan-100 text-cyan-700", "bg-cyan-500 text-white"],
  fuchsia: ["bg-fuchsia-100 text-fuchsia-700", "bg-fuchsia-500 text-white"],
};

export function Badge({ children, tone = "ocean", solid = false }: { children: ReactNode; tone?: AnyBadgeTone; solid?: boolean }) {
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
