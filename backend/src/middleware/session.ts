import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { verifySession, signSession } from "../lib/jwt";
import type { Env } from "../types";

export const SESSION_COOKIE = "dvbh_session";
// CHOT 2026-08-02 (chu he thong xac nhan): 72h + gia han theo hoat dong (sliding window, xem duoi) -
// truoc la 8h CO DINH tinh tu luc dang nhap, khong gia han, nen nguoi dung hay bi dang xuat giua
// luc dang lam viec (session > 8h lien tuc) chu khong phai do dang nhap lai qua nhieu. Doi ca
// TTL ban dau (auth.ts /callback) LAN TTL gia han (duoi day) - phai dung 1 hang so, doi rieng se
// gay lech han giua lan dang nhap dau va cac lan gia han sau.
export const SESSION_TTL_SECONDS = 72 * 60 * 60;

export async function verifySessionMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "MISSING_TOKEN" }, 401);

  const payload = await verifySession(token, c.env.SESSION_SECRET);
  if (!payload) return c.json({ error: "INVALID_TOKEN" }, 401);

  c.set("email", payload.email);

  // Gia han phien (sliding window): Chỉ ký lại và cập nhật cookie khi thời gian hết hạn còn lại
  // dưới 50% tổng thời gian sống (tương đương 36 giờ), giúp giảm thiểu tải tính toán mã hóa CPU
  // khi trình duyệt gửi đồng loạt hàng chục request song song, tránh nguy cơ DDoS CPU Worker.
  const now = Math.floor(Date.now() / 1000);
  const remaining = payload.exp - now;
  if (remaining < SESSION_TTL_SECONDS / 2) {
    const freshToken = await signSession({ email: payload.email }, c.env.SESSION_SECRET, SESSION_TTL_SECONDS);
    setCookie(c, SESSION_COOKIE, freshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
    });
  }

  await next();
}
