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
import { khuVucReportExclusionClause } from "./filterParams";
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
 * can 1 dong so sanh xu huong ngan gon cho tung chi tieu. Tinh TOAN HE THONG (SUM tat ca khu_vuc,
 * KHONG loc theo scope nguoi xem) - dung nguyen tac voi computeCanhBaoTonBuckets/getCanhBaoTonSnapshot
 * o tren (bao cao escalation cap quan ly, khong scope theo khu_vuc_phu_trach). Tra null cho moc nao
 * chua co du lieu lich su (vd chua du 30 ngay ke tu luc tinh nang deploy). */
export async function getCanhBaoTonTrendDeltas(db: D1Database): Promise<CanhBaoTonTrend> {
  const dYesterday = vnDateOffset(1);
  const dWeek = vnDateOffset(7);
  const dMonth = vnDateOffset(30);

  const { results } = await db
    .prepare(
      `SELECT ngay,
         SUM(ton_14_ngay) as ton_14_ngay, SUM(vip_svip_5_ngay) as vip_svip_5_ngay,
         SUM(loc_tong_3_ngay) as loc_tong_3_ngay, SUM(tranh_chap_3_ngay) as tranh_chap_3_ngay,
         SUM(ton_20_ngay) as ton_20_ngay, SUM(vip_svip_7_ngay) as vip_svip_7_ngay,
         SUM(loc_tong_5_ngay) as loc_tong_5_ngay, SUM(tranh_chap_5_ngay) as tranh_chap_5_ngay
       FROM canh_bao_ton_daily_log
       WHERE ngay IN (?, ?, ?)
       GROUP BY ngay`,
    )
    .bind(dYesterday, dWeek, dMonth)
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
