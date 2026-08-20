import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { getDailyReportWithDelta, getSnapshotForUser, isDefaultReportParams } from "../lib/dailySnapshot";
import { type DashboardFilterParams, computeDashboardKpis, PIVOT_DIMS, computeDashboardPivot } from "../lib/dashboardCompute";
import { getOrCompute, DASHBOARD_MONTHS_CACHE_KEY, DASHBOARD_SYNC_STATUS_CACHE_KEY, scopedFiltersCacheKey } from "../lib/precomputedCache";
import { cachedReport, buildReportKey } from "../lib/reportCache";
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

// Tinh that su 8 SELECT DISTINCT (ton kem - moi cau quet toan bo case_dvbh vi hau het cot khong
// index, xem KE_HOACH_TOI_UU_D1.md Giai doan 2). Tach rieng ham nay (khong goi truc tiep tu route)
// de dung chung cho ca compute-on-miss (route /filters ben duoi) va recompute sau import (importRoute.ts).
export async function computeDashboardFilters(db: D1Database, scope: string[] | null): Promise<DashboardFiltersPayload> {
  const scopeClause = khuVucWhereClause(scope, "khu_vuc");

  const distinctOf = (col: string) =>
    db
      .prepare(`SELECT DISTINCT ${col} FROM case_dvbh WHERE ${col} IS NOT NULL${scopeClause.sql} ORDER BY ${col}`)
      .bind(...scopeClause.binds)
      .all<Record<string, string>>();

  const tinhHuyenRes = db
    .prepare(`SELECT DISTINCT tinh, quan_huyen FROM case_dvbh WHERE tinh IS NOT NULL AND quan_huyen IS NOT NULL${scopeClause.sql} ORDER BY tinh, quan_huyen`)
    .bind(...scopeClause.binds)
    .all<{ tinh: string; quan_huyen: string }>();

  const [khuVucRes, hangRes, tinhRes, doiTacRes, nhomSanPhamRes, nhomKhRes, nganhRes, kyThuatVienRes, tinhHuyenRows] = await Promise.all([
    distinctOf("khu_vuc"),
    distinctOf("hang"),
    distinctOf("tinh"),
    distinctOf("doi_tac"),
    distinctOf("nhom_san_pham"),
    distinctOf("nhom_kh"),
    distinctOf("nganh"),
    distinctOf("ky_thuat_vien"),
    tinhHuyenRes,
  ]);

  const tinhHuyen: Record<string, string[]> = {};
  for (const r of tinhHuyenRows.results) {
    (tinhHuyen[r.tinh] ??= []).push(r.quan_huyen);
  }

  return {
    khuVuc: khuVucRes.results.map((r) => r.khu_vuc),
    hang: hangRes.results.map((r) => r.hang),
    tinh: tinhRes.results.map((r) => r.tinh),
    doiTac: doiTacRes.results.map((r) => r.doi_tac),
    nhomSanPham: nhomSanPhamRes.results.map((r) => r.nhom_san_pham),
    nhomKh: nhomKhRes.results.map((r) => r.nhom_kh),
    nganh: nganhRes.results.map((r) => r.nganh),
    kyThuatVien: kyThuatVienRes.results.map((r) => r.ky_thuat_vien),
    tinhHuyen,
  };
}

// GET /api/dashboard/filters - danh sach gia tri duy nhat cua tung dim (cho dropdown loc), theo pham
// vi user - dung chung cho moi bo loc REPORT_DIMS (BacklogModule bao cao ton can giai trinh, v.v.)
// Doc qua precomputed_cache (xem lib/precomputedCache.ts) - gia tri chi thay doi khi import ghi
// case_dvbh nen khong can tinh lai moi request; key tach theo pham vi khu_vuc cua user (Giam sat
// bi gioi han co key rieng, xem scopedFiltersCacheKey) de khong lo du lieu giua cac pham vi khac nhau.
dashboard.get("/filters", async (c) => {
  const scope = scopeByKhuVuc(c);
  const key = scopedFiltersCacheKey(scope);
  const payload = await getOrCompute(c.env.DB, key, () => computeDashboardFilters(c.env.DB, scope));
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
      `SELECT DISTINCT strftime('%Y-%m', thoi_gian_hoan_thanh) as thang FROM case_dvbh
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
dashboard.get("/kpis", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params: DashboardFilterParams = {
    khu_vuc: c.req.query("khu_vuc"),
    hang: c.req.query("hang"),
    thang: c.req.query("thang"),
    nhom_san_pham: c.req.query("nhom_san_pham"),
  };
  if (isDefaultReportParams(params)) {
    const snap = await getSnapshotForUser(c.env.DB, c.get("user"));
    if (snap) return c.json(snap.payload.kpis);
  }
  const key = buildReportKey("dashboard/kpis", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases", "vi_pham", "giai_trinh"], () => computeDashboardKpis(c.env.DB, params, scope));
  return c.json(payload);
});

// GET /api/dashboard/pivot?dim=khu_vuc|tinh|doi_tac|hang|ky_thuat_vien - CHOT 2026-08-01: voi bo loc
// MAC DINH doc CA 5 dim tu "Bao cao ngay 08:00" (dailySnapshot.ts tinh san het, xem
// DailySnapshotPayload.pivotByDim) - cung ly do voi /kpis o tren. Bo loc khac mac dinh van qua
// reportCache song nhu truoc.
dashboard.get("/pivot", async (c) => {
  const dimKey = c.req.query("dim") ?? "khu_vuc";
  if (!PIVOT_DIMS[dimKey]) return c.json({ error: "INVALID_DIM" }, 400);
  const scope = scopeByKhuVuc(c);
  const params = {
    dimKey,
    khu_vuc: c.req.query("khu_vuc"),
    hang: c.req.query("hang"),
    thang: c.req.query("thang"),
    nhom_san_pham: c.req.query("nhom_san_pham"),
  };
  if (isDefaultReportParams(params)) {
    const snap = await getSnapshotForUser(c.env.DB, c.get("user"));
    if (snap) return c.json({ rows: snap.payload.pivotByDim[dimKey] ?? [] });
  }
  const key = buildReportKey("dashboard/pivot", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases"], () => computeDashboardPivot(c.env.DB, params, scope));
  return c.json(payload);
});

export default dashboard;
