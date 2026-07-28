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
import { bumpVersions } from "../lib/dataVersions";
import { cachedReport, buildReportKey } from "../lib/reportCache";
import { nowVN } from "../lib/vnTime";
import { getSurveySnapshotManifest, getSurveySnapshotContent, getViPhamExistingLoaiLoi, SURVEY_SNAPSHOT_KEY } from "../lib/surveySnapshot";
import { checkAndConsumeDownloadQuota } from "../lib/r2DownloadRateLimit";

// Domain phu thuoc chung cho ca 3 bao cao /counts, /by-khu-vuc, /trend (xem bang R6 trong
// YEU_CAU_BAO_CAO_TINH_SAN.md - ap dung dong nhat, don gian hon tach rieng tung endpoint).
const SURVEY_REPORT_DOMAINS = ["cases", "vi_pham", "ket_qua_goi"] as const;

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

// GET /api/survey/candidates-manifest - hash + so dong cua snapshot R2 "ung vien khao sat" (xem
// lib/surveySnapshot.ts, khong dung R2, khong rate-limit) + trang thai "da co dong vi_pham" theo
// case_id (de client tu tinh lai NEED_SURVEY_CONDITION) + assigned_to (bang case_dvbh nho, doc
// song vi doi ngoai luc import - xem routes/survey.ts POST /assign).
survey.get("/candidates-manifest", async (c) => {
  const manifest = await getSurveySnapshotManifest(c.env.DB);
  const viPhamExistingLoaiLoi = await getViPhamExistingLoaiLoi(c.env.DB);
  // assigned_to doi ngoai luc import (POST /assign, /assign-bulk/commit - khong bump domain
  // "cases") nen KHONG the nam trong snapshot bat bien - doc song, bang case_dvbh da gioi han
  // "archived_at IS NULL" nen re (~vai nghin dong).
  const { results: assignedRows } = await c.env.DB.prepare(
    "SELECT id, assigned_to FROM case_dvbh WHERE archived_at IS NULL AND assigned_to IS NOT NULL",
  ).all<{ id: string; assigned_to: string }>();
  const assignedTo: Record<string, string> = {};
  for (const r of assignedRows) assignedTo[r.id] = r.assigned_to;

  return c.json({ hash: manifest?.hash ?? null, rowCount: manifest?.rowCount ?? 0, viPhamExistingLoaiLoi, assignedTo });
});

// POST /api/survey/candidates-content - doc noi dung file R2 (rate-limit theo file, dung chung co
// che voi lib/r2DownloadRateLimit.ts), loc theo scope (khu_vuc_phu_trach) TRUOC KHI tra ve.
survey.post("/candidates-content", async (c) => {
  const scope = scopeByKhuVuc(c);
  const user = c.get("user");

  const quota = await checkAndConsumeDownloadQuota(c.env.DB, user.email, SURVEY_SNAPSHOT_KEY);
  if (!quota.allowed) return c.json({ throttled: true, retryAfterSeconds: quota.retryAfterSeconds ?? 60 });

  const rows = await getSurveySnapshotContent(c.env);
  const filtered = scope === null ? rows : rows.filter((row) => scope.length > 0 && typeof row.khu_vuc === "string" && scope.includes(row.khu_vuc as string));
  return c.json({ throttled: false, rows: filtered });
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

  // "can-khao-sat"/"qua-han-khao-sat" da tach thanh /candidates-manifest + /candidates-content
  // (snapshot R2 1 file, xem lib/surveySnapshot.ts) - khong con query song o day.
  if (tab === "can-khao-sat" || tab === "qua-han-khao-sat") return c.json({ error: "DEPRECATED_USE_MANIFEST_ENDPOINT" }, 410);

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

export interface SurveyCountsParams {
  khu_vuc?: string;
  tuoi_tu?: string;
  tuoi_den?: string;
  // Index signature bat buoc de truyen truc tiep vao buildReportKey() (Record<string, string |
  // undefined>) - xem lib/reportCache.ts.
  [key: string]: string | undefined;
}

// Tach rieng phan tinh toan cua /counts - dung chung cho compute-on-miss va warm-up (R7).
export async function computeSurveyCounts(db: D1Database, params: SurveyCountsParams, scope: string[] | null) {
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", params.khu_vuc);
  const ageClause = ageFilterClause("c.thoi_gian_cskh_tiep_nhan", params.tuoi_tu, params.tuoi_den);
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
    db.prepare(canKhaoSatQuery).bind(...scopeClause.binds, ...extraBinds).first<{ n: number }>(),
    db.prepare(quaHanKhaoSatQuery).bind(...scopeClause.binds, ...extraBinds).first<{ n: number }>(),
    db.prepare(choQcQuery).bind(...scopeClause.binds, ...extraBinds).first<{ n: number }>(),
    db.prepare(daXuLyQuery).bind(...scopeClause.binds, ...extraBinds).first<{ n: number }>(),
  ]);

  return {
    "can-khao-sat": canKhaoSat?.n ?? 0,
    "qua-han-khao-sat": quaHanKhaoSat?.n ?? 0,
    "cho-qc": choQc?.n ?? 0,
    "da-xu-ly": daXuLy?.n ?? 0,
  };
}

// GET /api/survey/counts?khu_vuc=&tuoi_tu=&tuoi_den= - so ca (khong phai so dong vi_pham) cho ca 4
// tab, dung cho hien thi "(N)" tren Tabs. Doc qua reportCache (xem lib/reportCache.ts).
survey.get("/counts", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params: SurveyCountsParams = { khu_vuc: c.req.query("khu_vuc"), tuoi_tu: c.req.query("tuoi_tu"), tuoi_den: c.req.query("tuoi_den") };
  const key = buildReportKey("survey/counts", params, scope);
  const payload = await cachedReport(c.env.DB, key, [...SURVEY_REPORT_DOMAINS], () => computeSurveyCounts(c.env.DB, params, scope));
  return c.json(payload);
});

// GET /api/survey/by-khu-vuc?khu_vuc= - bao cao khao sat theo khu vuc: so ca can/qua han khao
// sat, cho QC, da xu ly (khong ap dung tuoi_tu/tuoi_den - bang nay luon hien tong quan, giong
// quy uoc o /cases/backlog-by-khu-vuc va /missing-parts/by-khu-vuc).
export interface SurveyByKhuVucParams {
  khu_vuc?: string;
  // Index signature bat buoc de truyen truc tiep vao buildReportKey() (Record<string, string |
  // undefined>) - xem lib/reportCache.ts.
  [key: string]: string | undefined;
}

// Tach rieng phan tinh toan cua /by-khu-vuc - dung chung cho compute-on-miss va warm-up (R7).
export async function computeSurveyByKhuVuc(db: D1Database, params: SurveyByKhuVucParams, scope: string[] | null) {
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", params.khu_vuc);

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
    db.prepare(canKhaoSatQuery).bind(...scopeClause.binds, ...khuVucClause.binds).all<{ khu_vuc: string; n: number }>(),
    db.prepare(quaHanKhaoSatQuery).bind(...scopeClause.binds, ...khuVucClause.binds).all<{ khu_vuc: string; n: number }>(),
    db.prepare(choQcQuery).bind(...scopeClause.binds, ...khuVucClause.binds).all<{ khu_vuc: string; n: number }>(),
    db.prepare(daXuLyQuery).bind(...scopeClause.binds, ...khuVucClause.binds).all<{ khu_vuc: string; n: number }>(),
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
  return { rows };
}

// GET /api/survey/by-khu-vuc?khu_vuc= - doc qua reportCache (xem lib/reportCache.ts).
survey.get("/by-khu-vuc", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params: SurveyByKhuVucParams = { khu_vuc: c.req.query("khu_vuc") };
  const key = buildReportKey("survey/by-khu-vuc", params, scope);
  const payload = await cachedReport(c.env.DB, key, [...SURVEY_REPORT_DOMAINS], () => computeSurveyByKhuVuc(c.env.DB, params, scope));
  return c.json(payload);
});

export interface SurveyTrendParams {
  days?: string;
  // Index signature bat buoc de truyen truc tiep vao buildReportKey() (Record<string, string |
  // undefined>) - xem lib/reportCache.ts.
  [key: string]: string | undefined;
}

// Tach rieng phan tinh toan cua /trend - dung chung cho compute-on-miss va warm-up (R7).
export async function computeSurveyTrend(db: D1Database, params: SurveyTrendParams, scope: string[] | null) {
  const days = Math.min(90, Math.max(1, Number(params.days ?? 30)));
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");

  const { results } = await db.prepare(
    `SELECT date(k.ngay_gio_thuc_hien) as ngay, COUNT(*) as so_cuoc_goi
     FROM ket_qua_goi k INNER JOIN case_dvbh c ON c.id = k.case_id
     WHERE k.ngay_gio_thuc_hien IS NOT NULL AND date(k.ngay_gio_thuc_hien) >= date('now', ?)${scopeClause.sql}
     GROUP BY ngay
     ORDER BY ngay ASC`,
  )
    .bind(`-${days} days`, ...scopeClause.binds)
    .all();

  return { rows: results };
}

// GET /api/survey/trend?days=30 - xu huong so cuoc goi khao sat theo ngay. Doc qua reportCache,
// "days" nam trong cache key.
survey.get("/trend", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params: SurveyTrendParams = { days: c.req.query("days") };
  const key = buildReportKey("survey/trend", params, scope);
  const payload = await cachedReport(c.env.DB, key, [...SURVEY_REPORT_DOMAINS], () => computeSurveyTrend(c.env.DB, params, scope));
  return c.json(payload);
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
      `INSERT INTO ket_qua_goi (id, case_id, loai_khao_sat, doi_tuong_lien_he, ket_qua_cuoc_goi, ghi_chu, ly_do_that_bai, can_goi_lai, nguoi_thuc_hien, ngay_gio_thuc_hien)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        nowVN(),
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
          `INSERT INTO vi_pham (id, ket_qua_goi_id, case_id, loai_loi, ket_qua_cap_1, nguoi_ghi_nhan, ngay_ghi_nhan)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(case_id, loai_loi) DO NOTHING`,
        ).bind(viPhamId, ketQuaGoiId, body.case_id, r.loai_loi, ketQuaCap1, user.email, nowVN()),
      );
    }
    const batchResults = statements.length > 0 ? await c.env.DB.batch(statements) : [];

    const daGhiNhan: LoaiLoi[] = [];
    const boQua: LoaiLoi[] = [];
    body.results.forEach((r, i) => {
      (batchResults[i]?.meta.changes ? daGhiNhan : boQua).push(r.loai_loi);
    });

    // Bump ca "vi_pham" va "ket_qua_goi" - ket_qua_goi luon co dong moi (INSERT tren), vi_pham co
    // the co hoac khong tuy ON CONFLICT DO NOTHING nhung bump ca 2 cho don gian (xem lib/dataVersions.ts).
    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["vi_pham", "ket_qua_goi"]));

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

    // assigned_to KHONG anh huong bao cao tinh san nao (khong bump domain "cases" - xem R8 trong
    // YEU_CAU_BAO_CAO_TINH_SAN.md va comment o lib/dataVersions.ts).

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
    // assigned_to KHONG anh huong bao cao tinh san nao (khong bump domain "cases" - xem R8 trong
    // YEU_CAU_BAO_CAO_TINH_SAN.md va comment o lib/dataVersions.ts).
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
