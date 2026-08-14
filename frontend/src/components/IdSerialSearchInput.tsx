// CHOT 2026-08-12: o tim kiem ID/Serial dung chung cho cac danh sach NOI BO tung the (Ca lap, Quan
// ly ton, Ca thieu linh kien, Tranh chap, Danh gia nap gas, Quan ly khao sat, Danh sach tong) -
// khac GlobalSearch cua TopBar (nhay thang vao 1 ca / hien popup chon), o nay chi LOC danh sach dang
// xem tai cho (con o dung module, khong roi trang) - dung chung 1 style cho tat ca de nguoi dung
// quen mat, xem noi goi trong tung module de biet loc client-side (mergedRows/allRows co san) hay
// server-side (them param "q" vao query key).
export function IdSerialSearchInput({
  value,
  onChange,
  className = "w-48",
  placeholder = "Tìm theo ID/Serial…",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm ${className}`}
    />
  );
}
