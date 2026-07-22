import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verifySession } from "../lib/jwt";
import type { Env } from "../types";

export const SESSION_COOKIE = "dvbh_session";

export async function verifySessionMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "MISSING_TOKEN" }, 401);

  const payload = await verifySession(token, c.env.SESSION_SECRET);
  if (!payload) return c.json({ error: "INVALID_TOKEN" }, 401);

  c.set("email", payload.email);
  await next();
}
