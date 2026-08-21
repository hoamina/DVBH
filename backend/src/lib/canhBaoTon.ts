/**
 * "Canh bao ton danh cho QL" (Quan ly ton) - 2 cap canh bao (Cap 1 TP DVBH / Cap 2 CEO), moi cap 4
 * chi tieu tuoi tồn khac nguong. Chot 1 lan/ngay luc 08:00 gio VN (cung cron DAILY_SNAPSHOT_CRON,
 * xem index.ts + generateCanhBaoTonSnapshot ben duoi) - KHONG tinh song, khac moi bao cao khac trong
 * "Quan ly ton" o cho: day la bao cao escalation cap quan ly, tinh TOAN HE THONG (khong loc theo
 * khu_vuc_phu_trach cua nguoi xem, ke ca Giam sat) - da chot voi nguoi dung.
 *
 * 4 quyet dinh nghiep vu da hoi truc tiep nguoi dung (khong doan):
 * - VIP/S.VIP: c.nhom_kh LIKE '%VIP%' (khong phan biet hoa/thuong, tu dong gom ca "SVIP" vi SVIP
 *   chua VIP - vd du lieu that "14. KH SVIP", "17. GT Vip 1", "18. GT Vip 2").
 * - "Loc tong": CHI c.nhom_san_pham = 'Lọc tổng' (khong gop "Loc nuoc BCN" nhu
 *   NEED_LOC_TONG_BCN_1_NGAY dang lam cho chi tieu khac trong needGiaiTrinh.ts).
 * - "Tranh chap chua xu ly xong": trang thai log MOI NHAT cua tien trinh tranh chap MOI NHAT cua ca
 *   KHONG thuoc TRANH_CHAP_TRANG_THAI_DONG - tuoi tinh theo tt.ngay_tao (TUOI_TIEN_TRINH_EXPR), KHONG
 *   bat buoc case goc phai con "ton" (case co the da hoan thanh nhung tranh chap phat sinh sau van
 *   tinh - y nghia la "tranh chap treo bao lau", khac "case treo bao lau").
 * - "Ton thuong" (>=14/>20 ngay) tinh TOAN BO ca ton dat nguong, KHONG loai tru ca da tinh o
 *   VIP/Loc tong/Tranh chap (4 con so co the trung nhau, giong cach he thong tach B2B/NSKX rieng
 *   khoi tong chung - xem NEED_B2B_1_NGAY/NEED_NSKX_2_NGAY trong needGiaiTrinh.ts).
 */
import { ageExpr } from "./ageCalc";
import { caseFilterTonAt0800 } from "./needGiaiTrinh";
import { khuVucReportExclusionClause, khuVucAdHocClause } from "./filterParams";
import {
  LATEST_TIEN_TRINH_ID_OF_CASE,
  CASE_TRANH_CHAP_STATUS_EXPR,
  TRANH_CHAP_TRANG_THAI_DONG,
  TUOI_TIEN_TRINH_EXPR,
} from "./tranhChapTienTrinh";
import { type SnapshotBucket, upsertSnapshot } from "./dailySnapshot";
import { getVnDateStr } from "./reportCache";
import { nowVN } from "./vnTime";
import { renderCanhBaoTonImage } from "./reportImage";
import { sendTelegramPhoto, TELEGRAM_BOT_ID, TELEGRAM_CHAT_ID } from "./telegram";

const AGE_C = ageExpr("c.thoi_gian_cskh_tiep_nhan");

export const NEED_TON_14_NGAY = `${AGE_C} >= 14`;
export const NEED_TON_20_NGAY = `${AGE_C} > 20`;
export const NEED_VIP_SVIP_5_NGAY = `c.nhom_kh LIKE '%VIP%' AND ${AGE_C} >= 5`;
export const NEED_VIP_SVIP_7_NGAY = `c.nhom_kh LIKE '%VIP%' AND ${AGE_C} >= 7`;
export const NEED_LOC_TONG_3_NGAY = `c.nhom_san_pham = 'Lọc tổng' AND ${AGE_C} >= 3`;
export const NEED_LOC_TONG_5_NGAY = `c.nhom_san_pham = 'Lọc tổng' AND ${AGE_C} >= 5`;

const TRANH_CHAP_DONG_PLACEHOLDERS = TRANH_CHAP_TRANG_THAI_DONG.map(() => "?").join(", ");

export type CanhBaoTonMetricKey = "ton14" | "vipSvip5" | "locTong3" | "tranhChap3" | "ton20" | "vipSvip7" | "locTong5" | "tranhChap5";
export type CanhBaoTonBuckets = Record<CanhBaoTonMetricKey, SnapshotBucket>;
export type CanhBaoTonKhuVucRow = Record<CanhBaoTonMetricKey, number>;

const EMPTY_ROW: CanhBaoTonKhuVucRow = { ton14: 0, vipSvip5: 0, locTong3: 0, tranhChap3: 0, ton20: 0, vipSvip7: 0, locTong5: 0, tranhChap5: 0 };

const toBucket = (rows: { id: string }[]): SnapshotBucket => ({ ids: rows.map((r) => r.id), count: rows.length });

function needIdQuery(db: D1Database, needExpr: string) {
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const tonAnchorC = caseFilterTonAt0800("c");
  return db
    .prepare(
      `SELECT c.id as id FROM case_dvbh c
       WHERE ${tonAnchorC} AND c.archived_at IS NULL AND c.huy_bo_at IS NULL AND ${needExpr}${exclusion.sql}`,
    )
    .bind(...exclusion.binds)
    .all<{ id: string }>();
}

function tranhChapIdQuery(db: D1Database, minAge: number) {
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  return db
    .prepare(
      `SELECT c.id as id FROM case_dvbh c
       JOIN tranh_chap_tien_trinh tt ON tt.id = ${LATEST_TIEN_TRINH_ID_OF_CASE}
       WHERE ${CASE_TRANH_CHAP_STATUS_EXPR} NOT IN (${TRANH_CHAP_DONG_PLACEHOLDERS}) AND ${TUOI_TIEN_TRINH_EXPR} >= ?${exclusion.sql}`,
    )
    .bind(...TRANH_CHAP_TRANG_THAI_DONG, minAge, ...exclusion.binds)
    .all<{ id: string }>();
}

/** Buckets toan he thong (khong loc khu_vuc) voi danh sach id day du - dung lam payload dong bang
 * cho card "hom nay" (click-through) + tong so gui anh Telegram. */
export async function computeCanhBaoTonBuckets(db: D1Database): Promise<CanhBaoTonBuckets> {
  const [ton14, ton20, vipSvip5, vipSvip7, locTong3, locTong5, tranhChap3, tranhChap5] = await Promise.all([
    needIdQuery(db, NEED_TON_14_NGAY),
    needIdQuery(db, NEED_TON_20_NGAY),
    needIdQuery(db, NEED_VIP_SVIP_5_NGAY),
    needIdQuery(db, NEED_VIP_SVIP_7_NGAY),
    needIdQuery(db, NEED_LOC_TONG_3_NGAY),
    needIdQuery(db, NEED_LOC_TONG_5_NGAY),
    tranhChapIdQuery(db, 3),
    tranhChapIdQuery(db, 5),
  ]);
  return {
    ton14: toBucket(ton14.results),
    ton20: toBucket(ton20.results),
    vipSvip5: toBucket(vipSvip5.results),
    vipSvip7: toBucket(vipSvip7.results),
    locTong3: toBucket(locTong3.results),
    locTong5: toBucket(locTong5.results),
    tranhChap3: toBucket(tranhChap3.results),
    tranhChap5: toBucket(tranhChap5.results),
  };
}

/** So dem (khong id) GROUP BY khu_vuc - dung ghi 1 dong/khu_vuc vao canh_bao_ton_daily_log
 * (lich su vinh vien, xem migration 0076). */
export async function computeCanhBaoTonByKhuVuc(db: D1Database): Promise<Record<string, CanhBaoTonKhuVucRow>> {
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const tonAnchorC = caseFilterTonAt0800("c");

  const [{ results: mainRows }, { results: tcRows }] = await Promise.all([
    db
      .prepare(
        `SELECT c.khu_vuc as khu_vuc,
           SUM(CASE WHEN ${NEED_TON_14_NGAY} THEN 1 ELSE 0 END) as ton14,
           SUM(CASE WHEN ${NEED_TON_20_NGAY} THEN 1 ELSE 0 END) as ton20,
           SUM(CASE WHEN ${NEED_VIP_SVIP_5_NGAY} THEN 1 ELSE 0 END) as vipSvip5,
           SUM(CASE WHEN ${NEED_VIP_SVIP_7_NGAY} THEN 1 ELSE 0 END) as vipSvip7,
           SUM(CASE WHEN ${NEED_LOC_TONG_3_NGAY} THEN 1 ELSE 0 END) as locTong3,
           SUM(CASE WHEN ${NEED_LOC_TONG_5_NGAY} THEN 1 ELSE 0 END) as locTong5
         FROM case_dvbh c
         WHERE ${tonAnchorC} AND c.archived_at IS NULL AND c.huy_bo_at IS NULL AND c.khu_vuc IS NOT NULL${exclusion.sql}
         GROUP BY c.khu_vuc`,
      )
      .bind(...exclusion.binds)
      .all<{ khu_vuc: string } & Record<string, number>>(),
    db
      .prepare(
        `SELECT c.khu_vuc as khu_vuc,
           SUM(CASE WHEN ${TUOI_TIEN_TRINH_EXPR} >= 3 THEN 1 ELSE 0 END) as tranhChap3,
           SUM(CASE WHEN ${TUOI_TIEN_TRINH_EXPR} >= 5 THEN 1 ELSE 0 END) as tranhChap5
         FROM case_dvbh c
         JOIN tranh_chap_tien_trinh tt ON tt.id = ${LATEST_TIEN_TRINH_ID_OF_CASE}
         WHERE ${CASE_TRANH_CHAP_STATUS_EXPR} NOT IN (${TRANH_CHAP_DONG_PLACEHOLDERS}) AND c.khu_vuc IS NOT NULL${exclusion.sql}
         GROUP BY c.khu_vuc`,
      )
      .bind(...TRANH_CHAP_TRANG_THAI_DONG, ...exclusion.binds)
      .all<{ khu_vuc: string } & Record<string, number>>(),
  ]);

  const byKhuVuc: Record<string, CanhBaoTonKhuVucRow> = {};
  for (const r of mainRows) {
    byKhuVuc[r.khu_vuc] = {
      ...EMPTY_ROW,
      ton14: r.ton14 ?? 0,
      ton20: r.ton20 ?? 0,
      vipSvip5: r.vipSvip5 ?? 0,
      vipSvip7: r.vipSvip7 ?? 0,
      locTong3: r.locTong3 ?? 0,
      locTong5: r.locTong5 ?? 0,
    };
  }
  for (const r of tcRows) {
    const acc = byKhuVuc[r.khu_vuc] ?? { ...EMPTY_ROW };
    acc.tranhChap3 = r.tranhChap3 ?? 0;
    acc.tranhChap5 = r.tranhChap5 ?? 0;
    byKhuVuc[r.khu_vuc] = acc;
  }
  return byKhuVuc;
}

const SNAPSHOT_SCOPE_KEY = "canh_bao_ton|all";

/** Chay o cron 08:00 VN (index.ts DAILY_SNAPSHOT_CRON) - dong bang buckets vao daily_snapshot (tai
 * dung bang co san, scope_key rieng), ghi 1 dong/khu_vuc vao canh_bao_ton_daily_log (lich su vinh
 * vien, ON CONFLICT DO NOTHING giong chotGiaiTrinhDailyLog), roi gui anh PNG tom tat qua Telegram.
 * Loi gui anh KHONG chan phan luu DB (bocc try/catch rieng, giong chotGiaiTrinhDailyLog). */
export async function generateCanhBaoTonSnapshot(db: D1Database, generatedBy: string): Promise<void> {
  const ngay = getVnDateStr();
  const generatedAt = nowVN();

  const [buckets, byKhuVuc] = await Promise.all([computeCanhBaoTonBuckets(db), computeCanhBaoTonByKhuVuc(db)]);

  await upsertSnapshot(db, ngay, SNAPSHOT_SCOPE_KEY, generatedAt, generatedBy, buckets);

  for (const [khuVuc, row] of Object.entries(byKhuVuc)) {
    try {
      await db
        .prepare(
          `INSERT INTO canh_bao_ton_daily_log
             (ngay, khu_vuc, ton_14_ngay, vip_svip_5_ngay, loc_tong_3_ngay, tranh_chap_3_ngay, ton_20_ngay, vip_svip_7_ngay, loc_tong_5_ngay, tranh_chap_5_ngay)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(ngay, khu_vuc) DO NOTHING`,
        )
        .bind(ngay, khuVuc, row.ton14, row.vipSvip5, row.locTong3, row.tranhChap3, row.ton20, row.vipSvip7, row.locTong5, row.tranhChap5)
        .run();
    } catch (err) {
      console.error(`generateCanhBaoTonSnapshot: loi khi ghi khu vuc ${khuVuc}`, err);
    }
  }

  try {
    const dateParts = ngay.split("-");
    const ngayFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
    const cap1 = [
      { label: "Tồn ≥14 ngày", count: buckets.ton14.count },
      { label: "VIP/S.VIP tồn ≥5 ngày", count: buckets.vipSvip5.count },
      { label: "Lọc tổng tồn ≥3 ngày", count: buckets.locTong3.count },
      { label: "Tranh chấp/KN ≥3 ngày", count: buckets.tranhChap3.count },
    ];
    const cap2 = [
      { label: "Tồn >20 ngày", count: buckets.ton20.count },
      { label: "VIP/S.VIP tồn ≥7 ngày", count: buckets.vipSvip7.count },
      { label: "Lọc tổng tồn ≥5 ngày", count: buckets.locTong5.count },
      { label: "Tranh chấp/KN ≥5 ngày", count: buckets.tranhChap5.count },
    ];
    const png = await renderCanhBaoTonImage(cap1, cap2, ngayFormatted);
    await sendTelegramPhoto(TELEGRAM_BOT_ID, TELEGRAM_CHAT_ID, png);
  } catch (err) {
    console.error("[Telegram] Loi tien trinh gui anh Canh bao ton danh cho QL:", err instanceof Error ? err.message : String(err));
  }
}

/** CHOT 2026-08-20 (doi tu thiet ke "toan he thong khong loc" ban dau): loc lai 1 CanhBaoTonBuckets
 * da tinh san (tu snapshot dong bang 08:00) xuong con dung case thuoc khu_vuc dang chon tren UI - gom
 * TOAN BO id xuat hien o ca 8 bucket lai (1 case co the trung nhau giua nhieu chi tieu) roi truy van
 * 1 LAN duy nhat de biet id nao thuoc khu_vuc, tranh 8 truy van rieng. Ho tro gia tri ao __QLDVBH__ +
 * nhieu khu vuc cung luc giong moi bo loc khu_vuc khac trong he thong (xem khuVucAdHocClause). Van giu
 * NGUYEN tap id goc cua tung bucket (khong tinh lai NEED_* song) - chi THU HEP theo khu_vuc, dam bao
 * StatCard va danh sach click-through tiep tuc khop tuyet doi voi nhau (ca 2 cung loc tren 1 tap id). */
export async function filterBucketsByKhuVuc(db: D1Database, buckets: CanhBaoTonBuckets, khuVucFilter: string | undefined): Promise<CanhBaoTonBuckets> {
  if (!khuVucFilter) return buckets;
  const allIds = Array.from(new Set(Object.values(buckets).flatMap((b) => b.ids)));
  if (allIds.length === 0) return buckets;
  const khuVucClause = khuVucAdHocClause("khu_vuc", khuVucFilter);
  const { results } = await db
    .prepare(`SELECT id FROM case_dvbh WHERE id IN (SELECT value FROM json_each(?))${khuVucClause.sql}`)
    .bind(JSON.stringify(allIds), ...khuVucClause.binds)
    .all<{ id: string }>();
  const allowed = new Set(results.map((r) => r.id));
  const filtered = {} as CanhBaoTonBuckets;
  for (const key of Object.keys(buckets) as CanhBaoTonMetricKey[]) {
    const ids = buckets[key].ids.filter((id) => allowed.has(id));
    filtered[key] = { ids, count: ids.length };
  }
  return filtered;
}

export interface CanhBaoTonProgressToday {
  daGtHomNay: number;
  daKetThuc: number;
  hienTaiCon: number;
}
export type CanhBaoTonProgress = Record<CanhBaoTonMetricKey, CanhBaoTonProgressToday>;

const TRANH_CHAP_METRIC_KEYS: readonly CanhBaoTonMetricKey[] = ["tranhChap3", "tranhChap5"];

/** CHOT 2026-08-20 (item 4): 3 con so phu "hom nay" cho tung o metric cua the Canh bao ton - dua tren
 * DUNG tap id da dong bang cua bucket (khong tinh lai NEED_* song, giong filterBucketsByKhuVuc), chia
 * lam 2 nhom nguon du lieu khac nhau theo yeu cau nguoi dung (khong doan):
 * - Nhom "ton thuong" (ton14/vipSvip5/locTong3/ton20/vipSvip7/locTong5): "Da GT hom nay" = co dong
 *   giai_trinh voi ngay_giai_trinh = hom nay (gio VN) VA ca CHUA dong hom nay (tranh dem trung voi "Da
 *   ket thuc"). "Da ket thuc" = case_dvbh.thoi_gian_hoan_thanh roi vao hom nay (case chuyen tu ton sang
 *   dong NGAY TRONG HOM NAY, du van con trong tap id vi tap id chi dong bang tai 08:00).
 * - Nhom "tranh chap" (tranhChap3/tranhChap5): "Da ket thuc" = tien trinh MOI NHAT cua ca da chuyen
 *   sang 1 trong TRANH_CHAP_TRANG_THAI_DONG VA log dong do duoc tao hom nay. "Da GT hom nay" = tien
 *   trinh CHUA dong nhung co it nhat 1 log CHINH hoac 1 "log con" (migration 0092 - ghi chu tien do,
 *   khong doi trang thai) duoc tao hom nay - dung y nghia "co dong xu ly hom nay du chua ket thuc".
 * "Hien tai con" = tong bucket - da GT hom nay - da ket thuc (2 nhom tren da duoc thiet ke LOAI TRU
 * lan nhau - 1 case chi roi vao dung 1 trong 2, hoac khong roi vao nhom nao ca). */
export async function computeCanhBaoTonProgressToday(db: D1Database, buckets: CanhBaoTonBuckets): Promise<CanhBaoTonProgress> {
  const todayVN = getVnDateStr();
  const normalKeys = (Object.keys(buckets) as CanhBaoTonMetricKey[]).filter((k) => !TRANH_CHAP_METRIC_KEYS.includes(k));
  const normalIds = Array.from(new Set(normalKeys.flatMap((k) => buckets[k].ids)));
  const tranhChapIds = Array.from(new Set(TRANH_CHAP_METRIC_KEYS.flatMap((k) => buckets[k].ids)));

  const ketThucNormalSet = new Set<string>();
  const gtNormalSet = new Set<string>();
  if (normalIds.length > 0) {
    const [{ results: closedRows }, { results: gtRows }] = await Promise.all([
      db
        .prepare(
          `SELECT id FROM case_dvbh WHERE id IN (SELECT value FROM json_each(?)) AND thoi_gian_hoan_thanh >= ? AND thoi_gian_hoan_thanh < date(?, '+1 day')`,
        )
        .bind(JSON.stringify(normalIds), todayVN, todayVN)
        .all<{ id: string }>(),
      db
        .prepare(
          `SELECT DISTINCT case_id FROM giai_trinh WHERE case_id IN (SELECT value FROM json_each(?)) AND ngay_giai_trinh >= ? AND ngay_giai_trinh < date(?, '+1 day')`,
        )
        .bind(JSON.stringify(normalIds), todayVN, todayVN)
        .all<{ case_id: string }>(),
    ]);
    for (const r of closedRows) ketThucNormalSet.add(r.id);
    for (const r of gtRows) if (!ketThucNormalSet.has(r.case_id)) gtNormalSet.add(r.case_id);
  }

  const ketThucTcSet = new Set<string>();
  const gtTcSet = new Set<string>();
  if (tranhChapIds.length > 0) {
    const dongList = TRANH_CHAP_TRANG_THAI_DONG as readonly string[];
    const [{ results: tcRows }, { results: logConRows }] = await Promise.all([
      db
        .prepare(
          `SELECT c.id as case_id, ll.trang_thai_xu_ly as trang_thai, ll.created_at as latest_log_at
           FROM case_dvbh c
           JOIN tranh_chap_tien_trinh tt ON tt.id = ${LATEST_TIEN_TRINH_ID_OF_CASE}
           JOIN tranh_chap_log ll ON ll.id = (SELECT id FROM tranh_chap_log WHERE tien_trinh_id = tt.id ORDER BY id DESC LIMIT 1)
           WHERE c.id IN (SELECT value FROM json_each(?))`,
        )
        .bind(JSON.stringify(tranhChapIds))
        .all<{ case_id: string; trang_thai: string; latest_log_at: string }>(),
      db
        .prepare(
          `SELECT DISTINCT tt.case_id as case_id
           FROM tranh_chap_log_con lc
           JOIN tranh_chap_log ll ON ll.id = lc.tranh_chap_log_id
           JOIN tranh_chap_tien_trinh tt ON tt.id = ll.tien_trinh_id
           WHERE tt.case_id IN (SELECT value FROM json_each(?)) AND lc.created_at >= ? AND lc.created_at < date(?, '+1 day')`,
        )
        .bind(JSON.stringify(tranhChapIds), todayVN, todayVN)
        .all<{ case_id: string }>(),
    ]);
    for (const r of tcRows) {
      const isDong = dongList.includes(r.trang_thai);
      const latestAtToday = r.latest_log_at?.slice(0, 10) === todayVN;
      if (isDong && latestAtToday) ketThucTcSet.add(r.case_id);
      else if (!isDong && latestAtToday) gtTcSet.add(r.case_id);
    }
    for (const r of logConRows) if (!ketThucTcSet.has(r.case_id)) gtTcSet.add(r.case_id);
  }

  const result = {} as CanhBaoTonProgress;
  for (const key of Object.keys(buckets) as CanhBaoTonMetricKey[]) {
    const isTranhChap = (TRANH_CHAP_METRIC_KEYS as readonly string[]).includes(key);
    const ketThucSet = isTranhChap ? ketThucTcSet : ketThucNormalSet;
    const gtSet = isTranhChap ? gtTcSet : gtNormalSet;
    let daGtHomNay = 0;
    let daKetThuc = 0;
    for (const id of buckets[key].ids) {
      if (ketThucSet.has(id)) daKetThuc++;
      else if (gtSet.has(id)) daGtHomNay++;
    }
    result[key] = { daGtHomNay, daKetThuc, hienTaiCon: buckets[key].count - daGtHomNay - daKetThuc };
  }
  return result;
}

export interface CanhBaoTonSnapshot {
  generatedAt: string;
  generatedBy: string;
  buckets: CanhBaoTonBuckets;
}

export interface CanhBaoTonTrendPoint {
  yesterday: number | null;
  weekAgo: number | null;
  monthAgo: number | null;
}
export type CanhBaoTonTrend = Record<CanhBaoTonMetricKey, CanhBaoTonTrendPoint>;

const TREND_COLS: Record<CanhBaoTonMetricKey, string> = {
  ton14: "ton_14_ngay",
  vipSvip5: "vip_svip_5_ngay",
  locTong3: "loc_tong_3_ngay",
  tranhChap3: "tranh_chap_3_ngay",
  ton20: "ton_20_ngay",
  vipSvip7: "vip_svip_7_ngay",
  locTong5: "loc_tong_5_ngay",
  tranhChap5: "tranh_chap_5_ngay",
};

/** "YYYY-MM-DD" theo gio VN, lui N ngay - dung pattern voi getVnDateStr() (+7h roi cat chuoi ngay). */
function vnDateOffset(daysAgo: number): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000 - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** So sanh nhanh 3 moc (hom qua/D-7/D-30) cho card tong quan - CHOT 2026-08-16 theo phan hoi "90% noi
 * dung thua thai, thieu cai can xem trong 2s": thay vi liet ke toan bo 8 bang khu_vuc x 14 ngay, chi
 * can 1 dong so sanh xu huong ngan gon cho tung chi tieu. Mac dinh tinh TOAN HE THONG (SUM tat ca
 * khu_vuc) - CHOT 2026-08-20: them "khuVucFilter" tuy chon (bo loc khu_vuc dang chon tren UI, KHAC voi
 * scope theo vai_tro/khu_vuc_phu_trach cua nguoi xem - van khong ap dung o day) de dong bo voi
 * computeCanhBaoTonBuckets khi nguoi dung chu dong loc theo khu_vuc. Tra null cho moc nao chua co du
 * lieu lich su (vd chua du 30 ngay ke tu luc tinh nang deploy). */
export async function getCanhBaoTonTrendDeltas(db: D1Database, khuVucFilter?: string): Promise<CanhBaoTonTrend> {
  const dYesterday = vnDateOffset(1);
  const dWeek = vnDateOffset(7);
  const dMonth = vnDateOffset(30);
  const khuVucClause = khuVucAdHocClause("khu_vuc", khuVucFilter);

  const { results } = await db
    .prepare(
      `SELECT ngay,
         SUM(ton_14_ngay) as ton_14_ngay, SUM(vip_svip_5_ngay) as vip_svip_5_ngay,
         SUM(loc_tong_3_ngay) as loc_tong_3_ngay, SUM(tranh_chap_3_ngay) as tranh_chap_3_ngay,
         SUM(ton_20_ngay) as ton_20_ngay, SUM(vip_svip_7_ngay) as vip_svip_7_ngay,
         SUM(loc_tong_5_ngay) as loc_tong_5_ngay, SUM(tranh_chap_5_ngay) as tranh_chap_5_ngay
       FROM canh_bao_ton_daily_log
       WHERE ngay IN (?, ?, ?)${khuVucClause.sql}
       GROUP BY ngay`,
    )
    .bind(dYesterday, dWeek, dMonth, ...khuVucClause.binds)
    .all<{ ngay: string } & Record<string, number>>();

  const byNgay = new Map(results.map((r) => [r.ngay, r]));
  const y = byNgay.get(dYesterday);
  const w = byNgay.get(dWeek);
  const m = byNgay.get(dMonth);

  const build = (key: CanhBaoTonMetricKey): CanhBaoTonTrendPoint => {
    const col = TREND_COLS[key];
    return {
      yesterday: y ? (y[col] ?? 0) : null,
      weekAgo: w ? (w[col] ?? 0) : null,
      monthAgo: m ? (m[col] ?? 0) : null,
    };
  };

  return {
    ton14: build("ton14"),
    vipSvip5: build("vipSvip5"),
    locTong3: build("locTong3"),
    tranhChap3: build("tranhChap3"),
    ton20: build("ton20"),
    vipSvip7: build("vipSvip7"),
    locTong5: build("locTong5"),
    tranhChap5: build("tranhChap5"),
  };
}

/** Doc snapshot dong bang cua hom nay, tu-heal (tinh + luu ngay tai cho) neu chua co - giong
 * getSnapshotForUser trong dailySnapshot.ts nhung khong co bien the theo vai_tro/khu_vuc (bao cao
 * nay tinh toan he thong, ai xem cung thay CHUNG 1 bo so). */
export async function getCanhBaoTonSnapshot(db: D1Database): Promise<CanhBaoTonSnapshot> {
  const ngay = getVnDateStr();
  let row = await db
    .prepare("SELECT generated_at, generated_by, payload FROM daily_snapshot WHERE ngay = ? AND scope_key = ?")
    .bind(ngay, SNAPSHOT_SCOPE_KEY)
    .first<{ generated_at: string; generated_by: string; payload: string }>();

  if (!row) {
    const generatedAt = nowVN();
    const buckets = await computeCanhBaoTonBuckets(db);
    await upsertSnapshot(db, ngay, SNAPSHOT_SCOPE_KEY, generatedAt, "auto", buckets);
    row = { generated_at: generatedAt, generated_by: "auto", payload: JSON.stringify(buckets) };
  }

  return { generatedAt: row.generated_at, generatedBy: row.generated_by, buckets: JSON.parse(row.payload) };
}
