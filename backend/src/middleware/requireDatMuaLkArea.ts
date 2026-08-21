import type { Context, Next } from "hono";
import type { Env } from "../types";
import { canAccessDatMuaLkArea } from "../lib/moduleAccess";

// RA SOAT BAO MAT 2026-08-18 (phan hoi Codex): chan o CONG VAO cho ca 3 router "Dat mua linh kien"/
// "Phieu xuat kho"/"Don tra hang" - truoc day chi can dang nhap + da duyet la goi duoc moi API du
// khong lien quan module nay (vd CSKH/Viewer). Dat SAU verifySessionMiddleware+loadUser (can
// c.get("user") da duoc set) - xem canAccessDatMuaLkArea() de biet ly do dung union role-flag thay vi
// chi hasModule().
export async function requireDatMuaLkArea(c: Context<{ Bindings: Env }>, next: Next) {
  if (!canAccessDatMuaLkArea(c.get("user"))) return c.json({ error: "MODULE_NOT_ALLOWED" }, 403);
  await next();
}
