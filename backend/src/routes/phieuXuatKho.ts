import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { nextSequentialId } from "../lib/idCounter";
import { nowVN } from "../lib/vnTime";
import { bumpVersions } from "../lib/dataVersions";

// Phieu xuat kho/giao hang - xem migration 0058_phieu_xuat_kho.sql. Pattern header+log giong
// phieu_dat. TN tao (gom nhieu dong don hang vao 1 phieu), Kho/KTV cap nhat trang thai giao nhan.
const phieuXuatKho = new Hono<{ Bindings: Env }>();
phieuXuatKho.use("*", verifySessionMiddleware, loadUser);

const TRANG_THAI_DONG = ["KTV da nhan", "KT huy"] as const;

function latestStatusExpr(idCol: string): string {
  return `(SELECT trang_thai FROM phieu_xuat_kho_log WHERE phieu_xuat_kho_id = ${idCol} ORDER BY id DESC LIMIT 1)`;
}

function canTacNghiep(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return user.vai_tro === "TBP DVBH" || user.vai_tro === "Admin";
}

function canKho(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_kho || user.vai_tro === "Admin";
}

// GET /api/phieu-xuat-kho?trang_thai= - danh sach. Khong gioi han theo nguoi dung o day (TN/Kho/KT
// deu can nhin toan bo de theo doi giao hang, KTV xem qua tab "Don cua toi" o dat-mua-lk thay vi
// truy cap truc tiep endpoint nay).
phieuXuatKho.get("/", async (c) => {
  const trangThai = c.req.query("trang_thai");
  let whereSql = "1=1";
  const binds: unknown[] = [];
  if (trangThai) {
    whereSql += ` AND ${latestStatusExpr("pxk.id")} = ?`;
    binds.push(trangThai);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT pxk.id, pxk.ma_xuat_kho, pxk.nguoi_tao, pxk.ngay_tao, pxk.ghi_chu,
       ${latestStatusExpr("pxk.id")} as trang_thai,
       (SELECT COUNT(*) FROM phieu_xuat_kho_dong WHERE phieu_xuat_kho_id = pxk.id) as so_dong
     FROM phieu_xuat_kho pxk WHERE ${whereSql} ORDER BY pxk.ngay_tao DESC`,
  )
    .bind(...binds)
    .all();
  return c.json({ rows: results });
});

// POST /api/phieu-xuat-kho - { ma_xuat_kho, ghi_chu?, dat_don_hang_ids } - TN tao, gan ma_xuat_kho
// vao tung dong don hang lien quan (dat_don_hang.ma_xuat_kho) de tra cuu nguoc.
phieuXuatKho.post("/", async (c) => {
  if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const body = await c.req.json<{ ma_xuat_kho: string; ghi_chu?: string; dat_don_hang_ids: string[] }>();
  if (!body.ma_xuat_kho?.trim()) return c.json({ error: "MISSING_MA_XUAT_KHO" }, 400);
  if (!Array.isArray(body.dat_don_hang_ids) || body.dat_don_hang_ids.length === 0) return c.json({ error: "MISSING_DON_HANG" }, 400);

  const user = c.get("user");
  const now = nowVN();
  const id = await nextSequentialId(c.env.DB, "phieu_xuat_kho", "PXK", 6);

  const statements = [
    c.env.DB.prepare("INSERT INTO phieu_xuat_kho (id, ma_xuat_kho, nguoi_tao, ngay_tao, ghi_chu) VALUES (?, ?, ?, ?, ?)").bind(
      id,
      body.ma_xuat_kho.trim(),
      user.email,
      now,
      body.ghi_chu?.trim() || null,
    ),
    c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly) VALUES (?, ?, ?, ?)").bind(
      id,
      "KT xac nhan",
      user.email,
      now,
    ),
    ...body.dat_don_hang_ids.flatMap((donHangId) => [
      c.env.DB.prepare("INSERT INTO phieu_xuat_kho_dong (phieu_xuat_kho_id, dat_don_hang_id) VALUES (?, ?)").bind(id, donHangId),
      c.env.DB.prepare("UPDATE dat_don_hang SET ma_xuat_kho = ?, updated_at = ? WHERE id = ?").bind(body.ma_xuat_kho.trim(), now, donHangId),
    ]),
  ];

  await c.env.DB.batch(statements);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["cases"]));
  return c.json({ id }, 201);
});

// GET /api/phieu-xuat-kho/:id - chi tiet + dong don hang + log.
phieuXuatKho.get("/:id", async (c) => {
  const id = c.req.param("id");
  const pxk = await c.env.DB.prepare(`SELECT pxk.*, ${latestStatusExpr("pxk.id")} as trang_thai FROM phieu_xuat_kho pxk WHERE pxk.id = ?`)
    .bind(id)
    .first();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);

  const { results: donHang } = await c.env.DB.prepare(
    `SELECT ddh.* FROM phieu_xuat_kho_dong pxkd JOIN dat_don_hang ddh ON ddh.id = pxkd.dat_don_hang_id WHERE pxkd.phieu_xuat_kho_id = ?`,
  )
    .bind(id)
    .all();
  const { results: logs } = await c.env.DB.prepare("SELECT * FROM phieu_xuat_kho_log WHERE phieu_xuat_kho_id = ? ORDER BY id DESC").bind(id).all();

  return c.json({ phieuXuatKho: pxk, donHang, logs });
});

// POST /api/phieu-xuat-kho/:id/log - { trang_thai, ghi_chu? } chuyen trang thai tiep theo.
// KT: "KT xac nhan" (dau) hoac "KT huy". Kho: "Kho xac nhan" -> "Dang gui". KTV (nguoi nhan hang,
// khong rang buoc cu the vi nhieu KTV/dong don co the cung nhan 1 phieu): "KTV da nhan".
phieuXuatKho.post("/:id/log", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ trang_thai: string; ghi_chu?: string }>();
  const pxk = await c.env.DB.prepare(`SELECT ${latestStatusExpr("id")} as trang_thai FROM phieu_xuat_kho WHERE id = ?`)
    .bind(id)
    .first<{ trang_thai: string | null }>();
  if (!pxk) return c.json({ error: "NOT_FOUND" }, 404);
  if (pxk.trang_thai && (TRANG_THAI_DONG as readonly string[]).includes(pxk.trang_thai)) return c.json({ error: "PHIEU_DA_DONG" }, 409);

  const user = c.get("user");
  if (body.trang_thai === "KT huy") {
    if (!canTacNghiep(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  } else if (body.trang_thai === "Kho xac nhan" || body.trang_thai === "Dang gui") {
    if (!canKho(c)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  }
  // "KTV da nhan" mo cho moi user da duyet (nguoi nhan hang thuc te, khong gioi han vai tro).

  const validNext = ["Kho xac nhan", "Dang gui", "KTV da nhan", "KT huy"];
  if (!validNext.includes(body.trang_thai)) return c.json({ error: "INVALID_TRANG_THAI" }, 400);

  await c.env.DB.prepare("INSERT INTO phieu_xuat_kho_log (phieu_xuat_kho_id, trang_thai, nguoi_xu_ly, ngay_xu_ly, ghi_chu) VALUES (?, ?, ?, ?, ?)")
    .bind(id, body.trang_thai, user.email, nowVN(), body.ghi_chu?.trim() || null)
    .run();

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["cases"]));
  return c.json({ ok: true });
});

export default phieuXuatKho;
