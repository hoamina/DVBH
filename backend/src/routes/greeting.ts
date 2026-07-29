import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { buildGreeting, currentVnHour, fetchAiGreeting, fetchWeather, inferRegion, pickEpithet, timeOfDay } from "../lib/greeting";

const greeting = new Hono<{ Bindings: Env }>();
greeting.use("*", verifySessionMiddleware, loadUser);

// Nguoi Viet thuong goi nhau bang tu cuoi cung cua ten day du (vd "Nguyen Van Nam" -> "Nam") -
// khop voi cach TopBar.tsx dang lay chu cai dau cho avatar. Uu tien "ten_goi" (nguoi dung tu dat
// rieng cho loi chao) truoc "ten" (lay tu Google luc dang nhap).
function firstNameOf(tenGoi: string | null, ten: string | null, email: string): string {
  const source = tenGoi?.trim() || ten?.trim();
  const last = source?.split(/\s+/).pop();
  return last || email.split("@")[0];
}

function lowerFirst(s: string): string {
  return s.length ? s[0].toLowerCase() + s.slice(1) : s;
}

// GET /api/greeting - loi chao "phu" dang "Chao {Ten} {cach goi}, {noi dung}" ket hop gio VN +
// thoi tiet uoc luong theo khu vuc phu trach cua user + cach goi ngau nhien theo gioi tinh. Tra
// rieng "namePrefix" (phan "Chao Ten cach-goi" - frontend to dam rieng phan nay) va "message"
// (phan noi dung con lai) thay vi 1 chuoi gop san, de FE quyet dinh kieu chu tung phan. Khong bao
// gio throw loi nghiep vu - loi mang/thoi tiet chi lam weather=null, van tra 200 kem loi chao
// thuan theo gio (frontend tu an ca banner neu request nay that bai vi ly do gi khac).
greeting.get("/", async (c) => {
  const user = c.get("user");
  const region = inferRegion(user.khu_vuc_phu_trach);
  const weather = await fetchWeather(region);
  const tod = timeOfDay(currentVnHour());
  const body = buildGreeting(tod, weather);
  const name = firstNameOf(user.ten_goi, user.ten, user.email);
  const epithet = pickEpithet(user.gioi_tinh);
  const namePrefix = `Chào ${name} ${epithet}`;
  const message = lowerFirst(body);
  return c.json({ timeOfDay: tod, weather, namePrefix, message });
});

// So giay giu ket qua (thanh cong LAN null) trong Cache API (edge, khong dung D1/KV rieng) - chan
// KHONG goi Gemini qua 1 lan/5 phut cho CUNG 1 tai khoan, ke ca khi AI fail (tranh dap lai API dang
// loi lien tuc). Cache theo edge Cloudflare (tung diem gan nguoi dung) nen KHONG dam bao dung tuyet
// doi 1 lan/5 phut toan cuc neu user doi diem ket noi giua 2 lan goi - chap nhan duoc vi day la
// tinh nang trang tri (giong fetchWeather() da dung cung co che), khong can chinh xac tuyet doi.
const AI_GREETING_CACHE_TTL_SEC = 300;

// GET /api/greeting/ai - ban chao "nang cap" boi Gemini, goi RIENG (khong gop vao GET / o tren) de
// frontend hien ban mau (buildGreeting(), tra ngay) TRUOC, roi thay bang ket qua o day SAU khi co -
// khong bao gio lam cham lan hien dau tien. "message: null" nghia la AI khong san sang (loi mang/
// key sai/timeout/model tra ve khong hop le) - FE giu nguyen ban mau, khong hien loi.
greeting.get("/ai", async (c) => {
  const user = c.get("user");
  const cacheKey = new Request(`https://internal-cache.dvbh-suite/greeting-ai/${encodeURIComponent(user.email)}`);
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) return c.json(await cached.json());

  const region = inferRegion(user.khu_vuc_phu_trach);
  const weather = await fetchWeather(region);
  const tod = timeOfDay(currentVnHour());
  const message = await fetchAiGreeting(c.env.GEMINI_API_KEY, tod, weather);

  const payload = { message };
  c.executionCtx.waitUntil(
    cache.put(
      cacheKey,
      new Response(JSON.stringify(payload), {
        headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${AI_GREETING_CACHE_TTL_SEC}` },
      }),
    ),
  );
  return c.json(payload);
});

export default greeting;
