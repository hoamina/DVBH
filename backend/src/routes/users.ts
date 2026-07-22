import { Hono } from "hono";
import type { Env, VaiTro } from "../types";
import { VAI_TRO_VALUES } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { toJsonArray, fromJsonArray } from "../lib/jsonArray";

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
    "UPDATE users SET trang_thai_duyet = ?, vai_tro = ?, khu_vuc_phu_trach = ?, updated_at = datetime('now') WHERE email = ?",
  )
    .bind(next.trang_thai_duyet, next.vai_tro, next.khu_vuc_phu_trach, email)
    .run();

  return c.json({ ok: true });
});

export default users;
