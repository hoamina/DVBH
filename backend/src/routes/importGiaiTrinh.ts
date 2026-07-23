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

// Khoa trung lap giai_trinh dung STRING KEY (khong dua vao UNIQUE constraint SQL) vi
// SQLite coi 2 gia tri NULL la "khac nhau" trong UNIQUE, nen ON CONFLICT DO NOTHING se
// KHONG chan duoc phan lon truong hop trung (do tren DB that: 87% dong giai_trinh co
// it nhat 1 trong 5 cot optional la NULL). Ghep chuoi bang "|" + ep chuoi rong cho gia
// tri thieu de so sanh la so sanh string thuan tuy, khong dinh loi NULL != NULL cua SQL -
// dung cung pattern da co san va dung voi loadExistingViPhamPairs trong importKhaoSat.ts.
function buildGiaiTrinhKey(f: {
  caseId: string;
  lyDoCham: string;
  nguoiGiaiTrinh: string;
  ngayGiaiTrinh: string;
  noiDung: string;
  linhKienThieu: string;
  ngayDuKienHoanThanh: string;
  ngayYeuCauCoHang: string;
  maXuatHangLienQuan: string;
}): string {
  return [
    f.caseId,
    f.lyDoCham,
    f.nguoiGiaiTrinh,
    f.ngayGiaiTrinh,
    f.noiDung,
    f.linhKienThieu,
    f.ngayDuKienHoanThanh,
    f.ngayYeuCauCoHang,
    f.maXuatHangLienQuan,
  ].join("|");
}

async function loadExistingGiaiTrinhKeys(db: D1Database, caseIds: string[]): Promise<Set<string>> {
  const uniqueIds = Array.from(new Set(caseIds.filter(Boolean)));
  const keys = new Set<string>();
  for (let i = 0; i < uniqueIds.length; i += 100) {
    const chunk = uniqueIds.slice(i, i + 100);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(
        `SELECT case_id, ly_do_cham, nguoi_giai_trinh, ngay_giai_trinh, noi_dung, linh_kien_thieu,
           ngay_du_kien_hoan_thanh, ngay_yeu_cau_co_hang, ma_xuat_hang_lien_quan
         FROM giai_trinh WHERE case_id IN (${placeholders})`,
      )
      .bind(...chunk)
      .all<{
        case_id: string;
        ly_do_cham: string;
        nguoi_giai_trinh: string;
        ngay_giai_trinh: string;
        noi_dung: string | null;
        linh_kien_thieu: string | null;
        ngay_du_kien_hoan_thanh: string | null;
        ngay_yeu_cau_co_hang: string | null;
        ma_xuat_hang_lien_quan: string | null;
      }>();
    for (const row of results) {
      keys.add(
        buildGiaiTrinhKey({
          caseId: row.case_id,
          lyDoCham: row.ly_do_cham,
          nguoiGiaiTrinh: row.nguoi_giai_trinh,
          ngayGiaiTrinh: row.ngay_giai_trinh,
          noiDung: row.noi_dung ?? "",
          linhKienThieu: row.linh_kien_thieu ?? "",
          ngayDuKienHoanThanh: row.ngay_du_kien_hoan_thanh ?? "",
          ngayYeuCauCoHang: row.ngay_yeu_cau_co_hang ?? "",
          maXuatHangLienQuan: row.ma_xuat_hang_lien_quan ?? "",
        }),
      );
    }
  }
  return keys;
}

async function processRows(db: D1Database, rows: BackfillRow[], commit: boolean) {
  const summary = { thanhCong: 0, loi: 0, trungLap: 0, errors: [] as string[] };

  // File Excel/CSV do nguoi dung tai len: SheetJS tra ve cell toan chu so (vd case_id "1014874")
  // dang kieu number chu khong phai string - phai ep String() truoc .trim(), neu khong se
  // nem TypeError ("x.trim is not a function") va lam sap ca request (loi that da gap voi
  // case_id thuan so cua CRM that).
  const caseIds = rows.map((r) => String(r.case_id ?? "").trim());
  const [existingCaseIds, activeLyDo, linhKienLookup, existingKeys] = await Promise.all([
    findExistingCaseIds(db, caseIds),
    loadActiveLyDoNames(db),
    loadLinhKienLookup(db),
    loadExistingGiaiTrinhKeys(db, caseIds),
  ]);

  const validRows: { row: BackfillRow; caseId: string; lyDoCham: string; linhKienThieu: string | null }[] = [];
  const seenInFile = new Set<string>();
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
    const nguoiGiaiTrinh = String(row.nguoi_giai_trinh ?? "").trim();
    if (!nguoiGiaiTrinh) {
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
    const key = buildGiaiTrinhKey({
      caseId,
      lyDoCham,
      nguoiGiaiTrinh,
      ngayGiaiTrinh: String(row.ngay_giai_trinh ?? "").trim(),
      noiDung: String(row.noi_dung ?? "").trim(),
      linhKienThieu: linhKienThieu ?? "",
      ngayDuKienHoanThanh: String(row.ngay_du_kien_hoan_thanh ?? "").trim(),
      ngayYeuCauCoHang: String(row.ngay_yeu_cau_co_hang ?? "").trim(),
      maXuatHangLienQuan: String(row.ma_xuat_hang_lien_quan ?? "").trim(),
    });
    if (existingKeys.has(key) || seenInFile.has(key)) {
      summary.trungLap++;
      summary.errors.push(`Dong ${i + 1}: giai trinh nay da ton tai (trung lap voi du lieu da import), bo qua`);
      return;
    }
    seenInFile.add(key);
    validRows.push({ row, caseId, lyDoCham, linhKienThieu });
  });

  summary.thanhCong = validRows.length;

  if (commit && validRows.length > 0) {
    await ensureUsersExist(db, validRows.map(({ row }) => String(row.nguoi_giai_trinh ?? "").trim()));
    // Hang rao chinh chan trung lap la buildGiaiTrinhKey/loadExistingGiaiTrinhKeys o tren (string
    // key, khong bi lo hong NULL != NULL cua SQL UNIQUE). ON CONFLICT DO NOTHING o day chi la
    // luoi an toan thu 2 (defense in depth) phong truong hop 2 request commit chay dong thoi
    // race nhau qua pre-check nhung cung luc ghi - giai_trinh co UNIQUE(case_id, ly_do_cham,
    // nguoi_giai_trinh, ngay_giai_trinh, noi_dung, linh_kien_thieu, ngay_du_kien_hoan_thanh,
    // ngay_yeu_cau_co_hang, ma_xuat_hang_lien_quan) tu migration 0022, giong pattern vi_pham
    // (xem importKhaoSat.ts + migration 0005_vi_pham_unique.sql).
    const statements = validRows.map(({ row, caseId, lyDoCham, linhKienThieu }) =>
      db
        .prepare(
          `INSERT INTO giai_trinh (id, case_id, ly_do_cham, noi_dung, linh_kien_thieu, ngay_du_kien_hoan_thanh,
             ngay_yeu_cau_co_hang, ma_xuat_hang_lien_quan, nguoi_giai_trinh, ngay_giai_trinh)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
           ON CONFLICT(case_id, ly_do_cham, nguoi_giai_trinh, ngay_giai_trinh, noi_dung, linh_kien_thieu,
             ngay_du_kien_hoan_thanh, ngay_yeu_cau_co_hang, ma_xuat_hang_lien_quan) DO NOTHING`,
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
