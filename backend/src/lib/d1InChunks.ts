/**
 * D1 gioi han 100 bind param / 1 cau lenh (khac SQLite thuong ~32k) - vuot qua la loi "too many SQL variables",
 * request tra 500. Gap that 2026-10-09: xuat Excel "Ca lap" (QC, ~3-4 nghin ca goc/thang trong 1 IN (...)).
 *
 * allInChunks: chay 1 cau "... IN (<placeholders>) ..." theo tung lo vua du cho phan bind con lai (head/tail),
 * cac lo gom chung 1 db.batch (1 round trip), tra ve mang ket qua noi lai. Chi dung cho cau SELECT doc theo
 * danh sach dong (id, email...) co the dai; danh sach hang so/khu vuc nho thi khong can.
 * Luu y: DISTINCT/ORDER BY/LIMIT chi dung TRONG tung lo - noi goi tu dedupe/sap xep lai neu can.
 */
export const D1_MAX_BIND_PARAMS = 100;

export async function allInChunks<T>(
  db: D1Database,
  values: readonly unknown[],
  buildSql: (placeholders: string) => string,
  opts: { headBinds?: readonly unknown[]; tailBinds?: readonly unknown[] } = {},
): Promise<T[]> {
  if (values.length === 0) return [];
  const head = opts.headBinds ?? [];
  const tail = opts.tailBinds ?? [];
  const size = Math.max(1, D1_MAX_BIND_PARAMS - head.length - tail.length);
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < values.length; i += size) {
    const chunk = values.slice(i, i + size);
    stmts.push(db.prepare(buildSql(chunk.map(() => "?").join(", "))).bind(...head, ...chunk, ...tail));
  }
  const results = stmts.length === 1 ? [await stmts[0].all<T>()] : await db.batch<T>(stmts);
  return results.flatMap((r) => r.results as T[]);
}
