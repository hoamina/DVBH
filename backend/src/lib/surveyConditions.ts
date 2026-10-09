// Tach rieng khoi routes/survey.ts (2026-08-21) de lib/canKhaoSat.ts va lib/importProcessor.ts
// dung lai duoc ma khong tao vong import nguoc (lib/ -> routes/). Noi dung khong doi.

// Ca can khao sat: co it nhat 1 co nghi ngo chua duoc khao sat (chua co dong vi_pham tuong ung) VA
// cuoc goi GAN NHAT (neu co) khong bi CSKH tich "khong can goi lai" - xem chu thich day du (lich su
// CHOT 2026-08-06) o ban goc truoc khi tach, van con trong git blame cua file nay.
// Day la dinh nghia GOC, duy nhat - cot case_dvbh.can_khao_sat (migration 0097) la gia tri DA TINH
// SAN cua chinh dieu kien nay, duy tri qua lib/canKhaoSat.ts recomputeCanKhaoSatBatch(). Cac truy
// van DOC (bao cao, danh sach) nen dung "c.can_khao_sat = 1" thay vi lap lai dieu kien nay truc
// tiep - chi lib/canKhaoSat.ts (noi TINH gia tri) va cac luong backfill/tu-heal moi can import
// hang so nay.
//
// CHOT 2026-10-02 (chu he thong): KH co ten chua "ĐMX" (vd "[ĐMX] [API ĐMX] ...", ~23% hang doi luc do)
// KHONG thuoc dien CSKH khao sat vi pham - loai khoi dieu kien goc. Ca cu dang can_khao_sat = 1 duoc
// selfHealCanKhaoSat() (cron 08:00 VN) tinh lai ve 0; ca moi/import sau tu dung dieu kien nay.
// CHOT 2026-10-09: "Danh sach loai tru" (bang khao_sat_loai_tru, migration 0128) - KTV + nhom loi + khoang ngay (so voi
// ngay CSKH tiep nhan ca). Nghi ngo loai X cua ca thuoc 1 dong loai tru -> KHONG tinh la can khao sat; ca chi con loi
// bi loai tru se tu roi danh sach can goi, ca con loi khac van can goi (loi bi loai tru hien mo o UI, xem
// LOAI_TRU_SELECT_COLUMNS). Khop KTV bang tien to "(ma_ktv)" cua c.ky_thuat_vien (substr, khong LIKE vi ma co the
// chua "_").
export function loaiTruExistsSql(loaiLoi: string): string {
  return `EXISTS (SELECT 1 FROM khao_sat_loai_tru x WHERE x.loai_loi = '${loaiLoi}'
      AND substr(c.ky_thuat_vien, 1, length(x.ma_ktv) + 2) = '(' || x.ma_ktv || ')'
      AND substr(c.thoi_gian_cskh_tiep_nhan, 1, 10) BETWEEN x.tu_ngay AND x.den_ngay)`;
}

export const NEED_SURVEY_CONDITION = `(
  COALESCE(c.khach_hang, '') NOT LIKE '%ĐMX%'
  AND (
    (c.loi_120p = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'Loi 120 phut') AND NOT ${loaiTruExistsSql("Loi 120 phut")})
    OR (c.loi_qua_han_24h = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'Hen qua 24h') AND NOT ${loaiTruExistsSql("Hen qua 24h")})
    OR (c.loi_lo_ke_hoach = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'Loi lo ke hoach') AND NOT ${loaiTruExistsSql("Loi lo ke hoach")})
    OR (c.loi_kh_hen_lai = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'KH hen lai') AND NOT ${loaiTruExistsSql("KH hen lai")})
  )
  AND (SELECT k.can_goi_lai FROM ket_qua_goi k WHERE k.case_id = c.id ORDER BY k.ngay_gio_thuc_hien DESC LIMIT 1) IS NOT 0
)`;
// Con moi/uu tien: dang ton (chua hoan thanh) HOAC da hoan thanh khong qua 3 ngay so voi 0h hom nay
export const RECENT_OR_OPEN_CONDITION = `(c.thoi_gian_hoan_thanh IS NULL OR c.thoi_gian_hoan_thanh >= datetime('now', 'start of day', '-3 days'))`;
// Qua han khao sat: da hoan thanh va qua 3 ngay so voi 0h hom nay ma van chua khao sat - co the goi hoac bo qua
export const OVERDUE_SURVEY_CONDITION = `(c.thoi_gian_hoan_thanh IS NOT NULL AND c.thoi_gian_hoan_thanh < datetime('now', 'start of day', '-3 days'))`;

// Cot "loai_tru_*" (1/0) cho GET /survey/candidates - nghi ngo nao cua ca dang thuoc danh sach loai tru (UI lam mo +
// canh bao "khong can goi"). Dung chung loaiTruExistsSql voi NEED_SURVEY_CONDITION de 2 noi khong lech nhau.
export const LOAI_TRU_SELECT_COLUMNS = `
  CASE WHEN ${loaiTruExistsSql("Loi 120 phut")} THEN 1 ELSE 0 END as loai_tru_120p,
  CASE WHEN ${loaiTruExistsSql("Hen qua 24h")} THEN 1 ELSE 0 END as loai_tru_qua_han_24h,
  CASE WHEN ${loaiTruExistsSql("Loi lo ke hoach")} THEN 1 ELSE 0 END as loai_tru_lo_ke_hoach,
  CASE WHEN ${loaiTruExistsSql("KH hen lai")} THEN 1 ELSE 0 END as loai_tru_kh_hen_lai`;
