/**
 * Version-tag theo domain du lieu (bang data_versions, migration 0021) - dung cung reportCache.ts
 * de cac endpoint bao cao/thong ke chi tinh lai khi domain lien quan THAT SU co ghi moi, thay vi
 * quet lai bang nguon moi lan doc (xem YEU_CAU_BAO_CAO_TINH_SAN.md). Khac precomputedCache.ts (luu
 * THANG payload JSON tinh san), bang data_versions chi luu 1 so nguyen tang dan moi domain - dung
 * de SO SANH voi "v" luu trong envelope cache (xem reportCache.ts), ban than KHONG luu du lieu bao cao.
 */

// Danh sach domain hop le - phai khop dung 8 domain liet ke trong YEU_CAU_BAO_CAO_TINH_SAN.md.
// Domain "cases" (R8, chot 2026-07-23): CHI phan anh dung 1 loai su kien - import du lieu case
// moi/ghi de (POST /api/import/commit hoac /api/import/sync-sheet, khi GHI_MOI+GHI_DE>0). KHONG
// bump o day cho archive tu dong (cron trong index.ts) hay thao tac nghiep vu khac nhu gan CSKH
// (survey.ts assign/assign-bulk) - cac ghi do KHONG lam bao cao tinh san tren domain "cases" cu di.
// "tranh_chap" them 2026-07-29: bump moi lan ghi tranh_chap_tien_trinh/tranh_chap_log (xem
// routes/tranhChap.ts) - dung cho cachedReport() cua GET /tranh-chap/tien-trinh + /notifications/count.
// "dat_mua_lk" them 2026-08-14: bump o moi duong ghi dat_don_hang_log/phieu_xuat_kho_log/
// thieu_lk_log/tra_hang_log/phieu_dat (routes/datMuaLinhKien.ts, phieuXuatKho.ts, traHang.ts) -
// dung rieng cho badge sidebar module "Dat mua linh kien" trong /notifications/count. TRUOC DAY cac
// duong ghi nay bump nham domain "cases" (khong co bao cao tinh san nao doc case_dvbh tu cac bang
// nay - xem R8 YEU_CAU_BAO_CAO_TINH_SAN.md ve nguyen tac "chi bump domain thuc su co bao cao phu
// thuoc") - da doi lai domain dung khi them field badge nay, tranh lam moi luot duyet/tu choi don
// mua linh kien vo tinh ep toan bo dashboard/report tinh lai khong can thiet.
const ALL_DOMAINS = ["blacklist", "cases", "dat_mua_lk", "giai_trinh", "giai_trinh_lap", "ket_qua_goi", "nap_gas_danh_gia", "settings", "tranh_chap", "users", "vi_pham"] as const;
export type DataDomain = (typeof ALL_DOMAINS)[number];

/** Tang version them 1 cho tung domain trong danh sach (1 cau UPSERT nhieu dong VALUES) - goi ngay
 * sau (hoac cung batch voi) ghi chinh tai duong ghi tuong ung. Domain chua tung co dong (lan bump
 * dau tien) duoc INSERT thang voi version = 1. Bo qua neu danh sach rong (khong tao cau SQL thua). */
export async function bumpVersions(db: D1Database, domains: DataDomain[]): Promise<void> {
  const unique = Array.from(new Set(domains));
  if (unique.length === 0) return;

  const placeholders = unique.map(() => "(?, 1, datetime('now'))").join(", ");
  await db
    .prepare(
      `INSERT INTO data_versions (domain, version, updated_at) VALUES ${placeholders}
       ON CONFLICT(domain) DO UPDATE SET version = data_versions.version + 1, updated_at = excluded.updated_at`,
    )
    .bind(...unique)
    .run();
}

/** Ghep "domain:version|domain:version|..." theo thu tu alphabet cho danh sach domain phu thuoc
 * (1 SELECT IN) - dung lam phan "v" cua envelope cache trong reportCache.ts. Domain chua tung
 * duoc bump (chua co dong trong data_versions) coi nhu version 0, van co mat trong tag de 2 lan
 * goi cung danh sach domain luon ra cung dinh dang chuoi. */
export async function getVersionTag(db: D1Database, domains: DataDomain[]): Promise<string> {
  const sorted = Array.from(new Set(domains)).sort();
  if (sorted.length === 0) return "";

  const placeholders = sorted.map(() => "?").join(", ");
  const { results } = await db
    .prepare(`SELECT domain, version FROM data_versions WHERE domain IN (${placeholders})`)
    .bind(...sorted)
    .all<{ domain: string; version: number }>();

  const versionByDomain = new Map(results.map((r) => [r.domain, r.version]));
  return sorted.map((d) => `${d}:${versionByDomain.get(d) ?? 0}`).join("|");
}
