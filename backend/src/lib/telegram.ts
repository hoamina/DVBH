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
