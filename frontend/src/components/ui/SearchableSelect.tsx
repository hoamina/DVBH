import { useEffect, useRef, useState } from "react";

export interface SearchableOption {
  value: string;
  label: string;
  // Chuoi phu dung de loc theo tu khoa nhung KHONG hien trong label (vd ten day du linh kien khi
  // label da rut gon) - neu bo trong, chi loc theo label.
  searchText?: string;
}

/**
 * O nhap tim theo tu khoa + danh sach ket qua tha xuong (khong co combobox/autocomplete nao san co
 * trong codebase truoc gio - component moi). Dung cho danh sach dai (vd Linh kien thieu) thay cho
 * <select> thuan de khong phai cuon qua hang tram dong.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Gõ để tìm…",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

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
  const filtered = q ? options.filter((o) => `${o.label} ${o.searchText ?? ""}`.toLowerCase().includes(q)) : options;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={open ? query : (selected?.label ?? "")}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        placeholder={placeholder}
        className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-lg py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--ink-400)] italic">Không tìm thấy.</div>
          ) : (
            filtered.map((o) => (
              // onMouseDown (khong phai onClick) de chay TRUOC su kien blur cua input - neu dung
              // onClick, input mat focus/dong dropdown truoc khi click kip dang ky.
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(o.value);
                  setOpen(false);
                  setQuery("");
                }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 ${o.value === value ? "bg-[var(--ocean-100)]/40 font-semibold" : ""}`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
