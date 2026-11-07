import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "./ui/Modal";
import { api } from "../api/client";
import { HoSoLinhKien } from "./HoSoLinhKien";
import { tr } from "../i18n/tr";

// Mo "Ho so linh kien" tu BAT KY cho nao dang hien ma linh kien (2026-10-08): GT ton, chi tiet ca, Quan ly ton, danh
// muc... 1 popup duy nhat cap App (render SAU CaseDetail -> nam tren cung). Chi bat khi nguoi dung co quyen module
// "missing-parts" (API /api/ton-kho-lk gate theo dung module nay) - khong co quyen thi ma LK hien chu thuong.
type MoHoSo = (ma: string, ten?: string | null) => void;
const HoSoLinhKienContext = createContext<MoHoSo | null>(null);

export function useMoHoSoLinhKien(): MoHoSo | null {
  return useContext(HoSoLinhKienContext);
}

export function HoSoLinhKienProvider({ enabled, openCase, children }: { enabled: boolean; openCase: (id: string, tab?: string) => void; children: ReactNode }) {
  const [dangMo, setDangMo] = useState<{ ma: string; ten: string | null } | null>(null);
  const mo: MoHoSo = (ma, ten) => setDangMo({ ma: ma.trim(), ten: ten ?? null });
  return (
    <HoSoLinhKienContext.Provider value={enabled ? mo : null}>
      {children}
      {dangMo && (
        <HoSoModal
          ma={dangMo.ma}
          ten={dangMo.ten}
          onClose={() => setDangMo(null)}
          openCase={(id, tab) => {
            setDangMo(null);
            openCase(id, tab);
          }}
        />
      )}
    </HoSoLinhKienContext.Provider>
  );
}

// Noi mo chi co ma (GT ton, ...) -> lay ten tu GET /ton-kho-lk/ma/:ma (`ten`). Cung queryKey voi HoSoLinhKien nen
// react-query gop thanh 1 request, khong goi them.
function HoSoModal({ ma, ten, onClose, openCase }: { ma: string; ten: string | null; onClose: () => void; openCase: (id: string, tab?: string) => void }) {
  const tonQ = useQuery({
    queryKey: ["ton-kho-lk-ma", ma],
    queryFn: () => api.get<{ rows: unknown[]; ten?: string | null }>(`/ton-kho-lk/ma/${encodeURIComponent(ma)}`),
  });
  const tenHien = ten || tonQ.data?.ten || null;
  return (
    <Modal open title={tr("Hồ sơ linh kiện {0}{1}", ma, tenHien ? ` — ${tenHien}` : "")} onClose={onClose} width="max-w-[1800px]" height="h-[calc(100vh-2rem)]">
      <HoSoLinhKien maLk={ma} openCase={openCase} />
    </Modal>
  );
}

/** Ma linh kien bam duoc -> mo Ho so linh kien. Khong co quyen / ma rong -> chu thuong. stopPropagation vi hay nam
 * trong dong bang/the da co onClick rieng (mo ca, mo chi tiet). */
export function MaLinhKienLink({ ma, ten, className = "", children }: { ma: string | null | undefined; ten?: string | null; className?: string; children?: ReactNode }) {
  const mo = useMoHoSoLinhKien();
  const ma2 = (ma ?? "").trim();
  if (!ma2 || !mo) return <span className={className}>{children ?? ma}</span>;
  return (
    <button
      type="button"
      title={tr("Xem tồn kho / hồ sơ linh kiện")}
      onClick={(e) => {
        e.stopPropagation();
        mo(ma2, ten);
      }}
      className={`focus-ring rounded underline decoration-dotted underline-offset-2 hover:text-[var(--ocean-600)] text-left ${className}`}
    >
      {children ?? ma2}
    </button>
  );
}
