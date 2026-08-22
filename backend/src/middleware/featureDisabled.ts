import type { Context, Next } from "hono";
import type { Env } from "../types";

// Chan TOAN BO 1 route cho TAT CA user (ke ca Admin), tra loi ro rang thay vi im lang 404 - dung de
// tam tat 1 module ma KHONG dong code/route/DB. Bat lai: xoa dong .use(featureDisabled(...)) o cuoi
// chuoi middleware cua route do, khong can doi gi khac (middleware phia truoc, vd
// requireDatMuaLkArea, van giu nguyen hanh vi cu).
export function featureDisabled(message: string) {
  return async (c: Context<{ Bindings: Env }>, _next: Next) => {
    return c.json({ error: "FEATURE_DISABLED", message }, 403);
  };
}
