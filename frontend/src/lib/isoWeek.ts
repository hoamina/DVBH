// ISO week-year: Monday starts the week; week 1 contains January 4.
export function isoWeekRange(year: number, week: number) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const start = new Date(jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000 + (week - 1) * 7 * 86400000);
  const end = new Date(start.getTime() + 7 * 86400000);
  return { tu_ngay: start.toISOString().slice(0, 10), den_ngay: end.toISOString().slice(0, 10) };
}
export function isoWeeksInYear(year: number) {
  const day = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  return day === 4 || (day === 3 && new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1) ? 53 : 52;
}
/** Tuan ISO cua 1 ngay "YYYY-MM-DD" (hoac hom nay gio VN): { year, week }. Nam ISO co the khac nam lich (vd 29/12). */
export function isoWeekOf(ngay?: string): { year: number; week: number } {
  const d = ngay ? new Date(`${ngay}T00:00:00Z`) : new Date(new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10) + "T00:00:00Z");
  const thu = (d.getUTCDay() + 6) % 7; // 0 = thu 2
  const thu5 = new Date(d.getTime() + (3 - thu) * 86400000); // thu 5 cung tuan quyet dinh nam ISO
  const year = thu5.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const tuan1 = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86400000;
  return { year, week: Math.floor((d.getTime() - thu * 86400000 - tuan1) / (7 * 86400000)) + 1 };
}
