import { Hono } from "hono";
import type { Env } from "../types";
import { NAP_GAS_DANH_GIA_KEYS, NAP_GAS_PHI_DICH_VU_KEYS } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { findExistingCaseIds, ensureUsersExist, runBatched, logImportHistory } from "../lib/backfillImportProcessor";
import { parseBackfillTsv, fetchSheetText, getSheetUrl } from "../lib/backfillSheetSync";
import { parseSheetDateTime } from "../lib/sheetDateParser";
import { csvTemplateResponse } from "../lib/csvTemplate";
import { bumpVersions } from "../lib/dataVersions";

const SHEET_DATE_TIME_FIELDS = new Set(["ngay_chot"]);

const importNapGas = new Hono<{ Bindings: Env }>();
importNapGas.use("*", verifySessionMiddleware, loadUser, requireRole("Admin", "TBP DVBH"));

interface BackfillRow {
  case_id?: string;
  danh_gia_nap_gas?: string;
  phi_dich_vu?: string;
  nguoi_chot?: string;
  ngay_chot?: string;
}

// Nguoi dien file backfill tu nhien go dung NHAN HIEN THI tren giao dien (co dau, giong het
// NAP_GAS_DANH_GIA_META/NAP_GAS_PHI_DICH_VU_META o frontend/src/types.ts) thay vi ma noi bo khong
// dau dung de luu DB - khop bai hoc rut ra tu importGiaiTrinhLap.ts (bao cao thuc te 2026-07-23,
// xem CA_LAP_LABEL_TO_KEY). Chap nhan CA 2 dang (nhan hien thi CO dau HOAC ma noi bo KHONG dau dung
// trong TEMPLATE_CSV) - map ve dung ma noi bo truoc khi validate/ghi DB.
const DANH_GIA_LABEL_TO_KEY: Record<string, string> = {
  "Tự nạp gas": "Tu nap gas",
  "Không nạp gas": "Khong nap gas",
  "Gửi về Hãng nạp gas": "Gui ve Hang nap gas",
  "Tự nạp gas + thay Block": "Tu nap gas thay Block",
  "Sửa chữa khác": "Sua chua khac",
  "Kiểm tra": "Kiem tra",
};
const PHI_DICH_VU_LABEL_TO_KEY: Record<string, string> = {
  "Không thu phí DV": "Khong thu phi DV",
  "Không nạp gas": "Khong nap gas",
  "Đã thu phí DV": "Da thu phi DV",
  "Lỗi không thu phí DV": "Loi khong thu phi DV",
};

function normalizeDanhGia(raw: string): string {
  return DANH_GIA_LABEL_TO_KEY[raw] ?? raw;
}
function normalizePhiDichVu(raw: string): string {
  return PHI_DICH_VU_LABEL_TO_KEY[raw] ?? raw;
}

// Ten cot file nguoi dung tai len (tieng Viet co dau, dung KHOP nhung gi hien tren UI/tai lieu
// huong dan) -> ten cot chuan hoa dung trong BackfillRow/DB - khop pattern COLUMN_MAP cua CRM (xem
// backend/src/lib/ratchet.ts). BUG DA SUA (2026-07-24): truoc day khong co map nay, ImportUploader
// (frontend) khong dich header nen file nguoi dung dien dung header hien thi (vd "ID", "ĐÁNH GIÁ
// NẠP GAS"...) bi doc thanh "thieu case_id" cho MOI dong - khong lien quan gi den gia tri tieng
// Viet co dau trong o (2 cot lua chon van chap nhan nhan co dau qua DANH_GIA_LABEL_TO_KEY/
// PHI_DICH_VU_LABEL_TO_KEY o duoi, van de chi nam o TEN COT).
export const COLUMN_MAP: Record<string, string> = {
  "ID": "case_id",
  "ĐÁNH GIÁ NẠP GAS": "danh_gia_nap_gas",
  "PHÍ DỊCH VỤ": "phi_dich_vu",
  "NGƯỜI CHỐT": "nguoi_chot",
  "NGÀY CHỐT": "ngay_chot",
};

// GET /api/import/nap-gas/column-map - anh xa cot Excel -> cot DB, de frontend parse dung tren
// trinh duyet (giong /api/import/column-map cua CRM).
importNapGas.get("/column-map", (c) => c.json({ columnMap: COLUMN_MAP }));

const TEMPLATE_CSV =
  "ID,ĐÁNH GIÁ NẠP GAS,PHÍ DỊCH VỤ,NGƯỜI CHỐT,NGÀY CHỐT\n" +
  "CASE-2026-001,Tự nạp gas,Đã thu phí DV,giamsat@congty.vn,01/06/2026 09:00:00\n";

// GET /api/import/nap-gas/template
importNapGas.get("/template", (c) => csvTemplateResponse(c, TEMPLATE_CSV, "mau_import_danh_gia_nap_gas_cu.csv"));

// nap_gas_danh_gia.case_id la PRIMARY KEY (1 dong/ca, xem migration 0025) nen import phai UPSERT
// (INSERT ... ON CONFLICT DO UPDATE), khong phai INSERT thuan. Khac giai_trinh_lap (chi can 1 trong
// 2 cot GS/QC), o day CA danh_gia_nap_gas LAN phi_dich_vu deu NOT NULL trong schema nen BAT BUOC
// phai co du ca 2 cot moi ghi duoc 1 dong - khong co khai niem "dien 1 phan roi bo sung sau" nhu
// giai_trinh_lap. Khong "mac dinh ve datetime('now')" cho ngay_chot thieu - day la backfill du lieu
// CU, mac dinh "now" se ghi sai ngay lich su, nen bat buoc ngay_chot phai co san trong file.
async function processRows(db: D1Database, rows: BackfillRow[], commit: boolean) {
  const summary = { thanhCong: 0, loi: 0, errors: [] as string[] };

  // Gop trung case_id trong CUNG 1 file (dong sau de) - case_id la PRIMARY KEY nen 2 dong cung
  // case_id trong 1 file khong the tach thanh 2 ban ghi rieng. Bao loi ro rang khi thieu case_id
  // (khop bug da sua trong importGiaiTrinhLap.ts - tranh loai bo am tham khong ro ly do).
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
    // Chuan hoa nhan hien thi CO dau ve dung ma noi bo KHONG dau truoc khi validate/ghi - xem giai
    // thich o DANH_GIA_LABEL_TO_KEY/PHI_DICH_VU_LABEL_TO_KEY dau file.
    const danhGia = normalizeDanhGia(String(row.danh_gia_nap_gas ?? "").trim());
    const phiDichVu = normalizePhiDichVu(String(row.phi_dich_vu ?? "").trim());
    if (!danhGia) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: thieu danh_gia_nap_gas`);
      continue;
    }
    if (!(NAP_GAS_DANH_GIA_KEYS as readonly string[]).includes(danhGia)) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: danh_gia_nap_gas "${danhGia}" khong hop le`);
      continue;
    }
    if (!phiDichVu) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: thieu phi_dich_vu`);
      continue;
    }
    if (!(NAP_GAS_PHI_DICH_VU_KEYS as readonly string[]).includes(phiDichVu)) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: phi_dich_vu "${phiDichVu}" khong hop le`);
      continue;
    }
    if (!String(row.nguoi_chot ?? "").trim()) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: thieu nguoi_chot`);
      continue;
    }
    // parseSheetDateTime chap nhan ca "YYYY-MM-DD HH:MM:SS" (da dung dinh dang) lan "DD/MM/YYYY
    // HH:MM:SS" (dinh dang pho bien khi go tay/copy tu Excel/Google Sheet) - xem lib/sheetDateParser.ts.
    // Ap dung cho CA 2 duong (upload file thu cong VA dong bo Google Sheet, duong sau da tu parse
    // qua parseBackfillTsv() nhung goi lai o day khong hai vi ham nay idempotent voi chuoi da dung
    // dinh dang) de tranh luu sai lech dinh dang ngay giua 2 nguon.
    const ngayChot = parseSheetDateTime(String(row.ngay_chot ?? "").trim());
    if (!ngayChot) {
      summary.loi++;
      summary.errors.push(`Dong ${lineNo}: thieu ngay_chot`);
      continue;
    }
    // Ghi lai gia tri DA CHUAN HOA vao row de buoc sau (build INSERT) dung dung ma noi bo, khong
    // dung nhan hien thi co dau tho tu file nguon.
    validRows.push({ caseId, row: { ...row, danh_gia_nap_gas: danhGia, phi_dich_vu: phiDichVu, ngay_chot: ngayChot } });
  }

  summary.thanhCong = validRows.length;

  if (commit && validRows.length > 0) {
    const emails = validRows.map(({ row }) => String(row.nguoi_chot ?? "").trim()).filter(Boolean);
    await ensureUsersExist(db, emails);

    const statements = validRows.map(({ caseId, row }) =>
      db
        .prepare(
          `INSERT INTO nap_gas_danh_gia (case_id, danh_gia_nap_gas, phi_dich_vu, nguoi_chot, ngay_chot)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(case_id) DO UPDATE SET
             danh_gia_nap_gas = excluded.danh_gia_nap_gas,
             phi_dich_vu = excluded.phi_dich_vu,
             nguoi_chot = excluded.nguoi_chot,
             ngay_chot = excluded.ngay_chot`,
        )
        .bind(caseId, row.danh_gia_nap_gas, row.phi_dich_vu, row.nguoi_chot, row.ngay_chot),
    );
    await runBatched(db, statements);
    // Bump domain "nap_gas_danh_gia" chi o nhanh COMMIT that (khong bump o preview) - xem lib/dataVersions.ts.
    await bumpVersions(db, ["nap_gas_danh_gia"]);
  }

  return summary;
}

// POST /api/import/nap-gas/preview
importNapGas.post("/preview", async (c) => {
  const body = await c.req.json<{ rows: BackfillRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processRows(c.env.DB, body.rows, false);
  return c.json(summary);
});

// POST /api/import/nap-gas/commit
importNapGas.post("/commit", async (c) => {
  const body = await c.req.json<{ rows: BackfillRow[]; filename?: string }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processRows(c.env.DB, body.rows, true);
  const user = c.get("user");
  c.executionCtx.waitUntil(
    logImportHistory(c.env.DB, {
      loai: "nap_gas_danh_gia_cu",
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
  | { ok: false; reason: "FETCH_FAILED"; message: string }
  | { ok: false; reason: "NO_ROWS_PARSED" };

/** Dung chung cho route POST /sync-sheet (nguoi bam tay) VA cron tu dong (xem index.ts scheduled()
 * + SHEET_SYNC_CRON) - xem chu thich day du o ham cung ten trong routes/importGiaiTrinh.ts. */
const TEN_FILE_SYNC = "Đồng bộ đánh giá nạp gas cũ từ Google Sheet";

// "bgError" - ghi luon vao lich su (khong chi tra ve response) de cron tu dong (khong ai xem
// response HTTP) van co cho tra cuu lai duoc ly do that bai/danh sach loi tung dong - xem
// logImportHistory() o backfillImportProcessor.ts.
export async function syncNapGasFromSheet(db: D1Database, actorEmail: string): Promise<SheetSyncResult> {
  const url = await getSheetUrl(db, "nap_gas_danh_gia_cu");
  if (!url) {
    await logImportHistory(db, {
      loai: "nap_gas_danh_gia_cu",
      tenFile: TEN_FILE_SYNC,
      nguoiImport: actorEmail,
      thanhCong: 0,
      loi: 0,
      bgError: "Chưa cấu hình link Google Sheet (xem Settings > Đường dẫn đồng bộ).",
    });
    return { ok: false, reason: "MISSING_SHEET_URL" };
  }

  let rows: BackfillRow[];
  try {
    const text = await fetchSheetText(url);
    // Dich header Sheet (tieng Viet co dau, xem COLUMN_MAP dau file) sang ten cot chuan hoa TRUOC
    // khi parse - thieu buoc nay se lam moi dong bi loai am tham (xem giai thich chi tiet o
    // parseBackfillTsv trong lib/backfillSheetSync.ts).
    rows = parseBackfillTsv(text, SHEET_DATE_TIME_FIELDS, new Set(), COLUMN_MAP) as BackfillRow[];
  } catch (err) {
    const message = (err as Error).message;
    await logImportHistory(db, {
      loai: "nap_gas_danh_gia_cu",
      tenFile: TEN_FILE_SYNC,
      nguoiImport: actorEmail,
      thanhCong: 0,
      loi: 0,
      bgError: `Không tải được Google Sheet: ${message}`,
    });
    return { ok: false, reason: "FETCH_FAILED", message };
  }

  // BAO LOI RO RANG thay vi tra "thanh cong 0 dong" trong im lang khi Sheet khong parse duoc dong
  // nao (header sai ten, khong co du lieu, hoac cot "ID"/"case_id" trong sau khi dich COLUMN_MAP) -
  // day chinh la loi thuc te da xay ra (2026-07-24): nguoi dung tuong da dong bo xong vi khong thay
  // bao loi gi, nhung thuc ra 0 dong nao duoc doc.
  if (rows.length === 0) {
    await logImportHistory(db, {
      loai: "nap_gas_danh_gia_cu",
      tenFile: TEN_FILE_SYNC,
      nguoiImport: actorEmail,
      thanhCong: 0,
      loi: 0,
      bgError: "Không đọc được dòng dữ liệu nào từ Sheet - kiểm tra lại tên cột (ID, ĐÁNH GIÁ NẠP GAS, PHÍ DỊCH VỤ, NGƯỜI CHỐT, NGÀY CHỐT) và đảm bảo Sheet có dữ liệu.",
    });
    return { ok: false, reason: "NO_ROWS_PARSED" };
  }

  const summary = await processRows(db, rows, true);
  await logImportHistory(db, {
    loai: "nap_gas_danh_gia_cu",
    tenFile: TEN_FILE_SYNC,
    nguoiImport: actorEmail,
    thanhCong: summary.thanhCong,
    loi: summary.loi,
    bgError: summary.errors.length > 0 ? summary.errors.join("\n") : null,
  });
  return { ok: true, summary };
}

// POST /api/import/nap-gas/sync-sheet - dong bo danh gia nap gas cu tu Google Sheet, chi Admin
// (link cau hinh o Settings > sheet-urls, loai_dong_bo = 'nap_gas_danh_gia_cu'). Tu dong 3 lan/ngay
// qua cron (xem index.ts).
importNapGas.post("/sync-sheet", requireRole("Admin"), async (c) => {
  const user = c.get("user");
  const result = await syncNapGasFromSheet(c.env.DB, user.email);
  if (!result.ok) {
    if (result.reason === "MISSING_SHEET_URL") return c.json({ error: "MISSING_SHEET_URL" }, 400);
    if (result.reason === "NO_ROWS_PARSED") {
      return c.json(
        { error: "NO_ROWS_PARSED", message: "Không đọc được dòng dữ liệu nào từ Sheet - kiểm tra lại tên cột (ID, ĐÁNH GIÁ NẠP GAS, PHÍ DỊCH VỤ, NGƯỜI CHỐT, NGÀY CHỐT) và đảm bảo Sheet có dữ liệu." },
        400,
      );
    }
    return c.json({ error: "FETCH_FAILED", message: result.message }, 502);
  }
  return c.json(result.summary);
});

export default importNapGas;
