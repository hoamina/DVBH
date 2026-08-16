import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";

// Luong "Don tra hang" - tach hoan toan khoi state machine mua/cong no, xem migration
// 0059_tra_hang_log.sql + 0064_tra_hang_log_du_6_buoc.sql. 1 dong dat_don_hang (loai_don='tra_hang')
// di qua 7 buoc tuyen tinh: Ke toan duyet mem -> Kho xac nhan -> QC xac nhan -> TN duyet tong ->
// Ke toan xac nhan nhap kho -> Kho xac nhan nhap kho -> Da hoan thanh. 2 buoc cuoi da chot tu dau
// (file "2. Giai dap va cai tien.txt" diem 4) nhung bi rut gon luc trien khai migration 0059 - bo
// sung lai theo dung ban chot 2026-08-14.
const traHang = new Hono<{ Bindings: Env }>();
traHang.use("*", verifySessionMiddleware, loadUser);

const TRANG_THAI_DONG = ["Da hoan thanh", "Tu choi", "Da huy"] as const;
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
  return user.vai_tro === "TBP DVBH" || user.vai_tro === "Admin";
}

// GET /api/tra-hang?trang_thai= - danh sach dong dat_don_hang loai_don='tra_hang', kem trang thai
// rieng cua luong nay. Khong scope theo nguoi tao o day - Ke toan/Kho/QC/TN can nhin toan bo de
// xu ly; KTV/Tram xem qua tab "Don cua toi" (dung scopeDatMuaNguoiTao nhu don mua/cong no khac).
traHang.get("/", async (c) => {
  const trangThai = c.req.query("trang_thai");
  let whereSql = "ddh.loai_don = 'tra_hang'";
  const binds: unknown[] = [];
  if (trangThai) {
    whereSql += ` AND ${latestStatusExpr("ddh.id")} = ?`;
    binds.push(trangThai);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT ddh.*, ${latestStatusExpr("ddh.id")} as trang_thai_tra_hang
     FROM dat_don_hang ddh WHERE ${whereSql} ORDER BY ddh.ngay_tao DESC`,
  )
    .bind(...binds)
    .all();
  return c.json({ rows: results });
});

// GET /api/tra-hang/:donHangId - chi tiet dong don hang + log rieng luong tra hang.
traHang.get("/:donHangId", async (c) => {
  const donHangId = c.req.param("donHangId");
  const ddh = await c.env.DB.prepare(
    `SELECT ddh.*, ${latestStatusExpr("ddh.id")} as trang_thai_tra_hang FROM dat_don_hang ddh WHERE ddh.id = ? AND ddh.loai_don = 'tra_hang'`,
  )
    .bind(donHangId)
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
  const ddh = await c.env.DB.prepare(
    `SELECT id, nguoi_tao, ${latestStatusExpr("id")} as trang_thai FROM dat_don_hang WHERE id = ? AND loai_don = 'tra_hang'`,
  )
    .bind(donHangId)
    .first<{ id: string; nguoi_tao: string; trang_thai: string | null }>();
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

  const results: Record<string, string> = {};
  for (const donHangId of body.ids) {
    const result = await applyTraHangLog(c, donHangId, body.hanh_dong, body.ghi_chu);
    results[donHangId] = "error" in result ? result.error : result.nextTrangThai;
  }

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ results });
});

// POST /api/tra-hang/:donHangId/log-lui - buoc 4 ke hoach (diem 19): chi Ke toan/Kho day nguoc 1
// buoc, bat buoc ghi_chu ly do. Khong cho day lui khi da o trang thai dong.
traHang.post("/:donHangId/log-lui", async (c) => {
  if (!canKeToan(c) && !canKho(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const donHangId = c.req.param("donHangId");
  const body = await c.req.json<{ ghi_chu: string }>();
  if (!body.ghi_chu?.trim()) return c.json({ error: "MISSING_GHI_CHU" }, 400);

  const ddh = await c.env.DB.prepare(`SELECT ${latestStatusExpr("id")} as trang_thai FROM dat_don_hang WHERE id = ? AND loai_don = 'tra_hang'`)
    .bind(donHangId)
    .first<{ trang_thai: string | null }>();
  if (!ddh) return c.json({ error: "NOT_FOUND" }, 404);

  const trangThaiHienTai = ddh.trang_thai ?? "Cho ke toan duyet mem";
  const idx = (THU_TU_BUOC as readonly string[]).indexOf(trangThaiHienTai);
  if (idx <= 0) return c.json({ error: "KHONG_THE_DAY_LUI" }, 409);

  const user = c.get("user");
  const prevTrangThai = THU_TU_BUOC[idx - 1];
  await c.env.DB.prepare("INSERT INTO tra_hang_log (dat_don_hang_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
    .bind(donHangId, prevTrangThai, user.email, nowVN(), body.ghi_chu.trim())
    .run();

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["dat_mua_lk"]));
  return c.json({ ok: true, trang_thai: prevTrangThai });
});

export default traHang;
