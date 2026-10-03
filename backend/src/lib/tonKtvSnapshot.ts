/**
 * "So ca ton theo KTV" (Quan ly ton > Bao cao, CHOT 2026-10-03) - chot 08:00 moi ngay, xem migration
 * 0121. Tap ca ton DUNG Y HET backlogTongTon cua "Bao cao ngay 08:00" (computeBacklogBuckets o
 * dailySnapshot.ts: caseFilterTonAt0800 + chua archive/huy + khuVucReportExclusionClause) va tuoi ton
 * tinh bang ageExpr chuan (moc 00:00 VN, giong cot >=3/5/7/14 cua backlogTren*) - de tong cua bang
 * nay khop voi bang "So ca ton theo moc thoi gian" ngay ben tren tren UI.
 *
 * Luu CHET (khong tinh lai luc xem) - chot voi chu he thong 2026-10-03 sau khi so sanh voi phuong an
 * "tinh luc xem" (tra danh sach id cua daily_snapshot + case_dvbh): luu chet re hon nhieu (doc ~31
 * dong/lan xem thay vi vai nghin) va gan KTV dung thoi diem chot. KHONG bo sung ngay cu.
 *
 * Payload luu histogram tuoi ton theo tung (KTV, khu_vuc) thay vi chi so tong, de bo loc "tu X den Y
 * ngay ton" tuy y van tinh duoc tu du lieu da chot.
 */
import { ageExpr } from "./ageCalc";
import { caseFilterTonAt0800 } from "./needGiaiTrinh";
import { khuVucReportExclusionClause } from "./filterParams";
import { getVnDateStr } from "./reportCache";
import { nowVN } from "./vnTime";

/** [ky_thuat_vien, khu_vuc, [tuoi1, so_ca1, tuoi2, so_ca2, ...]] - tuoi = -1 khi ca khong co
 * thoi_gian_cskh_tiep_nhan (chi tinh vao "Tat ca", khong khop bo loc tuoi nao). Mang phang thay vi
 * object de payload gon (1 dong/ngay, doc lai ca thang 1 lan). */
export type TonKtvEntry = [string, string, number[]];

export interface TonKtvPayload {
  rows: TonKtvEntry[];
}

/** Tinh + ghi de snapshot "hom nay" (gio VN) - idempotent, goi lai trong ngay (cron 08:00 hoac nut
 * "Lam moi bao cao") ghi de bang ket qua moi nhat. */
export async function generateTonKtvSnapshot(db: D1Database): Promise<void> {
  const ngay = getVnDateStr();
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const tuoiExpr = ageExpr("c.thoi_gian_cskh_tiep_nhan");
  const { results } = await db
    .prepare(
      `SELECT COALESCE(c.ky_thuat_vien, '') AS ktv, COALESCE(c.khu_vuc, '') AS kv,
              COALESCE(${tuoiExpr}, -1) AS tuoi, COUNT(*) AS n
       FROM case_dvbh c
       WHERE ${caseFilterTonAt0800("c")} AND c.archived_at IS NULL AND c.huy_bo_at IS NULL${exclusion.sql}
       GROUP BY 1, 2, 3`,
    )
    .bind(...exclusion.binds)
    .all<{ ktv: string; kv: string; tuoi: number; n: number }>();

  const byPair = new Map<string, TonKtvEntry>();
  for (const r of results) {
    const key = `${r.ktv}\u0000${r.kv}`;
    let entry = byPair.get(key);
    if (!entry) {
      entry = [r.ktv, r.kv, []];
      byPair.set(key, entry);
    }
    // Tuoi am chi xay ra khi du lieu tiep nhan sai (o tuong lai) - don ve 0 cho khoi lan voi -1.
    entry[2].push(r.tuoi === -1 ? -1 : Math.max(r.tuoi, 0), r.n);
  }
  const payload: TonKtvPayload = { rows: Array.from(byPair.values()) };

  await db
    .prepare(
      `INSERT INTO ton_ktv_daily (ngay, generated_at, payload) VALUES (?, ?, ?)
       ON CONFLICT(ngay) DO UPDATE SET generated_at = excluded.generated_at, payload = excluded.payload`,
    )
    .bind(ngay, nowVN(), JSON.stringify(payload))
    .run();
}

export interface TonKtvReportRow {
  ktv: string;
  khu_vuc: string;
  /** So ca ton ngay cuoi thang truoc (null neu ngay do chua co snapshot) - lam moc cho bien dong ngay 1. */
  truoc: number | null;
  /** Can theo "days" cua response - null = ngay do chua co snapshot (tuong lai/chua trien khai). */
  so: (number | null)[];
}

export interface TonKtvReport {
  thang: string;
  days: string[];
  ngayCoDuLieu: string[];
  ngayTruoc: string | null;
  rows: TonKtvReportRow[];
}

function daysOfMonth(thang: string): string[] {
  const [y, m] = thang.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${thang}-${String(i + 1).padStart(2, "0")}`);
}

function prevDay(ngay: string): string {
  return new Date(Date.parse(`${ngay}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
}

/** Doc + gop snapshot 1 thang theo bo loc. "matchesKhuVuc" gop ca pham vi xem (Giam sat) lan bo loc
 * khu_vuc tren UI; tuoiTu/tuoiDen la khoang tuoi ton BAO GOM 2 dau (null = khong gioi han). */
export async function getTonKtvMonth(
  db: D1Database,
  thang: string,
  matchesKhuVuc: (kv: string) => boolean,
  tuoiTu: number | null,
  tuoiDen: number | null,
): Promise<TonKtvReport> {
  const days = daysOfMonth(thang);
  const ngayTruoc = prevDay(days[0]);
  const { results } = await db
    .prepare("SELECT ngay, payload FROM ton_ktv_daily WHERE ngay >= ? AND ngay <= ? ORDER BY ngay")
    .bind(ngayTruoc, days[days.length - 1])
    .all<{ ngay: string; payload: string }>();

  const coLoc = tuoiTu !== null || tuoiDen !== null;
  const matchesTuoi = (tuoi: number) => {
    if (!coLoc) return true;
    if (tuoi < 0) return false;
    return (tuoiTu === null || tuoi >= tuoiTu) && (tuoiDen === null || tuoi <= tuoiDen);
  };

  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const rowMap = new Map<string, TonKtvReportRow>();
  const ngayCoDuLieu: string[] = [];
  let coNgayTruoc = false;

  for (const snap of results) {
    const idx = dayIndex.get(snap.ngay);
    const laNgayTruoc = snap.ngay === ngayTruoc;
    if (idx === undefined && !laNgayTruoc) continue;
    if (laNgayTruoc) coNgayTruoc = true;
    else ngayCoDuLieu.push(snap.ngay);

    const payload = JSON.parse(snap.payload) as TonKtvPayload;
    for (const [ktv, kv, hist] of payload.rows) {
      if (!matchesKhuVuc(kv)) continue;
      let n = 0;
      for (let i = 0; i < hist.length; i += 2) if (matchesTuoi(hist[i])) n += hist[i + 1];
      if (n === 0) continue;
      const key = `${ktv}\u0000${kv}`;
      let row = rowMap.get(key);
      if (!row) {
        row = { ktv, khu_vuc: kv, truoc: null, so: days.map(() => null) };
        rowMap.set(key, row);
      }
      if (laNgayTruoc) row.truoc = n;
      else row.so[idx!] = n;
    }
  }

  // Ngay da co snapshot ma KTV khong con ca nao khop -> 0 (khong phai null "chua co du lieu").
  const coDuLieuIdx = ngayCoDuLieu.map((d) => dayIndex.get(d)!);
  for (const row of rowMap.values()) {
    for (const i of coDuLieuIdx) if (row.so[i] === null) row.so[i] = 0;
    if (coNgayTruoc && row.truoc === null) row.truoc = 0;
  }

  return { thang, days, ngayCoDuLieu, ngayTruoc: coNgayTruoc ? ngayTruoc : null, rows: Array.from(rowMap.values()) };
}
