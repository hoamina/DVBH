import { Hono, type Context } from "hono";
import type { Env } from "../types";
import { CA_LAP_LOAI_KEYS, HINH_THUC_XU_LY_KEYS } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { scopeByKhuVuc } from "../middleware/scopeByKhuVuc";
import { excelWorkbookResponse } from "../lib/excelTemplate";
import { CA_LAP_LABELS, HINH_THUC_XU_LY_LABELS, chuanHoaCaLapLoai, chuanHoaHinhThuc } from "../lib/caLapLabels";
import { allInChunks } from "../lib/d1InChunks";
import { reserveSequentialIds } from "../lib/idCounter";
import { runBatched, logImportHistory } from "../lib/backfillImportProcessor";
import { bumpVersions } from "../lib/dataVersions";

// "Import giai trinh lap nhanh" (yeu cau chu he thong 2026-10-16) - nut o tab "Danh sach ca lap" (CaLapModule).
// KHAC importGiaiTrinhLap.ts (backfill du lieu CU: Admin/TBP DVBH, file tu ghi nguoi/ngay cho ca 2 cap): day la
// ban HANG LOAT cua 2 nut chot tay POST /api/ca-lap/:caseId/gs va /qc - moi dong ghi DUNG nhu bam nut do:
//   - vai "gs" (Giam sat; Admin chon): chot_danh_gia_lap + dien_giai_lap, nguoi_giai_trinh = nguoi import,
//     ngay_giai_trinh = luc import; Giam sat chi ghi duoc ca trong khu vuc phu trach (giong /gs).
//   - vai "qc" (QC; Admin chon): qc_chot + qc_ghi_chu, nguoi_qc / ngay_qc = nguoi import / luc import.
//   - "Hinh thuc xu ly" de trong = giu nguyen gia tri dang co (COALESCE, giong ca 2 nut).
// Chi nhan ca LAP that (case_dvbh.ca_lap_prior_ht IS NOT NULL, chua huy - cung dieu kien CA_LAP_CTE o caLap.ts).
const importGiaiTrinhLapNhanh = new Hono<{ Bindings: Env }>();
importGiaiTrinhLapNhanh.use("*", verifySessionMiddleware, loadUser);

type Vai = "gs" | "qc";

export const COLUMN_MAP: Record<string, string> = {
  "ID CASE": "case_id",
  "KẾT LUẬN LẶP": "ket_luan",
  "HÌNH THỨC XỬ LÝ": "hinh_thuc",
  "DIỄN GIẢI / GHI CHÚ": "ghi_chu",
};

importGiaiTrinhLapNhanh.get("/column-map", (c) => c.json({ columnMap: COLUMN_MAP }));

const TEN_SHEET_LUA_CHON = "Danh sách lựa chọn";

// GET /api/import/giai-trinh-lap-nhanh/template - 3 sheet: Mau (sheet du lieu, PHAI dung dau) / Danh sach lua
// chon / Huong dan.
importGiaiTrinhLapNhanh.get("/template", (c) => {
  const caLapLabels = CA_LAP_LOAI_KEYS.map((k) => CA_LAP_LABELS[k]);
  const hinhThucLabels = HINH_THUC_XU_LY_KEYS.map((k) => HINH_THUC_XU_LY_LABELS[k]);
  const mau = [
    Object.keys(COLUMN_MAP),
    ["1234567", CA_LAP_LABELS["Lap do tay nghe KTV"], HINH_THUC_XU_LY_LABELS["Tinh lap khong tinh luong"], "KTV thay sai linh kiện, khách báo lỗi lại sau 10 ngày"],
    ["1234568", CA_LAP_LABELS["Lap do trung su vu"], "", "Trùng sự vụ với ca trước - để trống hình thức thì giữ nguyên giá trị đang có"],
  ];
  const soDong = Math.max(caLapLabels.length, hinhThucLabels.length);
  const luaChon: string[][] = [["KẾT LUẬN LẶP", "HÌNH THỨC XỬ LÝ"]];
  for (let i = 0; i < soDong; i++) luaChon.push([caLapLabels[i] ?? "", hinhThucLabels[i] ?? ""]);
  const huongDan = [
    ["HƯỚNG DẪN IMPORT GIẢI TRÌNH LẶP NHANH"],
    [""],
    ["1. Điền dữ liệu ở sheet đầu tiên \"Mẫu\" - giữ NGUYÊN dòng tiêu đề (không đổi tên, không xóa cột). Xóa 2 dòng ví dụ trước khi import."],
    ["2. ID CASE (bắt buộc): mã ca trong danh sách Ca lặp. Ca không phải ca lặp hoặc đã hủy sẽ bị báo lỗi."],
    [`3. KẾT LUẬN LẶP (bắt buộc): chọn 1 giá trị ở sheet "${TEN_SHEET_LUA_CHON}" - cột A. Không phân biệt hoa/thường, có/không dấu.`],
    [`4. HÌNH THỨC XỬ LÝ (không bắt buộc): chọn 1 giá trị ở sheet "${TEN_SHEET_LUA_CHON}" - cột B. Để trống = giữ nguyên hình thức đang có của ca.`],
    ["5. DIỄN GIẢI / GHI CHÚ (không bắt buộc): Giám sát = diễn giải lặp; QC = ghi chú QC. Để trống sẽ xóa diễn giải/ghi chú cũ (giống bấm nút chốt tay)."],
    [""],
    ["Ghi theo vai trò người import (giống bấm nút chốt tay trên từng ca):"],
    ["- Giám sát: ghi \"Chốt đánh giá lặp\" (cấp 1) - chỉ ca thuộc khu vực mình phụ trách."],
    ["- QC: ghi \"QC chốt\" (cấp 2)."],
    ["- Admin: chọn ghi theo vai Giám sát hoặc QC trên màn hình import."],
    ["Người giải trình / người QC và ngày ghi nhận = người đang import, thời điểm import."],
    ["Ca đã có kết luận ở cấp tương ứng sẽ bị GHI ĐÈ - màn hình xem trước báo số ca bị ghi đè trước khi bấm xác nhận."],
    ["Một ID CASE xuất hiện nhiều dòng: lấy dòng cuối, các dòng trước báo lỗi trùng."],
  ];
  return excelWorkbookResponse(
    c,
    [
      { name: "Mẫu", rows: mau, colWidths: [14, 34, 36, 60] },
      { name: TEN_SHEET_LUA_CHON, rows: luaChon, colWidths: [34, 36] },
      { name: "Hướng dẫn", rows: huongDan, colWidths: [120] },
    ],
    "mau_import_giai_trinh_lap.xlsx",
  );
});

interface ImportRow {
  case_id?: unknown;
  ket_luan?: unknown;
  hinh_thuc?: unknown;
  ghi_chu?: unknown;
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

async function processRows(
  db: D1Database,
  rows: ImportRow[],
  vai: Vai,
  scope: string[] | null,
  actorEmail: string,
  commit: boolean,
) {
  const summary = { thanhCong: 0, ghiDe: 0, loi: 0, errors: [] as string[] };
  const loiTheoDong: { lineNo: number; msg: string }[] = [];
  const loi = (lineNo: number, msg: string) => {
    loiTheoDong.push({ lineNo, msg });
  };

  // Dong Excel = index + 2 (dong 1 la tieu de) - de nguoi dung tim dung dong trong file.
  const parsed = new Map<string, { lineNo: number; ketLuan: string; hinhThuc: string | null; ghiChu: string | null }>();
  rows.forEach((row, i) => {
    const lineNo = i + 2;
    const caseId = str(row.case_id);
    const ketLuanRaw = str(row.ket_luan);
    const hinhThucRaw = str(row.hinh_thuc);
    if (!caseId && !ketLuanRaw && !hinhThucRaw && !str(row.ghi_chu)) return; // dong trong
    if (!caseId) return loi(lineNo, "thiếu ID CASE");
    if (!ketLuanRaw) return loi(lineNo, `ca ${caseId} thiếu KẾT LUẬN LẶP`);
    const ketLuan = chuanHoaCaLapLoai(ketLuanRaw);
    if (!ketLuan) return loi(lineNo, `KẾT LUẬN LẶP "${ketLuanRaw}" không có trong danh sách lựa chọn`);
    let hinhThuc: string | null = null;
    if (hinhThucRaw) {
      hinhThuc = chuanHoaHinhThuc(hinhThucRaw);
      if (!hinhThuc) return loi(lineNo, `HÌNH THỨC XỬ LÝ "${hinhThucRaw}" không có trong danh sách lựa chọn`);
    }
    const truoc = parsed.get(caseId);
    if (truoc) loi(truoc.lineNo, `ID CASE ${caseId} trùng với dòng ${lineNo} - dùng dòng ${lineNo}`);
    parsed.set(caseId, { lineNo, ketLuan, hinhThuc, ghiChu: str(row.ghi_chu) || null });
  });

  const caseIds = [...parsed.keys()];
  const caseRows = await allInChunks<{ id: string; khu_vuc: string | null; la_ca_lap: number; da_huy: number; gt_id: string | null; da_co: string | null }>(
    db,
    caseIds,
    (ph) =>
      `SELECT c.id, c.khu_vuc, (c.ca_lap_prior_ht IS NOT NULL) AS la_ca_lap, (c.huy_bo_at IS NOT NULL) AS da_huy,
              gl.id AS gt_id, ${vai === "gs" ? "gl.chot_danh_gia_lap" : "gl.qc_chot"} AS da_co
       FROM case_dvbh c LEFT JOIN giai_trinh_lap gl ON gl.case_id = c.id
       WHERE c.id IN (${ph})`,
  );
  const byId = new Map(caseRows.map((r) => [r.id, r]));

  const hopLe: { caseId: string; gtId: string | null; ketLuan: string; hinhThuc: string | null; ghiChu: string | null }[] = [];
  for (const [caseId, p] of parsed) {
    const cr = byId.get(caseId);
    if (!cr) {
      loi(p.lineNo, `không tìm thấy ca ${caseId}`);
      continue;
    }
    if (cr.da_huy) {
      loi(p.lineNo, `ca ${caseId} đã bị hủy`);
      continue;
    }
    if (!cr.la_ca_lap) {
      loi(p.lineNo, `ca ${caseId} không phải ca lặp`);
      continue;
    }
    // Giam sat: chi khu vuc phu trach (giong POST /ca-lap/:caseId/gs). QC/Admin co scope null.
    if (vai === "gs" && scope !== null && !scope.includes(String(cr.khu_vuc))) {
      loi(p.lineNo, `ca ${caseId} thuộc khu vực ${cr.khu_vuc ?? "(trống)"} - ngoài khu vực bạn phụ trách`);
      continue;
    }
    if (cr.da_co) summary.ghiDe++;
    hopLe.push({ caseId, gtId: cr.gt_id, ketLuan: p.ketLuan, hinhThuc: p.hinhThuc, ghiChu: p.ghiChu });
  }
  summary.thanhCong = hopLe.length;
  summary.loi = loiTheoDong.length;
  summary.errors = loiTheoDong.sort((a, b) => a.lineNo - b.lineNo).map((e) => `Dòng ${e.lineNo}: ${e.msg}`);

  if (commit && hopLe.length > 0) {
    // Chi cap ID moi cho ca CHUA co dong giai_trinh_lap (ca da co -> ON CONFLICT(case_id) cap nhat, giu id cu).
    const canIdMoi = hopLe.filter((r) => !r.gtId);
    const idMoi = await reserveSequentialIds(db, "giai_trinh_lap", "CL", 6, canIdMoi.length);
    let k = 0;
    const sql =
      vai === "gs"
        ? `INSERT INTO giai_trinh_lap (id, case_id, chot_danh_gia_lap, dien_giai_lap, chot_hinh_thuc_xu_ly, nguoi_giai_trinh, ngay_giai_trinh)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'))
           ON CONFLICT(case_id) DO UPDATE SET
             chot_danh_gia_lap = excluded.chot_danh_gia_lap,
             dien_giai_lap = excluded.dien_giai_lap,
             chot_hinh_thuc_xu_ly = COALESCE(excluded.chot_hinh_thuc_xu_ly, giai_trinh_lap.chot_hinh_thuc_xu_ly),
             nguoi_giai_trinh = excluded.nguoi_giai_trinh,
             ngay_giai_trinh = excluded.ngay_giai_trinh`
        : `INSERT INTO giai_trinh_lap (id, case_id, qc_chot, qc_ghi_chu, chot_hinh_thuc_xu_ly, nguoi_qc, ngay_qc)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+7 hours'))
           ON CONFLICT(case_id) DO UPDATE SET
             qc_chot = excluded.qc_chot,
             qc_ghi_chu = excluded.qc_ghi_chu,
             chot_hinh_thuc_xu_ly = COALESCE(excluded.chot_hinh_thuc_xu_ly, giai_trinh_lap.chot_hinh_thuc_xu_ly),
             nguoi_qc = excluded.nguoi_qc,
             ngay_qc = excluded.ngay_qc`;
    const statements = hopLe.map((r) =>
      db.prepare(sql).bind(r.gtId ?? idMoi[k++], r.caseId, r.ketLuan, r.ghiChu, r.hinhThuc, actorEmail),
    );
    await runBatched(db, statements);
    await bumpVersions(db, ["giai_trinh_lap"]);
  }
  return summary;
}

// Vai ghi: Giam sat -> gs, QC -> qc, Admin -> theo body.vai (mac dinh gs).
function vaiCua(vaiTro: string | null, yeuCau: unknown): Vai | null {
  if (vaiTro === "Giam sat") return "gs";
  if (vaiTro === "QC") return "qc";
  if (vaiTro === "Admin") return yeuCau === "qc" ? "qc" : "gs";
  return null;
}

const requireImportRole = requireRole("Giam sat", "QC", "Admin");

async function xuLy(c: Context<{ Bindings: Env }>, commit: boolean) {
  const body = await c.req.json<{ rows: ImportRow[]; vai?: string; filename?: string }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const user = c.get("user");
  const vai = vaiCua(user.vai_tro, body.vai);
  if (!vai) return c.json({ error: "FORBIDDEN" }, 403);
  const summary = await processRows(c.env.DB, body.rows, vai, scopeByKhuVuc(c), user.email, commit);
  if (commit) {
    c.executionCtx.waitUntil(
      logImportHistory(c.env.DB, {
        loai: "giai_trinh_lap_nhanh",
        tenFile: `${body.filename || "(không rõ tên file)"} [${vai === "gs" ? "Giám sát" : "QC"}]`,
        nguoiImport: user.email,
        thanhCong: summary.thanhCong,
        loi: summary.loi,
      }),
    );
  }
  return c.json({ ...summary, vai });
}

// POST /api/import/giai-trinh-lap-nhanh/preview | /commit  body: { rows, vai?: "gs"|"qc", filename? }
importGiaiTrinhLapNhanh.post("/preview", requireImportRole, (c) => xuLy(c, false));
importGiaiTrinhLapNhanh.post("/commit", requireImportRole, (c) => xuLy(c, true));

export default importGiaiTrinhLapNhanh;
