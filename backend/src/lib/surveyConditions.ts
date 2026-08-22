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
export const NEED_SURVEY_CONDITION = `(
  (
    (c.loi_120p = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'Loi 120 phut'))
    OR (c.loi_qua_han_24h = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'Hen qua 24h'))
    OR (c.loi_lo_ke_hoach = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'Loi lo ke hoach'))
    OR (c.loi_kh_hen_lai = 1 AND NOT EXISTS (SELECT 1 FROM vi_pham v WHERE v.case_id = c.id AND v.loai_loi = 'KH hen lai'))
  )
  AND (SELECT k.can_goi_lai FROM ket_qua_goi k WHERE k.case_id = c.id ORDER BY k.ngay_gio_thuc_hien DESC LIMIT 1) IS NOT 0
)`;
// Con moi/uu tien: dang ton (chua hoan thanh) HOAC da hoan thanh khong qua 3 ngay so voi 0h hom nay
export const RECENT_OR_OPEN_CONDITION = `(c.thoi_gian_hoan_thanh IS NULL OR c.thoi_gian_hoan_thanh >= datetime('now', 'start of day', '-3 days'))`;
// Qua han khao sat: da hoan thanh va qua 3 ngay so voi 0h hom nay ma van chua khao sat - co the goi hoac bo qua
export const OVERDUE_SURVEY_CONDITION = `(c.thoi_gian_hoan_thanh IS NOT NULL AND c.thoi_gian_hoan_thanh < datetime('now', 'start of day', '-3 days'))`;
