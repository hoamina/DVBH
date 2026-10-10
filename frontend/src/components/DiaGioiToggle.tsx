import { useDiaGioiMode, type DiaGioiMode } from "../lib/diaGioi";

// Nut chuyen "Địa giới cũ / mới" (2026-10-10) - dat o TopBar, ap dung CHUNG moi bao cao/bo loc tinh-huyen-xa
// (lib/diaGioi.ts). Luu tren may nguoi dung.
const OPTS: { value: DiaGioiMode; label: string; title: string }[] = [
  { value: "cu", label: "Cũ", title: "Địa giới CŨ: 63 tỉnh + quận/huyện (ca chưa có tỉnh cũ → để trống)" },
  { value: "moi", label: "Mới", title: "Địa giới MỚI: 34 tỉnh + xã/phường mới (ca cũ chưa có tỉnh mới → tự quy đổi theo bảng Quy đổi tỉnh)" },
];

export function DiaGioiToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useDiaGioiMode();
  return (
    <div className={`flex items-center gap-1.5 ${className}`} title="Chọn cách nhóm/lọc tỉnh trong mọi báo cáo">
      <span className="text-[11px] text-[var(--ink-400)] hidden lg:inline">Địa giới</span>
      <div role="radiogroup" aria-label="Địa giới" className="inline-flex rounded-lg border border-[var(--line)] p-0.5 bg-[var(--surface)]">
        {OPTS.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={mode === o.value}
            title={o.title}
            onClick={() => setMode(o.value)}
            className={`focus-ring px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
              mode === o.value ? "bg-[var(--ocean-500)] text-white" : "text-[var(--ink-600)] hover:bg-slate-100"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
