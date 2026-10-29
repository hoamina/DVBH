import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { QUOC_GIA_CO_NSKX, setPhamVi, usePhamVi, useQuocGiaDangXem, type PhamVi } from "../lib/phamVi";

// Nut "Phạm vi báo cáo" (2026-10-13) - dat o TopBar canh nut Địa giới. CHI anh huong viec xem bao cao/danh sach
// (lib/phamVi.ts). Doi pham vi -> bo toan bo du lieu react-query de moi man tai lai theo pham vi moi.
// Nhan/tooltip dich qua i18n "phamVi.<value>" + "phamVi.<value>Title" (PHAM_VI_LABEL o lib/phamVi.ts giu cho cho khac).
const OPTS: { value: PhamVi }[] = [{ value: "tat_ca" }, { value: "nskx" }, { value: "khong_nskx" }];

export function PhamViToggle({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const pv = usePhamVi();
  const qc = useQueryClient();
  // NSKX la doi tac VN - dang xem nuoc khac thi an nut (server cung bo qua ?pv).
  const qg = useQuocGiaDangXem();
  const chon = (v: PhamVi) => {
    if (v === pv) return;
    setPhamVi(v);
    qc.resetQueries();
  };
  const dangLoc = pv !== "tat_ca";
  if (qg !== null && qg !== QUOC_GIA_CO_NSKX) return null;
  return (
    <div className={`flex items-center gap-1.5 ${className}`} title={t("phamVi.groupTitle")}>
      <span className={`text-[11px] hidden lg:inline ${dangLoc ? "font-bold text-[var(--coral-500)]" : "text-[var(--ink-400)]"}`}>
        {dangLoc ? t("phamVi.viewing") : t("phamVi.label")}
      </span>
      <div
        role="radiogroup"
        aria-label={t("phamVi.aria")}
        className={`inline-flex rounded-lg border p-0.5 bg-[var(--surface)] ${dangLoc ? "border-[var(--coral-500)] ring-2 ring-[var(--coral-500)]/20" : "border-[var(--line)]"}`}
      >
        {OPTS.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={pv === o.value}
            title={t(`phamVi.${o.value}Title`)}
            onClick={() => chon(o.value)}
            className={`focus-ring px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              pv === o.value
                ? o.value === "tat_ca"
                  ? "bg-[var(--ocean-500)] text-white"
                  : "bg-[var(--coral-500)] text-white"
                : "text-[var(--ink-600)] hover:bg-slate-100"
            }`}
          >
            {t(`phamVi.${o.value}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
