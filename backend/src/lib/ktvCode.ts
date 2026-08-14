/**
 * "case_dvbh.ky_thuat_vien" la text tu do tu CRM, dang "(ma) Loai - Khu vuc - Ten" (vd "(huannt.mb)
 * Tram Bac Ninh - TNHH TM va DV 3T Bac Ninh"). Phan "(ma)" o dau chuoi on dinh, phan con lai co the
 * doi qua cac lan import (da kiem tra du lieu that: cung ma xuat hien ca dang thuong lan dang co hau
 * to "(huy bo)") - dung ham nay de trich ra khoa dinh danh on dinh cho danh ba SDT KTV
 * (bang ktv_lien_he, migration 0049), KHONG dung nguyen chuoi ky_thuat_vien lam khoa.
 */
export function extractMaKtv(kyThuatVien: string | null | undefined): string | null {
  if (!kyThuatVien) return null;
  const m = /^\(([^)]+)\)/.exec(kyThuatVien.trim());
  return m ? m[1].trim() : null;
}
