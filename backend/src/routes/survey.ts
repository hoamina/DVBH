import { Hono } from "hono";
import type { Env, LoaiLoi } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { toJsonArray } from "../lib/jsonArray";
import { findExistingCaseIds, runBatched } from "../lib/backfillImportProcessor";
import { nextSequentialId } from "../lib/idCounter";
import { ageFilterClause } from "../lib/ageCalc";
import { khuVucAdHocClause } from "../lib/filterParams";

const survey = new Hono<{ Bindings: Env }>();
survey.use("*", verifySessionMiddleware, loadUser);

// Ca can khao sat: co it nhat 1 co nghi ngo chua duoc khao sat (chua co dong vi_pham tuong ung)
// Export de notifications.ts dung lai dung 1 dinh nghia cho badge sidebar "Quan ly khao sat".
export const NEED_SURVEY_CONDITION = `(
  (c.loi_120p = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'Loi 120 phut'))
  OR (c.loi_qua_han_24h = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'Hen qua 24h'))
  OR (c.loi_lo_ke_hoach = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'Loi lo ke hoach'))
  OR (c.loi_kh_hen_lai = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'KH hen lai'))
)`;
// Con moi/uu tien: dang ton (chua hoan thanh) HOAC da hoan thanh khong qua 3 ngay so voi 0h hom nay
export const RECENT_OR_OPEN_CONDITION = `(c.thoi_gian_hoan_thanh IS NULL OR c.thoi_gian_hoan_thanh >= datetime('now', 'start of day', '-3 days'))`;
// Qua han khao sat: da hoan thanh va qua 3 ngay so voi 0h hom nay ma van chua khao sat - co the goi hoac bo qua
const OVERDUE_SURVEY_CONDITION = `(c.thoi_gian_hoan_thanh IS NOT NULL AND c.thoi_gian_hoan_thanh < datetime('now', 'start of day', '-3 days'))`;

// GET /api/survey/cskh-list - danh sach CSKH da duyet, dung de phan cong (khong phai Quan ly User)
survey.get("/cskh-list", requireRole("TN CSKH", "TBP CSKH", "Admin"), async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT email, ten FROM users WHERE vai_tro = 'CSKH' AND trang_thai_duyet = 'Da duyet' ORDER BY ten",
  ).all();
  return c.json({ rows: results });
});

// GET /api/survey?tab=can-khao-sat|cho-qc|da-xu-ly&khu_vuc=&tuoi_tu=&tuoi_den=
survey.get("/", async (c) => {
  const tab = c.req.query("tab") ?? "can-khao-sat";
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const ageClause = ageFilterClause("c.thoi_gian_cskh_tiep_nhan", c.req.query("tuoi_tu"), c.req.query("tuoi_den"));
  const extraFilter = khuVucClause.sql + ageClause.sql;
  const extraBinds = [...khuVucClause.binds, ...ageClause.binds];
  const limit = c.req.query("export") === "true" ? 5000 : 200;

  if (tab === "can-khao-sat" || tab === "qua-han-khao-sat") {
    const timeCondition = tab === "can-khao-sat" ? RECENT_OR_OPEN_CONDITION : OVERDUE_SURVEY_CONDITION;
    const query = `
      SELECT * FROM (
        SELECT c.id, c.khach_hang, c.khu_vuc, c.assigned_to,
          c.mo_ta_loi, c.ky_thuat_vien, c.tinh, c.quan_huyen,
          c.thoi_gian_cskh_tiep_nhan, c.thoi_gian_hen_xu_ly, c.thoi_gian_hoan_thanh,
          c.link_crm, c.noi_dung_xu_ly,
          (c.loi_120p = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'Loi 120 phut')) AS need_loi_120p,
          (c.loi_qua_han_24h = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'Hen qua 24h')) AS need_loi_qua_han_24h,
          (c.loi_lo_ke_hoach = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'Loi lo ke hoach')) AS need_loi_lo_ke_hoach,
          (c.loi_kh_hen_lai = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'KH hen lai')) AS need_loi_kh_hen_lai
        FROM case_dvbh c
        WHERE c.archived_at IS NULL AND ${timeCondition}${scopeClause.sql}${extraFilter}
      ) t
      WHERE need_loi_120p OR need_loi_qua_han_24h OR need_loi_lo_ke_hoach OR need_loi_kh_hen_lai
      ORDER BY id DESC
      LIMIT ?
    `;
    const { results } = await c.env.DB.prepare(query).bind(...scopeClause.binds, ...extraBinds, limit).all();
    return c.json({ rows: results });
  }

  if (tab === "cho-qc") {
    const query = `
      SELECT v.*, c.khach_hang, c.khu_vuc
      FROM vi_pham v
      INNER JOIN case_dvbh c ON c.id = v.case_id
      WHERE v.ket_qua_cap_1 IS NOT NULL AND v.ket_qua_cap_1 != 'Khong loi' AND v.chot_bo_cap_2 IS NULL${scopeClause.sql}${extraFilter}
      ORDER BY v.ngay_ghi_nhan DESC
      LIMIT ?
    `;
    const { results } = await c.env.DB.prepare(query).bind(...scopeClause.binds, ...extraBinds, limit).all();
    return c.json({ rows: results });
  }

  if (tab === "da-xu-ly") {
    const query = `
      SELECT v.*, c.khach_hang, c.khu_vuc
      FROM vi_pham v
      INNER JOIN case_dvbh c ON c.id = v.case_id
      WHERE (v.ket_qua_cap_1 = 'Khong loi' OR v.chot_bo_cap_2 IS NOT NULL)${scopeClause.sql}${extraFilter}
      ORDER BY v.ngay_ghi_nhan DESC
      LIMIT ?
    `;
    const { results } = await c.env.DB.prepare(query).bind(...scopeClause.binds, ...extraBinds, limit).all();
    return c.json({ rows: results });
  }

  return c.json({ error: "INVALID_TAB" }, 400);
});

// GET /api/survey/counts?khu_vuc=&tuoi_tu=&tuoi_den= - so ca (khong phai so dong vi_pham) cho ca 4 tab, dung cho hien thi "(N)" tren Tabs
survey.get("/counts", async (c) => {
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const ageClause = ageFilterClause("c.thoi_gian_cskh_tiep_nhan", c.req.query("tuoi_tu"), c.req.query("tuoi_den"));
  const extraFilter = khuVucClause.sql + ageClause.sql;
  const extraBinds = [...khuVucClause.binds, ...ageClause.binds];

  const canKhaoSatQuery = `
    SELECT COUNT(*) as n FROM case_dvbh c
    WHERE c.archived_at IS NULL AND ${RECENT_OR_OPEN_CONDITION} AND ${NEED_SURVEY_CONDITION}${scopeClause.sql}${extraFilter}
  `;
  const quaHanKhaoSatQuery = `
    SELECT COUNT(*) as n FROM case_dvbh c
    WHERE c.archived_at IS NULL AND ${OVERDUE_SURVEY_CONDITION} AND ${NEED_SURVEY_CONDITION}${scopeClause.sql}${extraFilter}
  `;
  const choQcQuery = `
    SELECT COUNT(DISTINCT v.case_id) as n FROM vi_pham v INNER JOIN case_dvbh c ON c.id = v.case_id
    WHERE v.ket_qua_cap_1 IS NOT NULL AND v.ket_qua_cap_1 != 'Khong loi' AND v.chot_bo_cap_2 IS NULL${scopeClause.sql}${extraFilter}
  `;
  const daXuLyQuery = `
    SELECT COUNT(DISTINCT v.case_id) as n FROM vi_pham v INNER JOIN case_dvbh c ON c.id = v.case_id
    WHERE (v.ket_qua_cap_1 = 'Khong loi' OR v.chot_bo_cap_2 IS NOT NULL)${scopeClause.sql}${extraFilter}
  `;

  const [canKhaoSat, quaHanKhaoSat, choQc, daXuLy] = await Promise.all([
    c.env.DB.prepare(canKhaoSatQuery).bind(...scopeClause.binds, ...extraBinds).first<{ n: number }>(),
    c.env.DB.prepare(quaHanKhaoSatQuery).bind(...scopeClause.binds, ...extraBinds).first<{ n: number }>(),
    c.env.DB.prepare(choQcQuery).bind(...scopeClause.binds, ...extraBinds).first<{ n: number }>(),
    c.env.DB.prepare(daXuLyQuery).bind(...scopeClause.binds, ...extraBinds).first<{ n: number }>(),
  ]);

  return c.json({
    "can-khao-sat": canKhaoSat?.n ?? 0,
    "qua-han-khao-sat": quaHanKhaoSat?.n ?? 0,
    "cho-qc": choQc?.n ?? 0,
    "da-xu-ly": daXuLy?.n ?? 0,
  });
});

// GET /api/survey/by-khu-vuc?khu_vuc= - bao cao khao sat theo khu vuc: so ca can/qua han khao
// sat, cho QC, da xu ly (khong ap dung tuoi_tu/tuoi_den - bang nay luon hien tong quan, giong
// quy uoc o /cases/backlog-by-khu-vuc va /missing-parts/by-khu-vuc).
survey.get("/by-khu-vuc", async (c) => {
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));

  const canKhaoSatQuery = `
    SELECT c.khu_vuc as khu_vuc, COUNT(*) as n FROM case_dvbh c
    WHERE c.archived_at IS NULL AND ${RECENT_OR_OPEN_CONDITION} AND ${NEED_SURVEY_CONDITION} AND c.khu_vuc IS NOT NULL${scopeClause.sql}${khuVucClause.sql}
    GROUP BY c.khu_vuc
  `;
  const quaHanKhaoSatQuery = `
    SELECT c.khu_vuc as khu_vuc, COUNT(*) as n FROM case_dvbh c
    WHERE c.archived_at IS NULL AND ${OVERDUE_SURVEY_CONDITION} AND ${NEED_SURVEY_CONDITION} AND c.khu_vuc IS NOT NULL${scopeClause.sql}${khuVucClause.sql}
    GROUP BY c.khu_vuc
  `;
  const choQcQuery = `
    SELECT c.khu_vuc as khu_vuc, COUNT(DISTINCT v.case_id) as n FROM vi_pham v INNER JOIN case_dvbh c ON c.id = v.case_id
    WHERE v.ket_qua_cap_1 IS NOT NULL AND v.ket_qua_cap_1 != 'Khong loi' AND v.chot_bo_cap_2 IS NULL AND c.khu_vuc IS NOT NULL${scopeClause.sql}${khuVucClause.sql}
    GROUP BY c.khu_vuc
  `;
  const daXuLyQuery = `
    SELECT c.khu_vuc as khu_vuc, COUNT(DISTINCT v.case_id) as n FROM vi_pham v INNER JOIN case_dvbh c ON c.id = v.case_id
    WHERE (v.ket_qua_cap_1 = 'Khong loi' OR v.chot_bo_cap_2 IS NOT NULL) AND c.khu_vuc IS NOT NULL${scopeClause.sql}${khuVucClause.sql}
    GROUP BY c.khu_vuc
  `;

  const [canKhaoSat, quaHanKhaoSat, choQc, daXuLy] = await Promise.all([
    c.env.DB.prepare(canKhaoSatQuery).bind(...scopeClause.binds, ...khuVucClause.binds).all<{ khu_vuc: string; n: number }>(),
    c.env.DB.prepare(quaHanKhaoSatQuery).bind(...scopeClause.binds, ...khuVucClause.binds).all<{ khu_vuc: string; n: number }>(),
    c.env.DB.prepare(choQcQuery).bind(...scopeClause.binds, ...khuVucClause.binds).all<{ khu_vuc: string; n: number }>(),
    c.env.DB.prepare(daXuLyQuery).bind(...scopeClause.binds, ...khuVucClause.binds).all<{ khu_vuc: string; n: number }>(),
  ]);

  interface Row {
    khu_vuc: string;
    can_khao_sat: number;
    qua_han_khao_sat: number;
    cho_qc: number;
    da_xu_ly: number;
  }
  const map = new Map<string, Row>();
  const ensure = (khuVuc: string): Row => {
    let row = map.get(khuVuc);
    if (!row) {
      row = { khu_vuc: khuVuc, can_khao_sat: 0, qua_han_khao_sat: 0, cho_qc: 0, da_xu_ly: 0 };
      map.set(khuVuc, row);
    }
    return row;
  };
  for (const r of canKhaoSat.results) ensure(r.khu_vuc).can_khao_sat = r.n;
  for (const r of quaHanKhaoSat.results) ensure(r.khu_vuc).qua_han_khao_sat = r.n;
  for (const r of choQc.results) ensure(r.khu_vuc).cho_qc = r.n;
  for (const r of daXuLy.results) ensure(r.khu_vuc).da_xu_ly = r.n;

  const rows = Array.from(map.values()).sort((a, b) => b.can_khao_sat + b.qua_han_khao_sat - (a.can_khao_sat + a.qua_han_khao_sat));
  return c.json({ rows });
});

// GET /api/survey/trend?days=30 - xu huong so cuoc goi khao sat theo ngay
survey.get("/trend", async (c) => {
  const days = Math.min(90, Math.max(1, Number(c.req.query("days") ?? 30)));
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");

  const { results } = await c.env.DB.prepare(
    `SELECT date(k.ngay_gio_thuc_hien) as ngay, COUNT(*) as so_cuoc_goi
     FROM ket_qua_goi k INNER JOIN case_dvbh c ON c.id = k.case_id
     WHERE k.ngay_gio_thuc_hien IS NOT NULL AND date(k.ngay_gio_thuc_hien) >= date('now', ?)${scopeClause.sql}
     GROUP BY ngay
     ORDER BY ngay ASC`,
  )
    .bind(`-${days} days`, ...scopeClause.binds)
    .all();

  return c.json({ rows: results });
});

// POST /api/survey/calls
survey.post(
  "/calls",
  requireRole("CSKH", "TN CSKH", "TBP CSKH", "Admin"),
  async (c) => {
    const body = await c.req.json<{
      case_id: string;
      doi_tuong_lien_he?: string;
      ket_qua_cuoc_goi?: string;
      ghi_chu?: string;
      ly_do_that_bai?: string;
      can_goi_lai?: boolean;
      results: { loai_loi: LoaiLoi; ket_luan: "loi" | "khong_loi"; ket_qua_cap_1?: string }[];
    }>();

    // results rong duoc chap nhan khi la log 1 cuoc goi khong thanh cong (khong nghe may, sai so...) -
    // chi ghi lai ket_qua_goi (co can_goi_lai) de goi lai sau, khong ket luan vi pham nao ca.
    if (!body.case_id || !Array.isArray(body.results) || (body.results.length === 0 && body.can_goi_lai === undefined)) {
      return c.json({ error: "INVALID_BODY" }, 400);
    }

    const caseRow = await c.env.DB.prepare("SELECT id FROM case_dvbh WHERE id = ?").bind(body.case_id).first();
    if (!caseRow) return c.json({ error: "NOT_FOUND" }, 404);

    const user = c.get("user");
    const ketQuaGoiId = await nextSequentialId(c.env.DB, "ket_qua_goi", "CG", 6);

    await c.env.DB.prepare(
      `INSERT INTO ket_qua_goi (id, case_id, loai_khao_sat, doi_tuong_lien_he, ket_qua_cuoc_goi, ghi_chu, ly_do_that_bai, can_goi_lai, nguoi_thuc_hien)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        ketQuaGoiId,
        body.case_id,
        toJsonArray(body.results.map((r) => r.loai_loi)),
        body.doi_tuong_lien_he ?? null,
        body.ket_qua_cuoc_goi ?? null,
        body.ghi_chu ?? null,
        body.ly_do_that_bai ?? null,
        body.can_goi_lai === undefined ? null : body.can_goi_lai ? 1 : 0,
        user.email,
      )
      .run();

    const statements: D1PreparedStatement[] = [];
    for (const r of body.results) {
      const viPhamId = await nextSequentialId(c.env.DB, "vi_pham", "L", 6);
      const ketQuaCap1 = r.ket_luan === "loi" ? r.ket_qua_cap_1 ?? "Loi khac" : "Khong loi";
      statements.push(
        c.env.DB.prepare(
          // ON CONFLICT: neu da co nguoi khac ghi nhan cung (case_id, loai_loi) truoc (rang buoc UNIQUE
          // chan race 2 CSKH cung khao sat 1 luc), bo qua dong nay thay vi loi ca request
          `INSERT INTO vi_pham (id, ket_qua_goi_id, case_id, loai_loi, ket_qua_cap_1, nguoi_ghi_nhan)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(case_id, loai_loi) DO NOTHING`,
        ).bind(viPhamId, ketQuaGoiId, body.case_id, r.loai_loi, ketQuaCap1, user.email),
      );
    }
    const batchResults = statements.length > 0 ? await c.env.DB.batch(statements) : [];

    const daGhiNhan: LoaiLoi[] = [];
    const boQua: LoaiLoi[] = [];
    body.results.forEach((r, i) => {
      (batchResults[i]?.meta.changes ? daGhiNhan : boQua).push(r.loai_loi);
    });

    return c.json({ id: ketQuaGoiId, daGhiNhan, boQua }, 201);
  },
);

// POST /api/survey/assign
survey.post(
  "/assign",
  requireRole("TN CSKH", "TBP CSKH", "Admin"),
  async (c) => {
    const body = await c.req.json<{ case_id: string; assigned_to: string | null }>();
    if (!body.case_id) return c.json({ error: "INVALID_BODY" }, 400);

    const caseRow = await c.env.DB.prepare("SELECT id, khu_vuc FROM case_dvbh WHERE id = ?").bind(body.case_id).first<{ id: string; khu_vuc: string | null }>();
    if (!caseRow) return c.json({ error: "NOT_FOUND" }, 404);

    // Mirror cach GET /cases/:id chan xem ca ngoai pham vi - nguoi phan cong (TN CSKH) bi gioi
    // han khu vuc khong duoc gan ca ngoai khu vuc phu trach cua minh.
    const scope = scopeByKhuVuc(c);
    if (scope !== null && !scope.includes(String(caseRow.khu_vuc))) {
      return c.json({ error: "FORBIDDEN_KHU_VUC" }, 403);
    }

    if (body.assigned_to) {
      const validCskh = await loadValidCskhEmails(c.env.DB);
      if (!validCskh.has(body.assigned_to)) {
        return c.json({ error: "INVALID_ASSIGNED_TO" }, 400);
      }
    }

    await c.env.DB.prepare("UPDATE case_dvbh SET assigned_to = ? WHERE id = ?")
      .bind(body.assigned_to ?? null, body.case_id)
      .run();

    return c.json({ ok: true });
  },
);

interface BulkAssignRow {
  id?: string;
  assigned_to?: string;
}

async function loadValidCskhEmails(db: D1Database): Promise<Set<string>> {
  const { results } = await db
    .prepare("SELECT email FROM users WHERE vai_tro = 'CSKH' AND trang_thai_duyet = 'Da duyet'")
    .all<{ email: string }>();
  return new Set(results.map((r) => r.email));
}

async function processBulkAssign(db: D1Database, rows: BulkAssignRow[], commit: boolean) {
  const summary = { capNhat: 0, loi: 0, errors: [] as string[] };
  // File Excel/CSV do nguoi dung tai len: SheetJS tra ve cell toan chu so (vd case_id "1014874")
  // dang kieu number chu khong phai string - phai ep String() truoc .trim(), neu khong se
  // nem TypeError va lam sap ca request.
  const caseIds = rows.map((r) => String(r.id ?? "").trim());
  const [existingCaseIds, validCskh] = await Promise.all([findExistingCaseIds(db, caseIds), loadValidCskhEmails(db)]);

  const validRows: { id: string; assignedTo: string | null }[] = [];
  rows.forEach((row, i) => {
    const id = String(row.id ?? "").trim();
    if (!id) return; // dong trong (thuong do file co dong cuoi rong) - bo qua tham lang, khong tinh loi
    if (!existingCaseIds.has(id)) {
      summary.loi++;
      summary.errors.push(`Dong ${i + 2}: khong tim thay case_id "${id}"`);
      return;
    }
    const assignedRaw = String(row.assigned_to ?? "").trim();
    if (assignedRaw && !validCskh.has(assignedRaw)) {
      summary.loi++;
      summary.errors.push(`Dong ${i + 2}: "${assignedRaw}" khong phai email CSKH da duyet`);
      return;
    }
    validRows.push({ id, assignedTo: assignedRaw || null });
  });

  summary.capNhat = validRows.length;

  if (commit && validRows.length > 0) {
    const statements = validRows.map(({ id, assignedTo }) =>
      db.prepare("UPDATE case_dvbh SET assigned_to = ? WHERE id = ?").bind(assignedTo, id),
    );
    await runBatched(db, statements);
  }

  return summary;
}

// POST /api/survey/assign-bulk/preview - import lai file da tai xuong (co cot assigned_to duoc dien) de gan CSKH hang loat
survey.post("/assign-bulk/preview", requireRole("TN CSKH", "TBP CSKH", "Admin"), async (c) => {
  const body = await c.req.json<{ rows: BulkAssignRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processBulkAssign(c.env.DB, body.rows, false);
  return c.json(summary);
});

// POST /api/survey/assign-bulk/commit
survey.post("/assign-bulk/commit", requireRole("TN CSKH", "TBP CSKH", "Admin"), async (c) => {
  const body = await c.req.json<{ rows: BulkAssignRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const summary = await processBulkAssign(c.env.DB, body.rows, true);
  return c.json(summary);
});

export default survey;
