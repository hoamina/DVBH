import type { Context } from "hono";
import type { Env } from "../types";
import { ROLES_XEM_TOAN_BO } from "../types";

/**
 * Tra ve null (khong gioi han) hoac mang khu vuc duoc phep xem. Dung chung cho moi query
 * list-theo-khu-vuc, khong lap lai logic o tung route.
 *
 * "Viewer" (chot 2026-07-29): KHAC voi cac vai tro con lai trong ROLES_XEM_TOAN_BO (Admin/TBP DVBH/
 * TBP CSKH/QC - LUON khong gioi han bat ke khu_vuc_phu_trach) - Viewer mac dinh xem TOAN BO khi
 * CHUA duoc gan khu vuc nao (khu_vuc_phu_trach rong), nhung neu Admin gan 1-2 khu vuc cu the cho 1
 * Viewer thi nguoi do CHI xem duoc dung khu vuc da gan - giong het Giam sat. Van giu Viewer trong
 * ROLES_XEM_TOAN_BO (hang so do con dung o requireRole cua revenue.ts de cap quyen VAO duoc module
 * Bao cao doanh thu - khong lien quan gioi han khu vuc) nen phai kiem tra Viewer RIENG, TRUOC khi
 * xet ROLES_XEM_TOAN_BO chung.
 */
export function scopeByKhuVuc(c: Context<{ Bindings: Env }>): string[] | null {
  const user = c.get("user");
  if (user.vai_tro === "Viewer") {
    return user.khu_vuc_phu_trach && user.khu_vuc_phu_trach.length > 0 ? user.khu_vuc_phu_trach : null;
  }
  if (user.vai_tro && ROLES_XEM_TOAN_BO.includes(user.vai_tro)) return null;
  return user.khu_vuc_phu_trach || [];
}

/** Xay dung "AND khu_vuc IN (...)" + bind values, hoac chuoi rong neu khong gioi han. */
export function khuVucWhereClause(scope: string[] | null, column = "khu_vuc"): { sql: string; binds: string[] } {
  if (scope === null) return { sql: "", binds: [] };
  if (scope.length === 0) return { sql: " AND 1=0", binds: [] }; // chua duoc gan khu vuc nao -> khong thay gi
  const placeholders = scope.map(() => "?").join(", ");
  return { sql: ` AND ${column} IN (${placeholders})`, binds: scope };
}
