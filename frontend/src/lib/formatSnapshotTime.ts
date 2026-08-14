// generatedAt la chuoi "YYYY-MM-DD HH:MM:SS" gio VN thuan (backend ghi qua nowVN(), xem
// backend/src/lib/vnTime.ts) - hien thi truc tiep tung phan, KHONG dung Date/timezone conversion
// (tranh sai lech neu may client o mui gio khac). Dung chung cho moi banner "Bao cao duoc cap nhat
// luc..." (Tong quat, Quan ly ton...).
export function fmtGeneratedAt(raw: string): string {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2}:\d{2})$/);
  if (!m) return raw;
  const [, y, mo, d, hms] = m;
  return `${hms} ngày ${d}/${mo}/${y}`;
}
