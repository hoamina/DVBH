import { useEffect } from "react";

/**
 * Thang da luu (localStorage) dung chung moi quoc gia -> sang PH van giu thang cua VN (vd 2026-09) ma PH chua co du lieu:
 * o chon thang hien TRONG nhung van gui thang cu -> bao cao = 0 trong khi badge menu (thang hien tai) van dem (loi 2026-11-25,
 * Ca lap PH "26" nhung trang trong). Thang da luu khong con trong danh sach thang cua nuoc dang xem -> ve thang hien tai
 * (neu co trong danh sach) hoac thang moi nhat. Cung cach FilterBar.tsx da lam cho bo loc chung (2026-11-16).
 * Gia tri dac biet (vd CURRENT_MONTH_VALUE) truyen qua "boQua" de khong bi doi.
 */
export function useThangHopLe(thang: string, setThang: (v: string) => void, months: string[] | undefined, boQua: string[] = []): void {
  const boQuaKey = boQua.join("|");
  useEffect(() => {
    if (!months || months.length === 0) return;
    // Thang hien tai luon hop le (vd Khao sat cho chon thang nay du chua co ca dong).
    const thangNay = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
    if (thang === thangNay || boQuaKey.split("|").includes(thang) || months.includes(thang)) return;
    setThang(months.includes(thangNay) ? thangNay : [...months].sort().reverse()[0]);
  }, [thang, setThang, months, boQuaKey]);
}
