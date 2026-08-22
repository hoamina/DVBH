import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireDatMuaLkArea } from "../middleware/requireDatMuaLkArea";
import { featureDisabled } from "../middleware/featureDisabled";
import { nowVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";
import { scopeDatMuaNguoiTao } from "../lib/scopeDatMua";

// Luong "Don tra hang" - tach hoan toan khoi state machine mua/cong no, xem migration
// 0059_tra_hang_log.sql + 0064_tra_hang_log_du_6_buoc.sql. 1 dong dat_don_hang (loai_don='tra_hang')
// di qua 7 buoc tuyen tinh: Ke toan duyet mem -> Kho xac nhan -> QC xac nhan -> TN duyet tong ->
// Ke toan xac nhan nhap kho -> Kho xac nhan nhap kho -> Da hoan thanh. 2 buoc cuoi da chot tu dau
// (file "2. Giai dap va cai tien.txt" diem 4) nhung bi rut gon luc trien khai migration 0059 - bo
// sung lai theo dung ban chot 2026-08-14.
const traHang = new Hono<{ Bindings: Env }>();
traHang.use("*", verifySessionMiddleware, loadUser, requireDatMuaLkArea);
// CHOT 2026-08-21 (yeu cau chu he thong): tam tat module "Don tra hang" cho TOAN BO user, ke ca
// Admin - code/route/DB giu nguyen 100%, chi chan o day. Bat lai: XOA dong nay.
traHang.use("*", featureDisabled('Module "Đơn trả hàng" đang tạm ngừng hoạt động.'));

const TRANG_THAI_DONG = ["Da hoan thanh", "Tu choi", "Da huy"] as const;
// RA SOAT BAO MAT/CHI PHI D1 2026-08-18 (phan hoi Codex #9) - xem giai thich o datMuaLinhKien.ts.
const MAX_BULK_IDS = 100;
const THU_TU_BUOC = [
  "Cho ke toan duyet mem",
  "Cho kho xac nhan",
  "Cho QC xac nhan",
  "Cho TN duyet tong",
  "Cho ke toan xac nhan nhap kho",
  "Cho kho xac nhan nhap kho",
  "Da hoan thanh",
] as const;

function latestStatusExpr(donHangIdCol: string): string {
  return `(SELECT trang_thai FROM tra_hang_log WHERE dat_don_hang_id = ${donHangIdCol} ORDER BY id DESC LIMIT 1)`;
}

function canKeToan(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_ke_toan || user.vai_tro === "Admin";
}
function canKho(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_kho || user.vai_tro === "Admin";
}
function canQC(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return user.vai_tro === "QC" || user.vai_tro === "Admin";
}
function canTacNghiep(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_tac_nghiep || user.vai_tro === "Admin";
}

// GET /api/tra-hang?trang_thai= - danh sach dong dat_don_hang loai_don='tra_hang', kem trang thai
// rieng cua luong nay. Ke toan/Kho/QC/TN/Admin xem toan bo (scopeDatMuaNguoiTao tra null cho nhom
// nay) de xu ly; KTV/Tram/Ve tinh/Giam sat bi gioi han theo quan he - RA SOAT BAO MAT 2026-08-18
// (phan hoi Codex): truoc day KHONG scope cho AI ca, du comment cu noi "KTV xem qua tab Don cua toi"
// nhung endpoint nay van goi truc tiep duoc va tra ve TOAN BO du lieu tra hang he thong.
traHang.get("/", async (c) => {
  const scope = scopeDatMuaNguoiTao(c);
  const trangThai = c.req.query("trang_thai");
  const nguoiTao = c.req.query("nguoi_tao");
  // GD4 (phan hoi Codex #17): truoc day tra ve TOAN BO dong khop bo loc, frontend tu slice o client.
  // Them phan trang server-side, cung pattern voi GET /dat-mua-lk/don-hang. "nguoi_tao" chuyen tu loc
  // client-side (tren data.rows) sang server-side de khop dung tong so sau khi phan trang that su.
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(1000, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;
  let whereSql = "ddh.loai_don = 'tra_hang'" + (scope?.whereSql ?? "");
  const binds: unknown[] = [...(scope?.binds ?? [])];
  if (trangThai) {
    whereSql += ` AND ${latestStatusExpr("ddh.id")} = ?`;
    binds.push(trangThai);
  }
  if (nguoiTao) {
    whereSql += " AND ddh.nguoi_tao = ?";
    binds.push(nguoiTao);
  }

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM dat_don_hang ddh WHERE ${whereSql}`)
    .bind(...binds)
    .first<{ total: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT ddh.*, ${latestStatusExpr("ddh.id")} as trang_thai_tra_hang
     FROM dat_don_hang ddh WHERE ${whereSql} ORDER BY ddh.ngay_tao DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, offset)
    .all();
  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// GET /api/tra-hang/:donHangId - chi tiet dong don hang + log rieng luong tra hang. Ap dung
// scopeDatMuaNguoiTao giong GET / (RA SOAT BAO MAT 2026-08-18) - tra 404 khi ngoai pham vi.
traHang.get("/:donHangId", async (c) => {
  const donHangId = c.req.param("donHangId");
  const scope = scopeDatMuaNguoiTao(c);
  const whereSql = "ddh.id = ? AND ddh.loai_don = 'tra_hang'" + (scope?.whereSql ?? "");
  const binds = [donHangId, ...(scope?.binds ?? [])];
  const ddh = await c.env.DB.prepare(
    `SELECT ddh.*, ${latestStatusExpr("ddh.id")} as trang_thai_tra_hang FROM dat_don_hang ddh WHERE ${whereSql}`,
  )
    .bind(...binds)
    .first();
  if (!ddh) return c.json({ error: "NOT_FOUND" }, 404);

  const { results: logs } = await c.env.DB.prepare("SELECT * FROM tra_hang_log WHERE dat_don_hang_id = ? ORDER BY id DESC").bind(donHangId).all();
  return c.json({ donHang: ddh, logs });
});

// Logic dung chung cho 1 dong don tra hang - tach ra de route bulk-log tai su dung dung 1 cho (them
// 2026-08-15, tieu chi UX #4), khong copy lai role-check. Tra { error, status } khi khong hop le,
// hoac { nextTrangThai } khi thanh cong.
async function applyTraHangLog(
  c: Context<{ Bindings: Env }>,
  donHangId: string,
  hanhDong: "duyet" | "tu_choi" | "huy",
  ghiChu: string | undefined,
): Promise<{ error: string; status: 404 | 409 | 403 } | { nextTrangThai: string }> {
  // BUG THAT (phat hien 2026-08-18, cung ho voi loi Ma MISA cua PXK): "id" khong qualify se bi cot
  // "id" cua CHINH tra_hang_log (PK cua bang do) SHADOW ben trong subquery tuong quan, thay vi tro
  // ve dat_don_hang.id cua bang ngoai - pha vo tuong quan, luon tra NULL. Fallback
  // `?? "Cho ke toan duyet mem"` ben duoi khien MOI dong bi coi la LUON O BUOC DAU TIEN bat ke trang
  // thai that - Kho/QC/TN bi FORBIDDEN_ROLE oan khi xu ly dong da qua buoc cua ho, Ke toan "duyet"
  // lai 1 dong da qua buoc minh se ghi de sai trang thai. Phai qualify "dat_don_hang.id".
  const ddh = await c.env.DB.prepare(
    `SELECT id, nguoi_tao, version, ${latestStatusExpr("dat_don_hang.id")} as trang_thai FROM dat_don_hang WHERE id = ? AND loai_don = 'tra_hang'`,
  )
    .bind(donHangId)
    .first<{ id: string; nguoi_tao: string; version: number; trang_thai: string | null }>();
  if (!ddh) return { error: "NOT_FOUND", status: 404 };

  const trangThaiHienTai = ddh.trang_thai ?? "Cho ke toan duyet mem";
  if ((TRANG_THAI_DONG as readonly string[]).includes(trangThaiHienTai)) return { error: "DA_DONG", status: 409 };

  const user = c.get("user");
  let nextTrangThai: string;

  if (hanhDong === "huy") {
    if (ddh.nguoi_tao !== user.email && !canTacNghiep(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    nextTrangThai = "Da huy";
  } else if (trangThaiHienTai === "Cho ke toan duyet mem") {
    if (!canKeToan(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    nextTrangThai = hanhDong === "duyet" ? "Cho kho xac nhan" : "Tu choi";
  } else if (trangThaiHienTai === "Cho kho xac nhan") {
    if (!canKho(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    nextTrangThai = hanhDong === "duyet" ? "Cho QC xac nhan" : "Tu choi";
  } else if (trangThaiHienTai === "Cho QC xac nhan") {
    if (!canQC(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    nextTrangThai = hanhDong === "duyet" ? "Cho TN duyet tong" : "Tu choi";
  } else if (trangThaiHienTai === "Cho TN duyet tong") {
    if (!canTacNghiep(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #13): chi bat buoc ghi_chu khi Tu choi o BUOC
    // CUOI CO TINH QUYET DINH nhat (tuong duong "Cho TN duyet" ben luong mua hang, noi
    // DonHangDetailModal cung bat buoc chon Ly do cham) - 3 buoc KT/Kho/QC dau chuoi giu nhe nhu cu
    // (khong bat buoc gi), tranh ep ca 4 buoc deu phai nhap trong khi chi 1 buoc that su nghiem trong.
    if (hanhDong === "tu_choi" && !ghiChu?.trim()) return { error: "MISSING_GHI_CHU", status: 409 };
    nextTrangThai = hanhDong === "duyet" ? "Cho ke toan xac nhan nhap kho" : "Tu choi";
  } else if (trangThaiHienTai === "Cho ke toan xac nhan nhap kho") {
    if (!canKeToan(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    nextTrangThai = hanhDong === "duyet" ? "Cho kho xac nhan nhap kho" : "Tu choi";
  } else if (trangThaiHienTai === "Cho kho xac nhan nhap kho") {
    if (!canKho(c)) return { error: "FORBIDDEN_ROLE", status: 403 };
    nextTrangThai = hanhDong === "duyet" ? "Da hoan thanh" : "Tu choi";
  } else {
    return { error: "INVALID_STATE", status: 409 };
  }

  // RA SOAT BAO MAT 2026-08-18 (phan hoi Codex #8, migration 0087) - CAS giong applyDonHangLog, xem
  // comment o do.
  const casResult = await c.env.DB.prepare(
    "UPDATE dat_don_hang SET trang_thai_hien_tai = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
  )
    .bind(nextTrangThai, nowVN(), donHangId, ddh.version)
    .run();
  if (!casResult.meta.changes) return { error: "STATE_CHANGED", status: 409 };

  await c.env.DB.prepare("INSERT INTO tra_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
    .bind(donHangId, nextTrangThai, user.email, nowVN(), ghiChu?.trim() || null)
    .run();

  return { nextTrangThai };
}

// POST /api/tra-hang/:donHangId/log - { hanh_dong: "duyet" | "tu_choi" | "huy" | "day_lui",
// ghi_chu? } chuyen trang thai theo dung thu tu vai tro. "day_lui" xem buoc 4 ke hoach (chi Ke
// toan/Kho duoc dung, xem route rieng ben duoi thay vi nhanh nay de tach rach ly do bat buoc).
traHang.post("/:donHangId/log", async (c) => {
  const donHangId = c.req.param("donHangId");
  const body = await c.req.json<{ hanh_dong: "duyet" | "tu_choi" | "huy"; ghi_chu?: string }>();
  const result = await applyTraHangLog(c, donHangId, body.hanh_dong, body.ghi_chu);
  if ("error" in result) return c.json({ error: result.error }, result.status);

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, trang_thai: result.nextTrangThai });
});

// POST /api/tra-hang/bulk-log - { ids, hanh_dong, ghi_chu? } xu ly hang loat nhieu dong tra hang
// cung luc (them 2026-08-15, tieu chi UX #4). Tai su dung applyTraHangLog, tiep tuc xu ly cac id
// con lai ngay ca khi 1 id loi - tra ket qua tung id (khong phai tung phieu, moi id la 1 dong).
traHang.post("/bulk-log", async (c) => {
  const body = await c.req.json<{ ids: string[]; hanh_dong: "duyet" | "tu_choi" | "huy"; ghi_chu?: string }>();
  if (!Array.isArray(body.ids) || body.ids.length === 0) return c.json({ error: "MISSING_IDS" }, 400);
  const ids = [...new Set(body.ids)];
  if (ids.length > MAX_BULK_IDS) return c.json({ error: "QUA_NHIEU_ID", max: MAX_BULK_IDS }, 400);

  const results: Record<string, string> = {};
  let coThanhCong = false;
  for (const donHangId of ids) {
    const result = await applyTraHangLog(c, donHangId, body.hanh_dong, body.ghi_chu);
    results[donHangId] = "error" in result ? result.error : result.nextTrangThai;
    if (!("error" in result)) coThanhCong = true;
  }

  if (coThanhCong) c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ results });
});

// POST /api/tra-hang/:donHangId/log-lui - buoc 4 ke hoach (diem 19): chi Ke toan/Kho day nguoc 1
// buoc, bat buoc ghi_chu ly do. Khong cho day lui khi da o trang thai dong.
traHang.post("/:donHangId/log-lui", async (c) => {
  if (!canKeToan(c) && !canKho(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const donHangId = c.req.param("donHangId");
  const body = await c.req.json<{ ghi_chu: string }>();
  if (!body.ghi_chu?.trim()) return c.json({ error: "MISSING_GHI_CHU" }, 400);

  // BUG THAT (cung dot ma-misa PXK) - phai qualify "dat_don_hang.id", xem giai thich o applyTraHangLog.
  const ddh = await c.env.DB.prepare(`SELECT ${latestStatusExpr("dat_don_hang.id")} as trang_thai FROM dat_don_hang WHERE id = ? AND loai_don = 'tra_hang'`)
    .bind(donHangId)
    .first<{ trang_thai: string | null }>();
  if (!ddh) return c.json({ error: "NOT_FOUND" }, 404);

  const trangThaiHienTai = ddh.trang_thai ?? "Cho ke toan duyet mem";
  const idx = (THU_TU_BUOC as readonly string[]).indexOf(trangThaiHienTai);
  if (idx <= 0) return c.json({ error: "KHONG_THE_DAY_LUI" }, 409);

  const user = c.get("user");
  const prevTrangThai = THU_TU_BUOC[idx - 1];
  const now = nowVN();
  // Hanh dong don-tac-nhan (chi Ke toan/Kho, khong phai luong nhieu vai tro cung tranh 1 dong nhu
  // duyet/tu choi) - khong can CAS, nhung van bump version/trang_thai_hien_tai (migration 0087) de
  // cot mirror khong bi lech so voi lich su that.
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE dat_don_hang SET trang_thai_hien_tai = ?, version = version + 1, updated_at = ? WHERE id = ?").bind(prevTrangThai, now, donHangId),
    c.env.DB.prepare("INSERT INTO tra_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
      donHangId,
      prevTrangThai,
      user.email,
      now,
      body.ghi_chu.trim(),
    ),
  ]);

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, trang_thai: prevTrangThai });
});

export default traHang;
