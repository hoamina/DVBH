import type { ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
  height = "max-h-[88vh]",
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
  height?: string;
  // Khoi co dinh o day Modal (vd tong tien + nut hanh dong) - nam NGOAI vung overflow-y-auto nen
  // luon hien du cuon noi dung ben tren bao nhieu, giong thanh tong tien/thanh toan co dinh cua
  // cac trang gio hang (Shopee/Tiki). Mac dinh undefined = khong render gi them, khong doi hanh vi
  // cac noi goi Modal khac.
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,32,51,0.45)] backdrop-blur-[2px] p-4">
      <div className={`bg-[var(--surface)] rounded-2xl w-full ${width} ${height} overflow-hidden flex flex-col anim-in shadow-2xl`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)]">
          <h3 className="font-display font-bold text-[var(--ink-900)]">{title}</h3>
          <button onClick={onClose} className="focus-ring w-8 h-8 rounded-lg hover:bg-slate-100 text-[var(--ink-400)]">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
        {footer && <div className="border-t border-[var(--line)] bg-[var(--surface)] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
