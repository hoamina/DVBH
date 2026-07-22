import { useMemo } from "react";
import { Card } from "./Card";
import { randomLoadingPhrase } from "../../lib/loadingPhrases";

/** Trang thai dang tai dang Card day du (thay cho "Dang tai..." don dieu) - moi lan component nay
 * mount (vd moi lan isLoading chuyen tu false -> true) se chon ngau nhien 1 cau vui + emoji moi. */
export function LoadingCard({ label, className }: { label?: string; className?: string }) {
  const phrase = useMemo(randomLoadingPhrase, []);
  return (
    <Card className={`p-8 text-center ${className ?? ""}`}>
      <div className="text-5xl mb-3 animate-bounce">{phrase.emoji}</div>
      <div className="font-display font-bold text-lg text-[var(--ink-900)] mb-1.5">{phrase.text}</div>
      {label && <div className="text-sm text-[var(--ink-400)]">{label}</div>}
    </Card>
  );
}
