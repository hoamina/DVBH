// Bot noi bo, chi gui vao 1 nhom Telegram co dinh - giu nguyen gia tri da dung tu truoc (khong phai
// secret nhay cam, bot chi co quyen gui tin/anh vao dung group nay). Dung chung cho ca bao cao 17h30
// (dailySnapshot.ts chotGiaiTrinhDailyLog) lan "Canh bao ton danh cho QL" 08h00 (canhBaoTon.ts
// generateCanhBaoTonSnapshot).
export const TELEGRAM_BOT_ID = "8112253426:AAGT3PPMA5QvI2qUoJJj9HvlmgeCdhxDD-8";
export const TELEGRAM_CHAT_ID = "-1004389265476";

/** Gui 1 anh PNG qua Telegram Bot API (sendPhoto, multipart) - dung cho bao cao 17h30 (xem
 * lib/reportImage.ts + dailySnapshot.ts chotGiaiTrinhDailyLog). */
export async function sendTelegramPhoto(botId: string, chatId: string, png: Uint8Array, caption?: string): Promise<void> {
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
