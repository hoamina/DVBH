import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { findExistingCaseIds, ensureUsersExist, loadActiveLyDoNames, loadLinhKienLookup, runBatched } from "../lib/backfillImportProcessor";
import { parseBackfillTsv, fetchSheetText, getSheetUrl } from "../lib/backfillSheetSync";
import { bumpVersions } from "../lib/dataVersions";

const SHEET_DATE_TIME_FIELDS = new Set(["ngay_giai_trinh"]);
const SHEET_DATE_ONLY_FIELDS = new Set(["ngay_du_kien_hoan_thanh", "ngay_yeu_cau_co_hang"]);

const importGiaiTrinh = new Hono<{ Bindings: Env }>();
importGiaiTrinh.use("*", verifySessionMiddleware, loadUser, requireRole("Admin", "TBP DVBH"));

interface BackfillRow {
  case_id?: string;
  ly_do_cham?: string;
  noi_dung?: string;
  linh_kien_thieu?: string;
  ngay_du_kien_hoan_thanh?: string;
  ngay_yeu_cau_co_hang?: string;
  ma_xuat_hang_lien_quan?: string;
  nguoi_giai_trinh?: string;
  ngay_giai_trinh?: string;
}

const TEMPLATE_CSV =
  "case_id,ly_do_cham,noi_dung,linh_kien_thieu,ngay_du_kien_hoan_thanh,ngay_yeu_cau_co_hang,ma_xuat_hang_lien_quan,nguoi_giai_trinh,ngay_giai_trinh\n" +
  "CASE-2026-001,Do KTV,Da lien he khach hang hen lai lich,,,,,giamsat@congty.vn,2026-06-01 09:00:00\n";

// GET /api/import/giai-trinh/template
importGiaiTrinh.get("/template", (c) =>
  c.body(TEMPLATE_CSV, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": "attachment; filename=mau_import_giai_trinh_cu.csv",
  }),
);

async function processRows(db: D1Database, rows: BackfillRow[], commit: boolean) {
  const summary = { thanhCong: 0, loi: 0, errors: [] as string[] };

  // File Excel/CSV do nguoi dung tai len: SheetJS tra ve cell toan chu so (vd case_id "1014874")
  // dang kieu number chu khong phai string - phai ep String() truoc .trim(), neu khong se
  // nem TypeError ("x.trim is not a function") va lam sap ca request (loi that da gap voi
  // case_id thuan so cua CRM that).
  const caseIds = rows.map((r) => String(r.case_id ?? "").trim());
  const [existingCaseIds, activeLyDo, linhKienLookup] = await Promise.all([
    findExistingCaseIds(db, caseIds),
    loadActiveLyDoNames(db),
    loadLinhKienLookup(db),
  ]);

  const validRows: { row: BackfillRow; caseId: string; lyDoCham: string; linhKienThieu: string | null }[] = [];
  rows.forEach((row, i) => {
    const caseId = String(row.case_id ?? "").trim();
    if (!caseId || !existingCaseIds.has(caseId)) {
      summary.loi++;
      summary.errors.push(`Dong ${i + 1}: khong tim thay case_id "${caseId}"`);
      return;
    }
    const lyDoCham = String(row.ly_do_cham ?? "").trim();
    if (!lyDoCham || !activeLyDo.has(lyDoCham)) {
      summary.loi++;
      summary.errors.push(`Dong ${i + 1}: ly_do_cham "${lyDoCham}" khong ton tai trong danh muc`);
      return;
    }
    if (!String(row.nguoi_giai_trinh ?? "").trim()) {
      summary.loi++;
      summary.errors.push(`Dong ${i + 1}: thieu nguoi_giai_trinh`);
      return;
    }
    const linhKienRaw = String(row.linh_kien_thieu ?? "").trim();
    const linhKienThieu = linhKienRaw ? (linhKienLookup.get(linhKienRaw) ?? null) : null;
    if (linhKienRaw && !linhKienThieu) {
      summary.loi++;
      summary.errors.push(`Dong ${i + 1}: linh_kien_thieu "${linhKienRaw}" khong co trong danh muc linh kien (dung ma linh kien hoac ten day du)`);
      return;
    }
    validRows.push({ row, caseId, lyDoCham, linhKienThieu });
  });

  summary.thanhCong = validRows.length;

  if (commit && validRows.length > 0) {
    await ensureUsersExist(db, validRows.map(({ row }) => String(row.nguoi_giai_trinh ?? "").trim()));
    const statements = validRows.map(({ row, caseId, lyDoCham, linhKienThieu }) =>
      db
        .prepare(
          `INSERT INTO giai_trinh (id, case_id, ly_do_cham, noi_dung, linh_kien_thieu, ngay_du_kien_hoan_thanh,
             ngay_yeu_cau_co_hang, ma_xuat_hang_lien_quan, nguoi_giai_trinh, ngay_giai_trinh)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
        )
        .bind(
          crypto.randomUUID(),
          caseId,
          lyDoCham,
          row.noi_dung || null,
          linhKienThieu,
          row.ngay_du_kien_hoan_thanh || null,
          row.ngay_yeu_cau_co_hang || null,
          row.ma_xuat_hang_lien_quan || null,
          String(row.nguoi_giai_trinh ?? "").trim(),
          row.ngay_giai_trinh || null,
        ),
    );
    await runBatched(db, statements);
    // Bump domain "giai_trinh" chi o nhanh COMMIT that (khong bump o preview) - xem lib/dataVersions.ts.
    await bumpVersions(db, ["giai_trinh"]);
  }

  return summary;
}

// POST /api/import/giai-trinh/preview
importGiaiTrinh.post("/preview", async (c) => {
  const body = await c.req.json<{ rows: BackfillRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processRows(c.env.DB, body.rows, false);
  return c.json(summary);
});

// POST /api/import/giai-trinh/commit
importGiaiTrinh.post("/commit", async (c) => {
  const body = await c.req.json<{ rows: BackfillRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processRows(c.env.DB, body.rows, true);
  return c.json(summary);
});

// POST /api/import/giai-trinh/sync-sheet - dong bo giai trinh cu tu Google Sheet, chi Admin
// (link cau hinh o Settings > sheet-urls, loai_dong_bo = 'giai_trinh_cu')
importGiaiTrinh.post("/sync-sheet", requireRole("Admin"), async (c) => {
  const url = await getSheetUrl(c.env.DB, "giai_trinh_cu");
  if (!url) return c.json({ error: "MISSING_SHEET_URL" }, 400);

  let rows: BackfillRow[];
  try {
    const text = await fetchSheetText(url);
    rows = parseBackfillTsv(text, SHEET_DATE_TIME_FIELDS, SHEET_DATE_ONLY_FIELDS) as BackfillRow[];
  } catch (err) {
    return c.json({ error: "FETCH_FAILED", message: (err as Error).message }, 502);
  }

  const summary = await processRows(c.env.DB, rows, true);
  return c.json(summary);
});

export default importGiaiTrinh;
