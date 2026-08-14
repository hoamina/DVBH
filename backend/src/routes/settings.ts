import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { syncLinhKienFromSheet } from "../lib/linhKienSync";
import { computeAndStoreHash, getOrComputeHash } from "../lib/contentHash";
import { getSheetUrl } from "../lib/backfillSheetSync";
import { bumpVersions } from "../lib/dataVersions";
import { nowVN } from "../lib/vnTime";
import { generatePartnerApiKey, maskPartnerApiKey, hashApiKey } from "../lib/partnerApiAuth";
import { csvTemplateResponse } from "../lib/csvTemplate";
import { computeTonDailyEntries } from "../lib/dailySnapshot";
import { buildBaocaoTonRows, renderBaocaoTonImage } from "../lib/reportImage";

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

async function logAudit(
  db: D1Database,
  bang: "settings_ly_do" | "linh_kien" | "settings_phan_loai_tranh_chap" | "settings_ket_qua_xu_ly_tranh_chap",
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

settings.post("/linh-kien", adminOnly, async (c) => {
  const body = await c.req.json<{
    ma_linh_kien: string;
    ten_linh_kien: string;
    gia_ban?: number;
    gia_tham_chieu?: number;
    don_vi?: string;
    ghi_chu?: string;
    anh_demo?: string;
  }>();
  if (!body.ma_linh_kien?.trim() || !body.ten_linh_kien?.trim()) {
    return c.json({ error: "MISSING_FIELDS" }, 400);
  }

  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, gia_ban, gia_tham_chieu, don_vi, ghi_chu, anh_demo, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(body.ma_linh_kien.trim(), body.ten_linh_kien.trim(), body.gia_ban ?? null, body.gia_tham_chieu ?? null, body.don_vi?.trim() || null, body.ghi_chu?.trim() || null, body.anh_demo?.trim() || null, user.email, nowVN())
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
  const body = await c.req.json<{ bat_tat?: boolean; gia_ban?: number; gia_tham_chieu?: number; don_vi?: string; ghi_chu?: string; anh_demo?: string }>();
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
  };
  await c.env.DB.prepare(
    "UPDATE linh_kien SET bat_tat = ?, gia_ban = ?, gia_tham_chieu = ?, don_vi = ?, ghi_chu = ?, anh_demo = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ?",
  )
    .bind(next.bat_tat, next.gia_ban, next.gia_tham_chieu, next.don_vi, next.ghi_chu, next.anh_demo, user.email, nowVN(), ma)
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
  const body = await c.req.json<{ ma_ktv: string; ten_hien_thi?: string; sdt: string; ghi_chu?: string }>();
  if (!body.ma_ktv?.trim() || !body.sdt?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);

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
    .bind(body.ma_ktv.trim(), body.ten_hien_thi?.trim() || null, body.sdt.trim(), body.ghi_chu?.trim() || null, user.email, nowVN())
    .first();

  await refreshHash(c.env.DB, "ktv_lien_he", "ktv_lien_he", "ma_ktv");
  return c.json(row, 201);
});

settings.delete("/ktv-lien-he/:ma", ktvWriteRoles, async (c) => {
  const ma = c.req.param("ma");
  const existing = await c.env.DB.prepare("SELECT ma_ktv FROM ktv_lien_he WHERE ma_ktv = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  await c.env.DB.prepare("DELETE FROM ktv_lien_he WHERE ma_ktv = ?").bind(ma).run();
  await refreshHash(c.env.DB, "ktv_lien_he", "ktv_lien_he", "ma_ktv");
  return c.json({ ok: true });
});

const KTV_TEMPLATE_CSV = "ma_ktv,ten_hien_thi,sdt,ghi_chu\nhuannt.mb,(huannt.mb) Trạm Bắc Ninh - TNHH TM và DV 3T Bắc Ninh,0912345678,\n";

// GET /api/settings/ktv-lien-he/template
settings.get("/ktv-lien-he/template", adminOnly, (c) => csvTemplateResponse(c, KTV_TEMPLATE_CSV, "mau_import_sdt_ky_thuat_vien.csv"));

interface KtvImportRow {
  ma_ktv?: string;
  ten_hien_thi?: string;
  sdt?: string;
  ghi_chu?: string;
}

async function processKtvImportRows(db: D1Database, rows: KtvImportRow[], nguoiCapNhat: string, commit: boolean) {
  const summary = { thanhCong: 0, loi: 0, errors: [] as string[] };
  const valid: { ma_ktv: string; ten_hien_thi: string | null; sdt: string; ghi_chu: string | null }[] = [];

  rows.forEach((row, i) => {
    const ma = String(row.ma_ktv ?? "").trim();
    const sdt = String(row.sdt ?? "").trim();
    if (!ma || !sdt) {
      summary.loi++;
      summary.errors.push(`Dòng ${i + 1}: thiếu ma_ktv hoặc sdt`);
      return;
    }
    valid.push({
      ma_ktv: ma,
      ten_hien_thi: row.ten_hien_thi ? String(row.ten_hien_thi).trim() : null,
      sdt,
      ghi_chu: row.ghi_chu ? String(row.ghi_chu).trim() : null,
    });
  });
  summary.thanhCong = valid.length;

  if (commit && valid.length > 0) {
    const now = nowVN();
    await db.batch(
      valid.map((v) =>
        db
          .prepare(
            `INSERT INTO ktv_lien_he (ma_ktv, ten_hien_thi, sdt, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(ma_ktv) DO UPDATE SET
               ten_hien_thi = excluded.ten_hien_thi, sdt = excluded.sdt, ghi_chu = excluded.ghi_chu,
               nguoi_cap_nhat = excluded.nguoi_cap_nhat, ngay_cap_nhat = excluded.ngay_cap_nhat`,
          )
          .bind(v.ma_ktv, v.ten_hien_thi, v.sdt, v.ghi_chu, nguoiCapNhat, now),
      ),
    );
    await refreshHash(db, "ktv_lien_he", "ktv_lien_he", "ma_ktv");
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

export default settings;
