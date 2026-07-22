import type { Context, Next } from "hono";
import type { Env, VaiTro } from "../types";

export function requireRole(...allowedRoles: VaiTro[]) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const user = c.get("user");
    if (!user.vai_tro || !allowedRoles.includes(user.vai_tro)) {
      return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    }
    await next();
  };
}
