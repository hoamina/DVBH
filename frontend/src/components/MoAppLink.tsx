// Link mo thang 1 ma (don / don vi / thung / phieu) tren app ngoai theo ID (2026-11-06): app "Gửi bảo hành" (suachua)
// nhan /DH-…(-n), /BH-…, /TR-…; app "Đặt mua linh kiện" (linhkien) nhan /DDH-…, /PMH|PCN|PTL|PXK-…, /TLK-…, /TRA-….
// Nguoi bam phai co tai khoan duoc cap quyen o app do - app do tu kiem tra quyen, link chi la loi tat.
// 2026-11-06 vong 2 ("link kho nhin, can lam noi bat de nguoi dung biet co the an vao"): hien dang CHIP (vien + nen xanh,
// chu dam, icon ↗), re chuot nen dam han - khac ro voi chu ma thuong.
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
      className="focus-ring inline-flex items-center gap-1 align-middle rounded-md border border-[var(--ocean-400)] bg-[var(--ocean-100)] px-1.5 py-[1px] font-mono text-[12px] font-semibold text-[var(--ocean-800)] shadow-sm transition-colors hover:bg-[var(--ocean-600)] hover:border-[var(--ocean-600)] hover:text-white"
    >
      {children ?? id}
      <span aria-hidden className="text-[11px] leading-none">↗</span>
    </a>
  );
}

/** O ghi chu noi bat (vien trai vang + nen vang nhat, chu co thuong mau dam) - thay cho dong chu xam nho (2026-11-06). */
export function GhiChuBox({ label, children, className = "" }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border-l-4 border-[var(--amber-500)] bg-[var(--amber-100)] px-2.5 py-1.5 text-sm leading-snug text-[var(--ink-900)] whitespace-pre-line ${className}`}>
      {label && <span className="font-semibold">{label} </span>}
      {children}
    </div>
  );
}
