import { useMemo } from "react";
import { randomLoadingPhrase } from "../../lib/loadingPhrases";

/** Ban rut gon cua LoadingCard - khong bao Card, dung cho cac cho dang tai nho/nam trong layout
 * co san (dropdown, panel chi tiet, man hinh khoi dong toan trang...). */
export function LoadingInline({ label, className = "text-sm text-[var(--ink-400)]" }: { label?: string; className?: string }) {
  const phrase = useMemo(randomLoadingPhrase, []);
  return (
    <div className={className}>
      {phrase}
      {label && <span className="opacity-60"> · {label}</span>}
    </div>
  );
}
