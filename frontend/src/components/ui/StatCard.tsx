import type { CSSProperties, ReactNode } from "react";
import { Card } from "./Card";
import type { BadgeTone } from "./Badge";

export function StatCard({
  label,
  value,
  sub,
  tone = "ocean",
  muted = false,
  active = false,
  spotlight = false,
  onClick,
  size = "md",
}: {
  label: string;
  value: string | number;
  sub?: ReactNode;
  tone?: BadgeTone;
  /** Lam mo di khi so lieu = 0 (khong co viec can lam) - giu "cham mau" + so lon noi bat CHI cho gia
   * tri >0, tranh the "0" canh bao mau do/cam gay nhieu loan mat khi quet nhanh nhieu the lien tiep. */
  muted?: boolean;
  /** The nay dang la bo loc dang duoc chon (CHOT 2026-08-06) - vien 2px + nen nhat theo mau tone, thay
   * the cac cho tung tu viet rieng "ring-2 ring-[...]" o TranhChapModule.tsx truoc day (khong nhat
   * quan giua cac module) - dung 1 quy uoc chung cho MOI StatCard co the bam duoc trong app. */
  active?: boolean;
  /** "Long lanh, sac so" (them 2026-08-20, theo yeu cau) - nen gradient 2 mau + vien phat sang + tien
   * to "✦" truoc label, danh cho 1-2 the CAN dap vao mat nhat trong 1 luoi (vd VIP/DMX/uu tien) khac
   * han "active" (dang la bo loc dang chon). Chi ap dung cho size="sm" (luoi day dac Quan ly ton). */
  spotlight?: boolean;
  onClick?: () => void;
  /** "sm" = the thu gon (CHOT 2026-08-16, "Phuong an A") - dung o cac luoi nhieu the day dac
   * (Quan ly ton), mac dinh "md" giu nguyen kich thuoc cu cho moi noi khac dang dung component nay. */
  size?: "md" | "sm";
}) {
  const ring = { ocean: "var(--ocean-500)", teal: "var(--teal-500)", amber: "var(--amber-500)", coral: "var(--coral-500)", orange: "var(--orange-500)", gray: "var(--ink-400)" }[tone];
  const tint = { ocean: "var(--ocean-100)", teal: "var(--teal-100)", amber: "var(--amber-100)", coral: "var(--coral-100)", orange: "var(--orange-100)", gray: "var(--bg)" }[tone];
  const spotlightStyle: CSSProperties = {
    background: "linear-gradient(135deg, var(--amber-100), var(--coral-100) 55%, var(--amber-100))",
    boxShadow: "0 0 0 1.5px var(--coral-500), 0 6px 16px -4px color-mix(in srgb, var(--coral-500) 60%, transparent)",
  };
  if (size === "sm") {
    return (
      <Card
        className={`p-1.5 flex-1 min-w-[110px] ${onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-transform" : ""}`}
        style={spotlight ? spotlightStyle : active ? { boxShadow: `0 0 0 2px ${ring}`, backgroundColor: tint } : undefined}
        onClick={onClick}
      >
        <div className="flex items-start justify-between gap-1">
          <span className={`text-[10px] font-semibold uppercase tracking-wide leading-tight ${spotlight ? "text-[var(--coral-600)]" : "text-[var(--ink-400)]"}`}>
            {spotlight && "✦ "}
            {label}
          </span>
          <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-0.5" style={{ background: muted ? "var(--ink-400)" : ring }}></span>
        </div>
        <div className={`font-display text-base sm:text-lg font-extrabold leading-tight mt-0.5 ${muted ? "text-[var(--ink-400)]" : spotlight ? "text-[var(--coral-600)]" : "text-[var(--ink-900)]"}`}>{value}</div>
        {sub && <div className="text-[10px] text-[var(--ink-400)] leading-tight mt-0.5">{sub}</div>}
      </Card>
    );
  }
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
