import { useState } from "react";

// "|" thay vi "," de tach cac gia tri da chon - mot so dim (vd "Nhom KH") co GIA TRI GOC da chua san
// dau phay trong chinh no (vd "01. KH le, 03. KH DMX" la 1 gia tri DUY NHAT tren CRM, khong phai 2
// gia tri rieng) nen tach theo "," se cat nham 1 gia tri thanh nhieu, gay tich chon sai/khong tich
// duoc (loi thuc te 2026-08-20). "|" an toan hon vi khong xuat hien trong du lieu nghiep vu tieng
// Viet hien co - PHAI khop voi multiValueAdHocClause() phia backend (filterParams.ts).
const DELIM = "|";

export type MultiSelectOption = string | { value: string; label: string };
function optValue(o: MultiSelectOption): string {
  return typeof o === "string" ? o : o.value;
}
function optLabel(o: MultiSelectOption): string {
  return typeof o === "string" ? o : o.label;
}

/**
 * Bo loc chon NHIEU gia tri cung luc cho 1 dim don gian (khac KhuVucFilterControl - khong co khai
 * niem "khu vuc cua toi"/chip rieng, chi 1 dropdown checkbox + o tim kiem). "value" la chuoi cac gia
 * tri (KHONG phai nhan hien thi) cach nhau DELIM ("" = khong loc gi/tat ca), cung quy uoc voi
 * multiValueAdHocClause phia backend. "options" chap nhan ca string thuan (gia tri = nhan) lan dang
 * {value,label} (nhan hien thi rut gon khac gia tri loc that, vd shortKhuVuc) - them 2026-08-28 cho
 * bo loc "Khu vuc" cua Bao cao luy ke, khong doi hanh vi cac noi goi string[] da co san.
 * Dung cho bo loc "Tinh" trong module Tranh chap/KN (CHOT 2026-08-20) va "Nhom KH" trong Quan ly ton.
 */
export function MultiSelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: MultiSelectOption[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = value ? value.split(DELIM).filter(Boolean) : [];
  const q = search.trim().toLowerCase();
  const filteredOptions = q ? options.filter((o) => optLabel(o).toLowerCase().includes(q)) : options;

  function toggle(opt: string) {
    const next = selected.includes(opt) ? selected.filter((v) => v !== opt) : [...selected, opt];
    onChange(next.join(DELIM));
  }

  const selectedOption = selected.length === 1 ? options.find((o) => optValue(o) === selected[0]) : undefined;
  const buttonLabel = selected.length === 0 ? `Tất cả ${label.toLowerCase()}` : selected.length === 1 ? (selectedOption ? optLabel(selectedOption) : selected[0]) : `${label}: ${selected.length} đã chọn`;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`focus-ring inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
          selected.length > 0 ? "border-[var(--ocean-400)] bg-[var(--ocean-100)] text-[var(--ocean-700)]" : "border-[var(--line)] bg-white text-[var(--ink-600)]"
        }`}
      >
        {buttonLabel}
        <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => {
              setOpen(false);
              setSearch("");
            }}
          />
          <div className="absolute left-0 top-full mt-1 w-64 max-h-80 overflow-y-auto bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-lg py-1.5 z-20 anim-in">
            <div className="px-2 pb-1.5 sticky top-0 bg-[var(--surface)]">
              <input
                type="text"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Tìm ${label.toLowerCase()}…`}
                className="focus-ring w-full border border-[var(--line)] rounded-lg px-2 py-1 text-xs"
              />
            </div>
            {selected.length > 0 && (
              <button type="button" onClick={() => onChange("")} className="w-full text-left px-3 py-1.5 text-xs text-[var(--ocean-600)] hover:bg-slate-50 border-b border-[var(--line)] mb-1">
                Bỏ chọn tất cả
              </button>
            )}
            {filteredOptions.length === 0 && <div className="px-3 py-1.5 text-xs text-[var(--ink-400)] italic">Không có kết quả</div>}
            {filteredOptions.map((opt) => (
              <label key={optValue(opt)} className="flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--ink-700)] hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={selected.includes(optValue(opt))} onChange={() => toggle(optValue(opt))} className="w-3.5 h-3.5" />
                {optLabel(opt)}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
