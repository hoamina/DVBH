import { PHAM_VI_QUOC_GIA_MAC_DINH } from "../lib/quocGia";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { type Env, NGON_NGU_VALUES } from "../types";
import { signSession } from "../lib/jwt";
import { verifySessionMiddleware, SESSION_COOKIE, SESSION_TTL_SECONDS } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { nowVN } from "../lib/vnTime";
import { requireRole } from "../middleware/requireRole";

const STATE_COOKIE = "dvbh_oauth_state";

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

  const isBootstrapAdmin = userInfo.email === c.env.BOOTSTRAP_ADMIN_EMAIL;

  // Upsert ten hien thi (khong dong lai vai_tro/trang_thai_duyet o day - loadUser xu ly). Moi tai
  // khoan (ke ca KTV/Ve tinh) deu vao "Cho duyet" cho den khi Admin duyet thu cong.
  await c.env.DB.prepare(
    `INSERT INTO users (email, ten, vai_tro, trang_thai_duyet, pham_vi_quoc_gia)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET ten = excluded.ten, updated_at = ?`,
  )
    .bind(
      userInfo.email,
      userInfo.name ?? null,
      isBootstrapAdmin ? "Admin" : null,
      isBootstrapAdmin ? "Da duyet" : "Cho duyet",
      isBootstrapAdmin ? null : PHAM_VI_QUOC_GIA_MAC_DINH,
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

// GET /api/auth/dev-login - cua sau CHI hoat dong khi LOCAL_DEV_BYPASS_AUTH=true (chi dat trong
// .dev.vars, khong bao gio co tren production - xem Env.LOCAL_DEV_BYPASS_AUTH o types.ts). Bo qua
// toan bo vong Google OAuth that (.dev.vars dung GOOGLE_CLIENT_ID gia, xem secrets.md), dang nhap
// thang vao tai khoan BOOTSTRAP_ADMIN_EMAIL voi vai_tro Admin de test giao dien local day du.
auth.get("/dev-login", async (c) => {
  if (c.env.LOCAL_DEV_BYPASS_AUTH !== "true") return c.text("Not found", 404);

  const email = c.env.BOOTSTRAP_ADMIN_EMAIL;
  await c.env.DB.prepare(
    `INSERT INTO users (email, ten, vai_tro, trang_thai_duyet)
     VALUES (?, ?, 'Admin', 'Da duyet')
     ON CONFLICT(email) DO UPDATE SET updated_at = ?`,
  )
    .bind(email, "Dev Admin (local bypass)", nowVN())
    .run();

  const token = await signSession({ email }, c.env.SESSION_SECRET, SESSION_TTL_SECONDS);
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

  // GD4 (phan hoi Codex #16/#17, module Dat mua linh kien): "la_tram" TINH THAT (co it nhat 1 Ve
  // tinh voi tram_cha = email minh), cung dung 1 query voi notifications.ts (routes/notifications.ts
  // dong 170). Truoc day frontend tu suy "la Tram" qua heuristic `la_ktv_dvbh && !tram_cha` (tuc
  // "la KTV va KHONG phai Ve tinh cua ai") - dung SAI cho KTV thuong khong quan ly Ve tinh nao (ho
  // cung khong co tram_cha, nen bi nham la Tram, mac dinh sai vao bucket "Cho Tram duyet" luon rong
  // voi ho). Tra them field nay de FE dung truc tiep, khong tu suy dien nua.
  // Co he thong bat/tat 3T Pet (migration 0147) tra kem o day de khong ton them request (1 dong doc theo khoa chinh).
  const [laTramRow, petRow] = await Promise.all([
    c.env.DB.prepare("SELECT 1 as x FROM users WHERE tram_cha = ? LIMIT 1").bind(user.email).first(),
    c.env.DB.prepare("SELECT gia_tri FROM cai_dat_he_thong WHERE khoa = 'bat_pet_3t'").first<{ gia_tri: string }>(),
  ]);
  const la_tram = !!laTramRow;
  const pet_3t_he_thong = petRow?.gia_tri !== "0";

  return c.json({ user: { ...user, la_tram, pet_3t_he_thong }, showDailyReport });
});

// GET /api/auth/nguoi-directory - danh ba email -> ten HIEN THI, dung CHUNG toan he thong (moi
// route/module) de hien "Tên (mail)"/"Tên KTV (mail)" thay vi email tho khap noi (phan hoi
// 2026-08-19: "Toàn bộ hệ thống nếu tạo thông tin người dùng có tên => sẽ ưu tiên hiện tên dưới
// dạng Tên (mail)... KTV/Trạm/CTV sẽ hiện tên KTV (mail)"). CHI can dang nhap (khong gioi han theo
// vai_tro/module nhu GET /api/users hay GET /dat-mua-lk/nguoi-nhan-hang-kha-dung - 2 endpoint do bi
// khoa rieng Admin/khu vuc "Dat mua linh kien" nen KHONG dung chung duoc cho cac module khac). Tra
// rieng 2 danh sach (users/ktv) thay vi merge san o backend - frontend tu uu tien ten_hien_thi cua
// KTV (do CSKH/Admin bien tap rieng, thuong sat thuc te hon ten Google) truoc ten cua users.ten.
auth.get("/nguoi-directory", verifySessionMiddleware, loadUser, async (c) => {
  const [{ results: users }, { results: ktv }] = await Promise.all([
    c.env.DB.prepare("SELECT email, ten FROM users WHERE trang_thai_duyet = 'Da duyet' AND ten IS NOT NULL").all<{ email: string; ten: string }>(),
    c.env.DB.prepare("SELECT email_dang_nhap as email, ten_hien_thi FROM ktv_lien_he WHERE email_dang_nhap IS NOT NULL AND ten_hien_thi IS NOT NULL").all<{ email: string; ten_hien_thi: string }>(),
  ]);
  return c.json({ users, ktv });
});

// PATCH /api/auth/me - tu phuc vu: nguoi dang dang nhap doi thong tin CUA CHINH MINH (ten goi
// rieng dung cho loi chao, gioi tinh). Khac han users.ts (khoa Admin-only, thao tac tren user
// KHAC) - route nay khong dung tay toi vai_tro/khu_vuc_phu_trach/trang_thai_duyet.
// Chot 2026-08-13: Giao dien (gam mau/phong chu) KHONG con luu server o day nua - chuyen han sang
// localStorage may nguoi dung (xem frontend/src/theme/localThemeConfig.ts) de giam ghi/doc D1
// khong can thiet, chi con "Thong tin ca nhan" (ten_goi, gioi_tinh) dung route nay.
auth.patch("/me", verifySessionMiddleware, loadUser, async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ ten_goi?: string | null; gioi_tinh?: string | null; ngon_ngu?: string; bat_pet_3t?: boolean }>();

  const sets: string[] = [];
  const binds: unknown[] = [];

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

  // Ngon ngu giao dien (migration 0146) - moi user tu doi cua minh.
  if (body.ngon_ngu !== undefined) {
    if (!(NGON_NGU_VALUES as readonly string[]).includes(body.ngon_ngu)) return c.json({ error: "INVALID_NGON_NGU" }, 400);
    sets.push("ngon_ngu = ?");
    binds.push(body.ngon_ngu);
  }

  // Bat/tat thu cung 3T Pet cho chinh minh (migration 0147).
  if (body.bat_pet_3t !== undefined) {
    if (typeof body.bat_pet_3t !== "boolean") return c.json({ error: "INVALID_BAT_PET_3T" }, 400);
    sets.push("bat_pet_3t = ?");
    binds.push(body.bat_pet_3t ? 1 : 0);
  }

  if (sets.length === 0) return c.json({ ok: true });

  await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE email = ?`)
    .bind(...binds, user.email)
    .run();
  return c.json({ ok: true });
});

// PATCH /api/auth/pet-3t-he-thong { bat } - Admin bat/tat thu cung 3T Pet cho TOAN HE THONG (migration 0147).
// Tat = khong ai tai widget nua (bat ke users.bat_pet_3t); tab dang mo cua nguoi khac het game o lan tai trang sau.
auth.patch("/pet-3t-he-thong", verifySessionMiddleware, loadUser, requireRole("Admin"), async (c) => {
  const body = await c.req.json<{ bat?: unknown }>().catch(() => ({}) as { bat?: unknown });
  if (typeof body.bat !== "boolean") return c.json({ error: "INVALID_BAT" }, 400);
  await c.env.DB.prepare(
    `INSERT INTO cai_dat_he_thong (khoa, gia_tri, updated_at, updated_by) VALUES ('bat_pet_3t', ?, ?, ?)
     ON CONFLICT(khoa) DO UPDATE SET gia_tri = excluded.gia_tri, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  )
    .bind(body.bat ? "1" : "0", nowVN(), c.get("user").email)
    .run();
  return c.json({ ok: true });
});

export default auth;
