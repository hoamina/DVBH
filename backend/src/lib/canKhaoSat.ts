import { NEED_SURVEY_CONDITION } from "./surveyConditions";

// Duy tri case_dvbh.can_khao_sat (migration 0097) - gia tri da tinh san cua NEED_SURVEY_CONDITION,
// thay the viec quet + NOT EXISTS + subquery tuong quan o MOI lan doc bao cao/danh sach khao sat.
//
// Goi tu 3 diem ghi anh huong truc tiep den dieu kien nay:
//   1. lib/importProcessor.ts - sau khi ratchet 4 co loi_* (import CRM hang ngay/backfill)
//   2. routes/survey.ts POST /calls - sau khi ghi ket_qua_goi/vi_pham (CSKH khao sat qua UI)
//   3. routes/importKhaoSat.ts - sau khi ghi ket_qua_goi/vi_pham (import/sync-sheet du lieu khao sat cu)
// KHONG can goi tu routes/viPham.ts (QC chot chot_bo_cap_2) - NOT EXISTS chi kiem tra SU TON TAI cua
// dong vi_pham, khong phu thuoc chot_bo_cap_2, nen hanh dong QC khong lam doi ket qua dieu kien nay.
//
// Ngoai 3 diem ghi tren, con 1 luoi an toan tu-heal chay hang ngay (index.ts DAILY_SNAPSHOT_CRON,
// xem selfHealCanKhaoSat ben duoi) phong truong hop 1 diem ghi nao do quen goi ham nay (vd code moi
// them sau nay ma khong biet phai cap nhat can_khao_sat) - can_khao_sat la cot suy dien LAI DUOC tu
// du lieu goc bat cu luc nao, khac voi du lieu nghiep vu goc khong the tu phuc hoi.
const CHUNK_SIZE = 100; // an toan voi gioi han bind-param cua SQLite/D1, cung muc CHUNK_SIZE_SELECT o importProcessor.ts

export async function recomputeCanKhaoSatBatch(db: D1Database, caseIds: string[]): Promise<void> {
  const uniqueIds = Array.from(new Set(caseIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;

  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    await db
      .prepare(
        `UPDATE case_dvbh AS c
         SET can_khao_sat = CASE WHEN ${NEED_SURVEY_CONDITION} THEN 1 ELSE 0 END
         WHERE c.id IN (${placeholders})`,
      )
      .bind(...chunk)
      .run();
  }
}

// Luoi an toan hang ngay - tinh lai can_khao_sat cho tap hop CO THE bi lech, khong quet toan bo
// case_dvbh (se lai chinh la van de dang sua). Gom 2 huong lech co the xay ra:
//   (a) can_khao_sat dang = 1 nhung thuc te da het can (vd 1 diem ghi nao do quen goi recompute sau
//       khi ket_qua_goi/vi_pham thay doi) - tap nay CHAC CHAN nho va co index (idx_case_can_khao_sat_
//       thang, migration 0097) nen quet lai toan bo la re.
//   (b) can_khao_sat dang = 0 hoac NULL nhung thuc te CAN khao sat (vd loi_* vua duoc ratchet len 1
//       nhung buoc recompute o importProcessor.ts bi bo sot) - khong the tim tap nay ma khong quet
//       rong hon, nen GIOI HAN o case con "song" theo nghiep vu: chua hoan thanh HOAC hoan thanh
//       khong qua 45 ngay (rong hon nguong "qua han 3 ngay" cua RECENT_OR_OPEN_CONDITION mot khoang
//       an toan, nhung van nho hon nhieu so voi toan bang - case da hoan thanh qua 45 ngay coi nhu
//       khong con ai theo doi khao sat nua trong thuc te nghiep vu).
export async function selfHealCanKhaoSat(db: D1Database): Promise<{ updated: number }> {
  const result = await db
    .prepare(
      `UPDATE case_dvbh AS c
       SET can_khao_sat = CASE WHEN ${NEED_SURVEY_CONDITION} THEN 1 ELSE 0 END
       WHERE c.archived_at IS NULL AND c.huy_bo_at IS NULL
         AND (
           c.can_khao_sat = 1
           OR (
             (c.loi_120p = 1 OR c.loi_qua_han_24h = 1 OR c.loi_lo_ke_hoach = 1 OR c.loi_kh_hen_lai = 1)
             AND (c.thoi_gian_hoan_thanh IS NULL OR c.thoi_gian_hoan_thanh >= datetime('now', 'start of day', '-45 days'))
             AND c.can_khao_sat IS NOT 1
           )
         )`,
    )
    .run();
  return { updated: result.meta.changes ?? 0 };
}
