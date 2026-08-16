import type { Context } from "hono";
import type { Env } from "../types";

/**
 * Scope rieng cho module "Dat mua linh kien" - KHONG dung scopeByKhuVuc() (khu_vuc_phu_trach) vi
 * quyen xem o day phu thuoc vao QUAN HE nguoi dung (nguoi tao / Tram cha / GS quan ly) chu khong
 * theo khu vuc dia ly.
 *
 * CHOT 2026-08-15 (bo khai niem "phieu dat" khoi trai nghiem nguoi dung): whereSql gio doc THANG
 * tren dat_don_hang (alias BAT BUOC la "ddh" o FROM/JOIN cua caller) thay vi join qua phieu_dat -
 * xem migration 0075 (denormalize email_gs/nguoi_nhan_hang xuong dat_don_hang).
 *
 * - KTV/CTV thuong (la_ktv_dvbh, khong co Ve tinh nao tram_cha=email minh): don minh tao + don
 *   nguoi khac tao ho minh (ddh.nguoi_nhan_hang = email minh - Giai doan 4b, migration 0068).
 * - Tram (la_ktv_dvbh + co it nhat 1 Ve tinh voi tram_cha=email minh): don cua minh + don cua
 *   moi Ve tinh thuoc tram + don tao ho minh.
 * - Ve tinh (la_ve_tinh): don minh tao + don tao ho minh.
 * - GS (vai_tro='Giam sat'): don co dat_don_hang.email_gs = email minh (chi de theo doi, khong duyet).
 * - TN (TBP DVBH/Admin), Kho (la_kho), Ke toan (la_ke_toan): xem toan bo (loc rieng theo buoc xu ly
 *   o tung endpoint, khong loc o day).
 */
export function scopeDatMuaNguoiTao(c: Context<{ Bindings: Env }>): { whereSql: string; binds: string[] } | null {
  const user = c.get("user");
  if (user.vai_tro === "TBP DVBH" || user.vai_tro === "Admin" || user.vai_tro === "QC" || user.la_kho || user.la_ke_toan) {
    return null; // khong gioi han - QC them vao buoc 1 ke hoach "Luong tao don mua hang" (nen tang cho luong tra hang QC xac nhan)
  }
  if (user.vai_tro === "Giam sat") {
    return { whereSql: " AND ddh.email_gs = ?", binds: [user.email] };
  }
  if (user.la_ktv_dvbh || user.la_ve_tinh) {
    return {
      whereSql: " AND (ddh.nguoi_tao = ? OR ddh.nguoi_nhan_hang = ? OR ddh.nguoi_tao IN (SELECT email FROM users WHERE tram_cha = ?))",
      binds: [user.email, user.email, user.email],
    };
  }
  return { whereSql: " AND 1=0", binds: [] };
}

/**
 * "Khu vuc phu trach" (Giam sat) cho TN/Kho/Ke toan - scope MEM, chi dung cho badge/thong ke, KHONG
 * dung de gioi han danh sach/tim kiem (xem migration 0073). Tra null neu nguoi dung chua duoc Admin
 * gan khu vuc nao (0 dong) = che do khong gioi han nhu truoc gio; khac null tra Set email GS ma
 * nguoi dung nay dang phu trach.
 */
export async function phuTrachGsSet(db: D1Database, email: string): Promise<Set<string> | null> {
  const rows = await db
    .prepare("SELECT giam_sat_email FROM dat_mua_lk_phu_trach_gs WHERE nguoi_phu_trach = ?")
    .bind(email)
    .all<{ giam_sat_email: string }>();
  if (!rows.results || rows.results.length === 0) return null;
  return new Set(rows.results.map((r) => r.giam_sat_email));
}

/**
 * Tu dong gan them 1 Giam sat vao khu vuc phu trach cua nguoi dung khi ho xu ly 1 don ngoai khu vuc
 * hien tai - CHI kich hoat neu nguoi dung DA o che do gioi han (>=1 dong gan sẵn), tranh ep nguoi
 * chua duoc Admin cau hinh gi vao che do gioi han ngoai y muon.
 */
export async function autoClaimGs(db: D1Database, nguoiPhuTrach: string, emailGs: string | null): Promise<void> {
  if (!emailGs) return;
  const current = await phuTrachGsSet(db, nguoiPhuTrach);
  if (current === null) return; // chua o che do gioi han - khong lam gi
  if (current.has(emailGs)) return;
  await db
    .prepare(
      "INSERT OR IGNORE INTO dat_mua_lk_phu_trach_gs (nguoi_phu_trach, giam_sat_email, tu_dong_gan) VALUES (?, ?, 1)"
    )
    .bind(nguoiPhuTrach, emailGs)
    .run();
}
