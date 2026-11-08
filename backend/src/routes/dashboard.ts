import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { getDailyReportWithDelta, getSnapshotForUserAnToan, isDefaultReportParams } from "../lib/dailySnapshot";
import { type DashboardFilterParams, computeDashboardKpis, PIVOT_DIMS, computeDashboardPivot } from "../lib/dashboardCompute";
import { getOrCompute, DASHBOARD_MONTHS_CACHE_KEY, DASHBOARD_SYNC_STATUS_CACHE_KEY, DASHBOARD_FILTERS_CACHE_KEY, DASHBOARD_FILTERS_BY_KV_CACHE_KEY } from "../lib/precomputedCache";
import { cachedReport, buildReportKey, chayGomDoc } from "../lib/reportCache";
import { KHU_VUC_AN_KHOI_BAO_CAO } from "../lib/filterParams";

const dashboard = new Hono<{ Bindings: Env }>();
dashboard.use("*", verifySessionMiddleware, loadUser);

export interface DashboardFiltersPayload {
  khuVuc: (string | null)[];
  hang: (string | null)[];
  tinh: (string | null)[];
  doiTac: (string | null)[];
  nhomSanPham: (string | null)[];
  nhomKh: (string | null)[];
  nganh: (string | null)[];
  kyThuatVien: (string | null)[];
  // Tinh -> danh sach quan/huyen cua tinh do (dung cho filter cascade tinh->huyen o Bao cao khao
  // sat theo khu vuc) - khac 7 distinct-list phia tren (deu la 1 cot don), day la nhom theo 2 cot.
  tinhHuyen: Record<string, string[]>;
}

// TOI UU 2026-10-28 (web cham - d1 insights: "SELECT DISTINCT nganh ... khu_vuc IN (?, ?)" 4,9s/lan, 141k dong): truoc day
// MOI to hop khu_vuc_phu_trach (moi Giam sat) co 1 dong cache rieng, bi xoa sau MOI lan import -> nguoi dau tien cua tung
// pham vi kich hoat 9 cau SELECT DISTINCT quet toan bang (~5s) -> trang treo. Gio tinh 1 LAN "gia tri theo khu_vuc" cho ca he
// thong (9 cau GROUP BY khu_vuc, col - cung so lan quet nhu ban cu, chay ngay sau import o importRoute.ts), roi ghep danh
// sach toan he thong / theo pham vi TRONG BO NHO tu do - khong quet D1 lan nao nua cho tung pham vi.
const FILTER_COLS = ["khu_vuc", "hang", "tinh", "doi_tac", "nhom_san_pham", "nhom_kh", "nganh", "ky_thuat_vien"] as const;
type FilterCol = (typeof FILTER_COLS)[number];
const KV_NULL = ""; // khoa cho dong khu_vuc NULL

export interface DashboardFiltersByKhuVuc {
  cols: Record<FilterCol, Record<string, string[]>>;
  tinhHuyen: Record<string, [string, string][]>;
}

export async function computeDashboardFiltersByKhuVuc(db: D1Database): Promise<DashboardFiltersByKhuVuc> {
  const byKv = (col: string) =>
    db
      .prepare(`SELECT COALESCE(khu_vuc, '') AS kv, ${col} AS v FROM case_hieu_luc WHERE ${col} IS NOT NULL GROUP BY khu_vuc, ${col}`)
      .all<{ kv: string; v: string }>();
  const tinhHuyenRes = db
    .prepare(`SELECT COALESCE(khu_vuc, '') AS kv, tinh, quan_huyen FROM case_hieu_luc WHERE tinh IS NOT NULL AND quan_huyen IS NOT NULL GROUP BY khu_vuc, tinh, quan_huyen`)
    .all<{ kv: string; tinh: string; quan_huyen: string }>();
  const results = await Promise.all([...FILTER_COLS.map(byKv), tinhHuyenRes]);
  const cols = {} as DashboardFiltersByKhuVuc["cols"];
  FILTER_COLS.forEach((col, i) => {
    const m: Record<string, string[]> = {};
    for (const r of (results[i] as D1Result<{ kv: string; v: string }>).results) (m[r.kv] ??= []).push(r.v);
    cols[col] = m;
  });
  const tinhHuyen: Record<string, [string, string][]> = {};
  for (const r of (results[FILTER_COLS.length] as D1Result<{ kv: string; tinh: string; quan_huyen: string }>).results) {
    (tinhHuyen[r.kv] ??= []).push([r.tinh, r.quan_huyen]);
  }
  return { cols, tinhHuyen };
}

/** Ghep danh sach dropdown tu bang theo khu_vuc - scope null = toan he thong (gom ca dong khu_vuc NULL), mang = chi cac khu
 * vuc do (giong ban cu "khu_vuc IN (...)" - khu_vuc NULL khong thuoc pham vi nao). Sap xep giong ORDER BY (so sanh chuoi). */
export function deriveDashboardFilters(idx: DashboardFiltersByKhuVuc, scope: string[] | null): DashboardFiltersPayload {
  const kvs = (m: Record<string, unknown>) => (scope === null ? Object.keys(m) : scope.filter((k) => k in m));
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const uniq = (col: FilterCol) => {
    const m = idx.cols[col] ?? {};
    const set = new Set<string>();
    for (const k of kvs(m)) for (const v of m[k]) set.add(v);
    return [...set].sort(cmp);
  };
  const pairs = new Map<string, Set<string>>();
  for (const k of kvs(idx.tinhHuyen)) for (const [t, h] of idx.tinhHuyen[k]) (pairs.get(t) ?? pairs.set(t, new Set()).get(t)!).add(h);
  const tinhHuyen: Record<string, string[]> = {};
  for (const t of [...pairs.keys()].sort(cmp)) tinhHuyen[t] = [...pairs.get(t)!].sort(cmp);
  return {
    khuVuc: uniq("khu_vuc"),
    hang: uniq("hang"),
    tinh: uniq("tinh"),
    doiTac: uniq("doi_tac"),
    nhomSanPham: uniq("nhom_san_pham"),
    nhomKh: uniq("nhom_kh"),
    nganh: uniq("nganh"),
    kyThuatVien: uniq("ky_thuat_vien"),
    tinhHuyen,
  };
}

export async function computeDashboardFilters(db: D1Database, scope: string[] | null): Promise<DashboardFiltersPayload> {
  const idx = await getOrCompute(db, DASHBOARD_FILTERS_BY_KV_CACHE_KEY, () => computeDashboardFiltersByKhuVuc(db));
  return deriveDashboardFilters(idx, scope);
}

// GET /api/dashboard/filters - danh sach gia tri duy nhat cua tung dim (cho dropdown loc), theo pham
// vi user - dung chung cho moi bo loc REPORT_DIMS (BacklogModule bao cao ton can giai trinh, v.v.)
// Doc qua precomputed_cache (xem lib/precomputedCache.ts) - gia tri chi thay doi khi import ghi
// case_dvbh nen khong can tinh lai moi request; key tach theo pham vi khu_vuc cua user (Giam sat
// bi gioi han co key rieng, xem scopedFiltersCacheKey) de khong lo du lieu giua cac pham vi khac nhau.
dashboard.get("/filters", async (c) => {
  const scope = scopeByKhuVuc(c);
  // Toan he thong: 1 dong cache san. Theo pham vi: ghep trong bo nho tu bang theo khu_vuc (khong quet D1, khong cache rieng).
  const payload =
    scope === null
      ? await getOrCompute(c.env.DB, DASHBOARD_FILTERS_CACHE_KEY, () => computeDashboardFilters(c.env.DB, null))
      : await computeDashboardFilters(c.env.DB, scope);
  // CHOT 2026-08-01: dropdown loc khu_vuc dung CHUNG cho MOI module (Tong quat/Doanh thu/Quan ly
  // ton/Ca lap/Nap gas/Khao sat/Tranh chap/Thieu linh kien) khong duoc hien 2 khu_vuc "an khoi bao
  // cao" - CHI "Danh sach tong" (route /cases/tong-hop, khong ap dung khuVucReportExclusionClause)
  // moi can thay day du, nen truyen "?full_khu_vuc=true" de bo qua loc nay.
  if (c.req.query("full_khu_vuc") === "true") return c.json(payload);
  return c.json({ ...payload, khuVuc: payload.khuVuc.filter((kv) => kv === null || !(KHU_VUC_AN_KHOI_BAO_CAO as string[]).includes(kv)) });
});

export interface SyncStatusPayload {
  lastSynced: string | null;
}

// Quet MAX(thoi_gian_tai_du_lieu_crm) tren toan bo case_dvbh (khong index tren cot nay) - ton kem.
// CHOT 2026-08-20 (rao soat lag, buoc 2): sau import that su, importRoute.ts KHONG con goi ham nay
// nua - ghi thang thoi diem import (nowVN()) vao cache thay vi quet lai MAX (xem recomputeDashboardCaches).
// Ham nay gio CHI con la duong fallback compute-on-miss cua getOrCompute() ben duoi (GET /sync-status),
// tuc CHI chay 1 lan duy nhat trong doi cache - ngay dau tien co ai doc route nay TRUOC KHI tung co
// import nao chay qua code moi (vd ngay sau khi deploy tinh nang nay, cache con trong) - khong dang ke.
export async function computeSyncStatus(db: D1Database): Promise<SyncStatusPayload> {
  const row = await db.prepare(
    "SELECT MAX(thoi_gian_tai_du_lieu_crm) as last_synced FROM case_dvbh",
  ).first<{ last_synced: string | null }>();
  return { lastSynced: row?.last_synced ?? null };
}

// GET /api/dashboard/sync-status - thoi gian tiep nhan cua ca gan nhat da import, dung lam moc
// "he thong da dong bo den thoi diem nao" - khong loc theo khu_vuc, phan anh trang thai tong the.
// CHOT 2026-08-20 (rao soat lag): TopBar poll route nay 5 phut/lan cho MOI phien dang nhap - D1
// Insights do duoc ~93.564 rows/lan x ~319 lan/ngay = ~29,8 trieu rows/ngay chi de lay 1 moc thoi
// gian. Doc qua precomputed_cache (compute-on-miss + recompute sau import, giong /dashboard/filters)
// thay vi quet song moi lan - gia tri tra ve giong het (van la MAX that, chi tre toi da den lan import
// ke tiep thay vi tuc thi, chap nhan duoc vi ban chat gia tri nay von da la "trang thai dong bo gan
// nhat", khong phai du lieu can chinh xac tuyet doi realtime).
dashboard.get("/sync-status", async (c) => {
  const payload = await getOrCompute(c.env.DB, DASHBOARD_SYNC_STATUS_CACHE_KEY, () => computeSyncStatus(c.env.DB));
  return c.json(payload);
});

export interface DashboardMonthsPayload {
  months: string[];
}

// Quet toan bo ca da dong de liet ke cac thang co du lieu (ton kem - xem KE_HOACH_TOI_UU_D1.md
// Giai doan 2). Tach rieng de dung chung cho compute-on-miss va recompute sau import.
export async function computeDashboardMonths(db: D1Database): Promise<DashboardMonthsPayload> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT strftime('%Y-%m', thoi_gian_hoan_thanh) as thang FROM case_hieu_luc
       WHERE thoi_gian_hoan_thanh IS NOT NULL ORDER BY thang DESC`,
    )
    .all<{ thang: string }>();
  return { months: results.map((r) => r.thang) };
}

// GET /api/dashboard/months - danh sach thang xu ly (theo thoi_gian_hoan_thanh) de loc bao cao.
// Doc qua precomputed_cache - danh sach thang chi doi khi co ca dong moi, ma dieu do cung chi
// xay ra qua import (xem importRoute.ts).
dashboard.get("/months", async (c) => {
  const payload = await getOrCompute(c.env.DB, DASHBOARD_MONTHS_CACHE_KEY, () => computeDashboardMonths(c.env.DB));
  return c.json(payload);
});

// GET /api/dashboard/daily-report - bao cao "dong bang" 08:00 sang VN + delta trong ngay (xem
// lib/dailySnapshot.ts) theo vai tro (Giam sat: loc theo khu vuc phu trach; vai tro khac: so tong
// toan he thong). Doc snapshot da tinh san (cron 08:00 hoac nut "Lam moi bao cao" trong Import data -
// xem POST /api/import/refresh-reports goi generateDailySnapshot()), tu-heal neu chua co.
dashboard.get("/daily-report", async (c) => {
  const report = await getDailyReportWithDelta(c.env.DB, c.get("user"));
  return c.json(report);
});

// GET /api/dashboard/kpis - CHOT 2026-08-01: voi bo loc MAC DINH (khong khu_vuc/hang, thang hien
// tai) doc thang tu "Bao cao ngay 08:00" (dong bang, xem lib/dailySnapshot.ts) thay vi tinh song -
// khop yeu cau "1 lan load DB lam bao cao cho tat ca, dung yen ca ngay tru khi lam moi thu cong".
// Bo loc KHAC mac dinh (nguoi dung tu chon khu_vuc/hang/thang) van tinh song qua reportCache nhu
// truoc (khong the dong bang truoc MOI to hop filter co the co).
// Tach than route thanh ham (2026-11-07) de endpoint gop /man-tong-quat dung chung. "laySnap" = doc so chot 08:00 (endpoint gop
// truyen ham da nho ket qua -> 1 request chi doc so chot 1 lan cho ca kpis + 2 pivot).
type LaySnap = () => ReturnType<typeof getSnapshotForUserAnToan>;
function taoLaySnap(c: Context<{ Bindings: Env }>): LaySnap {
  let p: ReturnType<typeof getSnapshotForUserAnToan> | undefined;
  return () => (p ??= getSnapshotForUserAnToan(c.env.DB, c.get("user"), (x) => c.executionCtx.waitUntil(x)));
}

async function docKpis(c: Context<{ Bindings: Env }>, laySnap: LaySnap) {
  const scope = scopeByKhuVuc(c);
  const params: DashboardFilterParams = {
    khu_vuc: c.req.query("khu_vuc"),
    hang: c.req.query("hang"),
    thang: c.req.query("thang"),
    nhom_san_pham: c.req.query("nhom_san_pham"),
  };
  if (isDefaultReportParams(params)) {
    const snap = await laySnap();
    // So chot tu 08/11/2026 khong con kpis (lib/chotTon.ts) -> tinh qua cachedReport ben duoi.
    if (snap?.payload.kpis) return snap.payload.kpis;
  }
  const key = buildReportKey("dashboard/kpis", params, scope);
  return cachedReport(c.env.DB, key, ["cases", "vi_pham", "giai_trinh"], () => computeDashboardKpis(c.env.DB, params, scope));
}

dashboard.get("/kpis", async (c) => c.json(await docKpis(c, taoLaySnap(c))));

// GET /api/dashboard/pivot?dim=khu_vuc|tinh|doi_tac|hang|ky_thuat_vien - CHOT 2026-08-01: voi bo loc
// MAC DINH doc CA 5 dim tu "Bao cao ngay 08:00" (dailySnapshot.ts tinh san het, xem
// DailySnapshotPayload.pivotByDim) - cung ly do voi /kpis o tren. Bo loc khac mac dinh van qua
// reportCache song nhu truoc.
// null = dim khong hop le (route tra 400).
async function docPivot(c: Context<{ Bindings: Env }>, dimKey: string, dgLoc: string | undefined, laySnap: LaySnap) {
  if (!PIVOT_DIMS[dimKey]) return null;
  const scope = scopeByKhuVuc(c);
  const params = {
    dimKey,
    khu_vuc: c.req.query("khu_vuc"),
    hang: c.req.query("hang"),
    thang: c.req.query("thang"),
    nhom_san_pham: c.req.query("nhom_san_pham"),
    // Loc phu "Tinh" (chon nhieu) cua bang pivot khi nhom theo KTV (2026-10-23) - JSON gia tri tho theo che do Dia gioi
    // cu/moi (frontend lib/diaGioi.ts buildDgLoc), ap qua filterParams.ts diaGioiLoc. Co loc -> tinh song (cache theo key).
    dg_loc: dgLoc || undefined,
  };
  if (isDefaultReportParams(params) && !params.dg_loc) {
    const snap = await laySnap();
    const pivotByDim = snap?.payload.pivotByDim;
    if (pivotByDim && (dimKey !== "ky_thuat_vien" || snap.payload.pivotKtvTrienKhai)) return { rows: pivotByDim[dimKey] ?? [] };
  }
  // "v2" (2026-10-22): dim KTV doi sang KTV trien khai - bo envelope cache cu nhom theo tram.
  const key = buildReportKey("dashboard/pivot-v2", params, scope);
  return cachedReport(c.env.DB, key, ["cases"], () => computeDashboardPivot(c.env.DB, params, scope));
}

dashboard.get("/pivot", async (c) => {
  const data = await docPivot(c, c.req.query("dim") ?? "khu_vuc", c.req.query("dg_loc"), taoLaySnap(c));
  if (data === null) return c.json({ error: "INVALID_DIM" }, 400);
  return c.json(data);
});

// GET /api/dashboard/man-tong-quat?khu_vuc=&hang=&thang=&nhom_san_pham=&dim= (2026-11-07) - man "Tong quat" KEO 1 LAN: gop 4 request
// truoc day goi rieng (daily-report, kpis, pivot theo dim dang chon, pivot KTV) -> 1 lan xac thuc/doc user, so chot 08:00 doc 1 lan
// dung chung, moi lan doc cache gom 1 db.batch (chayGomDoc). Noi dung tung phan GIONG HET route le (cung ham, cung khoa cache). Pivot co
// loc phu Tinh (dg_loc) van goi rieng /pivot (bo loc tuong tac).
dashboard.get("/man-tong-quat", async (c) =>
  chayGomDoc(async () => {
    const laySnap = taoLaySnap(c);
    const dimKey = c.req.query("dim") ?? "khu_vuc";
    const [dailyReport, kpis, pivot, pivotKtv] = await Promise.all([
      getDailyReportWithDelta(c.env.DB, c.get("user")),
      docKpis(c, laySnap),
      docPivot(c, dimKey, undefined, laySnap),
      dimKey === "ky_thuat_vien" ? null : docPivot(c, "ky_thuat_vien", undefined, laySnap),
    ]);
    if (pivot === null) return c.json({ error: "INVALID_DIM" }, 400);
    return c.json({ dailyReport, kpis, pivot, pivotKtv: pivotKtv ?? pivot });
  }),
);

export default dashboard;
