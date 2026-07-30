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
import { khuVucAdHocClause, REPORT_DIMS, dimAdHocClause } from "../lib/filterParams";
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

// GET /api/survey?tab=can-khao-sat|cho-qc|da-xu-ly&khu_vuc=&tuoi_tu=&tuoi_den=&tinh=&quan_huyen=&ky_thuat_vien=
survey.get("/", async (c) => {
  const tab = c.req.query("tab") ?? "can-khao-sat";
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const ageClause = ageFilterClause("c.thoi_gian_cskh_tiep_nhan", c.req.query("tuoi_tu"), c.req.query("tuoi_den"));
  // 3 bo loc them cho drill-down tu Bao cao khao sat theo khu vuc (Phan C) - quan_huyen chi ap
  // dung khi da chon 1 tinh cu the, giong quy uoc o computeSurveyKhuVucReport.
  const tinhClause = dimAdHocClause("c.tinh", "tinh", c.req.query("tinh"));
  const quanHuyenSql = c.req.query("tinh") && c.req.query("quan_huyen") ? " AND c.quan_huyen = ?" : "";
  const quanHuyenBinds = c.req.query("tinh") && c.req.query("quan_huyen") ? [c.req.query("quan_huyen")] : [];
  const ktv = c.req.query("ky_thuat_vien");
  const ktvSql = ktv ? " AND c.ky_thuat_vien = ?" : "";
  const ktvBinds = ktv ? [ktv] : [];
  const extraFilter = khuVucClause.sql + ageClause.sql + tinhClause.sql + quanHuyenSql + ktvSql;
  const extraBinds = [...khuVucClause.binds, ...ageClause.binds, ...tinhClause.binds, ...quanHuyenBinds, ...ktvBinds];
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

// ---------- Bao cao khao sat theo khu vuc (Phan C, xem SRS/plan) ----------

// Whitelist "nhom theo" RIENG cho bao cao nay - KHONG them vao REPORT_DIMS dung chung o
// filterParams.ts vi se anh huong pham vi ca cases.ts/missingParts.ts/napGas.ts (cac endpoint
// khac dang dung REPORT_DIMS). "quan_huyen" chi co y nghia khi da loc theo 1 tinh cu the (xem
// quanHuyenClause ben duoi); "ky_thuat_vien" la cot thuan tren case_dvbh, chua tung dung de
// nhom/loc o dau khac.
const SURVEY_REPORT_DIMS: Record<string, string> = {
  khu_vuc: "khu_vuc",
  tinh: "tinh",
  quan_huyen: "quan_huyen",
  ky_thuat_vien: "ky_thuat_vien",
};

// KHONG them gio "00:00:00" vao bound - xem giai thich chi tiet o monthBounds() trong cases.ts
// (mot so ca co thoi_gian_hoan_thanh/thoi_gian_cskh_tiep_nhan chi la ngay thuan, so sanh chuoi
// voi bound co gio se sai).
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

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

// Doc tat ca dim con lai TRU khu_vuc/tinh (2 dim da co rieng khuVucAdHocClause/dimAdHocClause ben
// duoi) tu REPORT_DIMS dung chung - dong nhat voi sharedReportFiltersFromParams trong cases.ts.
function extraDimFiltersFromParams(params: Record<string, string | undefined>): { sql: string; binds: unknown[] } {
  let sql = "";
  const binds: unknown[] = [];
  for (const [dimKey, col] of Object.entries(REPORT_DIMS)) {
    if (dimKey === "khu_vuc" || dimKey === "tinh") continue;
    const value = params[dimKey];
    if (value) {
      sql += ` AND c.${col} = ?`;
      binds.push(value);
    }
  }
  return { sql, binds };
}

export interface SurveyKhuVucParams {
  dim?: string;
  thang?: string;
  khu_vuc?: string;
  tinh?: string;
  quan_huyen?: string;
  ky_thuat_vien?: string;
  nguoi_khao_sat?: string;
  // Index signature bat buoc de truyen truc tiep vao buildReportKey() - xem lib/reportCache.ts.
  [key: string]: string | undefined;
}

interface SurveyKhuVucRow {
  nhom: string;
  tong_tiep_nhan: number;
  tong_hoan_thanh: number;
  nghi_ngo_120p: number;
  nghi_ngo_24h: number;
  nghi_ngo_lkh: number;
  nghi_ngo_hl: number;
  da_goi_120p: number;
  da_goi_24h: number;
  da_goi_lkh: number;
  da_goi_hl: number;
  vi_pham_120p: number;
  vi_pham_24h: number;
  vi_pham_lkh: number;
  vi_pham_hl: number;
  tong_cuoc_goi: number;
  goi_thanh_cong: number;
  ty_le_nghi_ngo_120p: number;
  ty_le_nghi_ngo_24h: number;
  ty_le_nghi_ngo_lkh: number;
  ty_le_nghi_ngo_hl: number;
  ty_le_vi_pham_120p: number;
  ty_le_vi_pham_24h: number;
  ty_le_vi_pham_lkh: number;
  ty_le_vi_pham_hl: number;
  ty_le_da_goi_120p: number;
  ty_le_da_goi_24h: number;
  ty_le_da_goi_lkh: number;
  ty_le_da_goi_hl: number;
  ty_le_vi_pham_tren_da_goi_120p: number;
  ty_le_vi_pham_tren_da_goi_24h: number;
  ty_le_vi_pham_tren_da_goi_lkh: number;
  ty_le_vi_pham_tren_da_goi_hl: number;
  ty_le_da_goi_hen_lai_toan_he_thong: number;
  ty_le_ktv_chu_dong_toan_he_thong: number;
  ty_le_goi_thanh_cong: number;
}

// Tach rieng phan tinh toan cua /bao-cao-khu-vuc - dung chung cho compute-on-miss va warm-up (R7).
// 4 khoi query doc lap (khong join qua nhieu bang trong 1 cau) merge theo "nhom" bang Map, giong
// pattern R9.2 o cases.ts computeBacklogByKhuVuc - moi khoi la 1 muc dich khac nhau, gop lai de doc
// va toi uu (D1 tinh rows_read theo so dong QUET, tach khoi khong lam tang tong so dong quet).
export async function computeSurveyKhuVucReport(db: D1Database, params: SurveyKhuVucParams, scope: string[] | null) {
  const dimColRaw = SURVEY_REPORT_DIMS[params.dim ?? "khu_vuc"] ?? "khu_vuc";
  const dimCol = `c.${dimColRaw}`;
  const thang = params.thang || new Date().toISOString().slice(0, 7);
  const { start, end } = monthBounds(thang);

  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", params.khu_vuc);
  const tinhClause = dimAdHocClause("c.tinh", "tinh", params.tinh);
  // quan_huyen chi ap dung khi da chon 1 tinh cu the (tranh loc mo ho - nhieu tinh co the trung ten
  // huyen, vd "Thanh pho" o nhieu tinh khac nhau).
  const quanHuyenSql = params.tinh && params.quan_huyen ? " AND c.quan_huyen = ?" : "";
  const quanHuyenBinds = params.tinh && params.quan_huyen ? [params.quan_huyen] : [];
  const ktvSql = params.ky_thuat_vien ? " AND c.ky_thuat_vien = ?" : "";
  const ktvBinds = params.ky_thuat_vien ? [params.ky_thuat_vien] : [];
  const extraClause = extraDimFiltersFromParams(params);

  const commonFilterSql = `${scopeClause.sql}${khuVucClause.sql}${tinhClause.sql}${quanHuyenSql}${ktvSql}${extraClause.sql}`;
  const commonFilterBinds = [...scopeClause.binds, ...khuVucClause.binds, ...tinhClause.binds, ...quanHuyenBinds, ...ktvBinds, ...extraClause.binds];

  // Khoi 1: tiep nhan trong thang (thoi_gian_cskh_tiep_nhan, dung duoc idx_case_thoi_gian_tiep_nhan)
  // + so nghi ngo tung loai.
  const khoi1 = db
    .prepare(
      `SELECT ${dimCol} as nhom,
         COUNT(*) as tong_tiep_nhan,
         SUM(CASE WHEN c.loi_120p=1 THEN 1 ELSE 0 END) as nghi_ngo_120p,
         SUM(CASE WHEN c.loi_qua_han_24h=1 THEN 1 ELSE 0 END) as nghi_ngo_24h,
         SUM(CASE WHEN c.loi_lo_ke_hoach=1 THEN 1 ELSE 0 END) as nghi_ngo_lkh,
         SUM(CASE WHEN c.loi_kh_hen_lai=1 THEN 1 ELSE 0 END) as nghi_ngo_hl
       FROM case_dvbh c
       WHERE c.archived_at IS NULL AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ? AND ${dimCol} IS NOT NULL${commonFilterSql}
       GROUP BY ${dimCol}`,
    )
    .bind(start, end, ...commonFilterBinds)
    .all<{ nhom: string; tong_tiep_nhan: number; nghi_ngo_120p: number; nghi_ngo_24h: number; nghi_ngo_lkh: number; nghi_ngo_hl: number }>();

  // Khoi 2: hoan thanh trong thang (thoi_gian_hoan_thanh, khac cot voi khoi 1).
  const khoi2 = db
    .prepare(
      `SELECT ${dimCol} as nhom, COUNT(*) as tong_hoan_thanh
       FROM case_dvbh c
       WHERE c.archived_at IS NULL AND c.thoi_gian_hoan_thanh >= ? AND c.thoi_gian_hoan_thanh < ? AND ${dimCol} IS NOT NULL${commonFilterSql}
       GROUP BY ${dimCol}`,
    )
    .bind(start, end, ...commonFilterBinds)
    .all<{ nhom: string; tong_hoan_thanh: number }>();

  // Khoi 3: da goi + vi pham da xac nhan tung loai, JOIN vi_pham 4 lan (1 lan/loai_loi). Neu co loc
  // "nguoi_khao_sat" (CSKH khao sat), dieu kien nam trong ON cua JOIN chu KHONG phai WHERE - de mau
  // so (tong_tiep_nhan/nghi_ngo o khoi 1) khong bi thu hep theo nguoi khao sat, chi tu so (da_goi/
  // vi_pham) bi gioi han dung nguoi da khao sat. "Vi pham da xac nhan" dung dung bieu thuc
  // XAC_NHAN_EXPR o routes/viPham.ts/dashboard.ts: QC da chot la vi pham, hoac chua QC xet nhung
  // CSKH da ket luan loi cap 1.
  const nguoiKhaoSatJoinSql = params.nguoi_khao_sat ? " AND %ALIAS%.nguoi_ghi_nhan = ?" : "";
  const xacNhanExpr = (alias: string) => `COALESCE(${alias}.chot_bo_cap_2, CASE WHEN ${alias}.ket_qua_cap_1 != 'Khong loi' THEN 1 ELSE 0 END) = 1`;
  const khoi3JoinBinds = params.nguoi_khao_sat ? [params.nguoi_khao_sat, params.nguoi_khao_sat, params.nguoi_khao_sat, params.nguoi_khao_sat] : [];
  const khoi3 = db
    .prepare(
      `SELECT ${dimCol} as nhom,
         SUM(CASE WHEN c.loi_120p=1 AND v120.id IS NOT NULL THEN 1 ELSE 0 END) as da_goi_120p,
         SUM(CASE WHEN c.loi_120p=1 AND v120.id IS NOT NULL AND ${xacNhanExpr("v120")} THEN 1 ELSE 0 END) as vi_pham_120p,
         SUM(CASE WHEN c.loi_qua_han_24h=1 AND v24h.id IS NOT NULL THEN 1 ELSE 0 END) as da_goi_24h,
         SUM(CASE WHEN c.loi_qua_han_24h=1 AND v24h.id IS NOT NULL AND ${xacNhanExpr("v24h")} THEN 1 ELSE 0 END) as vi_pham_24h,
         SUM(CASE WHEN c.loi_lo_ke_hoach=1 AND vlkh.id IS NOT NULL THEN 1 ELSE 0 END) as da_goi_lkh,
         SUM(CASE WHEN c.loi_lo_ke_hoach=1 AND vlkh.id IS NOT NULL AND ${xacNhanExpr("vlkh")} THEN 1 ELSE 0 END) as vi_pham_lkh,
         SUM(CASE WHEN c.loi_kh_hen_lai=1 AND vhl.id IS NOT NULL THEN 1 ELSE 0 END) as da_goi_hl,
         SUM(CASE WHEN c.loi_kh_hen_lai=1 AND vhl.id IS NOT NULL AND ${xacNhanExpr("vhl")} THEN 1 ELSE 0 END) as vi_pham_hl
       FROM case_dvbh c
       LEFT JOIN vi_pham v120 ON v120.case_id = c.id AND v120.loai_loi = 'Loi 120 phut'${nguoiKhaoSatJoinSql.replace("%ALIAS%", "v120")}
       LEFT JOIN vi_pham v24h ON v24h.case_id = c.id AND v24h.loai_loi = 'Hen qua 24h'${nguoiKhaoSatJoinSql.replace("%ALIAS%", "v24h")}
       LEFT JOIN vi_pham vlkh ON vlkh.case_id = c.id AND vlkh.loai_loi = 'Loi lo ke hoach'${nguoiKhaoSatJoinSql.replace("%ALIAS%", "vlkh")}
       LEFT JOIN vi_pham vhl ON vhl.case_id = c.id AND vhl.loai_loi = 'KH hen lai'${nguoiKhaoSatJoinSql.replace("%ALIAS%", "vhl")}
       WHERE c.archived_at IS NULL AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ? AND ${dimCol} IS NOT NULL${commonFilterSql}
       GROUP BY ${dimCol}`,
    )
    .bind(...khoi3JoinBinds, start, end, ...commonFilterBinds)
    .all<{ nhom: string; da_goi_120p: number; vi_pham_120p: number; da_goi_24h: number; vi_pham_24h: number; da_goi_lkh: number; vi_pham_lkh: number; da_goi_hl: number; vi_pham_hl: number }>();

  // Khoi 4: ty le goi thanh cong - moc thang dung ngay THUC HIEN cuoc goi (k.ngay_gio_thuc_hien),
  // KHAC moc thang cua khoi 1-3 (ngay tiep nhan ca) - da xac nhan voi nguoi dung, vi 1 cuoc goi
  // khao sat co the xay ra o thang sau so voi thang ca duoc tiep nhan.
  const khoi4 = db
    .prepare(
      `SELECT ${dimCol} as nhom,
         COUNT(*) as tong_cuoc_goi,
         SUM(CASE WHEN k.ket_qua_cuoc_goi = 'Liên hệ thành công' THEN 1 ELSE 0 END) as goi_thanh_cong
       FROM ket_qua_goi k
       INNER JOIN case_dvbh c ON c.id = k.case_id
       WHERE k.ngay_gio_thuc_hien >= ? AND k.ngay_gio_thuc_hien < ? AND c.archived_at IS NULL AND ${dimCol} IS NOT NULL${commonFilterSql}${params.nguoi_khao_sat ? " AND k.nguoi_thuc_hien = ?" : ""}
       GROUP BY ${dimCol}`,
    )
    .bind(start, end, ...commonFilterBinds, ...(params.nguoi_khao_sat ? [params.nguoi_khao_sat] : []))
    .all<{ nhom: string; tong_cuoc_goi: number; goi_thanh_cong: number }>();

  const [r1, r2, r3, r4] = await Promise.all([khoi1, khoi2, khoi3, khoi4]);

  const map = new Map<string, SurveyKhuVucRow>();
  const ensure = (nhom: string): SurveyKhuVucRow => {
    let row = map.get(nhom);
    if (!row) {
      row = {
        nhom,
        tong_tiep_nhan: 0,
        tong_hoan_thanh: 0,
        nghi_ngo_120p: 0,
        nghi_ngo_24h: 0,
        nghi_ngo_lkh: 0,
        nghi_ngo_hl: 0,
        da_goi_120p: 0,
        da_goi_24h: 0,
        da_goi_lkh: 0,
        da_goi_hl: 0,
        vi_pham_120p: 0,
        vi_pham_24h: 0,
        vi_pham_lkh: 0,
        vi_pham_hl: 0,
        tong_cuoc_goi: 0,
        goi_thanh_cong: 0,
        ty_le_nghi_ngo_120p: 0,
        ty_le_nghi_ngo_24h: 0,
        ty_le_nghi_ngo_lkh: 0,
        ty_le_nghi_ngo_hl: 0,
        ty_le_vi_pham_120p: 0,
        ty_le_vi_pham_24h: 0,
        ty_le_vi_pham_lkh: 0,
        ty_le_vi_pham_hl: 0,
        ty_le_da_goi_120p: 0,
        ty_le_da_goi_24h: 0,
        ty_le_da_goi_lkh: 0,
        ty_le_da_goi_hl: 0,
        ty_le_vi_pham_tren_da_goi_120p: 0,
        ty_le_vi_pham_tren_da_goi_24h: 0,
        ty_le_vi_pham_tren_da_goi_lkh: 0,
        ty_le_vi_pham_tren_da_goi_hl: 0,
        ty_le_da_goi_hen_lai_toan_he_thong: 0,
        ty_le_ktv_chu_dong_toan_he_thong: 0,
        ty_le_goi_thanh_cong: 0,
      };
      map.set(nhom, row);
    }
    return row;
  };

  for (const r of r1.results) Object.assign(ensure(r.nhom), r);
  for (const r of r2.results) Object.assign(ensure(r.nhom), r);
  for (const r of r3.results) Object.assign(ensure(r.nhom), r);
  for (const r of r4.results) Object.assign(ensure(r.nhom), r);

  for (const row of map.values()) {
    row.ty_le_nghi_ngo_120p = pct(row.nghi_ngo_120p, row.tong_tiep_nhan);
    row.ty_le_nghi_ngo_24h = pct(row.nghi_ngo_24h, row.tong_tiep_nhan);
    row.ty_le_nghi_ngo_lkh = pct(row.nghi_ngo_lkh, row.tong_tiep_nhan);
    row.ty_le_nghi_ngo_hl = pct(row.nghi_ngo_hl, row.tong_tiep_nhan);
    row.ty_le_vi_pham_120p = pct(row.vi_pham_120p, row.tong_tiep_nhan);
    row.ty_le_vi_pham_24h = pct(row.vi_pham_24h, row.tong_tiep_nhan);
    row.ty_le_vi_pham_lkh = pct(row.vi_pham_lkh, row.tong_tiep_nhan);
    row.ty_le_vi_pham_hl = pct(row.vi_pham_hl, row.tong_tiep_nhan);
    row.ty_le_da_goi_120p = pct(row.da_goi_120p, row.tong_tiep_nhan);
    row.ty_le_da_goi_24h = pct(row.da_goi_24h, row.tong_tiep_nhan);
    row.ty_le_da_goi_lkh = pct(row.da_goi_lkh, row.tong_tiep_nhan);
    row.ty_le_da_goi_hl = pct(row.da_goi_hl, row.tong_tiep_nhan);
    row.ty_le_vi_pham_tren_da_goi_120p = pct(row.vi_pham_120p, row.da_goi_120p);
    row.ty_le_vi_pham_tren_da_goi_24h = pct(row.vi_pham_24h, row.da_goi_24h);
    row.ty_le_vi_pham_tren_da_goi_lkh = pct(row.vi_pham_lkh, row.da_goi_lkh);
    row.ty_le_vi_pham_tren_da_goi_hl = pct(row.vi_pham_hl, row.da_goi_hl);
    // Metric 5/6 (da xac nhan voi nguoi dung dung "vi pham 120'" trong ca 2 cong thuc, khong phai
    // "hen lai" du ten chi so nhac den hen lai):
    row.ty_le_da_goi_hen_lai_toan_he_thong = pct(row.tong_tiep_nhan - (row.nghi_ngo_120p - row.da_goi_120p), row.tong_tiep_nhan);
    row.ty_le_ktv_chu_dong_toan_he_thong = pct(row.tong_tiep_nhan - row.nghi_ngo_120p, row.tong_tiep_nhan);
    row.ty_le_goi_thanh_cong = pct(row.goi_thanh_cong, row.tong_cuoc_goi);
  }

  return { rows: Array.from(map.values()).sort((a, b) => b.tong_tiep_nhan - a.tong_tiep_nhan), thang };
}

// GET /api/survey/bao-cao-khu-vuc?dim=&thang=&khu_vuc=&tinh=&quan_huyen=&ky_thuat_vien=&nguoi_khao_sat=&doi_tac=&hang=&nhom_san_pham=&nhom_kh=&nganh=
survey.get("/bao-cao-khu-vuc", async (c) => {
  const dimKey = c.req.query("dim") ?? "khu_vuc";
  if (!SURVEY_REPORT_DIMS[dimKey]) return c.json({ error: "INVALID_DIM" }, 400);

  const scope = scopeByKhuVuc(c);
  const params: SurveyKhuVucParams = {
    dim: dimKey,
    thang: c.req.query("thang"),
    khu_vuc: c.req.query("khu_vuc"),
    tinh: c.req.query("tinh"),
    quan_huyen: c.req.query("quan_huyen"),
    ky_thuat_vien: c.req.query("ky_thuat_vien"),
    nguoi_khao_sat: c.req.query("nguoi_khao_sat"),
  };
  for (const dk of Object.keys(REPORT_DIMS)) {
    if (dk === "khu_vuc" || dk === "tinh") continue;
    params[dk] = c.req.query(dk);
  }
  const key = buildReportKey("survey/bao-cao-khu-vuc", params, scope);
  const payload = await cachedReport(c.env.DB, key, [...SURVEY_REPORT_DOMAINS], () => computeSurveyKhuVucReport(c.env.DB, params, scope));
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
