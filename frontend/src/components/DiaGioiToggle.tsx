import { useTranslation } from "react-i18next";
import { useDiaGioiMode, type DiaGioiMode } from "../lib/diaGioi";

// Nut chuyen "Địa giới cũ / mới" (2026-10-10) - dat o TopBar, ap dung CHUNG moi bao cao/bo loc tinh-huyen-xa
// (lib/diaGioi.ts). Luu tren may nguoi dung.
// Nhan/tooltip dich qua i18n "diaGioi.<value>" + "diaGioi.<value>Title".
const OPTS: DiaGioiMode[] = ["cu", "moi"];

export function DiaGioiToggle({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useDiaGioiMode();
  return (
    <div className={`flex items-center gap-1.5 ${className}`} title={t("diaGioi.groupTitle")}>
      <span className="text-[11px] text-[var(--ink-400)] hidden lg:inline">{t("diaGioi.label")}</span>
      <div role="radiogroup" aria-label={t("diaGioi.label")} className="inline-flex rounded-lg border border-[var(--line)] p-0.5 bg-[var(--surface)]">
        {OPTS.map((o) => (
          <button
            key={o}
            role="radio"
            aria-checked={mode === o}
            title={t(`diaGioi.${o}Title`)}
            onClick={() => setMode(o)}
            className={`focus-ring px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
              mode === o ? "bg-[var(--ocean-500)] text-white" : "text-[var(--ink-600)] hover:bg-slate-100"
            }`}
          >
            {t(`diaGioi.${o}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
