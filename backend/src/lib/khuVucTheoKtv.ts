// Quy tac khu vuc theo tai khoan KTV (CHOT 2026-10-22, chu he thong): ca cua cac tai khoan KD KRF loc tong / du lieu TEST
// luon thuoc "(teamkdbl.krf) Kinh doanh ban le KRF" - khu vuc nay nam trong KHU_VUC_AN_KHOI_BAO_CAO (filterParams.ts) nen
// KHONG tinh vao bao cao. Ap dung luc import (importProcessor.ts, truoc khi tinh crm_hash) cho ca moi/ca cap nhat - CRM/Odoo
// gui khu vuc khac ("Chua xac dinh", MB2, MB3...) van bi ghi de. Ca da co: migration 0141 chuyen + danh dau sua tay.
export const KHU_VUC_KRF_BAN_LE = "(teamkdbl.krf) Kinh doanh bán lẻ KRF";

// Tai khoan co ma: so khop tien to "(ma)"; tai khoan cu khong ma: so khop ten (bo dau cach thua, khong phan biet hoa thuong).
const MA_KTV_VE_KRF = ["kdloctong.krf", "TEST.ER"];
const TEN_KTV_VE_KRF = ["KD KRF Lọc tổng", "Trạm Hưng Yên- Dữ liệu TEST"];

const chuan = (v: string) => v.normalize("NFC").toLowerCase().replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
const TEN_CHUAN = new Set(TEN_KTV_VE_KRF.map(chuan));

export function laKtvVeKrfBanLe(kyThuatVien: unknown): boolean {
  if (typeof kyThuatVien !== "string" || !kyThuatVien.trim()) return false;
  const v = kyThuatVien.trim();
  const ma = /^\(([^)]+)\)/.exec(v)?.[1]?.trim().toLowerCase();
  if (ma && MA_KTV_VE_KRF.some((m) => m.toLowerCase() === ma)) return true;
  return TEN_CHUAN.has(chuan(v));
}
