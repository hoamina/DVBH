import { ageExpr, AGE_ANCHOR } from "./ageCalc";

/**
 * "Moi nhat" theo case_id - dung ROW_NUMBER() thay vi "MAX(ngay_giai_trinh) roi JOIN nguoc lai",
 * vi cach cu khi co >=2 dong giai_trinh TRUNG DUNG 1 giay (thuong gap khi backfill hang loat khong
 * co ngay_giai_trinh trong file, roi ca fallback ve cung 1 datetime('now')) se khop CA HAI dong voi
 * gia tri MAX, lam 1 case_id bi nhan len thanh nhieu dong ket qua. ROW_NUMBER() + "id DESC" lam
 * tie-breaker dam bao luon dung 1 dong cho moi case_id du co trung gio. Dung chung cho moi noi can
 * biet "giai trinh gan nhat" cua 1 case_dvbh (cases.ts, dailyReport.ts...).
 *
 * latestGiaiTrinhJoin(caseFilterSql): "caseFilterSql" la dieu kien WHERE (khong co tu khoa WHERE)
 * ap len case_dvbh, dung de gioi han subquery ROW_NUMBER() chi tinh tren giai_trinh CUA DUNG TAP
 * case dang xet - thay vi quet TOAN BO bang giai_trinh (~25k hang, tang dan) moi lan goi bat ke
 * cau WHERE ben ngoai da loc hep den dau. AN TOAN vi ROW_NUMBER() PARTITION BY case_id: mien la tap
 * case_id loc boi caseFilterSql la SUPERSET (bang hoac rong hon) tap c.id thuc su duoc WHERE ngoai
 * chon, thi voi moi case_id do TAT CA dong giai_trinh cua no van duoc xet du (vi loc dua tren
 * case_dvbh.id chu khong dua tren tung dong giai_trinh), nen "ban ghi giai trinh gan nhat" tra ve
 * y het truoc day. Nguoc lai, NEU KHONG THE khang dinh caseFilterSql la superset an toan cho 1
 * endpoint nao do thi KHONG duoc dung ham nay cho endpoint do.
 */
export function latestGiaiTrinhJoin(caseFilterSql: string): string {
  return `
  LEFT JOIN (
    SELECT * FROM (
      SELECT gt.*, ROW_NUMBER() OVER (PARTITION BY gt.case_id ORDER BY gt.ngay_giai_trinh DESC, gt.id DESC) AS rn
      FROM giai_trinh gt
      WHERE gt.case_id IN (SELECT id FROM case_dvbh WHERE ${caseFilterSql})
    ) WHERE rn = 1
  ) lg ON lg.case_id = c.id
`;
}

// Preset 1: tap ca DANG TON (khong phan biet da/chua giai trinh) - dung cho hau het endpoint Backlog/
// thong bao/bao cao nhanh, KHONG co bind param.
export const CASE_FILTER_TON = "thoi_gian_hoan_thanh IS NULL AND archived_at IS NULL AND huy_bo_at IS NULL";

// Preset 1.5: tap ca dang ton hoac moi dong trong 2 ngay gan day - de gia han thoi gian giai trinh va lay dung Ly do ton gan nhat cua ca moi hoan thanh.
export const CASE_FILTER_TON_AND_CLOSED_RECENTLY = "(thoi_gian_hoan_thanh IS NULL OR thoi_gian_hoan_thanh >= date(datetime('now', '+7 hours', '-2 days'))) AND archived_at IS NULL AND huy_bo_at IS NULL";


// Preset 2: tap ca DA DONG trong 1 khoang thoi gian [start, end) - CO 2 bind param theo dung thu tu
// (start, end). Vi subquery nay nam trong mau JOIN (dung TRUOC mau WHERE cua cau lenh ngoai trong
// chuoi SQL cuoi cung), nguoi goi PHAI bind 2 gia tri (start, end) nay TRUOC cac bind cua WHERE
// ngoai, dung thu tu ky tu "?" xuat hien trong chuoi SQL hoan chinh - de bind sai vi tri neu khong
// doi chieu ky.
export const CASE_FILTER_DA_DONG_RANGE = "thoi_gian_hoan_thanh >= ? AND thoi_gian_hoan_thanh < ?";

const AGE_C = ageExpr("c.thoi_gian_cskh_tiep_nhan");

/**
 * Dinh nghia thong nhat "ca can giai trinh" - nguon duy nhat cho ca 3 noi dang tinh rieng le truoc
 * day (cases.ts tabs, backlog-by-khu-vuc, dailyReport.ts) voi 3 cong thuc KHAC NHAU. Chot theo yeu
 * cau nghiep vu (chuyen tu he thong cu sang), tat ca gia dinh alias "c" (case_dvbh) + "lg" (giai
 * trinh gan nhat, xem latestGiaiTrinhJoin()) da co san trong cau FROM cua noi goi, va WHERE goc da
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
 * - NSKX_2_NGAY: SLA rieng (2 ngay thay vi 3) cho ca CHUA giai trinh cua doi tac "NSKX" (dung khop
 *   chinh xac c.doi_tac, khong phai LIKE nhu B2B).
 * - TONG (doi 2026-07-31, xem chot voi chu he thong): truoc day nhanh "chua tung giai trinh" trong
 *   TONG dung CHUA_GT_3_NGAY chung cho MOI khach hang; gio CHI khach hang DMX moi duoc tinh o
 *   nguong 3 ngay (DMX_CHUA_GT_3_NGAY, xem dinh nghia NEED_DMX_CUSTOMER ben duoi) - khach hang
 *   thuong phai toi nguong 5 ngay (CHUA_GT_5_NGAY, KHONG loc DMX) moi tinh vao TONG. Ly do: bang
 *   "Bao cao ton theo khu vuc" chi con hien cot "DMX chua GT >3 ngay" (khong con cot chua GT >3 ngay
 *   chung cho moi khach hang nhu truoc), neu TONG van cong ca nhom khach thuong 3-4 ngay thi so
 *   TONG se KHONG khop tong cac cot hien thi tren bao cao (da xay ra thuc te, chu he thong phat hien
 *   qua vi du hang "TỔNG=9" nhung cac cot con hien chi cong ra 3). CHUA_GT_5_NGAY vi vay PHAI co mat
 *   rieng trong TONG (khac truoc day, khi no la tap con tu dong cua CHUA_GT_3_NGAY nen khong can
 *   liet ke rieng).
 * - TONG (chot lai 2026-08-01, chu he thong phat hien nham logic): B2B_1_NGAY va NSKX_2_NGAY TUNG bi
 *   cong nham vao TONG - 2 nhom nay la hang muc rieng (van con card/cot B2B, NSKX o UI), KHONG duoc
 *   tinh vao "Tong can giai trinh".
 * - TONG (chot lai lan 2, 2026-08-16, chu he thong yeu cau): them VIP_CHUA_GT_24H vao TONG - dung
 *   OR (khong phai +) nen 1 ca VUA la VIP/S.VIP CHUA giai trinh >=24h VUA khop 1 trong 5 nhanh con
 *   lai (vd cung dang "chua GT >=5 ngay") van CHI duoc dem 1 LAN, khong bi dem trung. Cong thuc dung:
 *   lo ke hoach + tai giai trinh + DMX chua GT >3 ngay + chua GT >5 ngay + dieu hoa >1 ngay + VIP
 *   chua GT >=24h - CHINH XAC 6 nhanh.
 */
export const NEED_LO_KE_HOACH = `(lg.ngay_du_kien_hoan_thanh IS NOT NULL AND date(lg.ngay_du_kien_hoan_thanh) < date(${AGE_ANCHOR}))`;
export const NEED_TAI_GIAI_TRINH = `(lg.case_id IS NOT NULL AND ${ageExpr("lg.ngay_giai_trinh")} >= 3)`;
export const NEED_CHUA_GT_3_NGAY = `(lg.case_id IS NULL AND ${AGE_C} >= 3)`;
export const NEED_CHUA_GT_5_NGAY = `(lg.case_id IS NULL AND ${AGE_C} >= 5)`;
export const NEED_DIEU_HOA_1_NGAY = `(lg.case_id IS NULL AND c.nhom_san_pham = 'Điều hòa' AND ${AGE_C} >= 1)`;
export const NEED_B2B_1_NGAY = `(lg.case_id IS NULL AND c.doi_tac LIKE '%b2b%' AND ${AGE_C} >= 1)`;
export const NEED_NSKX_2_NGAY = `(lg.case_id IS NULL AND c.doi_tac = 'NSKX' AND ${AGE_C} >= 2)`;
// CHOT 2026-08-12: "chi tieu phu" moi, cung kieu B2B/NSKX (canh bao rieng theo nhom Model, KHONG
// cong vao NEED_TONG - xem chu thich NEED_TONG ben duoi) - ca CHUA giai trinh, Model = "Loc tong"
// HOAC "Loc nuoc BCN", ton >=1 ngay.
export const NEED_LOC_TONG_BCN_1_NGAY = `(lg.case_id IS NULL AND c.nhom_san_pham = 'Lọc tổng' AND ${AGE_C} >= 1)`;

// CHOT 2026-08-16: "chi tieu phu" moi - ca VIP/S.VIP (c.nhom_kh LIKE '%VIP%', dung QUY UOC da chot
// voi chu he thong o canhBaoTon.ts: khong phan biet hoa/thuong, tu dong gom ca "SVIP") CHUA giai
// trinh qua 24 GIO THUC (khong phai "1 ngay lich" kieu AGE_C/NEED_DIEU_HOA_1_NGAY o tren - AGE_C lam
// tron theo moc 0h VN nen 1 ca tiep nhan luc 23h50 se bi tinh "1 ngay" chi sau 10 phut, khong dung
// tinh than "24h" chu he thong yeu cau rieng cho VIP - o day dung julianday() so KHOANG CACH THUC te
// tinh bang gio/ngay phan so).
// CHOT 2026-08-16 (lan 2, chu he thong yeu cau): VIP_24H GIO CO cong vao NEED_TONG (xem chu thich
// NEED_TONG ben duoi) - khac cac "chi tieu phu" khac (B2B/NSKX/loc_tong_bcn) van KHONG cong vao TONG.
export const NEED_VIP_CHUA_GT_24H = `(lg.case_id IS NULL AND c.nhom_kh LIKE '%VIP%' AND (julianday(datetime('now','+7 hours')) - julianday(c.thoi_gian_cskh_tiep_nhan)) >= 1)`;

// "KH DMX" (chot 2026-07-31, thay the the "Chua giai trinh >3 ngay (canh bao som)" cu) - khach hang
// thuoc nhom DMX: c.khach_hang chua "DMX"/"DMX" (khong dau, dung LIKE ca 2 dang vi du lieu CRM
// khong luon nhat quan dau) HOAC c.nhom_kh chua dung "KH DMX" (khop CHINH XAC gia tri danh muc
// "03. KH DMX", KHONG khop "2. KRF-Kho DMX"/"04. Kho DMX" - 2 gia tri do la "Kho DMX" khac nghia,
// khong phai "KH DMX"). Xac nhan voi chu he thong bang doi chieu README - tong 3 nhom cong nhau
// (chua_gt_3_ngay + tai_giai_trinh + lo_ke_hoach, cung loc DMX) khop CHINH XAC voi bao cao thu cong
// (91/91) tai thoi diem doi chieu.
export const NEED_DMX_CUSTOMER = `((c.khach_hang LIKE '%ĐMX%' OR c.khach_hang LIKE '%DMX%') OR c.nhom_kh LIKE '%KH ĐMX%')`;
export const NEED_DMX_CHUA_GT_3_NGAY = `(${NEED_DMX_CUSTOMER} AND ${NEED_CHUA_GT_3_NGAY})`;
export const NEED_DMX_TAI_GIAI_TRINH = `(${NEED_DMX_CUSTOMER} AND ${NEED_TAI_GIAI_TRINH})`;
export const NEED_DMX_LO_KE_HOACH = `(${NEED_DMX_CUSTOMER} AND ${NEED_LO_KE_HOACH})`;
export const NEED_DMX_3_NGAY = `(${NEED_DMX_CHUA_GT_3_NGAY} OR ${NEED_DMX_TAI_GIAI_TRINH} OR ${NEED_DMX_LO_KE_HOACH})`;

// CHOT 2026-08-01: "Lo ke hoach"/"Tai giai trinh" chia nho theo tuoi ca (AGE_C, tinh tu CSKH tiep
// nhan - giong "Ton tren N ngay" hien co, KHONG phai tu ngay du kien hoan thanh) - dung cho 2 breakdown
// card rieng trong Quan ly ton (khong lien quan gi den TONG, chi la lens hien thi bo sung).
export const NEED_LO_KE_HOACH_DMX_5_NGAY = `(${NEED_LO_KE_HOACH} AND ${NEED_DMX_CUSTOMER} AND ${AGE_C} >= 5)`;
export const NEED_LO_KE_HOACH_14_NGAY = `(${NEED_LO_KE_HOACH} AND ${AGE_C} >= 14)`;
export const NEED_TAI_GIAI_TRINH_DMX_5_NGAY = `(${NEED_TAI_GIAI_TRINH} AND ${NEED_DMX_CUSTOMER} AND ${AGE_C} >= 5)`;
export const NEED_TAI_GIAI_TRINH_14_NGAY = `(${NEED_TAI_GIAI_TRINH} AND ${AGE_C} >= 14)`;

// CHOT 2026-08-01: bo B2B_1_NGAY/NSKX_2_NGAY khoi TONG (xem chu thich "chot lai" o tren).
// CHOT 2026-08-16 (lan 2): them NEED_VIP_CHUA_GT_24H vao TONG - dung CHINH XAC 6 nhanh, khong con 5
// nhu truoc.
export const NEED_TONG = `(${NEED_LO_KE_HOACH} OR ${NEED_TAI_GIAI_TRINH} OR ${NEED_DMX_CHUA_GT_3_NGAY} OR ${NEED_CHUA_GT_5_NGAY} OR ${NEED_DIEU_HOA_1_NGAY} OR ${NEED_VIP_CHUA_GT_24H})`;

// Moc 08:00 sang VN cua NGAY HOM NAY (dung ky thuat +7h giong AGE_ANCHOR, nhung KHONG lam tron ve 0h
// - day la moc "chot bao cao", khac moc "0h tinh tuoi ton" cua AGE_ANCHOR).
export const TON_ANCHOR_0800 = "(date(datetime('now','+7 hours')) || ' 08:00:00')";

/**
 * Dieu kien "dang ton TAI THOI DIEM 08:00 hom nay" (CHOT 2026-08-01, chu he thong xac nhan qua vi
 * du: "neu ca co ngay hoan thanh SAU 08:00 hom nay thi van tinh la ca ton can giai trinh"): case dang
 * mo NGAY BAY GIO (thoi_gian_hoan_thanh IS NULL), HOAC da hoan thanh nhung SAU moc 08:00 (tuc van con
 * "ton" tai thoi diem 08:00, chi la duoc dong sau do trong ngay). Muc dich: baseline cua "Bao cao ngay
 * 08:00" (lib/dailySnapshot.ts computeBacklogBuckets) KHONG duoc phu thuoc gio THUC SU Admin bam "Lam
 * moi bao cao" hay cron chay xong - du chay luc 09:30, 1 ca hoan thanh luc 08:45 (SAU 08:00) van phai
 * duoc tinh vao baseline "ton can giai trinh" cua ngay hom do.
 *
 * Khac CASE_FILTER_TON (chi xet "dang mo ngay bay gio", dung cho MOI noi khac trong he thong ngoai
 * pham vi nay) - KHONG dung ham nay thay CASE_FILTER_TON o cac noi khac.
 *
 * QUAN TRONG: khi dung dieu kien nay lam outer WHERE cho 1 truy van co latestGiaiTrinhJoin(), PHAI
 * truyen CHINH XAC ham nay (cung alias r?ng, tuc caseFilterTonAt0800() khong tham so) lam
 * caseFilterSql cho latestGiaiTrinhJoin() trong CUNG truy van do - neu van truyen CASE_FILTER_TON cho
 * join thi subquery se KHONG con la superset an toan cua outer WHERE nua (outer WHERE gio RONG HON,
 * gom them ca case hoan thanh sau 08:00 ma CASE_FILTER_TON khong gom), lam "giai trinh gan nhat" tra
 * ve sai/NULL cho dung nhung case do (xem canh bao trong docstring latestGiaiTrinhJoin()).
 */
export function caseFilterTonAt0800(alias = ""): string {
  const p = alias ? `${alias}.` : "";
  return `(${p}thoi_gian_hoan_thanh IS NULL OR ${p}thoi_gian_hoan_thanh >= ${TON_ANCHOR_0800})`;
}

export const NEED_GIAI_TRINH_CATEGORIES: Record<string, string> = {
  tong: NEED_TONG,
  lo_ke_hoach: NEED_LO_KE_HOACH,
  tai_giai_trinh: NEED_TAI_GIAI_TRINH,
  chua_gt_3_ngay: NEED_CHUA_GT_3_NGAY,
  chua_gt_5_ngay: NEED_CHUA_GT_5_NGAY,
  dieu_hoa: NEED_DIEU_HOA_1_NGAY,
  b2b: NEED_B2B_1_NGAY,
  nskx: NEED_NSKX_2_NGAY,
  loc_tong_bcn: NEED_LOC_TONG_BCN_1_NGAY,
  vip_24h: NEED_VIP_CHUA_GT_24H,
  dmx_3_ngay: NEED_DMX_3_NGAY,
  dmx_chua_gt_3_ngay: NEED_DMX_CHUA_GT_3_NGAY,
  dmx_tai_giai_trinh: NEED_DMX_TAI_GIAI_TRINH,
  dmx_lo_ke_hoach: NEED_DMX_LO_KE_HOACH,
  lo_ke_hoach_dmx_5: NEED_LO_KE_HOACH_DMX_5_NGAY,
  lo_ke_hoach_14: NEED_LO_KE_HOACH_14_NGAY,
  tai_giai_trinh_dmx_5: NEED_TAI_GIAI_TRINH_DMX_5_NGAY,
  tai_giai_trinh_14: NEED_TAI_GIAI_TRINH_14_NGAY,
};
