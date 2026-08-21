import { useState, useEffect } from "react";
import { Btn, type BtnVariant } from "../../components/ui/Btn";
import { Badge, type BadgeTone } from "../../components/ui/Badge";

// Cac component UI dung chung nhieu tab cua module "Dat mua linh kien" (tach tu
// DatMuaLinhKienModule.tsx - UI redesign Phase 3, phan hoi Codex 2026-08-19).

export function StatusBadge({ value, tones }: { value: string; tones: Record<string, BadgeTone> }) {
  return <Badge tone={tones[value] ?? "gray"}>{value}</Badge>;
}

// Thanh hien thi bo loc dang ap dung + nut xoa tung cai/xoa het (UI redesign phan hoi Codex
// 2026-08-19, muc P1 "nut reset filter + hien thi filter dang ap dung") - dung chung cho ca 4 tab
// danh sach, moi tab tu xay mang `chips` tu state filter rieng cua no. Rong (return null) khi khong
// co bo loc nao dang ap - khong chiem cho khi khong can.
export function ActiveFiltersBar({ chips }: { chips: { label: string; onClear: () => void }[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-2">
      <span className="text-xs text-[var(--ink-500)]">Đang lọc:</span>
      {chips.map((c, i) => (
        <button
          key={i}
          type="button"
          onClick={c.onClear}
          className="focus-ring inline-flex items-center gap-1 rounded-full bg-[var(--ocean-100)] px-2 py-0.5 text-xs font-medium text-[var(--ocean-700)] hover:brightness-95"
        >
          {c.label} <span aria-hidden="true">✕</span>
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() => chips.forEach((c) => c.onClear())}
          className="focus-ring text-xs text-[var(--ink-500)] underline decoration-dotted underline-offset-2 hover:text-[var(--ink-700)]"
        >
          Xoá tất cả bộ lọc
        </button>
      )}
    </div>
  );
}

// Quick filter dang chip/segmented thay cho Select lon (UI redesign phan hoi Codex 2026-08-19, muc
// P2#1) - CUNG danh sach option nhu Select cu (khong doi bo trang thai/logic), chi doi CACH HIEN THI
// de thay duoc ca trang thai dang chon VA cac lua chon khac cung luc, khong can mo dropdown. Dung
// dung pattern nut sub-tab "Mua hang | Cong no | Tra hang" da co san trong file.
export function TrangThaiChipFilter({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value || "__all__"}
            type="button"
            onClick={() => onChange(o.value)}
            className={`focus-ring rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              active ? "bg-[var(--ocean-500)] text-white shadow-sm" : "bg-white text-[var(--ink-600)] border border-[var(--line)] hover:bg-slate-50"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// UI redesign (phan hoi Codex 2026-08-19, muc P2 "Preview truoc bulk action"): bam LAN 2 moi thuc su
// chay (giong pattern "Bam lan nua de xac nhan huy" da co san o DonHangDetailModal - confirmCancelPending)
// thay vi chay NGAY LAP TUC khi bam 1 lan nhu truoc - tranh bam nham duyet/tu choi hang loat khong co
// buoc dung lai. Tu dong RESET ve chua xac nhan khi count doi (vd doi selection) - tranh tinh huong
// dang "cho xac nhan" cho N dong cu ma nguoi dung da doi sang chon M dong khac.
export function BulkConfirmButton({
  label,
  confirmLabel,
  count,
  onConfirm,
  disabled,
  loading,
  variant = "primary",
}: {
  label: string;
  confirmLabel: string;
  count: number;
  onConfirm: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: BtnVariant;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => setArmed(false), [count]);
  if (armed) {
    return (
      <Btn size="sm" variant={variant} onClick={() => { setArmed(false); onConfirm(); }} disabled={disabled} loading={loading}>
        {confirmLabel}
      </Btn>
    );
  }
  return (
    <Btn size="sm" variant={variant} onClick={() => setArmed(true)} disabled={disabled}>
      {label}
    </Btn>
  );
}


// Cot "Ma yeu cau su co lien quan" - bam mo popup chi tiet ca (App.tsx openCase) CHI khi
// canXemChiTietCa (khong phai KTV/CTV/Tram, xem comment canXemChiTietCa o DatMuaLinhKienModule) VA
// co openCase - nguoc lai van hien gia tri dang text thuong (khong an du lieu, chi khong bam mo
// duoc). Dung chung cho bang dong con o DonCuaToiTab va bang dong trong PhieuDatDetailModal.
export function MaYcscCell({ value, canXemChiTietCa, openCase }: { value: string | null; canXemChiTietCa: boolean; openCase?: (id: string, tab?: string) => void }) {
  if (!value?.trim()) return <span className="text-[var(--ink-400)]">—</span>;
  if (canXemChiTietCa && openCase) {
    return (
      <span className="font-mono text-[var(--ocean-600)] font-semibold cursor-pointer hover:underline" onClick={() => openCase(value.trim(), "giai-trinh")}>
        {value}
      </span>
    );
  }
  return <span className="font-mono">{value}</span>;
}

// CHOT 2026-08-15: thay the PhieuDatDetailModal (chi tiet ca "phieu") - khong con khai niem phieu,
// modal gio chi xem/xu ly DUNG 1 dong don hang (goi GET /dat-mua-lk/don-hang/:id). Khong con checkbox/
// bulk-select trong modal (bulk-select van hoat dong o ngoai bang danh sach, xem DonHangGroupedList).
