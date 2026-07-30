import { useEffect, useRef, useState } from "react";

export type SelectOption = string | { value: string; label: string };

// Nguong tu dong chuyen tu <select> thuan sang o nhap tim theo tu khoa - danh sach dai (vd KTV
// ~300 dong, Tinh 63, Linh kien ~400) rat kho cuon tim bang <select> thuan; danh sach ngan (trang
// thai, loai...) giu nguyen <select> nhu cu, khong doi hanh vi/giao dien. Ap dung CHUNG cho toan
// bo component Select (khong can sua tung noi goi) - dung options.length hien tai nen tu thich
// ung neu du lieu dai/ngan thay doi theo thoi gian (vd them CSKH/KTV moi).
const SEARCHABLE_THRESHOLD = 10;

function optValue(o: SelectOption): string {
  return typeof o === "string" ? o : o.value;
}
function optLabel(o: SelectOption): string {
  return typeof o === "string" ? o : o.label;
}

export function Select({
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
  if (options.length > SEARCHABLE_THRESHOLD) {
    return <SearchableSelect value={value} onChange={onChange} options={options} className={className} />;
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`focus-ring bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm text-[var(--ink-900)] ${className}`}
    >
      {options.map((o) =>
        typeof o === "string" ? (
          <option key={o} value={o}>
            {o}
          </option>
        ) : (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ),
      )}
    </select>
  );
}

function SearchableSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => optValue(o) === value);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => optLabel(o).toLowerCase().includes(q)) : options;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={open ? query : (selected ? optLabel(selected) : "")}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        placeholder="Gõ để tìm…"
        className="focus-ring w-full bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm text-[var(--ink-900)]"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-lg py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--ink-400)] italic">Không tìm thấy.</div>
          ) : (
            filtered.map((o) => {
              const v = optValue(o);
              return (
                // onMouseDown (khong phai onClick) de chay TRUOC su kien blur cua input.
                <button
                  key={v}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(v);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 ${v === value ? "bg-[var(--ocean-100)]/40 font-semibold" : ""}`}
                >
                  {optLabel(o)}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
