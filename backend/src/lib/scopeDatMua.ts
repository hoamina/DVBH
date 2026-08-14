import type { Context } from "hono";
import type { Env } from "../types";

/**
 * Scope rieng cho module "Dat mua linh kien" - KHONG dung scopeByKhuVuc() (khu_vuc_phu_trach) vi
 * quyen xem o day phu thuoc vao QUAN HE nguoi dung (nguoi tao / Tram cha / GS quan ly) chu khong
 * theo khu vuc dia ly.
 *
 * - KTV/CTV thuong (la_ktv_dvbh, khong co Ve tinh nao tram_cha=email minh): chi don cua minh.
 * - Tram (la_ktv_dvbh + co it nhat 1 Ve tinh voi tram_cha=email minh): don cua minh + don cua
 *   moi Ve tinh thuoc tram.
 * - Ve tinh (la_ve_tinh): chi don cua minh.
 * - GS (vai_tro='Giam sat'): don co phieu_dat.email_gs = email minh (chi de theo doi, khong duyet).
 * - TN (TBP DVBH/Admin), Kho (la_kho), Ke toan (la_ke_toan): xem toan bo (loc rieng theo buoc xu ly
 *   o tung endpoint, khong loc o day).
 */
export function scopeDatMuaNguoiTao(c: Context<{ Bindings: Env }>): { whereSql: string; binds: string[] } | null {
  const user = c.get("user");
  if (user.vai_tro === "TBP DVBH" || user.vai_tro === "Admin" || user.vai_tro === "QC" || user.la_kho || user.la_ke_toan) {
    return null; // khong gioi han - QC them vao buoc 1 ke hoach "Luong tao don mua hang" (nen tang cho luong tra hang QC xac nhan)
  }
  if (user.vai_tro === "Giam sat") {
    return { whereSql: " AND pd.email_gs = ?", binds: [user.email] };
  }
  if (user.la_ktv_dvbh || user.la_ve_tinh) {
    return { whereSql: " AND (pd.nguoi_tao = ? OR pd.nguoi_tao IN (SELECT email FROM users WHERE tram_cha = ?))", binds: [user.email, user.email] };
  }
  return { whereSql: " AND 1=0", binds: [] };
}
