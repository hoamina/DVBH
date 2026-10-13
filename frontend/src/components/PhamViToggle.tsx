import { useQueryClient } from "@tanstack/react-query";
import { PHAM_VI_LABEL, setPhamVi, usePhamVi, type PhamVi } from "../lib/phamVi";

// Nut "Phạm vi báo cáo" (2026-10-13) - dat o TopBar canh nut Địa giới. CHI anh huong viec xem bao cao/danh sach
// (lib/phamVi.ts). Doi pham vi -> bo toan bo du lieu react-query de moi man tai lai theo pham vi moi.
const OPTS: { value: PhamVi; title: string }[] = [
  { value: "tat_ca", title: "Xem toàn bộ hệ thống" },
  { value: "nskx", title: "Chỉ xem ca đối tác NSKX" },
  { value: "khong_nskx", title: "Xem toàn hệ thống TRỪ ca đối tác NSKX" },
];

export function PhamViToggle({ className = "" }: { className?: string }) {
  const pv = usePhamVi();
  const qc = useQueryClient();
  const chon = (v: PhamVi) => {
    if (v === pv) return;
    setPhamVi(v);
    qc.resetQueries();
  };
  const dangLoc = pv !== "tat_ca";
  return (
    <div className={`flex items-center gap-1.5 ${className}`} title="Phạm vi dữ liệu của mọi báo cáo / danh sách (không ảnh hưởng nghiệp vụ)">
      <span className={`text-[11px] hidden lg:inline ${dangLoc ? "font-bold text-[var(--coral-500)]" : "text-[var(--ink-400)]"}`}>
        {dangLoc ? "Đang xem" : "Phạm vi"}
      </span>
      <div
        role="radiogroup"
        aria-label="Phạm vi báo cáo"
        className={`inline-flex rounded-lg border p-0.5 bg-[var(--surface)] ${dangLoc ? "border-[var(--coral-500)] ring-2 ring-[var(--coral-500)]/20" : "border-[var(--line)]"}`}
      >
        {OPTS.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={pv === o.value}
            title={o.title}
            onClick={() => chon(o.value)}
            className={`focus-ring px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              pv === o.value
                ? o.value === "tat_ca"
                  ? "bg-[var(--ocean-500)] text-white"
                  : "bg-[var(--coral-500)] text-white"
                : "text-[var(--ink-600)] hover:bg-slate-100"
            }`}
          >
            {PHAM_VI_LABEL[o.value]}
          </button>
        ))}
      </div>
    </div>
  );
}
