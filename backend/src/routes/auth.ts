import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../types";
import { signSession } from "../lib/jwt";
import { verifySessionMiddleware, SESSION_COOKIE } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { sanitizeThemeConfig } from "../lib/theme";
import { nowVN } from "../lib/vnTime";

const STATE_COOKIE = "dvbh_oauth_state";
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8h, phu hop ca lam viec noi bo

const auth = new Hono<{ Bindings: Env }>();

auth.get("/login", async (c) => {
  const state = crypto.randomUUID();
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 600,
    path: "/",
  });

  const redirectUri = c.env.GOOGLE_REDIRECT_URI;
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

auth.get("/callback", async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/" });

  if (!code || !state || !savedState || state !== savedState) {
    return c.text("Xac thuc that bai: state khong hop le.", 400);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: c.env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    return c.text("Khong the doi ma xac thuc voi Google.", 502);
  }
  const tokenJson = (await tokenRes.json()) as { access_token: string };

  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  if (!userInfoRes.ok) {
    return c.text("Khong the lay thong tin nguoi dung tu Google.", 502);
  }
  const userInfo = (await userInfoRes.json()) as { email: string; email_verified: boolean; name?: string };

  if (!userInfo.email_verified) {
    return c.text("Email Google chua duoc xac minh.", 403);
  }

  // Upsert ten hien thi (khong dong lai vai_tro/trang_thai_duyet o day - loadUser xu ly)
  await c.env.DB.prepare("PRAGMA foreign_keys = ON").run();
  const isBootstrapAdmin = userInfo.email === c.env.BOOTSTRAP_ADMIN_EMAIL;
  await c.env.DB.prepare(
    `INSERT INTO users (email, ten, vai_tro, trang_thai_duyet)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET ten = excluded.ten, updated_at = ?`,
  )
    .bind(
      userInfo.email,
      userInfo.name ?? null,
      isBootstrapAdmin ? "Admin" : null,
      isBootstrapAdmin ? "Da duyet" : "Cho duyet",
      nowVN(),
    )
    .run();

  // Ghi nhat ky dang nhap (bao mat noi bo - Admin tra cuu ai dang nhap luc nao tu dau).
  // CF-Connecting-IP la header Cloudflare tu dong gan, dang tin cay hon so voi client tu khai bao.
  await c.env.DB.prepare("INSERT INTO login_log (email, thoi_gian, ip, user_agent) VALUES (?, ?, ?, ?)")
    .bind(userInfo.email, nowVN(), c.req.header("CF-Connecting-IP") ?? null, c.req.header("User-Agent") ?? null)
    .run();

  const token = await signSession({ email: userInfo.email }, c.env.SESSION_SECRET, SESSION_TTL_SECONDS);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });

  return c.redirect(c.env.FRONTEND_URL || "/");
});

auth.post("/logout", async (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// GET /api/auth/me - hydrate phien dang nhap. Tien the: 1 UPDATE nguyen tu doi chieu ngay lich
// VN (+7h) de xac dinh day co phai lan mo app dau tien trong ngay khong (khong dua vao tan suat
// OAuth callback vi phien dang nhap keo dai 8h, co the dang nhap lai nhieu lan/ngay). meta.changes
// = 1 nghia la ngay luu khac ngay hom nay -> day la lan dau -> tra showDailyReport de FE ban toast.
auth.get("/me", verifySessionMiddleware, loadUser, async (c) => {
  const user = c.get("user");
  const result = await c.env.DB.prepare(
    `UPDATE users SET last_report_date = date(datetime('now','+7 hours'))
     WHERE email = ? AND (last_report_date IS NULL OR last_report_date != date(datetime('now','+7 hours')))`,
  )
    .bind(user.email)
    .run();
  const showDailyReport = (result.meta.changes ?? 0) > 0;
  return c.json({ user, showDailyReport });
});

// PATCH /api/auth/me - tu phuc vu: nguoi dang dang nhap doi thong tin CUA CHINH MINH (giao dien,
// ten goi rieng dung cho loi chao, gioi tinh). Khac han users.ts (khoa Admin-only, thao tac tren
// user KHAC) - route nay khong dung tay toi vai_tro/khu_vuc_phu_trach/trang_thai_duyet.
auth.patch("/me", verifySessionMiddleware, loadUser, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ theme_config?: unknown; ten_goi?: string | null; gioi_tinh?: string | null }>();

  const sets: string[] = [];
  const binds: unknown[] = [];

  if (body.theme_config !== undefined) {
    const sanitized = sanitizeThemeConfig(body.theme_config);
    if (!sanitized) return c.json({ error: "INVALID_THEME_CONFIG" }, 400);
    sets.push("theme_config = ?");
    binds.push(sanitized);
  }

  if (body.ten_goi !== undefined) {
    const trimmed = typeof body.ten_goi === "string" ? body.ten_goi.trim() : "";
    if (trimmed.length > 50) return c.json({ error: "TEN_GOI_TOO_LONG" }, 400);
    sets.push("ten_goi = ?");
    binds.push(trimmed || null);
  }

  if (body.gioi_tinh !== undefined) {
    if (body.gioi_tinh !== null && body.gioi_tinh !== "nam" && body.gioi_tinh !== "nu") {
      return c.json({ error: "INVALID_GIOI_TINH" }, 400);
    }
    sets.push("gioi_tinh = ?");
    binds.push(body.gioi_tinh);
  }

  if (sets.length === 0) return c.json({ ok: true });

  await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE email = ?`)
    .bind(...binds, user.email)
    .run();
  return c.json({ ok: true });
});

export default auth;
