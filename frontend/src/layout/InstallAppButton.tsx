import { useTranslation } from "react-i18next";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "../components/ui/Modal";
import { usePwaInstall, isStandalonePwa } from "../hooks/usePwaInstall";

// Nut "Cai dat vao man hinh chinh" (2026-09-26, giong linh-kien-app/vi pham app) - chi render khi
// CHUA chay o che do app da cai (standalone). Android/Chrome: bam la goi prompt() that. iOS Safari
// (hoac Chrome da tu choi prompt truoc do): khong co API tu kich hoat - hien Modal huong dan thu cong.
export function InstallAppButton({
  onNavigateAway,
}: {
  onNavigateAway?: () => void;
}) {
  const { t } = useTranslation();
  const { available, promptInstall } = usePwaInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isStandalonePwa()) return null;

  async function handleClick() {
    if (available) {
      await promptInstall();
      onNavigateAway?.();
      return;
    }
    setShowGuide(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="focus-ring w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm font-semibold text-[var(--sidebar-ink-mid)] hover:bg-[var(--sidebar-highlight)] hover:text-[var(--sidebar-ink)] transition-colors"
      >
        <span className="w-6 text-center text-base">📲</span>
        <span>{t("install.button")}</span>
      </button>
      {/* Portal ra body: Sidebar mobile nam trong div co transform (translate-x) nen "fixed" cua Modal
          se bi gioi han trong khung sidebar 256px neu render tai cho. */}
      {showGuide &&
        createPortal(
          <Modal
            open
            title={t("install.title")}
            onClose={() => setShowGuide(false)}
          >
            <div className="space-y-3 text-sm text-[var(--ink-600)]">
              <p>{t("install.intro")}</p>
              <div className="space-y-1.5 bg-[var(--surface-100)] rounded-lg p-3">
                <div className="font-semibold text-[var(--ocean-600)]">
                  iPhone/iPad (Safari)
                </div>
                <div>{t("install.ios1")}</div>
                <div>{t("install.ios2")}</div>
              </div>
              <div className="space-y-1.5 bg-[var(--surface-100)] rounded-lg p-3">
                <div className="font-semibold text-[var(--ocean-600)]">
                  Android (Chrome)
                </div>
                <div>{t("install.android1")}</div>
                <div>{t("install.android2")}</div>
              </div>
            </div>
          </Modal>,
          document.body,
        )}
    </>
  );
}
