import type { ReactNode } from "react";
import type { BadgeTone } from "./Badge";

export type PillTone = BadgeTone | "indigo";

const TONE_MAP: Record<PillTone, string> = {
  ocean: "bg-[var(--ocean-100)] text-[var(--ocean-600)]",
  teal: "bg-[var(--teal-100)] text-[var(--teal-600)]",
  amber: "bg-[var(--amber-100)] text-[var(--amber-600)]",
  coral: "bg-[var(--coral-100)] text-[var(--coral-600)]",
  orange: "bg-[var(--orange-100)] text-[var(--orange-600)]",
  indigo: "bg-[var(--indigo-100)] text-[var(--indigo-600)]",
  gray: "bg-slate-100 text-[var(--ink-400)]",
};

/**
 * The pill bo tron - thay the cac cho tu viet rieng className cho "so/tag bam duoc trong bang day
 * dac" (vd NumCell o BacklogModule.tsx, nut bucket o MissingPartsModule.tsx, cot tuoi_ton) - CHI doi
 * hinh dang hien thi, khong doi y nghia mau/nguong dang dung o tung noi goi.
 */
export function Pill({
  children,
  tone = "gray",
  onClick,
  mono = true,
}: {
  children: ReactNode;
  tone?: PillTone;
  onClick?: () => void;
  mono?: boolean;
}) {
  const cls = `inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold ${mono ? "font-mono" : ""} ${TONE_MAP[tone]}`;
  return onClick ? (
    <button type="button" className={`${cls} hover:opacity-80 transition-opacity`} onClick={onClick}>
      {children}
    </button>
  ) : (
    <span className={cls}>{children}</span>
  );
}
