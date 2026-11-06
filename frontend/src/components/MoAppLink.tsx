// Link mo thang 1 ma (don / don vi / thung / phieu) tren app ngoai theo ID (2026-11-06): app "Gửi bảo hành" (suachua)
// nhan /DH-…(-n), /BH-…, /TR-…; app "Đặt mua linh kiện" (linhkien) nhan /DDH-…, /PMH|PCN|PTL|PXK-…, /TLK-…, /TRA-….
// Nguoi bam phai co tai khoan duoc cap quyen o app do - app do tu kiem tra quyen, link chi la loi tat.
import type { ReactNode } from "react";

export const SUACHUA_URL = "https://suachua.dichvu3t.workers.dev";
export const LINHKIEN_URL = "https://linhkien.dichvu3t.workers.dev";

export function MoAppLink({ base, id, children, title }: { base: string; id: string | null | undefined; children?: ReactNode; title?: string }) {
  if (!id) return <>{children ?? "—"}</>;
  return (
    <a
      href={`${base}/${encodeURIComponent(id)}`}
      target="_blank"
      rel="noreferrer"
      title={title ?? id}
      onClick={(e) => e.stopPropagation()}
      className="focus-ring font-mono text-[var(--ocean-600)] hover:underline decoration-dotted underline-offset-2"
    >
      {children ?? id}
      <span className="ml-0.5 text-[0.85em] opacity-70">↗</span>
    </a>
  );
}
