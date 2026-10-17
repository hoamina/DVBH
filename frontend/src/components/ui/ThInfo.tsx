// Nhan tieu de cot + dau "(?)" hover hien chu thich cach tinh (title native, khong can Tooltip component rieng) -
// theo yeu cau hien thi giai thich cong thuc ngay tren UI thay vi nguoi xem phai hoi lai. Dung chung cho cac bang
// bao cao (Bao cao khao sat theo khu vuc, Theo doi KTV loai tru...).
export function ThInfo({ label, info }: { label: string; info: string }) {
  return (
    <>
      {label} <span className="cursor-help text-[var(--ink-300)] normal-case" title={info}>(?)</span>
    </>
  );
}
