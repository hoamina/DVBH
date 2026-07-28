import { Hono } from "hono";
import type { Env, VaiTro } from "../types";
import { VAI_TRO_VALUES } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { toJsonArray, fromJsonArray } from "../lib/jsonArray";
import { bumpVersions } from "../lib/dataVersions";
import { nowVN } from "../lib/vnTime";

const users = new Hono<{ Bindings: Env }>();
users.use("*", verifySessionMiddleware, loadUser, requireRole("Admin"));

// GET /api/users?tab=cho-duyet|da-duyet
users.get("/", async (c) => {
  const tab = c.req.query("tab") ?? "cho-duyet";
  const trangThai = tab === "cho-duyet" ? "Cho duyet" : null;

  const { results } = await (trangThai
    ? c.env.DB.prepare("SELECT * FROM users WHERE trang_thai_duyet = ? ORDER BY created_at DESC").bind(trangThai)
    : c.env.DB.prepare("SELECT * FROM users WHERE trang_thai_duyet != 'Cho duyet' ORDER BY created_at DESC")
  ).all();

  const rows = (results as Record<string, unknown>[]).map((r) => ({
    ...r,
    khu_vuc_phu_trach: fromJsonArray(r.khu_vuc_phu_trach as string | null),
  }));

  return c.json({ rows });
});

// GET /api/users/login-log?email=&page=&pageSize= - nhat ky dang nhap, Admin-only (khoa boi
// middleware "*" o tren). Loc theo email neu co, sap theo thoi gian gan nhat.
users.get("/login-log", async (c) => {
  const email = c.req.query("email")?.trim();
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  // Khi khong loc email: gioi han 90 ngay gan nhat (dung idx_login_log_thoi_gian) - bang login_log
  // tang vo han theo thoi gian (moi lan dang nhap them 1 dong), neu khong gioi han thi COUNT(*) va
  // SELECT se doc lai TOAN BO bang moi lan Admin mo trang nay.
  const whereSql = email ? " WHERE email = ?" : " WHERE thoi_gian >= datetime('now', '-90 days')";
  const binds = email ? [email] : [];

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM login_log${whereSql}`)
    .bind(...binds)
    .first<{ total: number }>();

  const offset = (page - 1) * pageSize;
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM login_log${whereSql} ORDER BY thoi_gian DESC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, pageSize, offset)
    .all();

  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0 });
});

// PATCH /api/users/:email - duyet/tu choi/doi vai tro+khu vuc
users.patch("/:email", async (c) => {
  const email = decodeURIComponent(c.req.param("email"));
  const body = await c.req.json<{
    trang_thai_duyet?: "Da duyet" | "Tu choi";
    vai_tro?: VaiTro;
    khu_vuc_phu_trach?: string[];
  }>();

  if (body.vai_tro !== undefined && !(VAI_TRO_VALUES as readonly string[]).includes(body.vai_tro)) {
    return c.json({ error: "INVALID_VAI_TRO" }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const next = {
    trang_thai_duyet: body.trang_thai_duyet ?? existing.trang_thai_duyet,
    vai_tro: body.vai_tro !== undefined ? body.vai_tro : existing.vai_tro,
    khu_vuc_phu_trach:
      body.khu_vuc_phu_trach !== undefined ? toJsonArray(body.khu_vuc_phu_trach) : existing.khu_vuc_phu_trach,
  };

  await c.env.DB.prepare(
    "UPDATE users SET trang_thai_duyet = ?, vai_tro = ?, khu_vuc_phu_trach = ?, updated_at = ? WHERE email = ?",
  )
    .bind(next.trang_thai_duyet, next.vai_tro, next.khu_vuc_phu_trach, nowVN(), email)
    .run();

  // Bump domain "users" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["users"]));

  return c.json({ ok: true });
});

export default users;
