// D1 gioi han 100 COT / ket qua. case_dvbh da co 99 cot (migration 0170, 2026-11-14) -> "c.*" chi con them duoc DUNG 1 cot
// nua, them 2 cot la "too many columns in result set". Cach dung: cau danh sach chi lay c.id + cac cot rieng (join/tinh), roi
// ghepDuCotCa() lay du cot case_dvbh theo khoa chinh (1 bind json_each, 1 dong doc / ca) va tron vao - cot rieng de len cot ca.
export async function ghepDuCotCa<T extends Record<string, unknown>>(db: D1Database, dong: T[]): Promise<(Record<string, unknown> & T)[]> {
  if (!dong.length) return dong;
  const { results: full } = await db
    .prepare("SELECT * FROM case_dvbh WHERE id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(dong.map((r) => r.id)))
    .all<Record<string, unknown>>();
  const theoId = new Map(full.map((r) => [String(r.id), r]));
  return dong.map((r) => ({ ...(theoId.get(String(r.id)) ?? {}), ...r }));
}
