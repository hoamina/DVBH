import { Hono } from "hono";
import type { Env } from "../types";
import { CA_LAP_LOAI_KEYS, HINH_THUC_XU_LY_KEYS } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { findExistingCaseIds, ensureUsersExist, runBatched, logImportHistory } from "../lib/backfillImportProcessor";
import { reserveSequentialIds } from "../lib/idCounter";
import { parseBackfillTsv, fetchSheetText, getSheetUrl } from "../lib/backfillSheetSync";
import { csvTemplateResponse } from "../lib/csvTemplate";
import { bumpVersions } from "../lib/dataVersions";

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

// Nguoi dien file backfill (GS/QC) tu nhien go dung NHAN HIEN THI tren giao dien (co dau, giong
// het CA_LAP_META/HINH_THUC_XU_LY_META o frontend/src/types.ts) thay vi ma noi bo khong dau dung
// de luu DB - phat hien qua bao cao thuc te 2026-07-23 (Sheet toan gia tri "Bỏ qua"/"Lặp do tay
// nghề kỹ thuật viên"... bi tu choi het vi khong khop dung CA_LAP_LOAI_KEYS). Chap nhan CA 2 dang
// (nhan hien thi CO dau HOAC ma noi bo KHONG dau dung trong TEMPLATE_CSV) - map ve dung ma noi bo
// truoc khi validate/ghi DB, tranh bat nguoi dien file phai biet ma noi bo it ai nho duoc.
const CA_LAP_LABEL_TO_KEY: Record<string, string> = {
  "Bỏ qua": "Bo qua",
  "Lặp do nghiệp vụ kỹ thuật viên": "Lap do nghiep vu KTV",
  "Lặp do tay nghề kỹ thuật viên": "Lap do tay nghe KTV",
  "Lặp do chất lượng linh kiện": "Lap do chat luong linh kien",
  "Lặp do sai báo cáo": "Lap do sai bao cao",
  "Lặp do trùng sự vụ": "Lap do trung su vu",
};
const HINH_THUC_XU_LY_LABEL_TO_KEY: Record<string, string> = {
  "KHÔNG TÍNH LẶP, KHÔNG TÍNH LƯƠNG": "Khong tinh lap khong tinh luong",
  "TÍNH LẶP, KHÔNG TÍNH LƯƠNG": "Tinh lap khong tinh luong",
  "TÍNH LƯƠNG": "Tinh luong",
  "TÍNH LƯƠNG, LỖI BÁO CÁO": "Tinh luong loi bao cao",
  "KHÔNG TÍNH LƯƠNG, LỖI BÁO CÁO": "Khong tinh luong loi bao cao",
};

function normalizeCaLapLoai(raw: string): string {
  return CA_LAP_LABEL_TO_KEY[raw] ?? raw;
}
function normalizeHinhThuc(raw: string): string {
  return HINH_THUC_XU_LY_LABEL_TO_KEY[raw] ?? raw;
}

const TEMPLATE_CSV =
  "case_id,chot_danh_gia_lap,chot_hinh_thuc_xu_ly,dien_giai_lap,nguoi_giai_trinh,ngay_giai_trinh,qc_chot,qc_ghi_chu,nguoi_qc,ngay_qc\n" +
  "CASE-2026-001,Lap do nghiep vu KTV,Tinh luong,Do KTV thao tac sai quy trinh,giamsat@congty.vn,2026-06-01 09:00:00,Lap do nghiep vu KTV,Da doi chieu voi GS,qc@congty.vn,2026-06-02 10:00:00\n";

// GET /api/import/giai-trinh-lap/template
importGiaiTrinhLap.get("/template", (c) => csvTemplateResponse(c, TEMPLATE_CSV, "mau_import_giai_trinh_lap_cu.csv"));

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
  // BUG DA SUA (2026-07-23): truoc day dong thieu case_id bi LOAI BO AM THAM o day (khong tang
  // summary.loi, khong ghi vao summary.errors) - neu file nguon co ten cot khong khop "case_id"
  // (vd dung nham file/header cua luong import khac, hoac go sai ten cot) thi TOAN BO cac dong deu
  // bi loai o day ma khong co bat ky thong bao nao, ket qua tra ve {thanhCong:0, loi:0, errors:[]}
  // trong nhu khong co gi xay ra - nguoi dung khong biet ly do. Gio bat buoc phai bao loi ro rang.
  const byCaseId = new Map<string, { row: BackfillRow; lineNo: number }>();
  rows.forEach((row, i) => {
    const caseId = String(row.case_id ?? "").trim();
    if (caseId) {
      byCaseId.set(caseId, { row, lineNo: i + 1 });
    } else {
      summary.loi++;
      summary.errors.push(`Dong ${i + 1}: thieu case_id (kiem tra ten cot trong file co dung la "case_id" khong)`);
    }
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
    // Chuan hoa nhan hien thi CO dau (giong CA_LAP_META o frontend) ve dung ma noi bo KHONG dau
    // truoc khi validate/ghi - xem giai thich o CA_LAP_LABEL_TO_KEY dau file.
    const chotDanhGiaLap = normalizeCaLapLoai(String(row.chot_danh_gia_lap ?? "").trim());
    const qcChot = normalizeCaLapLoai(String(row.qc_chot ?? "").trim());
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
    const hinhThuc = normalizeHinhThuc(String(row.chot_hinh_thuc_xu_ly ?? "").trim());
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
    // Ghi lai gia tri DA CHUAN HOA vao row de cac buoc sau (build INSERT) dung dung ma noi bo,
    // khong dung nhan hien thi co dau tho tu file nguon.
    validRows.push({
      caseId,
      row: { ...row, chot_danh_gia_lap: chotDanhGiaLap || undefined, qc_chot: qcChot || undefined, chot_hinh_thuc_xu_ly: hinhThuc || undefined },
    });
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
    // Bump domain "giai_trinh_lap" chi o nhanh COMMIT that (khong bump o preview) - xem lib/dataVersions.ts.
    await bumpVersions(db, ["giai_trinh_lap"]);
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
  const body = await c.req.json<{ rows: BackfillRow[]; filename?: string }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processRows(c.env.DB, body.rows, true);
  const user = c.get("user");
  c.executionCtx.waitUntil(
    logImportHistory(c.env.DB, {
      loai: "giai_trinh_lap_cu",
      tenFile: body.filename || "(không rõ tên file)",
      nguoiImport: user.email,
      thanhCong: summary.thanhCong,
      loi: summary.loi,
    }),
  );
  return c.json(summary);
});

export type SheetSyncResult =
  | { ok: true; summary: Awaited<ReturnType<typeof processRows>> }
  | { ok: false; reason: "MISSING_SHEET_URL" }
  | { ok: false; reason: "FETCH_FAILED"; message: string };

/** Dung chung cho route POST /sync-sheet (nguoi bam tay) VA cron tu dong (xem index.ts scheduled()
 * + SHEET_SYNC_CRON) - xem chu thich day du o ham cung ten trong routes/importGiaiTrinh.ts. */
export async function syncGiaiTrinhLapFromSheet(db: D1Database, actorEmail: string): Promise<SheetSyncResult> {
  const url = await getSheetUrl(db, "giai_trinh_lap_cu");
  if (!url) return { ok: false, reason: "MISSING_SHEET_URL" };

  let rows: BackfillRow[];
  try {
    const text = await fetchSheetText(url);
    rows = parseBackfillTsv(text, SHEET_DATE_TIME_FIELDS) as BackfillRow[];
  } catch (err) {
    return { ok: false, reason: "FETCH_FAILED", message: (err as Error).message };
  }

  const summary = await processRows(db, rows, true);
  await logImportHistory(db, {
    loai: "giai_trinh_lap_cu",
    tenFile: "Đồng bộ giải trình lặp cũ từ Google Sheet",
    nguoiImport: actorEmail,
    thanhCong: summary.thanhCong,
    loi: summary.loi,
  });
  return { ok: true, summary };
}

// POST /api/import/giai-trinh-lap/sync-sheet - dong bo giai trinh lap cu tu Google Sheet, chi Admin
// (link cau hinh o Settings > sheet-urls, loai_dong_bo = 'giai_trinh_lap_cu'). Tu dong 3 lan/ngay
// qua cron (xem index.ts).
importGiaiTrinhLap.post("/sync-sheet", requireRole("Admin"), async (c) => {
  const user = c.get("user");
  const result = await syncGiaiTrinhLapFromSheet(c.env.DB, user.email);
  if (!result.ok) {
    if (result.reason === "MISSING_SHEET_URL") return c.json({ error: "MISSING_SHEET_URL" }, 400);
    return c.json({ error: "FETCH_FAILED", message: result.message }, 502);
  }
  return c.json(result.summary);
});

export default importGiaiTrinhLap;
