/**
 * Gio VN hien tai dang "YYYY-MM-DD HH:MM:SS", dung cho moi cot timestamp he thong tu sinh
 * (created_at, ngay_import, ngay_cap_nhat_gan_nhat, updated_at...) khi ghi tu code JS. Toan he
 * thong quy uoc luu gio VN dia phuong cho MOI cot thoi gian - ca du lieu nhap tu Excel/Sheet (giu
 * nguyen khong quy doi, xem ratchet.ts businessFieldValue) lan cot he thong tu sinh - de nhat quan
 * va so sanh/hien thi truc tiep khong can quy doi timezone (xem ageCalc.ts AGE_ANCHOR, frontend
 * fmtDateTime). Dung ham nay thay vi new Date().toISOString() (tra ve UTC that).
 */
export function nowVN(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
}
