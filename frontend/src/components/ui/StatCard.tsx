import { Card } from "./Card";
import type { BadgeTone } from "./Badge";

export function StatCard({
  label,
  value,
  sub,
  tone = "ocean",
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: BadgeTone;
  onClick?: () => void;
}) {
  const ring = { ocean: "var(--ocean-500)", teal: "var(--teal-500)", amber: "var(--amber-500)", coral: "var(--coral-500)", gray: "var(--ink-400)" }[tone];
  return (
    <Card
      className={`p-4 flex-1 min-w-[170px] ${onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-transform" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[var(--ink-400)] uppercase tracking-wide">{label}</span>
        <span className="w-2 h-2 rounded-full" style={{ background: ring }}></span>
      </div>
      <div className="font-display text-2xl font-extrabold text-[var(--ink-900)]">{value}</div>
      {sub && <div className="text-xs text-[var(--ink-400)] mt-1">{sub}</div>}
    </Card>
  );
}
