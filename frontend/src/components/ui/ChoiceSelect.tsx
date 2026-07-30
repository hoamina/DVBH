import { Select, type SelectOption } from "./Select";

// Nguong chuyen doi: listdown TU 5 LUA CHON THUC (khong tinh 1 muc placeholder rong "chua chon")
// TRO XUONG se hien thanh nhom nut bam thay vi <select> - de chon nhanh hon, ro rang hon voi so
// luong lua chon it. Qua nguong nay (vd 6-7 lua chon nhu "Chot danh gia lap"/"QC chot") van giu
// <select> nhu cu, tranh hang nut qua dai lam roi giao dien.
const MAX_BUTTONS = 5;

/**
 * The nut bam thay <select> khi so lua chon THUC (bo qua 1 muc placeholder rong neu co) tu 5 tro
 * xuong - dung cho cac truong chon 1 trong-cac giai trinh (ly do cham, hinh thuc xu ly, danh gia
 * lap...). Tu dong roi ve <select> binh thuong neu danh sach dai hon (vd du lieu dong tu Settings
 * co the thay doi so luong theo thoi gian).
 */
export function ChoiceSelect({
  value,
  onChange,
  options,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
}) {
  const realOptions = options.filter((o) => (typeof o === "string" ? o !== "" : o.value !== ""));

  if (realOptions.length === 0 || realOptions.length > MAX_BUTTONS) {
    return <Select value={value} onChange={onChange} options={options} className={className} />;
  }

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {realOptions.map((o) => {
        const optValue = typeof o === "string" ? o : o.value;
        const optLabel = typeof o === "string" ? o : o.label;
        const active = value === optValue;
        return (
          <button
            key={optValue}
            type="button"
            onClick={() => onChange(optValue)}
            className={`focus-ring px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
              active ? "bg-[var(--ocean-500)] text-white border-[var(--ocean-500)]" : "border-[var(--line)] text-[var(--ink-600)] hover:border-[var(--ocean-300)]"
            }`}
          >
            {optLabel}
          </button>
        );
      })}
    </div>
  );
}
