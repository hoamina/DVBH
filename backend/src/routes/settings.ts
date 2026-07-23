import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { syncLinhKienFromSheet } from "../lib/linhKienSync";
import { computeAndStoreHash, getOrComputeHash } from "../lib/contentHash";
import { getSheetUrl } from "../lib/backfillSheetSync";
import { bumpVersions } from "../lib/dataVersions";

const VALID_LOAI_DONG_BO = new Set(["case", "linh_kien", "giai_trinh_cu", "giai_trinh_lap_cu", "khao_sat_cu"]);

async function refreshHash(db: D1Database, tenBang: string, table: string, orderBy: string) {
  const { results } = await db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all();
  await computeAndStoreHash(db, tenBang, results);
}

const settings = new Hono<{ Bindings: Env }>();
settings.use("*", verifySessionMiddleware, loadUser);
// Doc danh muc (ly-do/linh-kien) can duoc phep cho moi user da duyet (dropdown giai trinh);
// chi thao tac ghi (POST/PATCH/upload) moi gioi han Admin, ap dung rieng ben duoi.
const adminOnly = requireRole("Admin");

async function logAudit(
  db: D1Database,
  bang: "settings_ly_do" | "linh_kien",
  banGhiId: string,
  nguoiThayDoi: string,
  truongThayDoi: string,
  giaTriCu: unknown,
  giaTriMoi: unknown,
) {
  await db
    .prepare(
      `INSERT INTO settings_audit_log (bang, ban_ghi_id, nguoi_thay_doi, truong_thay_doi, gia_tri_cu, gia_tri_moi)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(bang, banGhiId, nguoiThayDoi, truongThayDoi, JSON.stringify(giaTriCu), JSON.stringify(giaTriMoi))
    .run();
}

// ---------- Ly do cham ----------

settings.get("/ly-do", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM settings_ly_do ORDER BY id").all();
  return c.json({ rows: results });
});

// GET /api/settings/ly-do/version - hash noi dung hien tai, doc re (khong dong den bang settings_ly_do neu da co san)
settings.get("/ly-do/version", async (c) => {
  const hash = await getOrComputeHash(c.env.DB, "settings_ly_do", "settings_ly_do", "id");
  return c.json({ hash });
});

settings.post("/ly-do", adminOnly, async (c) => {
  const body = await c.req.json<{ ten_ly_do: string; thuoc_thieu_linh_kien?: boolean }>();
  if (!body.ten_ly_do?.trim()) return c.json({ error: "MISSING_TEN_LY_DO" }, 400);

  const row = await c.env.DB.prepare(
    `INSERT INTO settings_ly_do (ten_ly_do, thuoc_thieu_linh_kien) VALUES (?, ?) RETURNING *`,
  )
    .bind(body.ten_ly_do.trim(), body.thuoc_thieu_linh_kien ? 1 : 0)
    .first();

  const user = c.get("user");
  await logAudit(c.env.DB, "settings_ly_do", String((row as { id: number }).id), user.email, "created", null, row);
  await refreshHash(c.env.DB, "settings_ly_do", "settings_ly_do", "id");
  // Bump domain "settings" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  return c.json(row, 201);
});

settings.patch("/ly-do/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ bat_tat?: boolean; thuoc_thieu_linh_kien?: boolean }>();
  const existing = await c.env.DB.prepare("SELECT * FROM settings_ly_do WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const next = {
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
    thuoc_thieu_linh_kien:
      body.thuoc_thieu_linh_kien !== undefined ? (body.thuoc_thieu_linh_kien ? 1 : 0) : existing.thuoc_thieu_linh_kien,
  };
  await c.env.DB.prepare(
    "UPDATE settings_ly_do SET bat_tat = ?, thuoc_thieu_linh_kien = ?, updated_at = datetime('now') WHERE id = ?",
  )
    .bind(next.bat_tat, next.thuoc_thieu_linh_kien, id)
    .run();

  const user = c.get("user");
  await logAudit(c.env.DB, "settings_ly_do", String(id), user.email, "updated", existing, next);
  await refreshHash(c.env.DB, "settings_ly_do", "settings_ly_do", "id");
  // Bump domain "settings" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  return c.json({ ok: true });
});

// ---------- Linh kien ----------

settings.get("/linh-kien", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM linh_kien ORDER BY ma_linh_kien").all();
  return c.json({ rows: results });
});

// GET /api/settings/linh-kien/version - hash noi dung hien tai, doc re
settings.get("/linh-kien/version", async (c) => {
  const hash = await getOrComputeHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  return c.json({ hash });
});

settings.post("/linh-kien", adminOnly, async (c) => {
  const body = await c.req.json<{
    ma_linh_kien: string;
    ten_linh_kien: string;
    gia_ban?: number;
  }>();
  if (!body.ma_linh_kien?.trim() || !body.ten_linh_kien?.trim()) {
    return c.json({ error: "MISSING_FIELDS" }, 400);
  }

  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, gia_ban, nguoi_cap_nhat)
     VALUES (?, ?, ?, ?) RETURNING *`,
  )
    .bind(body.ma_linh_kien.trim(), body.ten_linh_kien.trim(), body.gia_ban ?? null, user.email)
    .first();

  await logAudit(c.env.DB, "linh_kien", body.ma_linh_kien, user.email, "created", null, row);
  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  // Bump domain "settings" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  return c.json(row, 201);
});

settings.patch("/linh-kien/:ma", adminOnly, async (c) => {
  const ma = c.req.param("ma");
  if (!ma) return c.json({ error: "INVALID_PARAM" }, 400);
  const body = await c.req.json<{ bat_tat?: boolean; gia_ban?: number }>();
  const existing = await c.env.DB.prepare("SELECT * FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const user = c.get("user");
  const next = {
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
    gia_ban: body.gia_ban !== undefined ? body.gia_ban : existing.gia_ban,
  };
  await c.env.DB.prepare(
    "UPDATE linh_kien SET bat_tat = ?, gia_ban = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = datetime('now') WHERE ma_linh_kien = ?",
  )
    .bind(next.bat_tat, next.gia_ban, user.email, ma)
    .run();

  await logAudit(c.env.DB, "linh_kien", ma, user.email, "updated", existing, next);
  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  // Bump domain "settings" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  return c.json({ ok: true });
});

// POST /api/settings/linh-kien/sync-sheet - dong bo tu Google Sheet cong khai (link cau hinh o /sheet-urls)
settings.post("/linh-kien/sync-sheet", adminOnly, async (c) => {
  const url = await getSheetUrl(c.env.DB, "linh_kien");
  if (!url) return c.json({ error: "MISSING_SHEET_URL" }, 400);
  try {
    const summary = await syncLinhKienFromSheet(c.env.DB, url);
    await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
    // Bump domain "settings" (xem lib/dataVersions.ts).
    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
    return c.json(summary);
  } catch (err) {
    return c.json({ error: "SYNC_FAILED", message: (err as Error).message }, 502);
  }
});

// ---------- Link Google Sheet dong bo (ca moi / linh kien / giai trinh cu / khao sat cu) ----------

// GET /api/settings/sheet-urls
settings.get("/sheet-urls", adminOnly, async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM settings_sheet_urls ORDER BY loai_dong_bo").all();
  return c.json({ rows: results });
});

// PATCH /api/settings/sheet-urls/:loai
settings.patch("/sheet-urls/:loai", adminOnly, async (c) => {
  const loai = c.req.param("loai") ?? "";
  if (!VALID_LOAI_DONG_BO.has(loai)) return c.json({ error: "INVALID_LOAI" }, 400);

  const body = await c.req.json<{ url: string | null }>();
  const user = c.get("user");
  await c.env.DB.prepare(
    "UPDATE settings_sheet_urls SET url = ?, updated_at = datetime('now'), updated_by = ? WHERE loai_dong_bo = ?",
  )
    .bind(body.url?.trim() || null, user.email, loai)
    .run();

  // Bump domain "settings" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));

  return c.json({ ok: true });
});

export default settings;
