import { PHAM_VI_LOC, bocPhamVi, phamViCua } from "./phamVi";
/**
 * Cache JSON tinh san cho cac endpoint doc NHIEU nhung du lieu nguon CHI doi khi import ghi
 * case_dvbh (xem KE_HOACH_TOI_UU_D1.md Giai doan 2 - R2: /dashboard/filters, /dashboard/months).
 * Khac voi contentHash.ts (chi luu HASH ngan de client tu quyet dinh co tai lai hay khong),
 * bang precomputed_cache nay luu THANG ket qua JSON da tinh san - server doc thi chi 1 SELECT
 * theo PRIMARY KEY (key) thay vi quet lai bang case_dvbh moi request.
 *
 * Co che: "compute-on-miss" - lan doc dau tien (hoac sau khi bi xoa/chua tung tinh) se chay
 * callback tinh du lieu that su roi luu lai; cac lan doc sau chi doc dong nho co san. Khi co
 * su kien lam du lieu nguon doi that (import GHI_MOI/GHI_DE > 0), goi recompute() de tinh lai
 * VA ghi de ngay (khong doi request tiep theo den moi tinh), giu cache luon "nong" san.
 */

// Key cho GET /api/dashboard/filters (pham vi khong gioi han - Admin/Viewer/TBP DVBH/TBP CSKH,
// xem scopeByKhuVuc()) va GET /api/dashboard/months - dung chung giua routes/dashboard.ts (doc)
// va routes/importRoute.ts (recompute sau import, xem ham recomputeDashboardCaches ben duoi).
export const DASHBOARD_FILTERS_CACHE_KEY = "dashboard-filters";
// Bang "gia tri dropdown theo khu_vuc" (2026-10-28) - nguon cua ca DASHBOARD_FILTERS_CACHE_KEY lan danh sach theo pham vi
// (routes/dashboard.ts deriveDashboardFilters). Ten khong bat dau "dashboard-filters:" -> khong bi invalidateScopedDashboardFilters xoa.
export const DASHBOARD_FILTERS_BY_KV_CACHE_KEY = "dashboard-filters-by-kv";
export const DASHBOARD_MONTHS_CACHE_KEY = "dashboard-months";
// Key cho GET /api/dashboard/sync-status (TopBar poll 5 phut/lan, moi phien dang nhap) - xem
// routes/dashboard.ts computeSyncStatus() + routes/importRoute.ts recomputeDashboardCaches().
export const DASHBOARD_SYNC_STATUS_CACHE_KEY = "dashboard-sync-status";

// Prefix rieng cho cac bien the /dashboard/filters bi gioi han theo khu_vuc_phu_trach (vd vai tro
// Giam sat) - moi Giam sat co the phu trach to hop khu_vuc khac nhau nen KHONG dung chung 1 dong
// voi ban khong gioi han. Dat prefix khac ("dashboard-filters:") de invalidateScopedDashboardFilters()
// (goi sau import, xem importRoute.ts) xoa dung cac dong nay ma khong dong den DASHBOARD_FILTERS_CACHE_KEY.
const DASHBOARD_FILTERS_SCOPED_PREFIX = "dashboard-filters:";

/** Key cache cho /dashboard/filters theo pham vi khu_vuc cua user hien tai - null = khong gioi han (dung DASHBOARD_FILTERS_CACHE_KEY dung chung), mang = gioi han (1 dong rieng theo to hop khu_vuc, sap xep de cung 1 to hop luon ra cung 1 key). */
export function scopedFiltersCacheKey(scope: string[] | null): string {
  if (scope === null) return DASHBOARD_FILTERS_CACHE_KEY;
  return `${DASHBOARD_FILTERS_SCOPED_PREFIX}${[...scope].sort().join(",")}`;
}

async function readCache<T>(db: D1Database, key: string): Promise<T | null> {
  const row = await db.prepare("SELECT payload FROM precomputed_cache WHERE key = ?").bind(key).first<{ payload: string }>();
  if (!row) return null;
  return JSON.parse(row.payload) as T;
}

async function writeCache<T>(db: D1Database, key: string, value: T): Promise<void> {
  await db
    .prepare(
      `INSERT INTO precomputed_cache (key, payload, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    )
    .bind(key, JSON.stringify(value))
    .run();
}

/** Doc cache theo key; neu chua co (lan dau, hoac vua bi xoa) thi tinh bang compute roi luu lai truoc khi tra ve. */
export async function getOrCompute<T>(db: D1Database, key: string, compute: () => Promise<T>): Promise<T> {
  const cached = await readCache<T>(db, key);
  if (cached !== null) return cached;

  const value = await compute();
  await writeCache(db, key, value);
  return value;
}

/** Tinh lai VA ghi de cache theo key, bat ke da co hay chua - dung khi biet chac du lieu nguon vua doi (sau import). */
export async function recompute<T>(db: D1Database, key: string, compute: () => Promise<T>): Promise<T> {
  const value = await compute();
  await writeCache(db, key, value);
  await xoaBanPhamVi(db, "DELETE FROM precomputed_cache WHERE key = ?", key);
  return value;
}

/** Ban cache cua 2 pham vi NSKX / Khong NSKX (bang precomputed_cache_<pv>, lib/phamVi.ts) khong co duong recompute rieng
 * -> khi "Tất cả" bi tinh lai / xoa (biet chac nguon vua doi) thi xoa luon dong tuong ung, lan xem sau tu tinh lai. */
async function xoaBanPhamVi(db: D1Database, sql: string, bind: string): Promise<void> {
  if (phamViCua(db) !== "tat_ca") return;
  await db.batch(PHAM_VI_LOC.map((pv) => bocPhamVi(db, pv).prepare(sql).bind(bind)));
}

/**
 * Xoa het cac dong cache /dashboard/filters bi gioi han theo khu_vuc (xem scopedFiltersCacheKey) -
 * KHONG dong den dong DASHBOARD_FILTERS_CACHE_KEY dung chung. Goi sau import (xem importRoute.ts):
 * ta biet chac du lieu nguon vua doi nhung KHONG the liet ke het moi to hop khu_vuc_phu_trach co the
 * co (moi Giam sat 1 to hop khac nhau) de recompute() truc tiep tung dong, nen xoa de lan GET
 * /dashboard/filters tiep theo cua dung nguoi dung do tu compute-on-miss lai voi du lieu moi nhat.
 */
export async function invalidateScopedDashboardFilters(db: D1Database): Promise<void> {
  // "dashboard-filters:" (co dau ':') khong bao gio trung DASHBOARD_FILTERS_CACHE_KEY ("dashboard-filters",
  // khong dau ':') nen khong can dieu kien loai tru rieng.
  await db.prepare("DELETE FROM precomputed_cache WHERE key LIKE ?").bind(`${DASHBOARD_FILTERS_SCOPED_PREFIX}%`).run();
  await xoaBanPhamVi(db, "DELETE FROM precomputed_cache WHERE key LIKE ?", `${DASHBOARD_FILTERS_SCOPED_PREFIX}%`);
}
