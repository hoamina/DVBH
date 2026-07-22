import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { buildGreeting, currentVnHour, fetchWeather, inferRegion, pickEpithet, timeOfDay } from "../lib/greeting";

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

export default greeting;
