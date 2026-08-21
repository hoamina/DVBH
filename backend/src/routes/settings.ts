import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { requireQuanLyDanhMucLk } from "../middleware/requireQuanLyDanhMucLk";
import { uploadPublicImage, uploadPrivateBackup } from "../lib/googleDrive";
import { encryptSecret } from "../lib/secretBox";
import { syncLinhKienFromSheet } from "../lib/linhKienSync";
import { computeAndStoreHash, getOrComputeHash } from "../lib/contentHash";
import { getSheetUrl } from "../lib/backfillSheetSync";
import { bumpVersions } from "../lib/dataVersions";
import { nowVN } from "../lib/vnTime";
import { generatePartnerApiKey, maskPartnerApiKey, hashApiKey } from "../lib/partnerApiAuth";
import { csvTemplateResponse } from "../lib/csvTemplate";
import { computeTonDailyEntries } from "../lib/dailySnapshot";
import { buildBaocaoTonRows, renderBaocaoTonImage, renderCanhBaoTonImage } from "../lib/reportImage";
import { computeCanhBaoTonBuckets } from "../lib/canhBaoTon";
import { getVnDateStr } from "../lib/reportCache";

const VALID_LOAI_DONG_BO = new Set(["case", "linh_kien", "giai_trinh_cu", "giai_trinh_lap_cu", "khao_sat_cu", "nap_gas_danh_gia_cu"]);

async function refreshHash(db: D1Database, tenBang: string, table: string, orderBy: string) {
  const { results } = await db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all();
  await computeAndStoreHash(db, tenBang, results);
}

const settings = new Hono<{ Bindings: Env }>();
settings.use("*", verifySessionMiddleware, loadUser);
// Doc danh muc (ly-do/linh-kien) can duoc phep cho moi user da duyet (dropdown giai trinh);
// chi thao tac ghi (POST/PATCH/upload) moi gioi han Admin, ap dung rieng ben duoi.
const adminOnly = requireRole("Admin");
// CHOT 2026-08-06: rieng "SDT ky thuat vien" cho phep them ca nhom CSKH ghi (khong chi Admin) - CSKH
// la nguoi thuc te dang goi dien va phat hien so sai/thieu dau tien, xem khoi "SDT ky thuat vien" ben
// duoi. Import/export hang loat + xoa van Admin-only (adminOnly), chi POST 1 dong (them/sua nhanh khi
// dang xem 1 ca) moi mo cho CSKH.
const ktvWriteRoles = requireRole("Admin", "CSKH", "TN CSKH", "TBP CSKH");
// CHOT 2026-08-17: quyen ghi "Danh muc linh kien" gio la flag doc lap quan_ly_danh_muc_lk (xem
// middleware/requireQuanLyDanhMucLk.ts + migration 0082) - THAY THE requireRole("Admin","TBP
// DVBH","Giam sat") cu (Giai doan 5, 2026-08-14) vi da lech sau khi tach la_tac_nghiep khoi vai_tro
// o migration 0081. Ap dung cho ca POST/PATCH /linh-kien - bang nay dung chung cho ca man "giai
// trinh thieu linh kien" lan "dat mua linh kien" (hop nhat tu migration 0060_unify_linh_kien.sql).
const linhKienWriteRoles = requireQuanLyDanhMucLk;

async function logAudit(
  db: D1Database,
  bang: "settings_ly_do" | "settings_ly_do_cham" | "linh_kien" | "settings_phan_loai_tranh_chap" | "settings_ket_qua_xu_ly_tranh_chap",
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
  const body = await c.req.json<{ ten_ly_do: string; thuoc_thieu_linh_kien?: boolean; thuoc_tranh_chap?: boolean }>();
  if (!body.ten_ly_do?.trim()) return c.json({ error: "MISSING_TEN_LY_DO" }, 400);

  const row = await c.env.DB.prepare(
    `INSERT INTO settings_ly_do (ten_ly_do, thuoc_thieu_linh_kien, thuoc_tranh_chap) VALUES (?, ?, ?) RETURNING *`,
  )
    .bind(body.ten_ly_do.trim(), body.thuoc_thieu_linh_kien ? 1 : 0, body.thuoc_tranh_chap ? 1 : 0)
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
  const body = await c.req.json<{ bat_tat?: boolean; thuoc_thieu_linh_kien?: boolean; thuoc_tranh_chap?: boolean }>();
  const existing = await c.env.DB.prepare("SELECT * FROM settings_ly_do WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const next = {
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
    thuoc_thieu_linh_kien:
      body.thuoc_thieu_linh_kien !== undefined ? (body.thuoc_thieu_linh_kien ? 1 : 0) : existing.thuoc_thieu_linh_kien,
    thuoc_tranh_chap:
      body.thuoc_tranh_chap !== undefined ? (body.thuoc_tranh_chap ? 1 : 0) : existing.thuoc_tranh_chap,
  };
  await c.env.DB.prepare(
    "UPDATE settings_ly_do SET bat_tat = ?, thuoc_thieu_linh_kien = ?, thuoc_tranh_chap = ?, updated_at = ? WHERE id = ?",
  )
    .bind(next.bat_tat, next.thuoc_thieu_linh_kien, next.thuoc_tranh_chap, nowVN(), id)
    .run();

  const user = c.get("user");
  await logAudit(c.env.DB, "settings_ly_do", String(id), user.email, "updated", existing, next);
  await refreshHash(c.env.DB, "settings_ly_do", "settings_ly_do", "id");
  // Bump domain "settings" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  return c.json({ ok: true });
});

// ---------- Ly do cham (Dat mua linh kien) ----------
// Bang settings_ly_do_cham (migration 0065) - KHAC bang settings_ly_do o tren (ly do cham GIAI
// TRINH ca ton). Bang nay dung cho nut "Cho hang"/"Tu choi" cua TN trong module "Dat mua linh
// kien" (xem routes/datMuaLinhKien.ts applyDonHangLog) - truoc day CHUA co UI quan ly, chi seed 1
// lan qua migration 0065, Admin muon sua/them phai vao thang D1. CHOT 2026-08-19: cot
// he_thong_su_dung la 2 lua chon CO DINH "Mua hàng"/"Bảo hành" (truoc la text tu do, co ca "Sửa
// chữa" - da doi ten qua migration 0089), luu dang chuoi phan cach dau phay giong cu de KHONG doi
// logic loc `LIKE '%Mua hàng%'` o datMuaLinhKien.ts.
settings.get("/ly-do-cham", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM settings_ly_do_cham ORDER BY stt, id").all();
  return c.json({ rows: results });
});

settings.post("/ly-do-cham", adminOnly, async (c) => {
  const body = await c.req.json<{ ten_ly_do: string; he_thong_su_dung: string; quan_ly_don_thieu_linh_kien?: boolean; bat_tat?: boolean; stt?: number }>();
  if (!body.ten_ly_do?.trim()) return c.json({ error: "MISSING_TEN_LY_DO" }, 400);
  if (!body.he_thong_su_dung?.trim()) return c.json({ error: "MISSING_HE_THONG_SU_DUNG" }, 400);

  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `INSERT INTO settings_ly_do_cham (ten_ly_do, he_thong_su_dung, quan_ly_don_thieu_linh_kien, bat_tat, stt, nguoi_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(
      body.ten_ly_do.trim(),
      body.he_thong_su_dung.trim(),
      body.quan_ly_don_thieu_linh_kien ? 1 : 0,
      body.bat_tat === false ? 0 : 1,
      body.stt ?? 0,
      user.email,
    )
    .first();

  await logAudit(c.env.DB, "settings_ly_do_cham", String((row as { id: number }).id), user.email, "created", null, row);
  return c.json(row, 201);
});

settings.patch("/ly-do-cham/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{
    ten_ly_do?: string; he_thong_su_dung?: string; quan_ly_don_thieu_linh_kien?: boolean; bat_tat?: boolean; stt?: number;
  }>();
  const existing = await c.env.DB.prepare("SELECT * FROM settings_ly_do_cham WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const next = {
    ten_ly_do: body.ten_ly_do !== undefined ? body.ten_ly_do.trim() : existing.ten_ly_do,
    he_thong_su_dung: body.he_thong_su_dung !== undefined ? body.he_thong_su_dung.trim() : existing.he_thong_su_dung,
    quan_ly_don_thieu_linh_kien:
      body.quan_ly_don_thieu_linh_kien !== undefined ? (body.quan_ly_don_thieu_linh_kien ? 1 : 0) : existing.quan_ly_don_thieu_linh_kien,
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
    stt: body.stt !== undefined ? body.stt : existing.stt,
  };
  const user = c.get("user");
  await c.env.DB.prepare(
    "UPDATE settings_ly_do_cham SET ten_ly_do = ?, he_thong_su_dung = ?, quan_ly_don_thieu_linh_kien = ?, bat_tat = ?, stt = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?",
  )
    .bind(next.ten_ly_do, next.he_thong_su_dung, next.quan_ly_don_thieu_linh_kien, next.bat_tat, next.stt, user.email, nowVN(), id)
    .run();

  await logAudit(c.env.DB, "settings_ly_do_cham", String(id), user.email, "updated", existing, next);
  return c.json({ ok: true });
});

// ---------- Phan loai tranh chap ----------

settings.get("/phan-loai-tranh-chap", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM settings_phan_loai_tranh_chap ORDER BY id").all();
  return c.json({ rows: results });
});

settings.post("/phan-loai-tranh-chap", adminOnly, async (c) => {
  const body = await c.req.json<{ ten_phan_loai: string }>();
  if (!body.ten_phan_loai?.trim()) return c.json({ error: "MISSING_TEN_PHAN_LOAI" }, 400);

  const row = await c.env.DB.prepare(`INSERT INTO settings_phan_loai_tranh_chap (ten_phan_loai) VALUES (?) RETURNING *`)
    .bind(body.ten_phan_loai.trim())
    .first();

  const user = c.get("user");
  await logAudit(c.env.DB, "settings_phan_loai_tranh_chap", String((row as { id: number }).id), user.email, "created", null, row);
  // Bump domain "settings" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  return c.json(row, 201);
});

settings.patch("/phan-loai-tranh-chap/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ bat_tat?: boolean }>();
  const existing = await c.env.DB.prepare("SELECT * FROM settings_phan_loai_tranh_chap WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const next = { bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat };
  await c.env.DB.prepare("UPDATE settings_phan_loai_tranh_chap SET bat_tat = ?, updated_at = ? WHERE id = ?")
    .bind(next.bat_tat, nowVN(), id)
    .run();

  const user = c.get("user");
  await logAudit(c.env.DB, "settings_phan_loai_tranh_chap", String(id), user.email, "updated", existing, next);
  // Bump domain "settings" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  return c.json({ ok: true });
});

// ---------- Ket qua xu ly tranh chap ----------

settings.get("/ket-qua-xu-ly-tranh-chap", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM settings_ket_qua_xu_ly_tranh_chap ORDER BY id").all();
  return c.json({ rows: results });
});

settings.post("/ket-qua-xu-ly-tranh-chap", adminOnly, async (c) => {
  const body = await c.req.json<{ ten_ket_qua: string }>();
  if (!body.ten_ket_qua?.trim()) return c.json({ error: "MISSING_TEN_KET_QUA" }, 400);

  const row = await c.env.DB.prepare(`INSERT INTO settings_ket_qua_xu_ly_tranh_chap (ten_ket_qua) VALUES (?) RETURNING *`)
    .bind(body.ten_ket_qua.trim())
    .first();

  const user = c.get("user");
  await logAudit(c.env.DB, "settings_ket_qua_xu_ly_tranh_chap", String((row as { id: number }).id), user.email, "created", null, row);
  // Bump domain "settings" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  return c.json(row, 201);
});

settings.patch("/ket-qua-xu-ly-tranh-chap/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ bat_tat?: boolean }>();
  const existing = await c.env.DB.prepare("SELECT * FROM settings_ket_qua_xu_ly_tranh_chap WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const next = { bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat };
  await c.env.DB.prepare("UPDATE settings_ket_qua_xu_ly_tranh_chap SET bat_tat = ?, updated_at = ? WHERE id = ?")
    .bind(next.bat_tat, nowVN(), id)
    .run();

  const user = c.get("user");
  await logAudit(c.env.DB, "settings_ket_qua_xu_ly_tranh_chap", String(id), user.email, "updated", existing, next);
  // Bump domain "settings" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  return c.json({ ok: true });
});

// ---------- Loai de xuat: nhom + options (xem migration 0061) ----------

settings.get("/loai-de-xuat/nhom", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM settings_loai_de_xuat_nhom ORDER BY id").all();
  return c.json({ rows: results });
});

settings.post("/loai-de-xuat/nhom", adminOnly, async (c) => {
  const body = await c.req.json<{ ten_nhom: string; vai_tro_json: string; bat_tat?: boolean }>();
  if (!body.ten_nhom?.trim()) return c.json({ error: "MISSING_TEN_NHOM" }, 400);
  const user = c.get("user");
  const vaiTroJson = typeof body.vai_tro_json === "string" ? body.vai_tro_json : JSON.stringify(body.vai_tro_json ?? []);
  const row = await c.env.DB.prepare(
    "INSERT INTO settings_loai_de_xuat_nhom (ten_nhom, vai_tro_json, bat_tat, nguoi_cap_nhat, ngay_cap_nhat) VALUES (?, ?, ?, ?, ?) RETURNING *",
  )
    .bind(body.ten_nhom.trim(), vaiTroJson, body.bat_tat !== false ? 1 : 0, user.email, nowVN())
    .first();
  return c.json(row, 201);
});

settings.patch("/loai-de-xuat/nhom/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ ten_nhom?: string; vai_tro_json?: string; bat_tat?: boolean }>();
  const existing = await c.env.DB.prepare("SELECT * FROM settings_loai_de_xuat_nhom WHERE id = ?").bind(id).first<{ ten_nhom: string; vai_tro_json: string; bat_tat: number }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  const user = c.get("user");
  const next = {
    ten_nhom: body.ten_nhom !== undefined ? body.ten_nhom.trim() : existing.ten_nhom,
    vai_tro_json: body.vai_tro_json !== undefined
      ? (typeof body.vai_tro_json === "string" ? body.vai_tro_json : JSON.stringify(body.vai_tro_json))
      : existing.vai_tro_json,
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
  };
  await c.env.DB.prepare(
    "UPDATE settings_loai_de_xuat_nhom SET ten_nhom = ?, vai_tro_json = ?, bat_tat = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?",
  )
    .bind(next.ten_nhom, next.vai_tro_json, next.bat_tat, user.email, nowVN(), id)
    .run();
  return c.json({ ok: true });
});

// GET /api/settings/loai-de-xuat?since=<ISO> - tra ve options + nhom info cho IndexedDB cache.
settings.get("/loai-de-xuat", async (c) => {
  const since = c.req.query("since")?.trim();
  let query =
    "SELECT o.id, o.nhom_id, o.ten_option, o.bat_tat, o.stt, o.ngay_cap_nhat, n.ten_nhom, n.vai_tro_json " +
    "FROM settings_loai_de_xuat o JOIN settings_loai_de_xuat_nhom n ON n.id = o.nhom_id " +
    "WHERE n.bat_tat = 1";
  const binds: string[] = [];
  if (since) { query += " AND o.ngay_cap_nhat > ?"; binds.push(since); }
  query += " ORDER BY o.nhom_id, o.stt, o.id";
  const { results } = await c.env.DB.prepare(query).bind(...binds).all();
  return c.json({ rows: results });
});

settings.post("/loai-de-xuat", adminOnly, async (c) => {
  const body = await c.req.json<{ nhom_id: number; ten_option: string; stt?: number }>();
  if (!body.nhom_id || !body.ten_option?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);
  const user = c.get("user");
  const row = await c.env.DB.prepare(
    "INSERT INTO settings_loai_de_xuat (nhom_id, ten_option, stt, nguoi_cap_nhat, ngay_cap_nhat) VALUES (?, ?, ?, ?, ?) RETURNING *",
  )
    .bind(body.nhom_id, body.ten_option.trim(), body.stt ?? 0, user.email, nowVN())
    .first();
  return c.json(row, 201);
});

settings.patch("/loai-de-xuat/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ ten_option?: string; bat_tat?: boolean; stt?: number }>();
  const existing = await c.env.DB.prepare("SELECT * FROM settings_loai_de_xuat WHERE id = ?").bind(id).first<{ ten_option: string; bat_tat: number; stt: number }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);
  const user = c.get("user");
  const next = {
    ten_option: body.ten_option !== undefined ? body.ten_option.trim() : existing.ten_option,
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
    stt: body.stt !== undefined ? body.stt : existing.stt,
  };
  await c.env.DB.prepare(
    "UPDATE settings_loai_de_xuat SET ten_option = ?, bat_tat = ?, stt = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?",
  )
    .bind(next.ten_option, next.bat_tat, next.stt, user.email, nowVN(), id)
    .run();
  return c.json({ ok: true });
});

settings.delete("/loai-de-xuat/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM settings_loai_de_xuat WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// ---------- Popup chao mung: GIF + loi chao (xem migration 0044_greeting_popup.sql) ----------
// KHONG ghi settings_audit_log - danh muc trang tri, khong can audit trail nhu cac danh muc nghiep
// vu khac o file nay (xem chu thich dau migration 0044).

settings.get("/greeting-gif", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM settings_greeting_gif ORDER BY id").all();
  return c.json({ rows: results });
});

settings.post("/greeting-gif", adminOnly, async (c) => {
  const body = await c.req.json<{ gif_url: string }>();
  if (!body.gif_url?.trim()) return c.json({ error: "MISSING_GIF_URL" }, 400);

  const row = await c.env.DB.prepare(`INSERT INTO settings_greeting_gif (gif_url) VALUES (?) RETURNING *`)
    .bind(body.gif_url.trim())
    .first();

  // Bump domain "settings" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  return c.json(row, 201);
});

settings.patch("/greeting-gif/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ bat_tat?: boolean }>();
  const existing = await c.env.DB.prepare("SELECT * FROM settings_greeting_gif WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const bat_tat = body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat;
  await c.env.DB.prepare("UPDATE settings_greeting_gif SET bat_tat = ?, updated_at = ? WHERE id = ?")
    .bind(bat_tat, nowVN(), id)
    .run();

  // Bump domain "settings" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  return c.json({ ok: true });
});

settings.get("/greeting-message", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM settings_greeting_message ORDER BY id").all();
  return c.json({ rows: results });
});

settings.post("/greeting-message", adminOnly, async (c) => {
  const body = await c.req.json<{ noi_dung: string }>();
  if (!body.noi_dung?.trim()) return c.json({ error: "MISSING_NOI_DUNG" }, 400);

  const row = await c.env.DB.prepare(`INSERT INTO settings_greeting_message (noi_dung) VALUES (?) RETURNING *`)
    .bind(body.noi_dung.trim())
    .first();

  // Bump domain "settings" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  return c.json(row, 201);
});

settings.patch("/greeting-message/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ bat_tat?: boolean }>();
  const existing = await c.env.DB.prepare("SELECT * FROM settings_greeting_message WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const bat_tat = body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat;
  await c.env.DB.prepare("UPDATE settings_greeting_message SET bat_tat = ?, updated_at = ? WHERE id = ?")
    .bind(bat_tat, nowVN(), id)
    .run();

  // Bump domain "settings" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  return c.json({ ok: true });
});

// ---------- Ngay loai tru khoi luy ke/ty le giai trinh thang (Quan ly ton) ----------
// CHOT 2026-08-03: xem migration 0046_giai_trinh_exclude_ngay.sql. Chu nhat MOI TUAN da bi loai tru
// CUNG (tinh o backend/src/lib/dailySnapshot.ts qua strftime, khong luu dong nao o bang nay) - bang
// nay CHI chua ngay loai tru THEM ngoai Chu nhat. KHONG ghi settings_audit_log (giong greeting-gif).

settings.get("/giai-trinh-exclude-ngay", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM settings_giai_trinh_exclude_ngay ORDER BY ngay DESC, khu_vuc").all();
  return c.json({ rows: results });
});

// POST /api/settings/giai-trinh-exclude-ngay - than: { ngay: "YYYY-MM-DD", khuVucList: string[], ghiChu?: string }.
// "khuVucList" chua ["__ALL__"] nghia la loai tru CA HE THONG cho ngay do (khong can liet ke tung
// khu vuc); nguoc lai la danh sach cac khu_vuc cu the duoc chon (multi-select o UI). Ghi nhieu dong
// (1 dong/khu_vuc) trong 1 lan goi - trung (ngay, khu_vuc) da co thi bo qua (UNIQUE constraint).
settings.post("/giai-trinh-exclude-ngay", adminOnly, async (c) => {
  const body = await c.req.json<{ ngay: string; khuVucList: string[]; ghiChu?: string }>();
  if (!body.ngay?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(body.ngay.trim())) return c.json({ error: "INVALID_NGAY" }, 400);
  if (!Array.isArray(body.khuVucList) || body.khuVucList.length === 0) return c.json({ error: "MISSING_KHU_VUC" }, 400);

  const ngay = body.ngay.trim();
  const ghiChu = body.ghiChu?.trim() || null;
  const user = c.get("user");
  const uniqueKhuVuc = [...new Set(body.khuVucList.map((k) => k.trim()).filter(Boolean))];

  const statements = uniqueKhuVuc.map((khuVuc) =>
    c.env.DB.prepare(
      `INSERT INTO settings_giai_trinh_exclude_ngay (ngay, khu_vuc, ghi_chu, nguoi_tao) VALUES (?, ?, ?, ?)
       ON CONFLICT(ngay, khu_vuc) DO UPDATE SET ghi_chu = excluded.ghi_chu`,
    ).bind(ngay, khuVuc, ghiChu, user.email),
  );
  await c.env.DB.batch(statements);

  const { results } = await c.env.DB.prepare("SELECT * FROM settings_giai_trinh_exclude_ngay WHERE ngay = ? ORDER BY khu_vuc")
    .bind(ngay)
    .all();
  return c.json({ rows: results }, 201);
});

settings.delete("/giai-trinh-exclude-ngay/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT id FROM settings_giai_trinh_exclude_ngay WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  await c.env.DB.prepare("DELETE FROM settings_giai_trinh_exclude_ngay WHERE id = ?").bind(id).run();
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

settings.post("/linh-kien", linhKienWriteRoles, async (c) => {
  const body = await c.req.json<{
    ma_linh_kien: string;
    ten_linh_kien: string;
    gia_ban?: number;
    gia_tham_chieu?: number;
    don_vi?: string;
    ghi_chu?: string;
    anh_demo?: string;
    dac_thu?: boolean;
    chi_sua_chua?: boolean;
  }>();
  if (!body.ma_linh_kien?.trim() || !body.ten_linh_kien?.trim()) {
    return c.json({ error: "MISSING_FIELDS" }, 400);
  }

  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, gia_ban, gia_tham_chieu, don_vi, ghi_chu, anh_demo, dac_thu, chi_sua_chua, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(body.ma_linh_kien.trim(), body.ten_linh_kien.trim(), body.gia_ban ?? null, body.gia_tham_chieu ?? null, body.don_vi?.trim() || null, body.ghi_chu?.trim() || null, body.anh_demo?.trim() || null, body.dac_thu ? 1 : 0, body.chi_sua_chua ? 1 : 0, user.email, nowVN())
    .first();

  await logAudit(c.env.DB, "linh_kien", body.ma_linh_kien, user.email, "created", null, row);
  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  // Bump domain "settings" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  return c.json(row, 201);
});

settings.patch("/linh-kien/:ma", linhKienWriteRoles, async (c) => {
  const ma = c.req.param("ma");
  if (!ma) return c.json({ error: "INVALID_PARAM" }, 400);
  const body = await c.req.json<{ bat_tat?: boolean; gia_ban?: number; gia_tham_chieu?: number; don_vi?: string; ghi_chu?: string; anh_demo?: string; dac_thu?: boolean; chi_sua_chua?: boolean }>();
  const existing = await c.env.DB.prepare("SELECT * FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const user = c.get("user");
  const next = {
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
    gia_ban: body.gia_ban !== undefined ? body.gia_ban : existing.gia_ban,
    gia_tham_chieu: body.gia_tham_chieu !== undefined ? body.gia_tham_chieu : existing.gia_tham_chieu,
    don_vi: body.don_vi !== undefined ? body.don_vi?.trim() || null : existing.don_vi,
    ghi_chu: body.ghi_chu !== undefined ? body.ghi_chu?.trim() || null : existing.ghi_chu,
    anh_demo: body.anh_demo !== undefined ? body.anh_demo?.trim() || null : existing.anh_demo,
    dac_thu: body.dac_thu !== undefined ? (body.dac_thu ? 1 : 0) : existing.dac_thu,
    chi_sua_chua: body.chi_sua_chua !== undefined ? (body.chi_sua_chua ? 1 : 0) : existing.chi_sua_chua,
  };
  await c.env.DB.prepare(
    "UPDATE linh_kien SET bat_tat = ?, gia_ban = ?, gia_tham_chieu = ?, don_vi = ?, ghi_chu = ?, anh_demo = ?, dac_thu = ?, chi_sua_chua = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ?",
  )
    .bind(next.bat_tat, next.gia_ban, next.gia_tham_chieu, next.don_vi, next.ghi_chu, next.anh_demo, next.dac_thu, next.chi_sua_chua, user.email, nowVN(), ma)
    .run();

  await logAudit(c.env.DB, "linh_kien", ma, user.email, "updated", existing, next);
  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  // Bump domain "settings" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  return c.json({ ok: true });
});

// POST /api/settings/linh-kien/:ma/anh - upload BINARY THO (Content-Type = mime anh) len Google
// Drive, set cong khai "anyone with link" roi luu link thumbnail truc tiep vao anh_demo - thay the
// hoan toan kieu nhap link tay cu (CHOT 2026-08-17, xem lib/googleDrive.ts uploadPublicImage()).
settings.post("/linh-kien/:ma/anh", linhKienWriteRoles, async (c) => {
  const ma = c.req.param("ma");
  const existing = await c.env.DB.prepare("SELECT ma_linh_kien FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const contentType = c.req.header("Content-Type") || "image/jpeg";
  if (!contentType.startsWith("image/")) return c.json({ error: "INVALID_CONTENT_TYPE" }, 400);
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "EMPTY_FILE" }, 400);

  const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
  const filename = `linh-kien-${ma}-${Date.now()}.${ext}`;
  let uploaded: { id: string; thumbnailUrl: string };
  try {
    uploaded = await uploadPublicImage(c.env, c.env.DB, bytes, contentType, filename);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("GOOGLE_DRIVE_NOT_CONNECTED")) {
      return c.json({ error: "GOOGLE_DRIVE_NOT_CONNECTED", message: "Chưa kết nối tài khoản Google Drive - vào Cài đặt để kết nối." }, 400);
    }
    return c.json({ error: "UPLOAD_FAILED", message }, 502);
  }

  const user = c.get("user");
  await c.env.DB.prepare("UPDATE linh_kien SET anh_demo = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ?")
    .bind(uploaded.thumbnailUrl, user.email, nowVN(), ma)
    .run();
  await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  return c.json({ ok: true, url: uploaded.thumbnailUrl });
});

// POST /api/settings/backup-file?filename=... - upload BINARY THO 1 file bao mat noi bo (vd
// secrets.md) len folder Drive rieng "DVBH-Secrets-Backup" (KHONG public, chi tai khoan da uy quyen
// OAuth xem duoc) - Admin tu chon file va bam upload tu Cai dat, KHONG co cron/trigger tu dong nao
// goi route nay (CHOT 2026-08-21: noi dung nhay cam nen giu thao tac thu cong, tung lan xac nhan).
settings.post("/backup-file", adminOnly, async (c) => {
  const contentType = c.req.header("Content-Type") || "application/octet-stream";
  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "EMPTY_FILE" }, 400);

  const rawFilename = c.req.query("filename");
  const filename = rawFilename ? decodeURIComponent(rawFilename) : `backup-${Date.now()}`;
  try {
    const uploaded = await uploadPrivateBackup(c.env, c.env.DB, bytes, contentType, filename);
    return c.json({ ok: true, webViewLink: uploaded.webViewLink });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("GOOGLE_DRIVE_NOT_CONNECTED")) {
      return c.json({ error: "GOOGLE_DRIVE_NOT_CONNECTED", message: "Chưa kết nối tài khoản Google Drive - vào Cài đặt để kết nối." }, 400);
    }
    return c.json({ error: "UPLOAD_FAILED", message }, 502);
  }
});

// ---------- Google Drive OAuth (uy quyen 1 tai khoan Google THAT de upload anh linh kien) ----------
// CHOT 2026-08-17: Service Account (GOOGLE_DRIVE_SA_*) khong the tao file trong 1 folder Drive ca
// nhan - Google tra 403 "Service Accounts do not have storage quota" bat ke folder co duoc chia se
// Editor hay khong (chi hoat dong voi Shared Drive, yeu cau Google Workspace tra phi). Giai phap:
// uy quyen 1 tai khoan that qua OAuth (dung lai GOOGLE_CLIENT_ID/SECRET co san cho dang nhap, xin
// them scope drive.file), luu refresh_token ma hoa trong bang google_drive_oauth (xem migration
// 0086 + lib/secretBox.ts). Lan dau ket noi se TAO MOI 1 folder Drive (thuoc quota nguoi duoc uy
// quyen) thay vi dung lai folder cu da chia se cho Service Account - vi scope drive.file chi thay
// duoc file do CHINH APP nay tao ra, khong thay duoc folder co san du da duoc share Editor.
const GOOGLE_DRIVE_STATE_COOKIE = "dvbh_drive_oauth_state";
// Can them "openid email profile" ben canh drive.file - thieu 2 scope nay thi endpoint
// oauth2/v3/userinfo (goi ngay sau o callback de biet da ket noi tai khoan Google nao) tra ve loi
// (thieu quyen), du drive.file van hoat dong binh thuong cho upload - CHOT 2026-08-17 sau khi gap
// loi "Khong the lay thong tin nguoi dung tu Google" khi test that.
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file openid email profile";

settings.get("/google-drive/status", adminOnly, async (c) => {
  const row = await c.env.DB.prepare("SELECT google_email, folder_id, authorized_by, authorized_at FROM google_drive_oauth WHERE id = 1").first<{
    google_email: string;
    folder_id: string;
    authorized_by: string;
    authorized_at: string;
  }>();
  if (!row) return c.json({ connected: false });
  return c.json({ connected: true, ...row });
});

settings.get("/google-drive/authorize", adminOnly, async (c) => {
  const state = crypto.randomUUID();
  setCookie(c, GOOGLE_DRIVE_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "Lax", maxAge: 600, path: "/" });

  const redirectUri = `${new URL(c.req.url).origin}/api/settings/google-drive/callback`;
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_DRIVE_SCOPE,
    state,
    access_type: "offline",
    prompt: "consent select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

settings.get("/google-drive/callback", adminOnly, async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(c, GOOGLE_DRIVE_STATE_COOKIE);
  deleteCookie(c, GOOGLE_DRIVE_STATE_COOKIE, { path: "/" });

  if (!code || !state || !savedState || state !== savedState) {
    return c.text("Xac thuc that bai: state khong hop le.", 400);
  }

  const redirectUri = `${url.origin}/api/settings/google-drive/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return c.text("Khong the doi ma xac thuc voi Google: " + (await tokenRes.text()), 502);
  const tokenJson = (await tokenRes.json()) as { access_token: string; refresh_token?: string };
  if (!tokenJson.refresh_token) {
    return c.text(
      "Google khong tra ve refresh_token (co the tai khoan da tung uy quyen truoc do) - vao myaccount.google.com/permissions, go quyen truy cap cua app nay roi thu lai.",
      400,
    );
  }

  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userInfoRes.ok) return c.text("Khong the lay thong tin nguoi dung tu Google.", 502);
  const userInfo = (await userInfoRes.json()) as { email: string };

  const folderRes = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "DVBH - Anh linh kien", mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!folderRes.ok) return c.text("Khong the tao folder Drive: " + (await folderRes.text()), 502);
  const { id: folderId } = (await folderRes.json()) as { id: string };

  const refreshTokenEnc = await encryptSecret(c.env, tokenJson.refresh_token);
  const user = c.get("user");
  await c.env.DB.prepare(
    `INSERT INTO google_drive_oauth (id, google_email, refresh_token_enc, folder_id, authorized_by, authorized_at)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       google_email = excluded.google_email, refresh_token_enc = excluded.refresh_token_enc,
       folder_id = excluded.folder_id, authorized_by = excluded.authorized_by, authorized_at = excluded.authorized_at`,
  )
    .bind(userInfo.email, refreshTokenEnc, folderId, user.email, nowVN())
    .run();

  return c.redirect(c.env.FRONTEND_URL || "/");
});

// POST /api/settings/linh-kien/bulk-import-anh - { rows: [{ma_linh_kien, source_url}], offset } xu ly
// 1 CHUNK NHO (10 dong/lan, client tu lap goi den done:true) - moi dong ton 1 fetch anh nguon + 3 goi
// Google Drive (token/upload/set-quyen) qua uploadPublicImage(), CHUNK 10 => toi da ~44 subrequest/
// lan goi, an toan duoi moi gioi han Workers. Dung 1 lan de nhap hang loat "anh demo" tu file Excel co
// san (cot "Mã linh kiện"/"ẢNH DEMO" tu AppSheet cu) - CHOT 2026-08-17. Loi tung dong (khong tim thay
// ma, fetch anh nguon that bai...) khong lam hong ca chunk, tra ve trong "details" de UI hien ro.
settings.post("/linh-kien/bulk-import-anh", linhKienWriteRoles, async (c) => {
  const body = await c.req.json<{ rows: { ma_linh_kien: string; source_url: string }[]; offset: number }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);

  const CHUNK_SIZE = 10;
  const offset = Math.max(0, body.offset ?? 0);
  const chunk = body.rows.slice(offset, offset + CHUNK_SIZE);
  const user = c.get("user");
  const now = nowVN();

  let success = 0;
  let notFound = 0;
  let fetchFailed = 0;
  let errorCount = 0;
  const details: { ma_linh_kien: string; status: string }[] = [];

  for (const row of chunk) {
    const ma = String(row.ma_linh_kien ?? "").trim();
    if (!ma || !row.source_url) {
      errorCount++;
      details.push({ ma_linh_kien: ma, status: "INVALID_ROW" });
      continue;
    }
    try {
      const existing = await c.env.DB.prepare("SELECT ma_linh_kien FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first();
      if (!existing) {
        notFound++;
        details.push({ ma_linh_kien: ma, status: "NOT_FOUND" });
        continue;
      }

      const imgRes = await fetch(row.source_url);
      if (!imgRes.ok) {
        fetchFailed++;
        details.push({ ma_linh_kien: ma, status: `FETCH_FAILED (${imgRes.status})` });
        continue;
      }
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      if (!contentType.startsWith("image/")) {
        fetchFailed++;
        details.push({ ma_linh_kien: ma, status: "NOT_AN_IMAGE" });
        continue;
      }
      const bytes = await imgRes.arrayBuffer();
      const ext = contentType.split("/")[1]?.split(";")[0] || "jpg";
      const filename = `linh-kien-${ma}-${Date.now()}.${ext}`;
      const uploaded = await uploadPublicImage(c.env, c.env.DB, bytes, contentType, filename);

      await c.env.DB.prepare("UPDATE linh_kien SET anh_demo = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ?")
        .bind(uploaded.thumbnailUrl, user.email, now, ma)
        .run();
      success++;
      details.push({ ma_linh_kien: ma, status: "OK" });
    } catch (err) {
      errorCount++;
      details.push({ ma_linh_kien: ma, status: "ERROR: " + (err instanceof Error ? err.message : String(err)) });
    }
  }

  if (success > 0) {
    await refreshHash(c.env.DB, "linh_kien", "linh_kien", "ma_linh_kien");
    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));
  }

  const nextOffset = offset + CHUNK_SIZE;
  const done = nextOffset >= body.rows.length;
  return c.json({ done, nextOffset: done ? body.rows.length : nextOffset, success, notFound, fetchFailed, error: errorCount, details });
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
    "UPDATE settings_sheet_urls SET url = ?, updated_at = ?, updated_by = ? WHERE loai_dong_bo = ?",
  )
    .bind(body.url?.trim() || null, nowVN(), user.email, loai)
    .run();

  // Bump domain "settings" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["settings"]));

  return c.json({ ok: true });
});

// ---------- Key API doi tac (xem PARTNER_API_GUIDE.md + routes/partnerApi.ts) ----------
// Admin-only ca doc lan ghi - danh sach key la thong tin nhay cam (ai dang duoc cap quyen quet du
// lieu CRM ra ngoai), khac voi cac danh muc dropdown o tren duoc phep doc cho moi user da duyet.

interface PartnerApiKeyRow {
  id: number;
  ten_doi_tac: string;
  api_key: string;
  active: number;
  ghi_chu: string | null;
  created_at: string;
  created_by: string | null;
  revoked_at: string | null;
}

settings.get("/partner-keys", adminOnly, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, ten_doi_tac, api_key, active, ghi_chu, created_at, created_by, revoked_at, masked_key FROM partner_api_keys ORDER BY created_at DESC",
  ).all<PartnerApiKeyRow & { masked_key: string | null }>();
  const rows = results.map((row) => {
    const masked = row.masked_key || (row.api_key.startsWith("dvbh_") ? maskPartnerApiKey(row.api_key) : "dvbh_hash...");
    return { ...row, api_key: masked };
  });
  return c.json({ rows });
});

// POST /api/settings/partner-keys - tra ve api_key DANG THANG DUY NHAT 1 LAN trong response nay (moi
// lan GET sau chi thay ban che - xem maskPartnerApiKey). Doi tac phai luu lai ngay, khong the xem lai.
settings.post("/partner-keys", adminOnly, async (c) => {
  const body = await c.req.json<{ ten_doi_tac: string; ghi_chu?: string }>();
  if (!body.ten_doi_tac?.trim()) return c.json({ error: "MISSING_TEN_DOI_TAC" }, 400);

  const user = c.get("user");
  const apiKey = generatePartnerApiKey();
  const hashedKey = await hashApiKey(apiKey);
  const maskedKey = maskPartnerApiKey(apiKey);
  const row = await c.env.DB.prepare(
    `INSERT INTO partner_api_keys (ten_doi_tac, api_key, ghi_chu, created_by, masked_key)
     VALUES (?, ?, ?, ?, ?) RETURNING id, ten_doi_tac, active, ghi_chu, created_at, created_by, revoked_at`,
  )
    .bind(body.ten_doi_tac.trim(), hashedKey, body.ghi_chu?.trim() || null, user.email, maskedKey)
    .first<PartnerApiKeyRow>();

  return c.json({ ...row, api_key: apiKey }, 201);
});

// PATCH /api/settings/partner-keys/:id - { active: boolean } thu hoi (false) hoac cap lai (true, giu
// nguyen key cu - khong sinh key moi).
settings.patch("/partner-keys/:id", adminOnly, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ active: boolean }>();
  const existing = await c.env.DB.prepare("SELECT id FROM partner_api_keys WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  await c.env.DB.prepare("UPDATE partner_api_keys SET active = ?, revoked_at = ? WHERE id = ?")
    .bind(body.active ? 1 : 0, body.active ? null : nowVN(), id)
    .run();

  return c.json({ ok: true });
});

// ---------- SDT ky thuat vien (xem migration 0049_ktv_lien_he.sql) ----------
// CSKH khao sat vi pham thinh thoang phai goi truc tiep cho KTV de xac minh, SDT truoc day phai tra
// o ngoai he thong. Doc mo cho moi user da duyet (giong ly-do/linh-kien); GHI 1 dong (them/sua nhanh
// khi dang xem 1 ca) mo cho ca Admin lan nhom CSKH (ktvWriteRoles) - rieng xoa hang loat/import/export
// van Admin-only (adminOnly). KHONG ghi settings_audit_log - danh ba lien he don gian, khong phai
// danh muc nghiep vu anh huong tinh toan/bao cao nhu ly-do/linh-kien (giong greeting-gif/
// giai-trinh-exclude-ngay, cung khong audit).

settings.get("/ktv-lien-he", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM ktv_lien_he ORDER BY ma_ktv").all();
  return c.json({ rows: results });
});

// GET /api/settings/ktv-lien-he/version - hash noi dung hien tai, doc re
settings.get("/ktv-lien-he/version", async (c) => {
  const hash = await getOrComputeHash(c.env.DB, "ktv_lien_he", "ktv_lien_he", "ma_ktv");
  return c.json({ hash });
});

// POST /api/settings/ktv-lien-he - upsert 1 dong (Admin dung o Settings, CSKH dung khi bam vao ten
// KTV o CaseDetail/SurveyModule/SurveyCallWorkspace/DanhSachTongModule - xem KtvNameWithPhone.tsx).
settings.post("/ktv-lien-he", ktvWriteRoles, async (c) => {
  const body = await c.req.json<{ ma_ktv: string; ten_hien_thi?: string; sdt?: string; ghi_chu?: string }>();
  // CHOT 2026-08-15: chi ma_ktv bat buoc (xem migration 0071) - sdt tuy chon, KtvNameWithPhone.tsx
  // (CSKH them SDT) van tu bat buoc o phia client rieng vi do la muc dich duy nhat cua popup do.
  if (!body.ma_ktv?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);

  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `INSERT INTO ktv_lien_he (ma_ktv, ten_hien_thi, sdt, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(ma_ktv) DO UPDATE SET
       ten_hien_thi = excluded.ten_hien_thi,
       sdt = excluded.sdt,
       ghi_chu = excluded.ghi_chu,
       nguoi_cap_nhat = excluded.nguoi_cap_nhat,
       ngay_cap_nhat = excluded.ngay_cap_nhat
     RETURNING *`,
  )
    .bind(body.ma_ktv.trim(), body.ten_hien_thi?.trim() || null, body.sdt?.trim() || null, body.ghi_chu?.trim() || null, user.email, nowVN())
    .first();

  await refreshHash(c.env.DB, "ktv_lien_he", "ktv_lien_he", "ma_ktv");
  return c.json(row, 201);
});

// Cap tai khoan "users" PLACEHOLDER cho 1 KTV da duoc Admin ghep email_dang_nhap trong "Danh sach
// KTV" nhung CHUA TUNG dang nhap Google that (chua co dong users that) - CAN THIET vi
// dat_don_hang.nguoi_nhan_hang / phieu_xuat_kho.nguoi_nhan_hang la FK THAT toi users(email) (khac
// ktv_lien_he.email_dang_nhap, migration 0072 da bo FK o day - xem comment processKtvImportRows).
// Khong co placeholder nay, "Nguoi nhan hang (tao ho)" o TaoDonTab se rong voi moi KTV chua tung mo
// app 1 lan (phat hien 2026-08-15: 456/460 KTV da ghep email nhung 0 dong users tuong ung).
//
// trang_thai_duyet giu "Cho duyet" + vai_tro NULL (dung y nghia "tai khoan moi, chua duyet" giong
// het 1 lan dang nhap Google that dau tien - KHONG cap quyen truy cap gi cho toi khi Admin duyet
// that su, loadUser.ts van chan cung o dieu kien trang_thai_duyet truoc khi tra AppUser). la_ktv_dvbh/
// la_ve_tinh dat truoc de dropdown "nguoi nhan hang" nhan dien duoc ngay - AN TOAN vi 2 co nay khong
// tu no mo quyen truy cap gi. ON CONFLICT DO NOTHING - khong bao gio ghi de 1 tai khoan THAT da ton
// tai (du dang "Cho duyet" hay da "Da duyet"). auth.ts callback dung ON CONFLICT DO UPDATE SET
// ten=excluded.ten khi nguoi nay THAT SU dang nhap lan dau - se tu cap nhat ten that, giu nguyen moi
// truong khac ta da set san o day.
// users.giam_sat_quan_ly la FK THAT toi users(email) (migration 0053 - khac han
// ktv_lien_he.giam_sat_quan_ly, co FK nay bi go bo o migration 0072 CHINH VI ly do nay: GS ghi trong
// Danh sach KTV rat co the CUNG chua tung dang nhap). Neu cu copy thang sang se lam INSERT loi FK
// (va lam ROLLBACK CA BATCH vi db.batch() la 1 transaction) - phai loc truoc, chi giu email GS DA
// CO trong users, con lai de NULL (Admin dien lai luc duyet that neu can).
async function filterValidGsEmails(db: D1Database, emails: (string | null)[]): Promise<Set<string>> {
  const distinct = [...new Set(emails.filter((e): e is string => !!e))];
  if (distinct.length === 0) return new Set();
  const { results } = await db
    .prepare(`SELECT email FROM users WHERE email IN (${distinct.map(() => "?").join(",")})`)
    .bind(...distinct)
    .all<{ email: string }>();
  return new Set((results as { email: string }[]).map((r) => r.email));
}

async function provisionPlaceholderUser(
  db: D1Database,
  args: { email: string; ten: string | null; vaiTroKtv: string | null; giamSatQuanLy: string | null },
): Promise<D1PreparedStatement> {
  const laVeTinh = args.vaiTroKtv === "Ve tinh";
  return db
    .prepare(
      `INSERT INTO users (email, ten, vai_tro, trang_thai_duyet, la_ktv_dvbh, la_ve_tinh, giam_sat_quan_ly)
       VALUES (?, ?, NULL, 'Cho duyet', ?, ?, ?)
       ON CONFLICT(email) DO NOTHING`,
    )
    .bind(args.email, args.ten, laVeTinh ? 0 : 1, laVeTinh ? 1 : 0, args.giamSatQuanLy);
}

// PATCH /api/settings/ktv-lien-he/:ma/dat-mua-lk - { gmail?, vai_tro_ktv?, giam_sat_quan_ly?,
// email_dang_nhap? } - Admin-only (khac ktvWriteRoles dung cho ten_hien_thi/sdt/ghi_chu o tren) -
// du lieu nghiep vu rieng cho module "Dat mua linh kien" (nguoi nhan hang, xem migration
// 0067_ktv_lien_he_dat_mua_lk.sql), khong phai danh ba lien he CSKH dung chung.
settings.patch("/ktv-lien-he/:ma/dat-mua-lk", adminOnly, async (c) => {
  const ma = c.req.param("ma");
  const body = await c.req.json<{ gmail?: string | null; vai_tro_ktv?: string | null; giam_sat_quan_ly?: string | null; email_dang_nhap?: string | null }>();
  const existing = await c.env.DB.prepare("SELECT ten_hien_thi, gmail, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap FROM ktv_lien_he WHERE ma_ktv = ?")
    .bind(ma)
    .first<{ ten_hien_thi: string | null; gmail: string | null; vai_tro_ktv: string | null; giam_sat_quan_ly: string | null; email_dang_nhap: string | null }>();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  if (body.vai_tro_ktv !== undefined && body.vai_tro_ktv !== null && !["KTV", "CTV", "Tram", "Ve tinh"].includes(body.vai_tro_ktv)) {
    return c.json({ error: "INVALID_VAI_TRO_KTV" }, 400);
  }

  const next = {
    gmail: body.gmail !== undefined ? body.gmail?.trim() || null : existing.gmail,
    vai_tro_ktv: body.vai_tro_ktv !== undefined ? body.vai_tro_ktv : existing.vai_tro_ktv,
    giam_sat_quan_ly: body.giam_sat_quan_ly !== undefined ? body.giam_sat_quan_ly?.trim() || null : existing.giam_sat_quan_ly,
    email_dang_nhap: body.email_dang_nhap !== undefined ? body.email_dang_nhap?.trim() || null : existing.email_dang_nhap,
  };

  await c.env.DB.prepare("UPDATE ktv_lien_he SET gmail = ?, vai_tro_ktv = ?, giam_sat_quan_ly = ?, email_dang_nhap = ? WHERE ma_ktv = ?")
    .bind(next.gmail, next.vai_tro_ktv, next.giam_sat_quan_ly, next.email_dang_nhap, ma)
    .run();

  if (next.email_dang_nhap) {
    const validGs = await filterValidGsEmails(c.env.DB, [next.giam_sat_quan_ly]);
    await provisionPlaceholderUser(c.env.DB, {
      email: next.email_dang_nhap,
      ten: existing.ten_hien_thi,
      vaiTroKtv: next.vai_tro_ktv,
      giamSatQuanLy: next.giam_sat_quan_ly && validGs.has(next.giam_sat_quan_ly) ? next.giam_sat_quan_ly : null,
    }).then((stmt) => stmt.run());
  }

  return c.json({ ok: true });
});

// POST /api/settings/ktv-lien-he/backfill-users - Admin bam 1 lan (idempotent, an toan lap lai) de
// cap tai khoan placeholder cho TOAN BO KTV da ghep email_dang_nhap tu TRUOC khi tinh nang nay ton
// tai (hook o PATCH .../dat-mua-lk va import/commit ben duoi chi lo cho cac lan ghep MOI sau nay).
settings.post("/ktv-lien-he/backfill-users", adminOnly, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT ten_hien_thi, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL",
  ).all<{ ten_hien_thi: string | null; vai_tro_ktv: string | null; giam_sat_quan_ly: string | null; email_dang_nhap: string }>();
  const rows = results as { ten_hien_thi: string | null; vai_tro_ktv: string | null; giam_sat_quan_ly: string | null; email_dang_nhap: string }[];
  if (rows.length === 0) return c.json({ ok: true, checked: 0 });

  const validGs = await filterValidGsEmails(c.env.DB, rows.map((r) => r.giam_sat_quan_ly));
  const statements = await Promise.all(
    rows.map((r) =>
      provisionPlaceholderUser(c.env.DB, {
        email: r.email_dang_nhap,
        ten: r.ten_hien_thi,
        vaiTroKtv: r.vai_tro_ktv,
        giamSatQuanLy: r.giam_sat_quan_ly && validGs.has(r.giam_sat_quan_ly) ? r.giam_sat_quan_ly : null,
      }),
    ),
  );
  await c.env.DB.batch(statements);
  return c.json({ ok: true, checked: rows.length });
});

settings.delete("/ktv-lien-he/:ma", ktvWriteRoles, async (c) => {
  const ma = c.req.param("ma");
  const existing = await c.env.DB.prepare("SELECT ma_ktv FROM ktv_lien_he WHERE ma_ktv = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  await c.env.DB.prepare("DELETE FROM ktv_lien_he WHERE ma_ktv = ?").bind(ma).run();
  await refreshHash(c.env.DB, "ktv_lien_he", "ktv_lien_he", "ma_ktv");
  return c.json({ ok: true });
});

const KTV_TEMPLATE_CSV = "ma_ktv,ten_hien_thi,sdt,ghi_chu,gmail,vai_tro_ktv,giam_sat_quan_ly,email_dang_nhap\nhuannt.mb,(huannt.mb) Trạm Bắc Ninh - TNHH TM và DV 3T Bắc Ninh,0912345678,,huannt.mb@gmail.com,Tram,,huannt.mb@company.com\n";

// GET /api/settings/ktv-lien-he/template
settings.get("/ktv-lien-he/template", adminOnly, (c) => csvTemplateResponse(c, KTV_TEMPLATE_CSV, "mau_import_sdt_ky_thuat_vien.csv"));

const VAI_TRO_KTV_VALUES = ["KTV", "CTV", "Tram", "Ve tinh"] as const;

interface KtvImportRow {
  ma_ktv?: string;
  ten_hien_thi?: string;
  sdt?: string;
  ghi_chu?: string;
  gmail?: string;
  vai_tro_ktv?: string;
  giam_sat_quan_ly?: string;
  email_dang_nhap?: string;
}

async function processKtvImportRows(db: D1Database, rows: KtvImportRow[], nguoiCapNhat: string, commit: boolean) {
  const summary = { thanhCong: 0, loi: 0, errors: [] as string[] };
  const valid: { ma_ktv: string; ten_hien_thi: string | null; sdt: string | null; ghi_chu: string | null; gmail: string | null; vai_tro_ktv: string | null; giam_sat_quan_ly: string | null; email_dang_nhap: string | null }[] = [];

  rows.forEach((row, i) => {
    const ma = String(row.ma_ktv ?? "").trim();
    // CHOT 2026-08-15: chi ma_ktv bat buoc (xem migration 0071) - sdt tuy chon.
    if (!ma) {
      summary.loi++;
      summary.errors.push(`Dòng ${i + 1}: thiếu ma_ktv`);
      return;
    }
    const vaiTro = row.vai_tro_ktv ? String(row.vai_tro_ktv).trim() : null;
    if (vaiTro && !(VAI_TRO_KTV_VALUES as readonly string[]).includes(vaiTro)) {
      summary.loi++;
      summary.errors.push(`Dòng ${i + 1}: vai_tro_ktv không hợp lệ ("${vaiTro}"), phải là: ${VAI_TRO_KTV_VALUES.join(", ")}`);
      return;
    }
    // giam_sat_quan_ly/email_dang_nhap KHONG con FK toi users (migration 0072) - luu duoc ngay ca
    // khi nguoi do chua tung dang nhap, cac cho JOIN voi users (vd GET
    // /dat-mua-lk/nguoi-nhan-hang-kha-dung) se tu khop khi tai khoan do xuat hien sau nay.
    valid.push({
      ma_ktv: ma,
      ten_hien_thi: row.ten_hien_thi ? String(row.ten_hien_thi).trim() : null,
      sdt: row.sdt ? String(row.sdt).trim() || null : null,
      ghi_chu: row.ghi_chu ? String(row.ghi_chu).trim() : null,
      gmail: row.gmail ? String(row.gmail).trim() : null,
      vai_tro_ktv: vaiTro,
      giam_sat_quan_ly: row.giam_sat_quan_ly ? String(row.giam_sat_quan_ly).trim() : null,
      email_dang_nhap: row.email_dang_nhap ? String(row.email_dang_nhap).trim() : null,
    });
  });
  summary.thanhCong = valid.length;

  if (commit && valid.length > 0) {
    const now = nowVN();
    await db.batch(
      valid.map((v) =>
        db
          .prepare(
            `INSERT INTO ktv_lien_he (ma_ktv, ten_hien_thi, sdt, ghi_chu, gmail, vai_tro_ktv, giam_sat_quan_ly, email_dang_nhap, nguoi_cap_nhat, ngay_cap_nhat)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(ma_ktv) DO UPDATE SET
               ten_hien_thi = excluded.ten_hien_thi, sdt = excluded.sdt, ghi_chu = excluded.ghi_chu,
               gmail = COALESCE(excluded.gmail, ktv_lien_he.gmail),
               vai_tro_ktv = COALESCE(excluded.vai_tro_ktv, ktv_lien_he.vai_tro_ktv),
               giam_sat_quan_ly = COALESCE(excluded.giam_sat_quan_ly, ktv_lien_he.giam_sat_quan_ly),
               email_dang_nhap = COALESCE(excluded.email_dang_nhap, ktv_lien_he.email_dang_nhap),
               nguoi_cap_nhat = excluded.nguoi_cap_nhat, ngay_cap_nhat = excluded.ngay_cap_nhat`,
          )
          .bind(v.ma_ktv, v.ten_hien_thi, v.sdt, v.ghi_chu, v.gmail, v.vai_tro_ktv, v.giam_sat_quan_ly, v.email_dang_nhap, nguoiCapNhat, now),
      ),
    );
    await refreshHash(db, "ktv_lien_he", "ktv_lien_he", "ma_ktv");

    // Cap tai khoan placeholder ngay cho cac dong co email_dang_nhap (xem provisionPlaceholderUser o
    // tren) - khong doi Admin phai bam rieng "backfill" sau moi lan import.
    const withEmail = valid.filter((v) => v.email_dang_nhap);
    if (withEmail.length > 0) {
      const validGs = await filterValidGsEmails(db, withEmail.map((v) => v.giam_sat_quan_ly));
      const statements = await Promise.all(
        withEmail.map((v) =>
          provisionPlaceholderUser(db, {
            email: v.email_dang_nhap!,
            ten: v.ten_hien_thi,
            vaiTroKtv: v.vai_tro_ktv,
            giamSatQuanLy: v.giam_sat_quan_ly && validGs.has(v.giam_sat_quan_ly) ? v.giam_sat_quan_ly : null,
          }),
        ),
      );
      await db.batch(statements);
    }
  }

  return summary;
}

settings.post("/ktv-lien-he/import/preview", adminOnly, async (c) => {
  const body = await c.req.json<{ rows: KtvImportRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processKtvImportRows(c.env.DB, body.rows, c.get("user").email, false);
  return c.json(summary);
});

settings.post("/ktv-lien-he/import/commit", adminOnly, async (c) => {
  const body = await c.req.json<{ rows: KtvImportRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processKtvImportRows(c.env.DB, body.rows, c.get("user").email, true);
  return c.json(summary);
});

// GET /api/settings/telegram-report-preview - Admin xem truoc anh se gui vao Telegram luc 17h30 (xem
// lib/reportImage.ts + dailySnapshot.ts chotGiaiTrinhDailyLog), khong ghi DB / khong gui Telegram that
// - chi doc snapshot 08:00 hom nay + tinh lai, tra ve PNG truc tiep.
settings.get("/telegram-report-preview", adminOnly, async (c) => {
  const computed = await computeTonDailyEntries(c.env.DB);
  if (!computed) return c.json({ error: "SNAPSHOT_NOT_READY", message: "Chưa có báo cáo 08:00 hôm nay để xem trước." }, 409);

  const { ngay, entries, resolvedList } = computed;
  const { mb, mn, kddv } = buildBaocaoTonRows(entries, resolvedList);
  const dateParts = ngay.split("-");
  const ngayFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

  const png = await renderBaocaoTonImage(mb, mn, kddv, ngayFormatted);
  return new Response(png as unknown as ArrayBuffer, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
});

// GET /api/settings/canh-bao-ton-report-preview - Admin xem truoc anh "Canh bao ton danh cho QL" se
// gui vao Telegram luc 08h00 (xem lib/canhBaoTon.ts generateCanhBaoTonSnapshot), khong ghi DB / khong
// gui Telegram that - chi tinh lai buckets song va tra ve PNG truc tiep.
settings.get("/canh-bao-ton-report-preview", adminOnly, async (c) => {
  const buckets = await computeCanhBaoTonBuckets(c.env.DB);
  const ngay = getVnDateStr();
  const dateParts = ngay.split("-");
  const ngayFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

  const cap1 = [
    { label: "Tồn ≥14 ngày", count: buckets.ton14.count },
    { label: "VIP/S.VIP tồn ≥5 ngày", count: buckets.vipSvip5.count },
    { label: "Lọc tổng tồn ≥3 ngày", count: buckets.locTong3.count },
    { label: "Tranh chấp/KN ≥3 ngày", count: buckets.tranhChap3.count },
  ];
  const cap2 = [
    { label: "Tồn >20 ngày", count: buckets.ton20.count },
    { label: "VIP/S.VIP tồn ≥7 ngày", count: buckets.vipSvip7.count },
    { label: "Lọc tổng tồn ≥5 ngày", count: buckets.locTong5.count },
    { label: "Tranh chấp/KN ≥5 ngày", count: buckets.tranhChap5.count },
  ];

  const png = await renderCanhBaoTonImage(cap1, cap2, ngayFormatted);
  return new Response(png as unknown as ArrayBuffer, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
});

export default settings;
