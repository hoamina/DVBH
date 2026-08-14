import { Card } from "./Card";
import type { BadgeTone } from "./Badge";

export function StatCard({
  label,
  value,
  sub,
  tone = "ocean",
  muted = false,
  active = false,
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: BadgeTone;
  /** Lam mo di khi so lieu = 0 (khong co viec can lam) - giu "cham mau" + so lon noi bat CHI cho gia
   * tri >0, tranh the "0" canh bao mau do/cam gay nhieu loan mat khi quet nhanh nhieu the lien tiep. */
  muted?: boolean;
  /** The nay dang la bo loc dang duoc chon (CHOT 2026-08-06) - vien 2px + nen nhat theo mau tone, thay
   * the cac cho tung tu viet rieng "ring-2 ring-[...]" o TranhChapModule.tsx truoc day (khong nhat
   * quan giua cac module) - dung 1 quy uoc chung cho MOI StatCard co the bam duoc trong app. */
  active?: boolean;
  onClick?: () => void;
}) {
  const ring = { ocean: "var(--ocean-500)", teal: "var(--teal-500)", amber: "var(--amber-500)", coral: "var(--coral-500)", gray: "var(--ink-400)" }[tone];
  const tint = { ocean: "var(--ocean-100)", teal: "var(--teal-100)", amber: "var(--amber-100)", coral: "var(--coral-100)", gray: "var(--bg)" }[tone];
  return (
    <Card
      className={`p-3 sm:p-4 flex-1 min-w-[150px] ${onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-transform" : ""}`}
      style={active ? { boxShadow: `0 0 0 2px ${ring}`, backgroundColor: tint } : undefined}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1.5 sm:mb-2">
        <span className="text-xs font-semibold text-[var(--ink-400)] uppercase tracking-wide">{label}</span>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: muted ? "var(--ink-400)" : ring }}></span>
      </div>
      <div className={`font-display text-xl sm:text-2xl font-extrabold ${muted ? "text-[var(--ink-400)]" : "text-[var(--ink-900)]"}`}>{value}</div>
      {sub && <div className="text-xs text-[var(--ink-400)] mt-1">{sub}</div>}
    </Card>
  );
}
