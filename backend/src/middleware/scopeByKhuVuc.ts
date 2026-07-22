import type { Context } from "hono";
import type { Env } from "../types";
import { ROLES_XEM_TOAN_BO } from "../types";

/**
 * Tra ve null (khong gioi han - Admin/Viewer/TBP DVBH/TBP CSKH) hoac
 * mang khu vuc duoc phep xem. Dung chung cho moi query list-theo-khu-vuc,
 * khong lap lai logic o tung route.
 */
export function scopeByKhuVuc(c: Context<{ Bindings: Env }>): string[] | null {
  const user = c.get("user");
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
