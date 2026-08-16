import { Hono } from "hono";
import type { Env, VaiTro } from "../types";
import { VAI_TRO_VALUES } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { toJsonArray, fromJsonArray } from "../lib/jsonArray";
import { bumpVersions } from "../lib/dataVersions";
import { nowVN } from "../lib/vnTime";
import { parseModulesColumn } from "../lib/moduleAccess";

const users = new Hono<{ Bindings: Env }>();
users.use("*", verifySessionMiddleware, loadUser, requireRole("Admin"));

// GET /api/users?tab=cho-duyet|da-duyet|da-duyet-chua-vai-tro|mua-hang&search=&vai_tro=
users.get("/", async (c) => {
  const tab    = c.req.query("tab") ?? "cho-duyet";
  const search = c.req.query("search")?.trim();
  const vaiTro = c.req.query("vai_tro")?.trim();

  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (tab === "cho-duyet") {
    conditions.push("trang_thai_duyet = ?"); binds.push("Cho duyet");
  } else if (tab === "da-duyet-chua-vai-tro") {
    conditions.push("trang_thai_duyet = 'Da duyet'");
    conditions.push("(vai_tro IS NULL OR vai_tro = '')");
  } else if (tab === "mua-hang") {
    conditions.push("(la_ktv_dvbh = 1 OR la_ve_tinh = 1 OR la_kho = 1 OR la_ke_toan = 1)");
  } else {
    conditions.push("trang_thai_duyet != 'Cho duyet'");
  }

  if (search) {
    conditions.push("(LOWER(email) LIKE LOWER(?) OR LOWER(COALESCE(ten,'')) LIKE LOWER(?))");
    binds.push(`%${search}%`, `%${search}%`);
  }
  if (vaiTro && (VAI_TRO_VALUES as readonly string[]).includes(vaiTro)) {
    conditions.push("vai_tro = ?"); binds.push(vaiTro);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM users ${where} ORDER BY created_at DESC`,
  ).bind(...binds).all();

  const rows = (results as Record<string, unknown>[]).map((r) => ({
    ...r,
    khu_vuc_phu_trach: fromJsonArray(r.khu_vuc_phu_trach as string | null),
    modules: parseModulesColumn(r.modules as string | null),
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
    // null = tai khoan "chi Dat mua linh kien" (KTV/CTV/Tram/Ve tinh/Kho/Ke toan thuan tuy, xem
    // frontend/src/App.tsx) - CO CHU DICH khong gan vai_tro, khac han "chua duyet toi" (do la
    // trang_thai_duyet, khong phai vai_tro).
    vai_tro?: VaiTro | null;
    khu_vuc_phu_trach?: string[];
    la_ksnb_doi_tac?: boolean;
    // undefined = khong doi, null = reset ve mac dinh theo vai_tro, mang = danh sach tuy chinh.
    modules?: string[] | null;
    // Khoa/mo khoa tai khoan - xem migration 0043_users_bi_khoa.sql + loadUser.ts.
    bi_khoa?: boolean;
    // Quyen import hang loat tranh chap theo ID - xem migration 0052_users_import_tranh_chap.sql.
    co_the_import_tranh_chap?: boolean;
    // Module "Dat mua linh kien" - xem migration 0053_dat_mua_lk_users.sql.
    la_ktv_dvbh?: boolean;
    la_ve_tinh?: boolean;
    la_kho?: boolean;
    la_ke_toan?: boolean;
    tram_cha?: string | null;
    giam_sat_quan_ly?: string | null;
  }>();

  if (body.vai_tro !== undefined && body.vai_tro !== null && !(VAI_TRO_VALUES as readonly string[]).includes(body.vai_tro)) {
    return c.json({ error: "INVALID_VAI_TRO" }, 400);
  }

  const existing = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const next = {
    trang_thai_duyet: body.trang_thai_duyet ?? existing.trang_thai_duyet,
    vai_tro: body.vai_tro !== undefined ? body.vai_tro : existing.vai_tro,
    khu_vuc_phu_trach:
      body.khu_vuc_phu_trach !== undefined ? toJsonArray(body.khu_vuc_phu_trach) : existing.khu_vuc_phu_trach,
    la_ksnb_doi_tac: body.la_ksnb_doi_tac !== undefined ? (body.la_ksnb_doi_tac ? 1 : 0) : existing.la_ksnb_doi_tac,
    modules: body.modules !== undefined ? (body.modules === null ? null : JSON.stringify(body.modules)) : existing.modules,
    bi_khoa: body.bi_khoa !== undefined ? (body.bi_khoa ? 1 : 0) : existing.bi_khoa,
    co_the_import_tranh_chap:
      body.co_the_import_tranh_chap !== undefined ? (body.co_the_import_tranh_chap ? 1 : 0) : existing.co_the_import_tranh_chap,
    la_ktv_dvbh: body.la_ktv_dvbh !== undefined ? (body.la_ktv_dvbh ? 1 : 0) : existing.la_ktv_dvbh,
    la_ve_tinh: body.la_ve_tinh !== undefined ? (body.la_ve_tinh ? 1 : 0) : existing.la_ve_tinh,
    la_kho: body.la_kho !== undefined ? (body.la_kho ? 1 : 0) : existing.la_kho,
    la_ke_toan: body.la_ke_toan !== undefined ? (body.la_ke_toan ? 1 : 0) : existing.la_ke_toan,
    tram_cha: body.tram_cha !== undefined ? (body.tram_cha ?? null) : existing.tram_cha,
    giam_sat_quan_ly: body.giam_sat_quan_ly !== undefined ? (body.giam_sat_quan_ly ?? null) : existing.giam_sat_quan_ly,
  };

  await c.env.DB.prepare(
    "UPDATE users SET trang_thai_duyet = ?, vai_tro = ?, khu_vuc_phu_trach = ?, la_ksnb_doi_tac = ?, modules = ?, bi_khoa = ?, co_the_import_tranh_chap = ?, la_ktv_dvbh = ?, la_ve_tinh = ?, la_kho = ?, la_ke_toan = ?, tram_cha = ?, giam_sat_quan_ly = ?, updated_at = ? WHERE email = ?",
  )
    .bind(
      next.trang_thai_duyet,
      next.vai_tro,
      next.khu_vuc_phu_trach,
      next.la_ksnb_doi_tac,
      next.modules,
      next.bi_khoa,
      next.co_the_import_tranh_chap,
      next.la_ktv_dvbh,
      next.la_ve_tinh,
      next.la_kho,
      next.la_ke_toan,
      next.tram_cha,
      next.giam_sat_quan_ly,
      nowVN(),
      email,
    )
    .run();

  // Bump domain "users" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["users"]));

  return c.json({ ok: true });
});

export default users;
