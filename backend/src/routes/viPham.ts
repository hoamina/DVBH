import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { bumpVersions } from "../lib/dataVersions";
import { cachedReport, buildReportKey } from "../lib/reportCache";
import { khuVucReportExclusionClause } from "../lib/filterParams";

const viPham = new Hono<{ Bindings: Env }>();
viPham.use("*", verifySessionMiddleware, loadUser);

const XAC_NHAN_EXPR = "COALESCE(v.chot_bo_cap_2, CASE WHEN v.ket_qua_cap_1 != 'Khong loi' THEN 1 ELSE 0 END) = 1";

// KHONG them gio "00:00:00" vao bound - xem giai thich chi tiet o monthBounds() trong cases.ts.
function monthBounds(thang: string): { start: string; end: string } {
  const m = thang.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const [y, mo] = m ? [Number(m[1]), Number(m[2])] : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const start = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-01`;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const nextY = mo === 12 ? y + 1 : y;
  const end = `${String(nextY).padStart(4, "0")}-${String(nextMo).padStart(2, "0")}-01`;
  return { start, end };
}

// Khop dung 4 cot loi_* tren case_dvbh voi ten loai_loi tren vi_pham - dung chung cho ca nghiNgo lan
// canKhaoSat (xem computeViPhamFunnel) va cho 4 index tung phan trong migration 0045.
const FLAG_BRANCHES: { flagCol: string; loaiLoi: string }[] = [
  { flagCol: "loi_120p", loaiLoi: "Loi 120 phut" },
  { flagCol: "loi_qua_han_24h", loaiLoi: "Hen qua 24h" },
  { flagCol: "loi_lo_ke_hoach", loaiLoi: "Loi lo ke hoach" },
  { flagCol: "loi_kh_hen_lai", loaiLoi: "KH hen lai" },
];

export interface ViPhamFunnelPayload {
  nghiNgo: number;
  canKhaoSat: number;
  choQc: number;
  daXuLy: number;
}

// Tach rieng phan tinh toan cua /funnel - dung chung cho compute-on-miss va warm-up (R7).
// CHOT 2026-08-03: gioi han theo THANG (thoi_gian_cskh_tiep_nhan, giong logic da chot o
// survey.ts/cases.ts) VA viet lai OR-4-cot thanh UNION 4 nhanh rieng, moi nhanh dung dung 1 index
// tung phan (migration 0045_vi_pham_funnel_indexes.sql) thay vi quet toan bo case_dvbh nhu truoc -
// xem giai thich D1 read-budget trong CLAUDE.md.
export async function computeViPhamFunnel(db: D1Database, scope: string[] | null, thang?: string): Promise<ViPhamFunnelPayload> {
  const scopeClauseCBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusionC = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClauseC = { sql: scopeClauseCBase.sql + exclusionC.sql, binds: [...scopeClauseCBase.binds, ...exclusionC.binds] };
  const { start, end } = monthBounds(thang || new Date().toISOString().slice(0, 7));

  const nghiNgo = await db.prepare(
    `SELECT COUNT(*) as n FROM (
       ${FLAG_BRANCHES.map(
         (b) =>
           `SELECT c.id FROM case_dvbh c
            WHERE c.archived_at IS NULL AND c.huy_bo_at IS NULL AND c.${b.flagCol} = 1
              AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC.sql}`,
       ).join(" UNION ")}
     )`,
  )
    .bind(...FLAG_BRANCHES.flatMap(() => [start, end, ...scopeClauseC.binds]))
    .first<{ n: number }>();

  const canKhaoSat = await db.prepare(
    `SELECT COUNT(*) as n FROM (
       ${FLAG_BRANCHES.map(
         (b) =>
           `SELECT c.id FROM case_dvbh c
            WHERE c.archived_at IS NULL AND c.huy_bo_at IS NULL AND c.${b.flagCol} = 1
              AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC.sql}
              AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = '${b.loaiLoi}')`,
       ).join(" UNION ")}
     )`,
  )
    .bind(...FLAG_BRANCHES.flatMap(() => [start, end, ...scopeClauseC.binds]))
    .first<{ n: number }>();

  const choQc = await db.prepare(
    `SELECT COUNT(DISTINCT v.case_id) as n FROM vi_pham v INNER JOIN case_dvbh c ON c.id = v.case_id
     WHERE v.ket_qua_cap_1 IS NOT NULL AND v.ket_qua_cap_1 != 'Khong loi' AND v.chot_bo_cap_2 IS NULL
       AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC.sql}`,
  )
    .bind(start, end, ...scopeClauseC.binds)
    .first<{ n: number }>();

  const daXuLy = await db.prepare(
    `SELECT COUNT(DISTINCT v.case_id) as n FROM vi_pham v INNER JOIN case_dvbh c ON c.id = v.case_id
     WHERE (v.ket_qua_cap_1 = 'Khong loi' OR v.chot_bo_cap_2 IS NOT NULL)
       AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?${scopeClauseC.sql}`,
  )
    .bind(start, end, ...scopeClauseC.binds)
    .first<{ n: number }>();

  return {
    nghiNgo: nghiNgo?.n ?? 0,
    canKhaoSat: canKhaoSat?.n ?? 0,
    choQc: choQc?.n ?? 0,
    daXuLy: daXuLy?.n ?? 0,
  };
}

// GET /api/vi-pham/funnel?thang=YYYY-MM - phau xu ly nghi ngo vi pham -> can khao sat -> cho QC ->
// da xu ly, gioi han theo dung 1 thang (mac dinh thang hien tai neu khong truyen). Doc qua
// reportCache (xem lib/reportCache.ts), "thang" nam trong cache key.
viPham.get("/funnel", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params = { thang: c.req.query("thang") };
  const key = buildReportKey("vi-pham/funnel", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases", "vi_pham"], () => computeViPhamFunnel(c.env.DB, scope, params.thang));
  return c.json(payload);
});

export interface ViPhamLeaderboardParams {
  by?: string;
  // Index signature bat buoc de truyen truc tiep vao buildReportKey() (Record<string, string |
  // undefined>) - xem lib/reportCache.ts.
  [key: string]: string | undefined;
}

// Tach rieng phan tinh toan cua /leaderboard - dung chung cho compute-on-miss va warm-up (R7).
// Moi dong tra them "tong_ca" (tong so ca cua KTV do / tong so ca trong cac khu vuc gia sat do phu
// trach, khong gioi han thang) va "ty_le_vi_pham" (%, = so_vi_pham/tong_ca) - CHOT: bieu do Top 10
// chuyen tu so vi pham tuyet doi sang ty le, nhung TIEU CHI chon+sap xep Top 10 van la so_vi_pham
// tuyet doi cao nhat (khong doi), chi doi gia tri hien thi tren truc.
export async function computeViPhamLeaderboard(db: D1Database, params: ViPhamLeaderboardParams, scope: string[] | null): Promise<{ rows: unknown[] }> {
  const by = params.by === "giam-sat" ? "giam-sat" : "ktv";
  const scopeClauseCBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusionC = khuVucReportExclusionClause("c.khu_vuc");
  const scopeClauseC = { sql: scopeClauseCBase.sql + exclusionC.sql, binds: [...scopeClauseCBase.binds, ...exclusionC.binds] };

  function withTyLe<T extends { so_vi_pham: number; tong_ca: number }>(rows: T[]): (T & { ty_le_vi_pham: number })[] {
    return rows.map((r) => ({ ...r, ty_le_vi_pham: r.tong_ca ? Math.round((r.so_vi_pham / r.tong_ca) * 1000) / 10 : 0 }));
  }

  if (by === "ktv") {
    const scopeClauseC2Base = khuVucWhereClause(scope, "c2.khu_vuc");
    const exclusionC2 = khuVucReportExclusionClause("c2.khu_vuc");
    const scopeClauseC2 = { sql: scopeClauseC2Base.sql + exclusionC2.sql, binds: [...scopeClauseC2Base.binds, ...exclusionC2.binds] };
    const { results } = await db.prepare(
      `SELECT c.ky_thuat_vien as nhom, COUNT(*) as so_vi_pham,
         (SELECT COUNT(*) FROM case_dvbh c2 WHERE c2.ky_thuat_vien = c.ky_thuat_vien
            AND c2.archived_at IS NULL AND c2.huy_bo_at IS NULL${scopeClauseC2.sql}) as tong_ca
       FROM vi_pham v INNER JOIN case_dvbh c ON c.id = v.case_id
       WHERE ${XAC_NHAN_EXPR} AND c.ky_thuat_vien IS NOT NULL${scopeClauseC.sql}
       GROUP BY c.ky_thuat_vien
       ORDER BY so_vi_pham DESC
       LIMIT 10`,
    )
      .bind(...scopeClauseC2.binds, ...scopeClauseC.binds)
      .all<{ nhom: string; so_vi_pham: number; tong_ca: number }>();
    return { rows: withTyLe(results) };
  }

  const scopeClauseC2Base = khuVucWhereClause(scope, "c2.khu_vuc");
  const exclusionC2 = khuVucReportExclusionClause("c2.khu_vuc");
  const scopeClauseC2 = { sql: scopeClauseC2Base.sql + exclusionC2.sql, binds: [...scopeClauseC2Base.binds, ...exclusionC2.binds] };
  const { results } = await db.prepare(
    `SELECT u.email as giam_sat_email, u.ten as giam_sat, COUNT(*) as so_vi_pham,
       (SELECT COUNT(*) FROM case_dvbh c2, json_each(u.khu_vuc_phu_trach) jv2
          WHERE c2.khu_vuc = jv2.value AND c2.archived_at IS NULL AND c2.huy_bo_at IS NULL${scopeClauseC2.sql}) as tong_ca
     FROM users u, json_each(u.khu_vuc_phu_trach) jv
     INNER JOIN case_dvbh c ON c.khu_vuc = jv.value
     INNER JOIN vi_pham v ON v.case_id = c.id
     WHERE u.vai_tro = 'Giam sat' AND ${XAC_NHAN_EXPR}${scopeClauseC.sql}
     GROUP BY u.email
     ORDER BY so_vi_pham DESC
     LIMIT 10`,
  )
    .bind(...scopeClauseC2.binds, ...scopeClauseC.binds)
    .all<{ giam_sat_email: string; giam_sat: string | null; so_vi_pham: number; tong_ca: number }>();
  return { rows: withTyLe(results) };
}

// GET /api/vi-pham/leaderboard?by=ktv|giam-sat - top 10 nhieu vi pham da xac nhan nhat. Doc qua
// reportCache, "by" nam trong cache key. "leaderboard-v2" (khong phai "leaderboard") - CHOT
// 2026-08-20: doi shape payload (them tong_ca/ty_le_vi_pham) nhung reportCache chi invalidate theo
// version-tag domain (khong theo deploy code), nen key cu se tiep tuc tra ve envelope THIEU 2 truong
// moi cho toi khi domain "vi_pham"/"cases" tinh co bump - doi ten key ep tinh lai ngay, tranh phai
// cho 1 write tinh co xay ra. Neu doi shape payload lan nua trong tuong lai, lai doi hau to version.
viPham.get("/leaderboard", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params: ViPhamLeaderboardParams = { by: c.req.query("by") };
  const key = buildReportKey("vi-pham/leaderboard-v2", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases", "vi_pham"], () => computeViPhamLeaderboard(c.env.DB, params, scope));
  return c.json(payload);
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
    "UPDATE vi_pham SET chot_bo_cap_2 = ?, nguoi_chot = ?, ngay_chot = datetime('now', '+7 hours') WHERE id = ?",
  )
    .bind(body.chot ? 1 : 0, user.email, id)
    .run();

  // Bump domain "vi_pham" (xem lib/dataVersions.ts).
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["vi_pham"]));

  return c.json({ ok: true });
});

export default viPham;
