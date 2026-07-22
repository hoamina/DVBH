import { useMemo } from "react";
import { Card } from "./Card";
import { randomLoadingPhrase } from "../../lib/loadingPhrases";

/** Trang thai dang tai dang Card day du (thay cho "Dang tai..." don dieu) - moi lan component nay
 * mount (vd moi lan isLoading chuyen tu false -> true) se chon ngau nhien 1 cau vui moi. */
export function LoadingCard({ label, className }: { label?: string; className?: string }) {
  const phrase = useMemo(randomLoadingPhrase, []);
  return (
    <Card className={`p-8 text-center ${className ?? ""}`}>
      <div className="text-2xl mb-2">⏳</div>
      <div className="font-semibold text-sm text-[var(--ink-600)] mb-1">{phrase}</div>
      {label && <div className="text-xs text-[var(--ink-400)]">{label}</div>}
    </Card>
  );
}
