import type { ReactNode } from "react";
import { Card } from "./Card";
import type { BadgeTone } from "./Badge";

export type HeroTone = BadgeTone | "indigo";

/**
 * Bien the "hero" cua StatCard - nen tint LUON bat (khong chi khi active) + vach accent trai + so
 * lon hon, danh cho DUNG 1 chi so quan trong nhat cua moi khu vuc man hinh (khong thay the toan bo
 * StatCard). Cung props shape voi StatCard de thay 1-1 tai dung diem can nhan manh.
 */
export function HeroStat({
  label,
  value,
  sub,
  tone = "ocean",
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: ReactNode;
  tone?: HeroTone;
  onClick?: () => void;
}) {
  const accent = { ocean: "var(--ocean-500)", teal: "var(--teal-500)", amber: "var(--amber-500)", coral: "var(--coral-500)", orange: "var(--orange-500)", indigo: "var(--indigo-600)", gray: "var(--ink-400)" }[tone];
  const tint = { ocean: "var(--ocean-100)", teal: "var(--teal-100)", amber: "var(--amber-100)", coral: "var(--coral-100)", orange: "var(--orange-100)", indigo: "var(--indigo-100)", gray: "var(--bg)" }[tone];
  const text = { ocean: "var(--ocean-700)", teal: "var(--teal-600)", amber: "var(--amber-700)", coral: "var(--coral-600)", orange: "var(--orange-600)", indigo: "var(--indigo-700)", gray: "var(--ink-700)" }[tone];
  return (
    <Card
      className={`p-1.5 flex-1 min-w-[110px] ${onClick ? "cursor-pointer hover:-translate-y-0.5 transition-transform" : ""}`}
      style={{ backgroundColor: tint, borderLeft: `4px solid ${accent}`, borderRadius: "16px" }}
      onClick={onClick}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide leading-tight" style={{ color: text, opacity: 0.85 }}>
        {label}
      </div>
      <div className="font-display text-base sm:text-lg font-extrabold leading-tight mt-0.5" style={{ color: text }}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] leading-tight mt-0.5" style={{ color: text, opacity: 0.7 }}>
          {sub}
        </div>
      )}
    </Card>
  );
}
