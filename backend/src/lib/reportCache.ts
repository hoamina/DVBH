/**
 * Cache bao cao "tinh san" theo version-tag domain (xem lib/dataVersions.ts) - DUNG LAI bang
 * precomputed_cache (migration 0020, xem lib/precomputedCache.ts) voi key luon co prefix "rpt:"
 * de khong dung do voi cac key "dashboard-filters"/"dashboard-months" da co san trong cung bang.
 * Khac co che "compute-on-miss + recompute() chu dong sau import" cua precomputedCache.ts,
 * reportCache.ts dung "lazy invalidate": moi lan doc so sanh version-tag luu san trong envelope
 * (truong "v") voi version-tag HIEN TAI cua cac domain phu thuoc (1 SELECT IN qua getVersionTag) -
 * khop thi tra data cache (~1 SELECT theo PRIMARY KEY), lech (hoac chua co dong nao) thi chay
 * compute() that su roi ghi de envelope moi truoc khi tra ve. Endpoint boc qua cachedReport()
 * KHONG can biet domain nao vua doi, chi can khai bao dung danh sach domain minh phu thuoc.
 */
import type { DataDomain } from "./dataVersions";
import { getVersionTag } from "./dataVersions";

interface CacheEnvelope<T> {
  v: string;
  data: T;
}

/** Xay key on dinh cho 1 endpoint bao cao: "rpt:" + endpoint + query param da chuan hoa (bo param
 * rong, sap theo ten) + scope khu_vuc cua user hien tai (sap) - 2 request cung endpoint/cung bo
 * loc/cung pham vi xem LUON ra cung 1 key; khac bo loc HOAC khac pham vi (vd Giam sat phu trach
 * khu_vuc khac nhau) LUON ra key khac nhau, tranh tra nham du lieu ngoai pham vi cho phep cua
 * nguoi dung dang xem (xem Rang buoc chung trong YEU_CAU_BAO_CAO_TINH_SAN.md). */
export function buildReportKey(endpoint: string, params: Record<string, string | undefined>, scope: string[] | null): string {
  const paramPart = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const scopePart = scope === null ? "all" : [...scope].sort().join(",");
  return `rpt:${endpoint}|${paramPart}|scope=${scopePart}`;
}

/** Ngay hien tai theo gio VN (UTC+7), dang "YYYY-MM-DD" - ghep them vao version-tag cua MOI bao cao
 * (xem "BO SUNG BAT BUOC: thanh phan ngay VN" trong YEU_CAU_BAO_CAO_TINH_SAN.md). Nhieu bao cao phu
 * thuoc TUOI TON (>1/3/7/14 ngay, tinh theo moc 0h sang VN - xem AGE_ANCHOR trong ageCalc.ts) nen con
 * so co the doi khi sang ngay moi du KHONG co ghi nao vao data_versions - dua ngay VN vao tag coi nhu
 * 1 "domain ao" luon duoc kiem tra, dam bao cache tu invalidate dung dau ngay moi. */
function getVnDateStr(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Doc cache bao cao theo key: neu da co envelope VA version-tag luu san khop voi version-tag hien
 * tai cua cac domain phu thuoc (da ghep them ngay VN) thi tra data luu san (chi 1 SELECT theo
 * PRIMARY KEY + 1 SELECT IN nho tren data_versions); lech (du lieu nguon vua doi, hoac sang ngay
 * moi) hoac chua co dong nao thi chay compute() that su roi ghi de (UPSERT) envelope moi truoc khi
 * tra ve - lan doc tiep theo se lai duoc dung cache moi. Response shape tra ve client GIU NGUYEN
 * 100% kieu T cua compute(), reportCache chi boc ngoai khong dong vao noi dung. */
export async function cachedReport<T>(db: D1Database, key: string, domains: DataDomain[], compute: () => Promise<T>): Promise<T> {
  const currentTag = `${await getVersionTag(db, domains)}|ngay:${getVnDateStr()}`;

  const row = await db.prepare("SELECT payload FROM precomputed_cache WHERE key = ?").bind(key).first<{ payload: string }>();
  if (row) {
    const envelope = JSON.parse(row.payload) as CacheEnvelope<T>;
    if (envelope.v === currentTag) return envelope.data;
  }

  const data = await compute();
  const envelope: CacheEnvelope<T> = { v: currentTag, data };
  await db
    .prepare(
      `INSERT INTO precomputed_cache (key, payload, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    )
    .bind(key, JSON.stringify(envelope))
    .run();
  return data;
}
