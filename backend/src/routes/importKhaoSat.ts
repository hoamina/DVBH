import { Hono } from "hono";
import type { Env, LoaiLoi } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { findExistingCaseIds, ensureUsersExist, runBatched } from "../lib/backfillImportProcessor";
import { reserveSequentialIds } from "../lib/idCounter";
import { toJsonArray } from "../lib/jsonArray";
import { LOAI_LOI_KEYS } from "../types";
import { parseBackfillTsv, fetchSheetText, getSheetUrl } from "../lib/backfillSheetSync";

const SHEET_DATE_TIME_FIELDS = new Set(["ngay_gio_thuc_hien", "ngay_chot"]);

const importKhaoSat = new Hono<{ Bindings: Env }>();
importKhaoSat.use("*", verifySessionMiddleware, loadUser, requireRole("Admin", "TBP DVBH"));

const KET_QUA_CAP_1_VALUES = new Set(["Khong loi", "Loi khong lien he", "Loi sai bao cao", "Loi khac"]);

interface BackfillRow {
  case_id?: string;
  loai_loi?: string;
  doi_tuong_lien_he?: string;
  ket_qua_cuoc_goi?: string;
  dien_giai?: string;
  ghi_chu?: string;
  ly_do_that_bai?: string;
  can_goi_lai?: string;
  ket_qua_cap_1?: string;
  chot_bo_cap_2?: string;
  nguoi_thuc_hien?: string;
  ngay_gio_thuc_hien?: string;
  nguoi_chot?: string;
  ngay_chot?: string;
}

const TEMPLATE_CSV =
  "case_id,loai_loi,doi_tuong_lien_he,ket_qua_cuoc_goi,dien_giai,ghi_chu,ly_do_that_bai,can_goi_lai,ket_qua_cap_1,chot_bo_cap_2,nguoi_thuc_hien,ngay_gio_thuc_hien,nguoi_chot,ngay_chot\n" +
  `CASE-2026-001,${LOAI_LOI_KEYS[0]},Khach hang,Lien he thanh cong,,,,,Khong loi,,cskh@congty.vn,2026-06-01 10:00:00,,\n`;

// GET /api/import/khao-sat/template
importKhaoSat.get("/template", (c) =>
  c.body(TEMPLATE_CSV, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": "attachment; filename=mau_import_khao_sat_cu.csv",
  }),
);

// raw co the la number (SheetJS tra ve kieu number cho o toan chu so, vd "1"), khong the tin
// tuong kieu string | undefined khai bao tinh - phai ep String() truoc khi goi .trim().
function toBool(raw: unknown): boolean | null {
  if (raw === undefined || raw === null) return null;
  const str = String(raw).trim();
  if (str === "") return null;
  const v = str.toUpperCase();
  return v === "TRUE" || v === "1" || v === "CO" || v === "CÓ";
}

async function loadExistingViPhamPairs(db: D1Database, caseIds: string[]): Promise<Set<string>> {
  const uniqueIds = Array.from(new Set(caseIds.filter(Boolean)));
  const pairs = new Set<string>();
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(`SELECT case_id, loai_loi FROM vi_pham WHERE case_id IN (${placeholders})`)
      .bind(...chunk)
      .all<{ case_id: string; loai_loi: string }>();
    for (const row of results) pairs.add(`${row.case_id}|${row.loai_loi}`);
  }
  return pairs;
}

async function processRows(db: D1Database, rows: BackfillRow[], commit: boolean) {
  const summary = { thanhCong: 0, loi: 0, errors: [] as string[] };
  const caseIds = rows.map((r) => String(r.case_id ?? "").trim());
  const [existingCaseIds, existingViPhamPairs] = await Promise.all([
    findExistingCaseIds(db, caseIds),
    loadExistingViPhamPairs(db, caseIds),
  ]);

  interface ValidRow {
    row: BackfillRow;
    caseId: string;
    loaiLoi: LoaiLoi;
    ketQuaCap1: string | null;
    chotBoCap2: boolean | null;
    nguoiThucHien: string;
  }
  const validRows: ValidRow[] = [];
  const seenInFile = new Set<string>();

  rows.forEach((row, i) => {
    const caseId = String(row.case_id ?? "").trim();
    if (!caseId || !existingCaseIds.has(caseId)) {
      summary.loi++;
      summary.errors.push(`Dong ${i + 1}: khong tim thay case_id "${caseId}"`);
      return;
    }
    const loaiLoiRaw = String(row.loai_loi ?? "").trim();
    if (!loaiLoiRaw || !(LOAI_LOI_KEYS as readonly string[]).includes(loaiLoiRaw)) {
      summary.loi++;
      summary.errors.push(`Dong ${i + 1}: loai_loi "${loaiLoiRaw}" khong hop le`);
      return;
    }
    const nguoiThucHien = String(row.nguoi_thuc_hien ?? "").trim();
    if (!nguoiThucHien) {
      summary.loi++;
      summary.errors.push(`Dong ${i + 1}: thieu nguoi_thuc_hien`);
      return;
    }
    const ketQuaCap1 = String(row.ket_qua_cap_1 ?? "").trim() || null;
    if (ketQuaCap1 && !KET_QUA_CAP_1_VALUES.has(ketQuaCap1)) {
      summary.loi++;
      summary.errors.push(`Dong ${i + 1}: ket_qua_cap_1 "${ketQuaCap1}" khong hop le`);
      return;
    }
    const chotBoCap2 = toBool(row.chot_bo_cap_2);
    if (chotBoCap2 !== null && !ketQuaCap1) {
      summary.loi++;
      summary.errors.push(`Dong ${i + 1}: co chot_bo_cap_2 nhung thieu ket_qua_cap_1 (vi pham rang buoc chk_cap2_sau_cap1)`);
      return;
    }
    const pairKey = `${caseId}|${loaiLoiRaw}`;
    if (existingViPhamPairs.has(pairKey) || seenInFile.has(pairKey)) {
      summary.loi++;
      summary.errors.push(`Dong ${i + 1}: ca "${caseId}" da co vi pham ghi nhan cho loai loi "${loaiLoiRaw}" (bo qua de tranh trung lap)`);
      return;
    }
    seenInFile.add(pairKey);
    validRows.push({ row, caseId, loaiLoi: loaiLoiRaw as LoaiLoi, ketQuaCap1, chotBoCap2, nguoiThucHien });
  });

  summary.thanhCong = validRows.length;

  if (commit && validRows.length > 0) {
    await ensureUsersExist(
      db,
      validRows.flatMap(({ row, nguoiThucHien }) => [nguoiThucHien, row.nguoi_chot ? String(row.nguoi_chot).trim() : null]),
    );

    const [ketQuaGoiIds, viPhamIds] = await Promise.all([
      reserveSequentialIds(db, "ket_qua_goi", "CG", 6, validRows.length),
      reserveSequentialIds(db, "vi_pham", "L", 6, validRows.length),
    ]);

    const statements: D1PreparedStatement[] = [];
    validRows.forEach(({ row, caseId, loaiLoi, ketQuaCap1, chotBoCap2, nguoiThucHien }, i) => {
      const ketQuaGoiId = ketQuaGoiIds[i];
      const viPhamId = viPhamIds[i];

      statements.push(
        db
          .prepare(
            `INSERT INTO ket_qua_goi (id, case_id, loai_khao_sat, doi_tuong_lien_he, ket_qua_cuoc_goi, dien_giai, ghi_chu, ly_do_that_bai, can_goi_lai, nguoi_thuc_hien, ngay_gio_thuc_hien)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
          )
          .bind(
            ketQuaGoiId,
            caseId,
            toJsonArray([loaiLoi]),
            row.doi_tuong_lien_he || null,
            row.ket_qua_cuoc_goi || null,
            row.dien_giai || null,
            row.ghi_chu || null,
            row.ly_do_that_bai || null,
            toBool(row.can_goi_lai) === null ? null : toBool(row.can_goi_lai) ? 1 : 0,
            nguoiThucHien,
            row.ngay_gio_thuc_hien || null,
          ),
      );

      statements.push(
        db
          .prepare(
            `INSERT INTO vi_pham (id, ket_qua_goi_id, case_id, loai_loi, ket_qua_cap_1, nguoi_ghi_nhan, ngay_ghi_nhan, chot_bo_cap_2, nguoi_chot, ngay_chot)
             VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?, ?, ?)
             ON CONFLICT(case_id, loai_loi) DO NOTHING`,
          )
          .bind(
            viPhamId,
            ketQuaGoiId,
            caseId,
            loaiLoi,
            ketQuaCap1,
            nguoiThucHien,
            row.ngay_gio_thuc_hien || null,
            chotBoCap2 === null ? null : chotBoCap2 ? 1 : 0,
            chotBoCap2 !== null ? (row.nguoi_chot ? String(row.nguoi_chot).trim() : nguoiThucHien) : null,
            chotBoCap2 !== null ? row.ngay_chot || row.ngay_gio_thuc_hien || null : null,
          ),
      );
    });
    await runBatched(db, statements);
  }

  return summary;
}

// POST /api/import/khao-sat/preview
importKhaoSat.post("/preview", async (c) => {
  const body = await c.req.json<{ rows: BackfillRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processRows(c.env.DB, body.rows, false);
  return c.json(summary);
});

// POST /api/import/khao-sat/commit
importKhaoSat.post("/commit", async (c) => {
  const body = await c.req.json<{ rows: BackfillRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processRows(c.env.DB, body.rows, true);
  return c.json(summary);
});

// POST /api/import/khao-sat/sync-sheet - dong bo khao sat cu tu Google Sheet, chi Admin
// (link cau hinh o Settings > sheet-urls, loai_dong_bo = 'khao_sat_cu')
importKhaoSat.post("/sync-sheet", requireRole("Admin"), async (c) => {
  const url = await getSheetUrl(c.env.DB, "khao_sat_cu");
  if (!url) return c.json({ error: "MISSING_SHEET_URL" }, 400);

  let rows: BackfillRow[];
  try {
    const text = await fetchSheetText(url);
    rows = parseBackfillTsv(text, SHEET_DATE_TIME_FIELDS) as BackfillRow[];
  } catch (err) {
    return c.json({ error: "FETCH_FAILED", message: (err as Error).message }, 502);
  }

  const summary = await processRows(c.env.DB, rows, true);
  return c.json(summary);
});

export default importKhaoSat;
