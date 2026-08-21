import type { Context, Next } from "hono";
import type { Env } from "../types";

// Quyen ghi "Danh muc linh kien" (bang linh_kien, dung chung ca "giai trinh thieu linh kien" lan
// "dat mua linh kien") - CHOT 2026-08-17, xem migration 0082_linh_kien_dac_thu_tp_dvbh.sql. Thay
// the requireRole("Admin","TBP DVBH","Giam sat") cu (da lech sau khi tach la_tac_nghiep khoi vai_tro
// o migration 0081) bang 1 flag doc lap - dung chung cho settings.ts (/linh-kien) va lkSettings.ts
// (/lk-settings/danh-muc) vi ca 2 cung ghi vao 1 bang.
export async function requireQuanLyDanhMucLk(c: Context<{ Bindings: Env }>, next: Next) {
  const user = c.get("user");
  if (!user.quan_ly_danh_muc_lk && user.vai_tro !== "Admin") {
    return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  }
  await next();
}
