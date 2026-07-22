import { Hono } from "hono";
import type { Env } from "../types";
import { CA_LAP_LOAI_KEYS, HINH_THUC_XU_LY_KEYS } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { findExistingCaseIds, ensureUsersExist, runBatched } from "../lib/backfillImportProcessor";
import { reserveSequentialIds } from "../lib/idCounter";
import { parseBackfillTsv, fetchSheetText, getSheetUrl } from "../lib/backfillSheetSync";

const SHEET_DATE_TIME_FIELDS = new Set(["ngay_giai_trinh", "ngay_qc"]);

const importGiaiTrinhLap = new Hono<{ Bindings: Env }>();
importGiaiTrinhLap.use("*", verifySessionMiddleware, loadUser, requireRole("Admin", "TBP DVBH"));

interface BackfillRow {
  case_id?: string;
  chot_danh_gia_lap?: string;
  chot_hinh_thuc_xu_ly?: string;
  dien_giai_lap?: string;
  nguoi_giai_trinh?: string;
  ngay_giai_trinh?: string;
  qc_chot?: string;
  qc_ghi_chu?: string;
  nguoi_qc?: string;
  ngay_qc?: string;
}

const TEMPLATE_CSV =
  "case_id,chot_danh_gia_lap,chot_hinh_thuc_xu_ly,dien_giai_lap,nguoi_giai_trinh,ngay_giai_trinh,qc_chot,qc_ghi_chu,nguoi_qc,ngay_qc\n" +
  "CASE-2026-001,Lap do nghiep vu KTV,Tinh luong,Do KTV thao tac sai quy trinh,giamsat@congty.vn,2026-06-01 09:00:00,Lap do nghiep vu KTV,Da doi chieu voi GS,qc@congty.vn,2026-06-02 10:00:00\n";

// GET /api/import/giai-trinh-lap/template
importGiaiTrinhLap.get("/template", (c) =>
  c.body(TEMPLATE_CSV, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": "attachment; filename=mau_import_giai_trinh_lap_cu.csv",
  }),
);

// giai_trinh_lap.case_id la UNIQUE (1 dong/ca, khac han giai_trinh cho phep nhieu dong/ca) nen
// import phai UPSERT (INSERT ... ON CONFLICT DO UPDATE), khong phai INSERT thuan nhu importGiaiTrinh.ts.
// Khong "mac dinh ve datetime('now')" cho ngay thieu nhu cac route /gs, /qc dang lam (dung cho hanh
// dong dang xay ra THAT SU) - vi day la backfill du lieu CU, mac dinh "now" se ghi sai ngay lich su,
// va con nguy co ghi de nham ngay that da co san qua COALESCE(excluded.x,...) khi excluded.x luon
// khac null do da duoc coalesce ve now() ngay trong VALUES. Vi vay bat buoc rieng ngay_giai_trinh/
// ngay_qc phai co san neu dong co chot_danh_gia_lap/qc_chot tuong ung, khong thi tu choi dong.
async function processRows(db: D1Database, rows: BackfillRow[], commit: boolean) {
  const summary = { thanhCong: 0, loi: 0, errors: [] as string[] };

  // Gop trung case_id trong CUNG 1 file (dong sau de) - khop pattern Map dedup cua blacklist import,
  // vi case_id la UNIQUE nen 2 dong cung case_id trong 1 file khong the tach GS/QC rieng le.
  const byCaseId = new Map<string, { row: BackfillRow; lineNo: number }>();
  rows.forEach((row, i) => {
    const caseId = String(row.case_id ?? "").trim();
    if (caseId) byCaseId.set(caseId, { row, lineNo: i + 1 });
  });

  const caseIds = [...byCaseId.keys()];
  const existingCaseIds = await findExistingCaseIds(db, caseIds);

  const validRows: { caseId: string; row: BackfillRow }[] = [];
  for (const [caseId, { row, lineNo }] of byCaseId) {
    if (!existingCaseIds.has(caseId)) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: khong tim thay case_id "${caseId}"`);
      continue;
    }
    const chotDanhGiaLap = String(row.chot_danh_gia_lap ?? "").trim();
    const qcChot = String(row.qc_chot ?? "").trim();
    if (!chotDanhGiaLap && !qcChot) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: phai co it nhat 1 trong 2 cot "chot_danh_gia_lap" hoac "qc_chot"`);
      continue;
    }
    if (chotDanhGiaLap && !CA_LAP_LOAI_KEYS.includes(chotDanhGiaLap as (typeof CA_LAP_LOAI_KEYS)[number])) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: chot_danh_gia_lap "${chotDanhGiaLap}" khong hop le`);
      continue;
    }
    if (qcChot && !CA_LAP_LOAI_KEYS.includes(qcChot as (typeof CA_LAP_LOAI_KEYS)[number])) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: qc_chot "${qcChot}" khong hop le`);
      continue;
    }
    const hinhThuc = String(row.chot_hinh_thuc_xu_ly ?? "").trim();
    if (hinhThuc && !HINH_THUC_XU_LY_KEYS.includes(hinhThuc as (typeof HINH_THUC_XU_LY_KEYS)[number])) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: chot_hinh_thuc_xu_ly "${hinhThuc}" khong hop le`);
      continue;
    }
    if (chotDanhGiaLap && !String(row.ngay_giai_trinh ?? "").trim()) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: co chot_danh_gia_lap nhung thieu ngay_giai_trinh`);
      continue;
    }
    if (qcChot && !String(row.ngay_qc ?? "").trim()) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: co qc_chot nhung thieu ngay_qc`);
      continue;
    }
    if (chotDanhGiaLap && !String(row.nguoi_giai_trinh ?? "").trim()) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: co chot_danh_gia_lap nhung thieu nguoi_giai_trinh`);
      continue;
    }
    if (qcChot && !String(row.nguoi_qc ?? "").trim()) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: co qc_chot nhung thieu nguoi_qc`);
      continue;
    }
    validRows.push({ caseId, row });
  }

  summary.thanhCong = validRows.length;

  if (commit && validRows.length > 0) {
    const emails = validRows.flatMap(({ row }) => [String(row.nguoi_giai_trinh ?? "").trim(), String(row.nguoi_qc ?? "").trim()]).filter(Boolean);
    await ensureUsersExist(db, emails);

    const ids = await reserveSequentialIds(db, "giai_trinh_lap", "CL", 6, validRows.length);
    const statements = validRows.map(({ caseId, row }, i) =>
      db
        .prepare(
          `INSERT INTO giai_trinh_lap (id, case_id, chot_danh_gia_lap, chot_hinh_thuc_xu_ly, dien_giai_lap, nguoi_giai_trinh, ngay_giai_trinh, qc_chot, qc_ghi_chu, nguoi_qc, ngay_qc)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(case_id) DO UPDATE SET
             chot_danh_gia_lap = COALESCE(excluded.chot_danh_gia_lap, giai_trinh_lap.chot_danh_gia_lap),
             chot_hinh_thuc_xu_ly = COALESCE(excluded.chot_hinh_thuc_xu_ly, giai_trinh_lap.chot_hinh_thuc_xu_ly),
             dien_giai_lap = COALESCE(excluded.dien_giai_lap, giai_trinh_lap.dien_giai_lap),
             nguoi_giai_trinh = COALESCE(excluded.nguoi_giai_trinh, giai_trinh_lap.nguoi_giai_trinh),
             ngay_giai_trinh = COALESCE(excluded.ngay_giai_trinh, giai_trinh_lap.ngay_giai_trinh),
             qc_chot = COALESCE(excluded.qc_chot, giai_trinh_lap.qc_chot),
             qc_ghi_chu = COALESCE(excluded.qc_ghi_chu, giai_trinh_lap.qc_ghi_chu),
             nguoi_qc = COALESCE(excluded.nguoi_qc, giai_trinh_lap.nguoi_qc),
             ngay_qc = COALESCE(excluded.ngay_qc, giai_trinh_lap.ngay_qc)`,
        )
        .bind(
          ids[i],
          caseId,
          row.chot_danh_gia_lap || null,
          row.chot_hinh_thuc_xu_ly || null,
          row.dien_giai_lap || null,
          row.nguoi_giai_trinh || null,
          row.ngay_giai_trinh || null,
          row.qc_chot || null,
          row.qc_ghi_chu || null,
          row.nguoi_qc || null,
          row.ngay_qc || null,
        ),
    );
    await runBatched(db, statements);
  }

  return summary;
}

// POST /api/import/giai-trinh-lap/preview
importGiaiTrinhLap.post("/preview", async (c) => {
  const body = await c.req.json<{ rows: BackfillRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processRows(c.env.DB, body.rows, false);
  return c.json(summary);
});

// POST /api/import/giai-trinh-lap/commit
importGiaiTrinhLap.post("/commit", async (c) => {
  const body = await c.req.json<{ rows: BackfillRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processRows(c.env.DB, body.rows, true);
  return c.json(summary);
});

// POST /api/import/giai-trinh-lap/sync-sheet - dong bo giai trinh lap cu tu Google Sheet, chi Admin
// (link cau hinh o Settings > sheet-urls, loai_dong_bo = 'giai_trinh_lap_cu')
importGiaiTrinhLap.post("/sync-sheet", requireRole("Admin"), async (c) => {
  const url = await getSheetUrl(c.env.DB, "giai_trinh_lap_cu");
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

export default importGiaiTrinhLap;
