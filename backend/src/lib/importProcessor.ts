import {
  BUSINESS_FIELDS,
  VIOLATION_FIELDS,
  normalizeViolationFlag,
  ratchetFlag,
  hasBusinessDataChanged,
  businessFieldValue,
} from "./ratchet";

/**
 * Luong import hang ngay - port tu import.js (thiet ke Node.js/pg ban goc).
 *
 * D1 khong co "SELECT ... FOR UPDATE" / transaction dai nhu Postgres.
 * Vi day chi la 1 lan upload/ngay boi 1 nguoi (khong ghi dong thoi vao cung
 * case), thay the bang mau "doc het truoc, ghi theo batch":
 *   1. SELECT toan bo case lien quan theo id (chunk IN-list)
 *   2. Tinh quyet dinh tung dong trong bo nho (JS thuan)
 *   3. Gom cac cau INSERT/UPDATE, thuc thi qua db.batch() theo lo <=1000
 */

export type ImportAction = "GHI_MOI" | "BO_QUA" | "CAP_NHAT_MOC_THOI_GIAN" | "GHI_DE";

export interface ImportRow {
  id: string;
  [key: string]: unknown;
}

export interface ImportSummary {
  GHI_MOI: number;
  BO_QUA: number;
  CAP_NHAT_MOC_THOI_GIAN: number;
  GHI_DE: number;
  LOI: number;
  errors: string[];
}

const CHUNK_SIZE_SELECT = 100; // an toan voi gioi han bind-param cua SQLite
const CHUNK_SIZE_BATCH = 500; // duoi gioi han batch 1000 (free tier D1)

function emptySummary(): ImportSummary {
  return { GHI_MOI: 0, BO_QUA: 0, CAP_NHAT_MOC_THOI_GIAN: 0, GHI_DE: 0, LOI: 0, errors: [] };
}

function validateRows(rows: unknown[]): { valid: ImportRow[]; errors: string[] } {
  const valid: ImportRow[] = [];
  const errors: string[] = [];
  for (const [i, r] of rows.entries()) {
    const row = r as Record<string, unknown>;
    const idStr = row?.id === null || row?.id === undefined ? "" : String(row.id).trim();
    if (!row || !idStr) {
      errors.push(`Dong ${i + 1}: thieu hoac sai cot ID`);
      continue;
    }
    valid.push({ ...row, id: idStr });
  }
  return { valid, errors };
}

async function fetchExistingRows(
  db: D1Database,
  ids: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < ids.length; i += CHUNK_SIZE_SELECT) {
    const chunk = ids.slice(i, i + CHUNK_SIZE_SELECT);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(`SELECT * FROM case_dvbh WHERE id IN (${placeholders})`)
      .bind(...chunk)
      .all();
    for (const row of results as Record<string, unknown>[]) {
      map.set(String(row.id), row);
    }
  }
  return map;
}

function buildInsertStatement(db: D1Database, incoming: ImportRow, now: string): D1PreparedStatement {
  const normalizedFlags = Object.fromEntries(
    VIOLATION_FIELDS.map((f) => [f, normalizeViolationFlag(incoming[f]) ? 1 : 0]),
  );
  const businessValues = Object.fromEntries(BUSINESS_FIELDS.map((f) => [f, businessFieldValue(f, incoming)]));
  const fields = ["id", ...BUSINESS_FIELDS, ...VIOLATION_FIELDS, "ngay_import", "ngay_cap_nhat_gan_nhat"];
  const values = {
    id: incoming.id,
    ...businessValues,
    ...normalizedFlags,
    ngay_import: now,
    ngay_cap_nhat_gan_nhat: now,
  };
  const placeholders = fields.map(() => "?").join(", ");
  return db
    .prepare(`INSERT INTO case_dvbh (${fields.join(", ")}) VALUES (${placeholders})`)
    .bind(...fields.map((f) => values[f as keyof typeof values]));
}

function buildTimestampOnlyUpdate(
  db: D1Database,
  id: string,
  finalFlags: Record<string, number>,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE case_dvbh SET ngay_cap_nhat_gan_nhat = ?, updated_at = ?,
         loi_120p = ?, loi_qua_han_24h = ?, loi_lo_ke_hoach = ?, loi_kh_hen_lai = ?
       WHERE id = ?`,
    )
    .bind(
      now,
      now,
      finalFlags.loi_120p,
      finalFlags.loi_qua_han_24h,
      finalFlags.loi_lo_ke_hoach,
      finalFlags.loi_kh_hen_lai,
      id,
    );
}

function buildFullOverwrite(
  db: D1Database,
  incoming: ImportRow,
  finalFlags: Record<string, number>,
  now: string,
): D1PreparedStatement {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  for (const field of BUSINESS_FIELDS) {
    setClauses.push(`${field} = ?`);
    values.push(businessFieldValue(field, incoming));
  }
  for (const field of VIOLATION_FIELDS) {
    setClauses.push(`${field} = ?`);
    values.push(finalFlags[field]);
  }
  setClauses.push("ngay_cap_nhat_gan_nhat = ?");
  values.push(now);
  setClauses.push("updated_at = ?");
  values.push(now);
  values.push(incoming.id);
  return db
    .prepare(`UPDATE case_dvbh SET ${setClauses.join(", ")} WHERE id = ?`)
    .bind(...values);
}

/**
 * Xu ly toan bo file import. commit=false: chi tra ve so luong du kien
 * (preview), khong ghi DB. commit=true: thuc thi that qua db.batch().
 */
export async function processImport(
  db: D1Database,
  rawRows: unknown[],
  commit: boolean,
): Promise<ImportSummary> {
  const summary = emptySummary();
  const { valid, errors } = validateRows(rawRows);
  summary.errors = errors;
  summary.LOI = errors.length;

  const existingById = await fetchExistingRows(
    db,
    valid.map((r) => r.id),
  );

  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const statements: D1PreparedStatement[] = [];

  for (const incoming of valid) {
    const existing = existingById.get(incoming.id);
    const normalizedFlags = Object.fromEntries(
      VIOLATION_FIELDS.map((f) => [f, normalizeViolationFlag(incoming[f])]),
    ) as Record<string, boolean>;

    if (!existing) {
      summary.GHI_MOI++;
      if (commit) statements.push(buildInsertStatement(db, incoming, now));
      continue;
    }

    const dataChanged = hasBusinessDataChanged(existing, incoming);

    if (existing.thoi_gian_hoan_thanh && !dataChanged) {
      summary.BO_QUA++;
      continue; // da hoan thanh, khong doi -> bo qua hoan toan, khong dung ratchet
    }

    const finalFlags = Object.fromEntries(
      VIOLATION_FIELDS.map((f) => [
        f,
        ratchetFlag(Boolean(existing[f]), normalizedFlags[f]) ? 1 : 0,
      ]),
    ) as Record<string, number>;

    if (!dataChanged) {
      summary.CAP_NHAT_MOC_THOI_GIAN++;
      if (commit) statements.push(buildTimestampOnlyUpdate(db, incoming.id, finalFlags, now));
      continue;
    }

    summary.GHI_DE++;
    if (commit) statements.push(buildFullOverwrite(db, incoming, finalFlags, now));
  }

  if (commit) {
    for (let i = 0; i < statements.length; i += CHUNK_SIZE_BATCH) {
      const chunk = statements.slice(i, i + CHUNK_SIZE_BATCH);
      if (chunk.length > 0) await db.batch(chunk);
    }
  }

  return summary;
}
