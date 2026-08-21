import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { requireQuanLyDanhMucLk } from "../middleware/requireQuanLyDanhMucLk";
import { nowVN } from "../lib/vnTime";

// Catalog "Dat mua linh kien": danh muc LK, nhom thay the, BOM tra cuu - xem migration
// 0054_lk_danh_muc.sql + 0055_lk_bom.sql. Doc mo cho moi user da duyet (dropdown tao don), ghi
// gioi han Admin (giong pattern settings.ts).
const lkSettings = new Hono<{ Bindings: Env }>();
lkSettings.use("*", verifySessionMiddleware, loadUser);
const adminOnly = requireRole("Admin");
// CHOT 2026-08-17: quyen ghi danh muc linh kien + nhom thay the gio la flag doc lap
// quan_ly_danh_muc_lk (xem middleware/requireQuanLyDanhMucLk.ts + migration 0082) - THAY THE
// requireRole("Admin","TBP DVBH","Giam sat") cu (Giai doan 5, 2026-08-14) vi da lech sau khi tach
// la_tac_nghiep khoi vai_tro o migration 0081. BOM import van giu adminOnly (ngoai pham vi chot).
const quanLyDanhMuc = requireQuanLyDanhMucLk;

// D1 batch/bind-param safety margin - xem lib/importProcessor.ts.
const CHUNK_SIZE_BATCH = 500;

// ---------- Danh muc linh kien ----------

// GET /api/lk-settings/danh-muc?since=<ISO-timestamp> - tra ve chi nhung LK co ngay_cap_nhat
// > since (incremental sync cho client cache). Neu khong co ?since thi tra ve tat ca.
lkSettings.get("/danh-muc", async (c) => {
  const since = c.req.query("since")?.trim();
  let query = "SELECT * FROM linh_kien";
  const binds: string[] = [];

  if (since) {
    query += " WHERE ngay_cap_nhat > ?";
    binds.push(since);
  }

  query += " ORDER BY ma_linh_kien";
  const { results } = await c.env.DB.prepare(query).bind(...binds).all();
  return c.json({ rows: results });
});

lkSettings.post("/danh-muc", quanLyDanhMuc, async (c) => {
  const body = await c.req.json<{ ma_linh_kien: string; ten_linh_kien: string; gia_ban?: number | null; gia_tham_chieu?: number | null; don_vi?: string | null; ghi_chu?: string | null; anh_demo?: string | null; dac_thu?: boolean; chi_sua_chua?: boolean }>();
  if (!body.ma_linh_kien?.trim() || !body.ten_linh_kien?.trim()) return c.json({ error: "MISSING_FIELDS" }, 400);

  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `INSERT INTO linh_kien (ma_linh_kien, ten_linh_kien, gia_ban, gia_tham_chieu, don_vi, ghi_chu, anh_demo, dac_thu, chi_sua_chua, nguoi_cap_nhat, ngay_cap_nhat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ma_linh_kien) DO UPDATE SET
       ten_linh_kien = excluded.ten_linh_kien, gia_ban = excluded.gia_ban, gia_tham_chieu = excluded.gia_tham_chieu,
       don_vi = excluded.don_vi, ghi_chu = excluded.ghi_chu, anh_demo = excluded.anh_demo, dac_thu = excluded.dac_thu,
       chi_sua_chua = excluded.chi_sua_chua, nguoi_cap_nhat = excluded.nguoi_cap_nhat, ngay_cap_nhat = excluded.ngay_cap_nhat
     RETURNING *`,
  )
    .bind(body.ma_linh_kien.trim(), body.ten_linh_kien.trim(), body.gia_ban ?? null, body.gia_tham_chieu ?? null, body.don_vi?.trim() || null, body.ghi_chu?.trim() || null, body.anh_demo?.trim() || null, body.dac_thu ? 1 : 0, body.chi_sua_chua ? 1 : 0, user.email, nowVN())
    .first();

  return c.json(row, 201);
});

lkSettings.patch("/danh-muc/:ma", quanLyDanhMuc, async (c) => {
  const ma = c.req.param("ma");
  const body = await c.req.json<{ ten_linh_kien?: string; gia_ban?: number | null; gia_tham_chieu?: number | null; don_vi?: string | null; ghi_chu?: string | null; anh_demo?: string | null; bat_tat?: boolean; dac_thu?: boolean; chi_sua_chua?: boolean }>();
  const existing = await c.env.DB.prepare("SELECT * FROM linh_kien WHERE ma_linh_kien = ?").bind(ma).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const user = c.get("user");
  const next = {
    ten_linh_kien: body.ten_linh_kien !== undefined ? body.ten_linh_kien.trim() : existing.ten_linh_kien,
    gia_ban: body.gia_ban !== undefined ? body.gia_ban : existing.gia_ban,
    gia_tham_chieu: body.gia_tham_chieu !== undefined ? body.gia_tham_chieu : existing.gia_tham_chieu,
    don_vi: body.don_vi !== undefined ? body.don_vi?.trim() || null : existing.don_vi,
    ghi_chu: body.ghi_chu !== undefined ? body.ghi_chu?.trim() || null : existing.ghi_chu,
    anh_demo: body.anh_demo !== undefined ? body.anh_demo?.trim() || null : existing.anh_demo,
    bat_tat: body.bat_tat !== undefined ? (body.bat_tat ? 1 : 0) : existing.bat_tat,
    dac_thu: body.dac_thu !== undefined ? (body.dac_thu ? 1 : 0) : existing.dac_thu,
    chi_sua_chua: body.chi_sua_chua !== undefined ? (body.chi_sua_chua ? 1 : 0) : existing.chi_sua_chua,
  };

  await c.env.DB.prepare(
    "UPDATE linh_kien SET ten_linh_kien = ?, gia_ban = ?, gia_tham_chieu = ?, don_vi = ?, ghi_chu = ?, anh_demo = ?, bat_tat = ?, dac_thu = ?, chi_sua_chua = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE ma_linh_kien = ?",
  )
    .bind(next.ten_linh_kien, next.gia_ban, next.gia_tham_chieu, next.don_vi, next.ghi_chu, next.anh_demo, next.bat_tat, next.dac_thu, next.chi_sua_chua, user.email, nowVN(), ma)
    .run();

  return c.json({ ok: true });
});

// ---------- Nhom thay the ----------

lkSettings.get("/nhom-thay-the", async (c) => {
  const { results: nhoms } = await c.env.DB.prepare("SELECT * FROM lk_nhom_thay_the ORDER BY id").all();
  const { results: cts } = await c.env.DB.prepare("SELECT * FROM lk_nhom_thay_the_ct").all<{ nhom_id: number; ma_lk: string }>();

  const maLkByNhom = new Map<number, string[]>();
  for (const ct of cts) {
    const list = maLkByNhom.get(ct.nhom_id) ?? [];
    list.push(ct.ma_lk);
    maLkByNhom.set(ct.nhom_id, list);
  }

  const rows = (nhoms as Record<string, unknown>[]).map((n) => ({ ...n, ma_lk_list: maLkByNhom.get(n.id as number) ?? [] }));
  return c.json({ rows });
});

// POST /api/lk-settings/nhom-thay-the - { ten_nhom, ghi_chu?, ma_lk_list } tao moi (thay toan bo
// thanh vien trong 1 lan, khong PATCH tung dong - danh sach thanh vien thuong nho, don gian hon).
lkSettings.post("/nhom-thay-the", quanLyDanhMuc, async (c) => {
  const body = await c.req.json<{ ten_nhom: string; ghi_chu?: string | null; ma_lk_list: string[] }>();
  if (!body.ten_nhom?.trim() || !Array.isArray(body.ma_lk_list) || body.ma_lk_list.length === 0) {
    return c.json({ error: "MISSING_FIELDS" }, 400);
  }

  const user = c.get("user");
  const nhom = await c.env.DB.prepare(
    "INSERT INTO lk_nhom_thay_the (ten_nhom, ghi_chu, nguoi_cap_nhat, ngay_cap_nhat) VALUES (?, ?, ?, ?) RETURNING *",
  )
    .bind(body.ten_nhom.trim(), body.ghi_chu?.trim() || null, user.email, nowVN())
    .first<{ id: number }>();
  if (!nhom) return c.json({ error: "INSERT_FAILED" }, 500);

  await c.env.DB.batch(
    body.ma_lk_list.map((ma) => c.env.DB.prepare("INSERT INTO lk_nhom_thay_the_ct (nhom_id, ma_lk) VALUES (?, ?)").bind(nhom.id, ma)),
  );

  return c.json(nhom, 201);
});

lkSettings.patch("/nhom-thay-the/:id", quanLyDanhMuc, async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ ten_nhom?: string; ghi_chu?: string | null; ma_lk_list?: string[] }>();
  const existing = await c.env.DB.prepare("SELECT * FROM lk_nhom_thay_the WHERE id = ?").bind(id).first();
  if (!existing) return c.json({ error: "NOT_FOUND" }, 404);

  const user = c.get("user");
  const next = {
    ten_nhom: body.ten_nhom !== undefined ? body.ten_nhom.trim() : existing.ten_nhom,
    ghi_chu: body.ghi_chu !== undefined ? body.ghi_chu?.trim() || null : existing.ghi_chu,
  };

  await c.env.DB.prepare("UPDATE lk_nhom_thay_the SET ten_nhom = ?, ghi_chu = ?, nguoi_cap_nhat = ?, ngay_cap_nhat = ? WHERE id = ?")
    .bind(next.ten_nhom, next.ghi_chu, user.email, nowVN(), id)
    .run();

  if (body.ma_lk_list !== undefined) {
    await c.env.DB.prepare("DELETE FROM lk_nhom_thay_the_ct WHERE nhom_id = ?").bind(id).run();
    if (body.ma_lk_list.length > 0) {
      await c.env.DB.batch(
        body.ma_lk_list.map((ma) => c.env.DB.prepare("INSERT INTO lk_nhom_thay_the_ct (nhom_id, ma_lk) VALUES (?, ?)").bind(id, ma)),
      );
    }
  }

  return c.json({ ok: true });
});

// GET /api/lk-settings/thay-the/:ma_lk - goi y ma LK khac cung nhom thay the voi :ma_lk (khong
// tra chinh :ma_lk). Dung o TaoDonTab khi chon 1 ma_lk - buoc 2 ke hoach "Luong tao don mua hang".
lkSettings.get("/thay-the/:ma_lk", async (c) => {
  const maLk = c.req.param("ma_lk").trim();
  const { results } = await c.env.DB.prepare(
    `SELECT DISTINCT dm.ma_linh_kien, dm.ten_linh_kien, dm.gia_tham_chieu
     FROM lk_nhom_thay_the_ct ct
     JOIN linh_kien dm ON dm.ma_linh_kien = ct.ma_lk
     WHERE ct.nhom_id IN (SELECT nhom_id FROM lk_nhom_thay_the_ct WHERE ma_lk = ?)
       AND ct.ma_lk != ?
     ORDER BY dm.ma_linh_kien`,
  )
    .bind(maLk, maLk)
    .all();
  return c.json({ rows: results });
});

// ---------- BOM tra cuu ----------

lkSettings.get("/bom/lookup", async (c) => {
  const maModel = c.req.query("ma_model")?.trim();
  if (!maModel) return c.json({ error: "MISSING_MA_MODEL" }, 400);

  const { results } = await c.env.DB.prepare("SELECT ma_lk, ten_lk, so_luong FROM lk_bom WHERE ma_model = ? ORDER BY ma_lk").bind(maModel).all();
  return c.json({ rows: results });
});

interface BomImportRow {
  ma_model?: string;
  ma_lk?: string;
  ten_lk?: string;
  so_luong?: number;
}

// POST /api/lk-settings/bom/import - { rows, offset } xu ly 1 chunk (client tu chia file 39k dong
// va lap goi cho den done:true). Khong dung UPSERT (lk_bom khong co unique key tu nhien - 1
// (ma_model, ma_lk) co the xuat hien lai khi import lai) - client tu xoa du lieu cu qua rows=[]
// truoc neu can nap lai tu dau (xem "?reset=1").
lkSettings.post("/bom/import", adminOnly, async (c) => {
  const reset = c.req.query("reset") === "1";
  const body = await c.req.json<{ rows: BomImportRow[]; offset: number }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);

  if (reset && body.offset === 0) {
    await c.env.DB.prepare("DELETE FROM lk_bom").run();
  }

  const offset = Math.max(0, body.offset ?? 0);
  const chunk = body.rows.slice(offset, offset + CHUNK_SIZE_BATCH);
  const now = nowVN();

  const valid = chunk
    .map((r) => ({
      ma_model: String(r.ma_model ?? "").trim(),
      ma_lk: String(r.ma_lk ?? "").trim(),
      ten_lk: r.ten_lk ? String(r.ten_lk).trim() : null,
      so_luong: Number(r.so_luong ?? 1) || 1,
    }))
    .filter((r) => r.ma_model && r.ma_lk);

  if (valid.length > 0) {
    await c.env.DB.batch(
      valid.map((v) =>
        c.env.DB.prepare("INSERT INTO lk_bom (ma_model, ma_lk, ten_lk, so_luong, ngay_import) VALUES (?, ?, ?, ?, ?)").bind(
          v.ma_model,
          v.ma_lk,
          v.ten_lk,
          v.so_luong,
          now,
        ),
      ),
    );
  }

  const nextOffset = offset + CHUNK_SIZE_BATCH;
  const done = nextOffset >= body.rows.length;
  return c.json({ done, nextOffset: done ? body.rows.length : nextOffset, processed: valid.length });
});

export default lkSettings;
