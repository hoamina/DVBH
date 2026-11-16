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
