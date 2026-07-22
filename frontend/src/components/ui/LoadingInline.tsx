import { useMemo } from "react";
import { randomLoadingPhrase } from "../../lib/loadingPhrases";

/** Ban rut gon cua LoadingCard - khong bao Card, dung cho cac cho dang tai nho/nam trong layout
 * co san (dropdown, panel chi tiet, man hinh khoi dong toan trang...). To + ro hon ban cu, kem emoji
 * rieng cho tung cau de tao khong khi vui nhon. */
export function LoadingInline({ label, className = "text-base font-semibold text-[var(--ink-600)]" }: { label?: string; className?: string }) {
  const phrase = useMemo(randomLoadingPhrase, []);
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-2xl leading-none animate-bounce">{phrase.emoji}</span>
      <span>
        {phrase.text}
        {label && <span className="opacity-60 font-normal"> · {label}</span>}
      </span>
    </div>
  );
}
