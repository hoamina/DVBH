import { ageExpr, AGE_ANCHOR } from "./ageCalc";

/**
 * "Moi nhat" theo case_id - dung ROW_NUMBER() thay vi "MAX(ngay_giai_trinh) roi JOIN nguoc lai",
 * vi cach cu khi co >=2 dong giai_trinh TRUNG DUNG 1 giay (thuong gap khi backfill hang loat khong
 * co ngay_giai_trinh trong file, roi ca fallback ve cung 1 datetime('now')) se khop CA HAI dong voi
 * gia tri MAX, lam 1 case_id bi nhan len thanh nhieu dong ket qua. ROW_NUMBER() + "id DESC" lam
 * tie-breaker dam bao luon dung 1 dong cho moi case_id du co trung gio. Dung chung cho moi noi can
 * biet "giai trinh gan nhat" cua 1 case_dvbh (cases.ts, dailyReport.ts...).
 */
export const LATEST_GIAI_TRINH_JOIN = `
  LEFT JOIN (
    SELECT * FROM (
      SELECT gt.*, ROW_NUMBER() OVER (PARTITION BY gt.case_id ORDER BY gt.ngay_giai_trinh DESC, gt.id DESC) AS rn
      FROM giai_trinh gt
    ) WHERE rn = 1
  ) lg ON lg.case_id = c.id
`;

const AGE_C = ageExpr("c.thoi_gian_cskh_tiep_nhan");

/**
 * Dinh nghia thong nhat "ca can giai trinh" - nguon duy nhat cho ca 3 noi dang tinh rieng le truoc
 * day (cases.ts tabs, backlog-by-khu-vuc, dailyReport.ts) voi 3 cong thuc KHAC NHAU. Chot theo yeu
 * cau nghiep vu (chuyen tu he thong cu sang), tat ca gia dinh alias "c" (case_dvbh) + "lg" (giai
 * trinh gan nhat, xem LATEST_GIAI_TRINH_JOIN) da co san trong cau FROM cua noi goi, va WHERE goc da
 * loc c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL (ca dang ton).
 *
 * - LO_KE_HOACH: da giai trinh, ngay du kien hoan thanh (lan giai trinh gan nhat) da qua NGAY LICH
 *   hom nay (moc 0h sang VN, dung AGE_ANCHOR). So sanh qua date(...) ca 2 ve (khong so chuoi tho) vi
 *   ngay_du_kien_hoan_thanh thuong la ngay thuan (khong gio) - xem giai thich bay string-compare o
 *   monthBounds() trong cases.ts, loi tuong tu se xay ra neu so chuoi truc tiep.
 * - TAI_GIAI_TRINH: da giai trinh, nhung >=3 ngay ke tu lan giai trinh gan nhat ma van chua dong ca
 *   (chu ky "giai trinh lai" 3 ngay/lan).
 * - CHUA_GT_3_NGAY: chua tung giai trinh, da ton >=3 ngay ke tu luc CSKH tiep nhan - "canh bao som".
 * - CHUA_GT_5_NGAY: tap con cua CHUA_GT_3_NGAY (>=5 ngay thay vi >=3) - "nguong chinh can xu ly".
 *   Khong can them vao TONG rieng vi da nam trong CHUA_GT_3_NGAY roi (chi de tach rieng ra 1 nhom
 *   hien thi uu tien cao hon trong UI, khong lam thay doi tong so ca can giai trinh).
 * - DIEU_HOA_1_NGAY / B2B_1_NGAY: SLA nhanh hon (1 ngay thay vi 3) cho ca CHUA giai trinh thuoc
 *   nhom san pham Dieu hoa hoac doi tac co chua "b2b" trong ten (vd "[B2B-BAUER]").
 * - TONG: hop (OR) ca 5 nhom chinh (khong tinh CHUA_GT_5_NGAY, da la tap con) - 1 ca thuoc nhieu
 *   nhom van chi dem 1 lan khi dung TONG.
 */
export const NEED_LO_KE_HOACH = `(lg.ngay_du_kien_hoan_thanh IS NOT NULL AND date(lg.ngay_du_kien_hoan_thanh) < date(${AGE_ANCHOR}))`;
export const NEED_TAI_GIAI_TRINH = `(lg.case_id IS NOT NULL AND ${ageExpr("lg.ngay_giai_trinh")} >= 3)`;
export const NEED_CHUA_GT_3_NGAY = `(lg.case_id IS NULL AND ${AGE_C} >= 3)`;
export const NEED_CHUA_GT_5_NGAY = `(lg.case_id IS NULL AND ${AGE_C} >= 5)`;
export const NEED_DIEU_HOA_1_NGAY = `(lg.case_id IS NULL AND c.nhom_san_pham = 'Điều hòa' AND ${AGE_C} >= 1)`;
export const NEED_B2B_1_NGAY = `(lg.case_id IS NULL AND c.doi_tac LIKE '%b2b%' AND ${AGE_C} >= 1)`;
export const NEED_TONG = `(${NEED_LO_KE_HOACH} OR ${NEED_TAI_GIAI_TRINH} OR ${NEED_CHUA_GT_3_NGAY} OR ${NEED_DIEU_HOA_1_NGAY} OR ${NEED_B2B_1_NGAY})`;

export const NEED_GIAI_TRINH_CATEGORIES: Record<string, string> = {
  tong: NEED_TONG,
  lo_ke_hoach: NEED_LO_KE_HOACH,
  tai_giai_trinh: NEED_TAI_GIAI_TRINH,
  chua_gt_3_ngay: NEED_CHUA_GT_3_NGAY,
  chua_gt_5_ngay: NEED_CHUA_GT_5_NGAY,
  dieu_hoa: NEED_DIEU_HOA_1_NGAY,
  b2b: NEED_B2B_1_NGAY,
};
