import {
  BUSINESS_FIELDS,
  VIOLATION_FIELDS,
  normalizeViolationFlag,
  ratchetFlag,
  normalizeNghiNgoTranhChapRaw,
  ratchetNghiNgoTranhChap,
  computeCrmHash,
  businessFieldValue,
} from "./ratchet";
import { nowVN } from "./vnTime";

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

export type ImportAction = "GHI_MOI" | "BO_QUA" | "GHI_DE";

export interface ImportRow {
  id: string;
  [key: string]: unknown;
}

export interface ImportSummary {
  GHI_MOI: number;
  BO_QUA: number;
  GHI_DE: number;
  LOI: number;
  errors: string[];
  // Tap DISTINCT seri_san_pham cua CAC DONG GHI_MOI/GHI_DE (BO_QUA khong doi du lieu nghiep vu/co vi
  // pham nen khong dua vao day) - truyen cho refreshCaLapPrecompute() (lib/caLapRefresh.ts)
  // de tinh lai "ca lap" INCREMENTAL chi trong pham vi serial bi anh huong, thay vi full recompute
  // (xem importRoute.ts scheduleCaLapRefreshIfChanged). Voi dong GHI_DE, gom CA serial CU (truoc khi
  // ghi de) lan serial MOI, phong truong hop 1 case doi serial giua 2 lan import - LAG() PARTITION BY
  // seri_san_pham thi ca 2 partition (cu va moi) deu co the doi, khong chi partition moi.
  affectedSerials: string[];
  // Tap DISTINCT ngay lich (YYYY-MM-DD, tu thoi_gian_hoan_thanh) cua CAC DONG GHI_MOI/GHI_DE - dung
  // cho recomputeDaDongDayChunks() (lib/daDongDayChunks.ts) de biet DUNG nhung ngay nao can tinh lai
  // snapshot R2, thay vi tinh lai ca thang. Cung logic voi affectedSerials: GHI_DE gom ca ngay CU
  // (truoc khi ghi de) lan ngay MOI, phong truong hop 1 case doi ngay hoan thanh giua 2 lan import
  // (vd sua lai ngay dong ca, hoac case dang ton moi duoc danh dau hoan thanh).
  affectedDates: string[];
}

const CHUNK_SIZE_SELECT = 100; // an toan voi gioi han bind-param cua SQLite
const CHUNK_SIZE_BATCH = 500; // duoi gioi han batch 1000 (free tier D1)

function emptySummary(): ImportSummary {
  return { GHI_MOI: 0, BO_QUA: 0, GHI_DE: 0, LOI: 0, errors: [], affectedSerials: [], affectedDates: [] };
}

// Them 1 gia tri seri_san_pham (co the la unknown tho tu file import hoac tu dong DB cu) vao tap
// serial bi anh huong, bo qua gia tri rong/null - xem giai thich o field affectedSerials tren.
function addAffectedSerial(set: Set<string>, rawValue: unknown): void {
  if (rawValue === null || rawValue === undefined) return;
  const seri = String(rawValue).trim();
  if (seri.length > 0) set.add(seri);
}

// Them 1 ngay lich (YYYY-MM-DD, lay 10 ky tu dau cua thoi_gian_hoan_thanh dang UTC "YYYY-MM-DD
// HH:MM:SS") vao tap ngay bi anh huong, bo qua null/rong - xem giai thich o field affectedDates tren.
function addAffectedDate(set: Set<string>, rawValue: unknown): void {
  if (rawValue === null || rawValue === undefined) return;
  const ngay = String(rawValue).trim().slice(0, 10);
  if (ngay.length === 10) set.add(ngay);
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

// File co the chua nhieu dong cung "id" (loi nhap lieu nguon/CRM xuat trung). Neu khong loc truoc,
// 2 dong ID moi giong nhau se cung sinh buildInsertStatement() trong cung db.batch() -> vi pham
// PRIMARY KEY, roll back ca lo (xem CHUNK_SIZE_BATCH). Giu dong CUOI CUNG xuat hien trong file (gia
// dinh la ban ghi moi nhat neu CRM xuat theo thu tu thoi gian) - khong bao loi cung LOI (do khong
// phai loi dinh dang tung dong) ma ghi rieng vao errors[] de nguoi import biet co trung id.
function dedupeById(rows: ImportRow[]): { rows: ImportRow[]; duplicateCount: number } {
  const byId = new Map<string, ImportRow>();
  for (const row of rows) byId.set(row.id, row);
  return { rows: [...byId.values()], duplicateCount: rows.length - byId.size };
}

// Projection toi thieu: CHI cot can cho quyet dinh GHI_MOI/BO_QUA/GHI_DE va cho affectedSerials/
// affectedDates (gia tri CU truoc khi ghi de) - khong con SELECT * (xem BAO_CAO_RAO_SOAT_IMPORT_CRM_
// CACHE_2026-07-28.md P1). "crm_hash" la nguon so sanh chinh (xem ratchet.ts computeCrmHash); 4 cot
// loi_* + nghi_ngo_nap_gas can rieng de tinh flagsChanged (ratchet co the doi ke ca khi crm_hash
// khong doi, vi hash CHI tinh tren BUSINESS_FIELDS, khong gom VIOLATION_FIELDS). "nghi_ngo_tranh_chap"
// liet ke rieng (khong con nam trong VIOLATION_FIELDS - xem ratchet.ts) vi can gia tri hien co (0-3)
// de tinh ratchetNghiNgoTranhChap().
const EXISTING_ROW_COLUMNS = ["id", "crm_hash", "thoi_gian_hoan_thanh", "seri_san_pham", ...VIOLATION_FIELDS, "nghi_ngo_tranh_chap"];

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
      .prepare(`SELECT ${EXISTING_ROW_COLUMNS.join(", ")} FROM case_dvbh WHERE id IN (${placeholders})`)
      .bind(...chunk)
      .all();
    for (const row of results as Record<string, unknown>[]) {
      map.set(String(row.id), row);
    }
  }
  return map;
}

function buildInsertStatement(db: D1Database, incoming: ImportRow, now: string, crmHash: string): D1PreparedStatement {
  const normalizedFlags = Object.fromEntries(
    VIOLATION_FIELDS.map((f) => [f, normalizeViolationFlag(incoming[f]) ? 1 : 0]),
  );
  // Dong MOI (chua co gia tri cu) - khong can ratchet, ghi thang gia tri raw da normalize (0/1/2).
  const nghiNgoTranhChap = normalizeNghiNgoTranhChapRaw(incoming.nghi_ngo_tranh_chap);
  const businessValues = Object.fromEntries(BUSINESS_FIELDS.map((f) => [f, businessFieldValue(f, incoming)]));
  const fields = ["id", ...BUSINESS_FIELDS, ...VIOLATION_FIELDS, "nghi_ngo_tranh_chap", "crm_hash", "ngay_import", "ngay_cap_nhat_gan_nhat"];
  const values = {
    id: incoming.id,
    ...businessValues,
    ...normalizedFlags,
    nghi_ngo_tranh_chap: nghiNgoTranhChap,
    crm_hash: crmHash,
    ngay_import: now,
    ngay_cap_nhat_gan_nhat: now,
  };
  const placeholders = fields.map(() => "?").join(", ");
  return db
    .prepare(`INSERT INTO case_dvbh (${fields.join(", ")}) VALUES (${placeholders})`)
    .bind(...fields.map((f) => values[f as keyof typeof values]));
}

function buildFullOverwrite(
  db: D1Database,
  incoming: ImportRow,
  finalFlags: Record<string, number>,
  finalNghiNgoTranhChap: number,
  now: string,
  crmHash: string,
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
  setClauses.push("nghi_ngo_tranh_chap = ?");
  values.push(finalNghiNgoTranhChap);
  setClauses.push("crm_hash = ?");
  values.push(crmHash);
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
  const { valid: validRaw, errors } = validateRows(rawRows);
  summary.errors = errors;
  summary.LOI = errors.length; // chi tinh loi dinh dang tung dong (thieu/sai ID), khong tinh trung ID

  const { rows: valid, duplicateCount } = dedupeById(validRaw);
  if (duplicateCount > 0) {
    summary.errors.push(`${duplicateCount} dong ID trung lap trong file - da gop, giu dong cuoi cung xuat hien`);
  }

  const existingById = await fetchExistingRows(
    db,
    valid.map((r) => r.id),
  );

  const now = nowVN();
  const statements: D1PreparedStatement[] = [];
  const affectedSerials = new Set<string>();
  const affectedDates = new Set<string>();

  for (const incoming of valid) {
    const existing = existingById.get(incoming.id);
    const normalizedFlags = Object.fromEntries(
      VIOLATION_FIELDS.map((f) => [f, normalizeViolationFlag(incoming[f])]),
    ) as Record<string, boolean>;
    const incomingNghiNgoTranhChap = normalizeNghiNgoTranhChapRaw(incoming.nghi_ngo_tranh_chap);
    const incomingHash = await computeCrmHash(incoming);

    if (!existing) {
      summary.GHI_MOI++;
      addAffectedSerial(affectedSerials, businessFieldValue("seri_san_pham", incoming));
      addAffectedDate(affectedDates, businessFieldValue("thoi_gian_hoan_thanh", incoming));
      if (commit) statements.push(buildInsertStatement(db, incoming, now, incomingHash));
      continue;
    }

    // crm_hash NULL (dong tu truoc khi co cot nay, chua duoc backfill - xem POST /api/import/
    // backfill-crm-hash) luon bi coi la "khac" o lan cham dau tien, tu dong tinh lai hash that su
    // roi ghi lai - tu hoi phuc dan, khong can chan tinh dung ve lau dai.
    const dataChanged = existing.crm_hash !== incomingHash;
    const existingNghiNgoTranhChap = Number(existing.nghi_ngo_tranh_chap) || 0;
    const finalNghiNgoTranhChap = ratchetNghiNgoTranhChap(existingNghiNgoTranhChap, incomingNghiNgoTranhChap);
    const nghiNgoTranhChapChanged = finalNghiNgoTranhChap !== existingNghiNgoTranhChap;

    // Fix 2026-08-20 (phat hien qua test tinh nang "AI phat hien tranh chap"): early-BO_QUA nay TRUOC
    // day khong dieu kien gi ngoai "da hoan thanh + hash khong doi" - vo tinh nuot LUON ca tin hieu AI
    // moi (incoming nghi_ngo_tranh_chap=2 tren 1 ca DA DONG tu truoc, khong co truong nghiep vu nao
    // khac thay doi - CHINH LA tinh huong pho bien nhat AI se gap: quet lai ca cu, khong sua du lieu
    // gi khac). Them dieu kien "&& !nghiNgoTranhChapChanged" de KHONG bo qua khi rieng co nay THAT SU
    // doi (0/2 -> 1/2/3) - 5 cot VIOLATION_FIELDS con lai VAN giu nguyen hanh vi cu (quyet dinh nghiep
    // vu 2026-07-28 rieng, khong dong cham toi o day).
    if (existing.thoi_gian_hoan_thanh && !dataChanged && !nghiNgoTranhChapChanged) {
      summary.BO_QUA++;
      continue; // da hoan thanh, khong doi (ke ca nghi_ngo_tranh_chap) -> bo qua hoan toan
    }

    const finalFlags = Object.fromEntries(
      VIOLATION_FIELDS.map((f) => [
        f,
        ratchetFlag(Boolean(existing[f]), normalizedFlags[f]) ? 1 : 0,
      ]),
    ) as Record<string, number>;

    // Ca dang ton (chua hoan thanh), du lieu nghiep vu (crm_hash) khong doi: CHI ghi khi ratchet
    // co vi pham that su lam doi it nhat 1 co (vd CRM vua bao co loi nhung cac truong nghiep vu
    // khac giu nguyen) - neu khong thi bo qua hoan toan, khong con ghi lai "da xuat hien trong file
    // hom nay" don thuan nhu truoc nua (quyet dinh nghiep vu 2026-07-28, xem BAO_CAO_RAO_SOAT_
    // IMPORT_CRM_CACHE_2026-07-28.md muc "Chong cheo can xu ly" #3).
    if (!dataChanged) {
      const flagsChanged = VIOLATION_FIELDS.some((f) => finalFlags[f] !== (existing[f] ? 1 : 0)) || nghiNgoTranhChapChanged;
      if (!flagsChanged) {
        summary.BO_QUA++;
        continue;
      }
    }

    summary.GHI_DE++;
    // Gom ca serial CU (truoc khi ghi de, tu row DB da doc san o fetchExistingRows) lan serial MOI -
    // xem giai thich o field affectedSerials cua ImportSummary.
    addAffectedSerial(affectedSerials, existing.seri_san_pham);
    addAffectedSerial(affectedSerials, businessFieldValue("seri_san_pham", incoming));
    // Tuong tu: gom ca ngay hoan thanh CU (truoc khi ghi de) lan ngay MOI - xem field affectedDates.
    addAffectedDate(affectedDates, existing.thoi_gian_hoan_thanh);
    addAffectedDate(affectedDates, businessFieldValue("thoi_gian_hoan_thanh", incoming));
    if (commit) statements.push(buildFullOverwrite(db, incoming, finalFlags, finalNghiNgoTranhChap, now, incomingHash));
  }

  summary.affectedSerials = [...affectedSerials];
  summary.affectedDates = [...affectedDates];

  if (commit) {
    for (let i = 0; i < statements.length; i += CHUNK_SIZE_BATCH) {
      const chunk = statements.slice(i, i + CHUNK_SIZE_BATCH);
      if (chunk.length > 0) await db.batch(chunk);
    }
  }

  return summary;
}
