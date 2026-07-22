import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";

const viPham = new Hono<{ Bindings: Env }>();
viPham.use("*", verifySessionMiddleware, loadUser);

const XAC_NHAN_EXPR = "COALESCE(v.chot_bo_cap_2, CASE WHEN v.ket_qua_cap_1 != 'Khong loi' THEN 1 ELSE 0 END) = 1";

// GET /api/vi-pham/funnel - phau xu ly nghi ngo vi pham -> can khao sat -> cho QC -> da xu ly
viPham.get("/funnel", async (c) => {
  const scope = scopeByKhuVuc(c);
  const scopeClauseC = khuVucWhereClause(scope, "c.khu_vuc");

  const nghiNgo = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM case_dvbh c
     WHERE c.archived_at IS NULL
       AND (c.loi_120p = 1 OR c.loi_qua_han_24h = 1 OR c.loi_lo_ke_hoach = 1 OR c.loi_kh_hen_lai = 1)${scopeClauseC.sql}`,
  )
    .bind(...scopeClauseC.binds)
    .first<{ n: number }>();

  const canKhaoSat = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM (
       SELECT c.id FROM case_dvbh c
       WHERE c.archived_at IS NULL${scopeClauseC.sql}
         AND (
           (c.loi_120p = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'Loi 120 phut'))
           OR (c.loi_qua_han_24h = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'Hen qua 24h'))
           OR (c.loi_lo_ke_hoach = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'Loi lo ke hoach'))
           OR (c.loi_kh_hen_lai = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'KH hen lai'))
         )
     )`,
  )
    .bind(...scopeClauseC.binds)
    .first<{ n: number }>();

  const choQc = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT v.case_id) as n FROM vi_pham v INNER JOIN case_dvbh c ON c.id = v.case_id
     WHERE v.ket_qua_cap_1 IS NOT NULL AND v.ket_qua_cap_1 != 'Khong loi' AND v.chot_bo_cap_2 IS NULL${scopeClauseC.sql}`,
  )
    .bind(...scopeClauseC.binds)
    .first<{ n: number }>();

  const daXuLy = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT v.case_id) as n FROM vi_pham v INNER JOIN case_dvbh c ON c.id = v.case_id
     WHERE (v.ket_qua_cap_1 = 'Khong loi' OR v.chot_bo_cap_2 IS NOT NULL)${scopeClauseC.sql}`,
  )
    .bind(...scopeClauseC.binds)
    .first<{ n: number }>();

  return c.json({
    nghiNgo: nghiNgo?.n ?? 0,
    canKhaoSat: canKhaoSat?.n ?? 0,
    choQc: choQc?.n ?? 0,
    daXuLy: daXuLy?.n ?? 0,
  });
});

// GET /api/vi-pham/leaderboard?by=ktv|giam-sat - top 10 nhieu vi pham da xac nhan nhat
viPham.get("/leaderboard", async (c) => {
  const by = c.req.query("by") === "giam-sat" ? "giam-sat" : "ktv";
  const scope = scopeByKhuVuc(c);
  const scopeClauseC = khuVucWhereClause(scope, "c.khu_vuc");

  if (by === "ktv") {
    const { results } = await c.env.DB.prepare(
      `SELECT c.ky_thuat_vien as nhom, COUNT(*) as so_vi_pham
       FROM vi_pham v INNER JOIN case_dvbh c ON c.id = v.case_id
       WHERE ${XAC_NHAN_EXPR} AND c.ky_thuat_vien IS NOT NULL${scopeClauseC.sql}
       GROUP BY c.ky_thuat_vien
       ORDER BY so_vi_pham DESC
       LIMIT 10`,
    )
      .bind(...scopeClauseC.binds)
      .all();
    return c.json({ rows: results });
  }

  const { results } = await c.env.DB.prepare(
    `SELECT u.email as giam_sat_email, u.ten as giam_sat, COUNT(*) as so_vi_pham
     FROM users u, json_each(u.khu_vuc_phu_trach) jv
     INNER JOIN case_dvbh c ON c.khu_vuc = jv.value
     INNER JOIN vi_pham v ON v.case_id = c.id
     WHERE u.vai_tro = 'Giam sat' AND ${XAC_NHAN_EXPR}${scopeClauseC.sql}
     GROUP BY u.email
     ORDER BY so_vi_pham DESC
     LIMIT 10`,
  )
    .bind(...scopeClauseC.binds)
    .all();
  return c.json({ rows: results });
});

// PATCH /api/vi-pham/:id/cap2 - QC chot/bo vi pham cap 2 (final)
viPham.patch("/:id/cap2", requireRole("QC", "Admin"), async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ chot: boolean }>();
  if (typeof body.chot !== "boolean") return c.json({ error: "INVALID_BODY" }, 400);

  const row = await c.env.DB.prepare("SELECT id, ket_qua_cap_1 FROM vi_pham WHERE id = ?")
    .bind(id)
    .first<{ id: string; ket_qua_cap_1: string | null }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  // Mirror CHECK chk_cap2_sau_cap1: khong duoc chot cap 2 khi chua co cap 1
  if (row.ket_qua_cap_1 === null) return c.json({ error: "CAP1_CHUA_CO" }, 400);

  const user = c.get("user");
  await c.env.DB.prepare(
    "UPDATE vi_pham SET chot_bo_cap_2 = ?, nguoi_chot = ?, ngay_chot = datetime('now') WHERE id = ?",
  )
    .bind(body.chot ? 1 : 0, user.email, id)
    .run();

  return c.json({ ok: true });
});

export default viPham;
