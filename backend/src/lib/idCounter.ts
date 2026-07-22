/**
 * Sinh ID tuan tu (vd "CG-000123") qua bang dem rieng `id_counters`, dung
 * UPDATE ... RETURNING de tang atomic - O(1) bat ke bang nguon (ket_qua_goi,
 * vi_pham) lon co nao, thay the pattern cu "SELECT COUNT(*) FROM table" phai
 * doc lai toan bo bang moi lan sinh 1 ID.
 */

export async function nextSequentialId(db: D1Database, table: string, prefix: string, width: number): Promise<string> {
  const row = await db
    .prepare("UPDATE id_counters SET gia_tri_hien_tai = gia_tri_hien_tai + 1 WHERE ten_bang = ? RETURNING gia_tri_hien_tai")
    .bind(table)
    .first<{ gia_tri_hien_tai: number }>();
  const next = row?.gia_tri_hien_tai ?? 1;
  return `${prefix}-${String(next).padStart(width, "0")}`;
}

/** Danh cho import hang loat: giu truoc N id trong 1 lan goi thay vi N lan goi rieng le. */
export async function reserveSequentialIds(db: D1Database, table: string, prefix: string, width: number, count: number): Promise<string[]> {
  if (count <= 0) return [];
  const row = await db
    .prepare("UPDATE id_counters SET gia_tri_hien_tai = gia_tri_hien_tai + ? WHERE ten_bang = ? RETURNING gia_tri_hien_tai")
    .bind(count, table)
    .first<{ gia_tri_hien_tai: number }>();
  const last = row?.gia_tri_hien_tai ?? count;
  const first = last - count + 1;
  return Array.from({ length: count }, (_, i) => `${prefix}-${String(first + i).padStart(width, "0")}`);
}
