/**
 * Tu ghi log giai trinh "Case đã được kết thúc" (CHOT 2026-10-19) - ca nam trong danh sach "can giai trinh"
 * da chot 08:00 hom nay, nhung TRONG NGAY duoc dong (Hoàn thành / Không hoàn thành = thoi_gian_hoan_thanh
 * co gia tri, roi vao hom nay) ma chua ai giai trinh sau moc chot -> ghi 1 dong giai_trinh he thong de ca do
 * tinh la "da giai trinh", khong con nam trong "con lai can giai trinh".
 *
 * Vi sao ghi THAT vao giai_trinh (khong chi loai khi tinh): moi noi dem "da giai trinh trong ngay" (o so Bao
 * cao 08:00, danh sach chi tiet, giai_trinh_daily_log 17h30, ban theo khu vuc, pham vi NSKX) deu dung CUNG
 * tieu chi "co dong giai_trinh ngay_giai_trinh > moc chot" - 1 dong log tu dong ap dung dong bo cho tat ca,
 * khong phai sua tung cong thuc. Cung khuon voi log tu dong ETX (lib/etxGiaiTrinhSync.ts, migration 0110).
 *
 * - Tap ca: id trong cac bucket "can giai trinh" cua MOI snapshot 08:00 hom nay (daily_snapshot, tru the
 *   Canh bao ton): tonCanGiaiTrinh + thieuLinhKien + 4 chi tieu phu (B2B/NSKX/Loc tong BCN/VIP 24h). KHONG
 *   gom backlogTongTon (tong ton, khong phai danh sach can giai trinh).
 * - nguoi_giai_trinh = user he thong 'he-thong-tu-dong@dvbh.internal' (migration 0033); ly_do_cham = muc
 *   "Case đã được kết thúc" (migration 0138, bat_tat = 0 de nguoi dung khong chon tay duoc).
 * - ngay_giai_trinh = thoi diem ghi (nowVN, luon sau moc chot) - noi_dung ghi tien do + gio dong that.
 * - Idempotent: chi ghi ca CHUA co dong giai_trinh nao sau moc chot (ke ca dong tu dong lan truoc).
 *
 * Goi tu: sau moi import co GHI_MOI/GHI_DE (importRoute.ts scheduleCaLapRefreshIfChanged - ca CRM tay lan
 * pipeline tu dong) + cron moi gio 9h-18h VN (luoi an toan, index.ts DAILY_SNAPSHOT_CRON).
 */
import { bumpVersions } from "./dataVersions";
import { CAP2_KHONG_THEO_TON_KEYS } from "./canhBaoCap2GiaiTrinh";
import { dbGoc } from "./phamVi";
import { getVnDateStr } from "./reportCache";
import { nowVN } from "./vnTime";

export const LY_DO_CA_KET_THUC = "Case đã được kết thúc";
const NGUOI_HE_THONG = "he-thong-tu-dong@dvbh.internal";
const BUCKET_CAN_GIAI_TRINH = ["tonCanGiaiTrinh", "thieuLinhKien", "backlogB2b", "backlogNskx", "backlogLocTongBcn", "backlogVip24h"];

export async function autoLogCaKetThucTrongNgay(dbIn: D1Database): Promise<number> {
  const db = dbGoc(dbIn);
  const ngay = getVnDateStr();
  // 1 SELECT duy nhat qua json_each(payload) loc theo ten bucket - KHONG dung UNION: D1 gioi han 5 nhanh / cau ghep
  // (SQLITE_LIMIT_COMPOUND_SELECT), ban 6 nhanh UNION truoc day loi "too many terms in compound SELECT" moi lan chay
  // (phat hien 2026-10-20) nen chua tung tu ghi duoc log nao.
  const dsBucket = (keys: readonly string[]) => keys.map((k) => `'${k}'`).join(", ");
  const snapIds = `SELECT DISTINCT j.value AS id FROM daily_snapshot s, json_each(s.payload) b, json_each(b.value, '$.ids') j
    WHERE s.ngay = ?1 AND s.scope_key NOT LIKE 'canh_bao_ton%' AND b.key IN (${dsBucket(BUCKET_CAN_GIAI_TRINH)})`;
  // Moc chot som nhat hom nay - dong giai_trinh sau moc nay da tinh "da giai trinh" o moi snapshot.
  const { results } = await db
    .prepare(
      `WITH snap AS (${snapIds}),
            moc AS (SELECT MIN(generated_at) AS since FROM daily_snapshot WHERE ngay = ?1 AND scope_key NOT LIKE 'canh_bao_ton%')
       SELECT CAST(c.id AS TEXT) AS id, c.tien_do_hoan_thanh, c.thoi_gian_hoan_thanh
       FROM case_dvbh c JOIN snap ON snap.id = c.id, moc
       WHERE moc.since IS NOT NULL
         AND c.thoi_gian_hoan_thanh >= ?1
         -- Ca cap 2 vi tranh chap / luong doi tra con treo (lib/canhBaoCap2GiaiTrinh.ts): dong ca khong co nghia la het
         -- can giai trinh -> khong tu ghi log "Case đã được kết thúc".
         AND c.id NOT IN (SELECT j.value FROM daily_snapshot s, json_each(s.payload) b, json_each(b.value, '$.ids') j
           WHERE s.ngay = ?1 AND s.scope_key = 'canh_bao_ton|all' AND b.key IN (${dsBucket(CAP2_KHONG_THEO_TON_KEYS)}))
         AND NOT EXISTS (SELECT 1 FROM giai_trinh g WHERE g.case_id = c.id AND g.ngay_giai_trinh > moc.since)`,
    )
    .bind(ngay)
    .all<{ id: string; tien_do_hoan_thanh: string | null; thoi_gian_hoan_thanh: string }>();
  if (results.length === 0) return 0;

  const now = nowVN();
  // linh_kien_thieu/ngay_* = '' (khong NULL) de ON CONFLICT bat duoc trung - cung ly do voi etxGiaiTrinhSync.ts.
  const stmts = results.map((r) =>
    db
      .prepare(
        `INSERT INTO giai_trinh (id, case_id, ly_do_cham, noi_dung, linh_kien_thieu, ngay_du_kien_hoan_thanh,
           ngay_yeu_cau_co_hang, ma_xuat_hang_lien_quan, nguoi_giai_trinh, ngay_giai_trinh)
         VALUES (?, ?, ?, ?, '', '', '', '', ?, ?)
         ON CONFLICT(case_id, ly_do_cham, nguoi_giai_trinh, ngay_giai_trinh, noi_dung, linh_kien_thieu,
           ngay_du_kien_hoan_thanh, ngay_yeu_cau_co_hang, ma_xuat_hang_lien_quan) DO NOTHING`,
      )
      .bind(
        crypto.randomUUID(),
        r.id,
        LY_DO_CA_KET_THUC,
        `Hệ thống tự ghi: ca đã kết thúc trong ngày (${r.tien_do_hoan_thanh ?? "đã đóng"} lúc ${r.thoi_gian_hoan_thanh}) - không cần giải trình.`,
        NGUOI_HE_THONG,
        now,
      ),
  );
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  await bumpVersions(db, ["giai_trinh"]);
  return results.length;
}
