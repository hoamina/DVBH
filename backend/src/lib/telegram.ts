import { dbGoc, phamViCua, quocGiaCua } from "./phamVi";

// Bot noi bo, chi gui vao 1 nhom Telegram co dinh - giu nguyen gia tri da dung tu truoc (khong phai
// secret nhay cam, bot chi co quyen gui tin/anh vao dung group nay). Dung chung cho ca bao cao 17h30
// (dailySnapshot.ts chotGiaiTrinhDailyLog) lan "Canh bao ton danh cho QL" 08h00 (canhBaoTon.ts
// generateCanhBaoTonSnapshot).
export const TELEGRAM_BOT_ID = "8112253426:AAGT3PPMA5QvI2qUoJJj9HvlmgeCdhxDD-8";
export const TELEGRAM_CHAT_ID = "-1004389265476";

let laMoiTruongLocal = false;
/** Goi dau moi fetch/scheduled (index.ts): danh dau isolate dang chay dev local -> sendTelegramPhoto khong gui. */
export function danhDauMoiTruongLocal(env: { LOCAL_DEV_BYPASS_AUTH?: string }): void {
  laMoiTruongLocal = env.LOCAL_DEV_BYPASS_AUTH === "true";
}

/** Gui 1 anh PNG qua Telegram Bot API (sendPhoto, multipart) - dung cho bao cao 17h30 (xem
 * lib/reportImage.ts + dailySnapshot.ts chotGiaiTrinhDailyLog). */
export async function sendTelegramPhoto(botId: string, chatId: string, png: Uint8Array, caption?: string): Promise<void> {
  // Dev local (wrangler dev, .dev.vars LOCAL_DEV_BYPASS_AUTH=true) KHONG BAO GIO gui that - bot/nhom ben tren la that
  // (2026-10-29: 1 lan thu cron 08:00 local da gui nham anh so lieu local vao nhom production).
  if (laMoiTruongLocal) {
    console.log("[Telegram] Bo qua gui (moi truong dev local)");
    return;
  }
  const form = new FormData();
  form.append("chat_id", chatId);
  if (caption) form.append("caption", caption);
  form.append("photo", new Blob([png], { type: "image/png" }), "baocao.png");

  const res = await fetch(`https://api.telegram.org/bot${botId}/sendPhoto`, { method: "POST", body: form });
  if (!res.ok) {
    console.error("[Telegram] Gui anh that bai:", res.status, await res.text());
  } else {
    console.log("[Telegram] Gui anh thanh cong!");
  }
}

/**
 * "Đa quốc gia" (SRS §12, Q6 - gui rieng tung nuoc, chot 2026-10-29): anh 08:00 / 17:30 gui o lan chot cua TUNG NUOC
 * (lib/phamViChot.ts) vao nhom cua nuoc do (quoc_gia.telegram_chat_id, migration 0150; VN = nhom cu TELEGRAM_CHAT_ID).
 * Pham vi "Tất cả" / NSKX khong gui. Tra null = khong gui (nuoc chua cau hinh nhom, hoac khong phai pham vi 1 nuoc).
 */
export async function nhomTelegramCuaPhamVi(db: D1Database): Promise<{ chatId: string; qg: string } | null> {
  const qg = quocGiaCua(db);
  if (qg === null || phamViCua(db) !== "tat_ca") return null;
  const row = await dbGoc(db)
    .prepare("SELECT telegram_chat_id FROM quoc_gia WHERE ma = ? AND kich_hoat = 1")
    .bind(qg)
    .first<{ telegram_chat_id: string | null }>();
  const chatId = row?.telegram_chat_id?.trim();
  return chatId ? { chatId, qg } : null;
}
