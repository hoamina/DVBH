import { useTranslation } from "react-i18next";
import { coDiaGioiCu, useDiaGioiMode, type DiaGioiMode } from "../lib/diaGioi";
import { useQuocGiaDangXem } from "../lib/phamVi";
import { tr } from "../i18n/tr";

// Nut chuyen "Địa giới cũ / mới" (2026-10-10) - dat o TopBar, ap dung CHUNG moi bao cao/bo loc tinh-huyen-xa
// (lib/diaGioi.ts). Luu tren may nguoi dung.
// Nhan/tooltip dich qua i18n "diaGioi.<value>" + "diaGioi.<value>Title".
const OPTS: DiaGioiMode[] = ["cu", "moi"];

export function DiaGioiToggle({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useDiaGioiMode();
  // Nuoc khac VN (vd PH) khong co tinh cu -> khoa "Cũ", che do luon "Mới" (lib/diaGioi.ts readMode).
  const coCu = coDiaGioiCu(useQuocGiaDangXem());
  return (
    <div className={`flex items-center gap-1.5 ${className}`} title={t("diaGioi.groupTitle")}>
      <span className="text-[11px] text-[var(--ink-400)] hidden lg:inline">{t("diaGioi.label")}</span>
      <div role="radiogroup" aria-label={t("diaGioi.label")} className="inline-flex rounded-lg border border-[var(--line)] p-0.5 bg-[var(--surface)]">
        {OPTS.map((o) => (
          <button
            key={o}
            role="radio"
            aria-checked={mode === o}
            title={o === "cu" && !coCu ? tr("Nước đang xem không có dữ liệu tỉnh cũ - luôn dùng địa giới mới") : t(`diaGioi.${o}Title`)}
            disabled={o === "cu" && !coCu}
            onClick={() => setMode(o)}
            className={`focus-ring px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
              mode === o ? "bg-[var(--ocean-500)] text-white" : "text-[var(--ink-600)] hover:bg-slate-100"
            } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
          >
            {t(`diaGioi.${o}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
