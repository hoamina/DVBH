import { useEffect, type ReactNode } from "react";

// UI redesign (phan hoi Codex 2026-08-19, muc P2 "Doi Detail Modal sang Drawer"): component RIENG
// (khong sua Modal.tsx dung chung 40 noi trong 12 file) - copy dung pattern PartDetailDrawer da co san
// va da qua kiem thu (DanhMucLinhKienModule.tsx), chi tong quat hoa thanh props giong het Modal (open/
// title/onClose/width/footer/headerExtra) de cac noi dang dung Modal chuyen sang Drawer chi can doi
// ten the, khong phai viet lai JSX ben trong. Truot tu canh phai (.drawer-in, xem tokens.css) thay vi
// mo giua man hinh - phu hop luong "duyet qua nhieu dong lien tiep" (co Next/Previous o header) vi
// danh sach ben duoi/canh van con nhin thay duoc khi drawer mo, khong che het man hinh nhu Modal giua.
export function Drawer({
  open,
  onClose,
  title,
  children,
  width = "max-w-xl",
  footer,
  headerExtra,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  width?: string;
  footer?: ReactNode;
  headerExtra?: ReactNode;
}) {
  // Phase 4 (phim tat, phan hoi Codex 2026-08-19 roadmap goc): Esc dong Drawer - hanh vi nen tang cho
  // moi dialog, ap dung o day (KHONG sua Modal.tsx, tranh dung cham 40 noi dung Modal) vi Drawer moi
  // chi co 2 noi dung (DonHangDetailModal/PxkDetailModal), rui ro thap.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-50 bg-[rgba(6,32,51,0.45)] backdrop-blur-[2px]" onClick={onClose} />
      <div className={`drawer-in fixed inset-y-0 right-0 z-50 w-full ${width} bg-[var(--surface)] shadow-2xl flex flex-col`}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--line)] shrink-0">
          <h3 className="font-display font-bold text-[var(--ink-900)] truncate">{title}</h3>
          <div className="flex items-center gap-2 shrink-0">
            {headerExtra}
            <button onClick={onClose} className="focus-ring w-8 h-8 rounded-lg hover:bg-slate-100 text-[var(--ink-400)]">
              ✕
            </button>
          </div>
        </div>
        <div className="overflow-y-auto p-5 flex-1">{children}</div>
        {footer && <div className="border-t border-[var(--line)] bg-[var(--surface)] px-5 py-3 shrink-0">{footer}</div>}
      </div>
    </>
  );
}

// Nut Next/Previous dung CHUNG cho moi Drawer co danh sach dieu huong (DonHangDetailModal,
// PxkDetailModal) - disabled khi khong con dong truoc/sau trong TRANG DANG XEM (khong tu dong sang
// trang ke, giu don gian vi danh sach da phan trang server-side, xem comment goi noi dung).
export function DrawerNavButtons({ hasPrev, hasNext, onPrev, onNext }: { hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onPrev}
        disabled={!hasPrev}
        title="Dòng trước"
        className="focus-ring w-7 h-8 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-[var(--ink-500)]"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasNext}
        title="Dòng sau"
        className="focus-ring w-7 h-8 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent text-[var(--ink-500)]"
      >
        ›
      </button>
    </div>
  );
}

// Phim tat ←/→ cho dieu huong dong truoc/sau (Phase 4, phan hoi Codex 2026-08-19 roadmap goc) - opt-in
// rieng (khong gop chung vao Drawer) vi khong phai Drawer nao cung co danh sach de dieu huong, va 1
// Drawer co the muon tu xu ly phim mui ten cho noi dung khac (vd carousel anh) thay vi chuyen dong.
// Bo qua khi dang go trong input/textarea/select (tranh cuop phim mui ten luc sua ghi chu/tim kiem).
export function useDrawerArrowNav({
  hasPrev, hasNext, onPrev, onNext,
}: { hasPrev: boolean; hasNext: boolean; onPrev: () => void; onNext: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (e.key === "ArrowLeft" && hasPrev) onPrev();
      else if (e.key === "ArrowRight" && hasNext) onNext();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasPrev, hasNext, onPrev, onNext]);
}
