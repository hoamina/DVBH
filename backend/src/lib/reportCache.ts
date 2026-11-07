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
import { AsyncLocalStorage } from "node:async_hooks";
import type { DataDomain } from "./dataVersions";
import { versionTagStatement } from "./dataVersions";

/** "Gom doc" (2026-11-07, man Quan ly ton keo 1 lan): trong pham vi chayGomDoc(), moi lan cachedReport doc envelope + version
 * KHONG goi D1 ngay ma xep hang, het luot dong bo hien tai (setTimeout 0) thi gui CHUNG 1 db.batch cho ca hang - endpoint gop
 * chay nhieu bao cao song song chi ton 1-2 luot xep hang doi D1 thay vi moi bao cao 1 luot. AsyncLocalStorage -> hang doi
 * thuoc DUNG 1 request (khong dung chung Promise giua cac request). Ngoai chayGomDoc: goi thang db.batch nhu cu. */
interface MucGom {
  db: D1Database;
  stmts: D1PreparedStatement[];
  resolve: (r: D1Result[]) => void;
  reject: (e: unknown) => void;
}
const gomStore = new AsyncLocalStorage<{ hang: MucGom[] }>();

export function chayGomDoc<T>(fn: () => Promise<T>): Promise<T> {
  return gomStore.run({ hang: [] }, fn);
}

function docGom(db: D1Database, stmts: D1PreparedStatement[]): Promise<D1Result[]> {
  const g = gomStore.getStore();
  if (!g) return db.batch(stmts);
  return new Promise<D1Result[]>((resolve, reject) => {
    g.hang.push({ db, stmts, resolve, reject });
    if (g.hang.length === 1) setTimeout(() => void xaHang(g), 0);
  });
}

async function xaHang(g: { hang: MucGom[] }): Promise<void> {
  const muc = g.hang.splice(0);
  if (muc.length === 0) return;
  try {
    // Moi statement da duoc prepare qua dung DB (boc pham vi) cua nguoi goi -> gop chung 1 batch qua DB bat ky deu dung bang.
    const kq = await muc[0].db.batch(muc.flatMap((m) => m.stmts));
    let i = 0;
    for (const m of muc) {
      m.resolve(kq.slice(i, i + m.stmts.length));
      i += m.stmts.length;
    }
  } catch (e) {
    for (const m of muc) m.reject(e);
  }
}

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
export function getVnDateStr(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Doc cache bao cao theo key: neu da co envelope VA version-tag luu san khop voi version-tag hien
 * tai cua cac domain phu thuoc (da ghep them ngay VN) thi tra data luu san (chi 1 SELECT theo
 * PRIMARY KEY + 1 SELECT IN nho tren data_versions); lech (du lieu nguon vua doi, hoac sang ngay
 * moi) hoac chua co dong nao thi chay compute() that su roi ghi de (UPSERT) envelope moi truoc khi
 * tra ve - lan doc tiep theo se lai duoc dung cache moi. Response shape tra ve client GIU NGUYEN
 * 100% kieu T cua compute(), reportCache chi boc ngoai khong dong vao noi dung. */
// extraTag (2026-11-06): noi them vao tag cho nguon du lieu doi ma KHONG bump domain nao (vd so chot 08:00 daily_snapshot,
// chot 17h30 giai_trinh_daily_log) - nguoi goi tu doc 1 "dau van tay" re cua nguon do roi truyen vao.

export async function cachedReport<T>(db: D1Database, key: string, domains: DataDomain[], compute: () => Promise<T>, extraTag = ""): Promise<T> {
  // 2026-11-07: doc version-tag + envelope trong 1 luot batch (truoc la 2 luot tuan tu, moi luot xep hang doi D1 rieng).
  const [versionStmt, readVersion] = versionTagStatement(db, domains);
  const stmts: D1PreparedStatement[] = [db.prepare("SELECT payload FROM precomputed_cache WHERE key = ?").bind(key)];
  if (versionStmt) stmts.push(versionStmt);
  const res = await docGom(db, stmts);
  const row = (res[0]?.results?.[0] as { payload: string } | undefined) ?? null;
  const versionTag = readVersion(versionStmt ? ((res[1]?.results ?? []) as { domain: string; version: number }[]) : []);
  const currentTag = `${versionTag}|ngay:${getVnDateStr()}${extraTag ? `|${extraTag}` : ""}`;

  if (row) {
    const envelope = JSON.parse(row.payload) as CacheEnvelope<T>;
    if (envelope.v === currentTag) return envelope.data;
  }

  return tinhVaGhi(db, key, currentTag, compute);
}

async function tinhVaGhi<T>(db: D1Database, key: string, currentTag: string, compute: () => Promise<T>): Promise<T> {
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
