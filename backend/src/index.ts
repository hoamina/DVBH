import { Hono } from "hono";
import type { Env } from "./types";
import authRoutes from "./routes/auth";
import casesRoutes from "./routes/cases";
import missingPartsRoutes from "./routes/missingParts";
import tranhChapRoutes from "./routes/tranhChap";
import napGasRoutes from "./routes/napGas";
import surveyRoutes from "./routes/survey";
import viPhamRoutes from "./routes/viPham";
import importRoutes from "./routes/importRoute";
import importGiaiTrinhRoutes from "./routes/importGiaiTrinh";
import importGiaiTrinhLapRoutes from "./routes/importGiaiTrinhLap";
import importKhaoSatRoutes from "./routes/importKhaoSat";
import importNapGasRoutes from "./routes/importNapGas";
import settingsRoutes from "./routes/settings";
import usersRoutes from "./routes/users";
import dashboardRoutes from "./routes/dashboard";
import revenueRoutes from "./routes/revenue";
import notificationsRoutes from "./routes/notifications";
import greetingRoutes from "./routes/greeting";
import caLapRoutes from "./routes/caLap";
import { refreshCaLapPrecompute, shouldSkipCronRefresh } from "./lib/caLapRefresh";
import { syncGiaiTrinhFromSheet } from "./routes/importGiaiTrinh";
import { syncGiaiTrinhLapFromSheet } from "./routes/importGiaiTrinhLap";
import { syncKhaoSatFromSheet } from "./routes/importKhaoSat";
import { syncNapGasFromSheet } from "./routes/importNapGas";

const app = new Hono<{ Bindings: Env }>();

app.route("/api/auth", authRoutes);
app.route("/api/cases", casesRoutes);
app.route("/api/missing-parts", missingPartsRoutes);
app.route("/api/tranh-chap", tranhChapRoutes);
app.route("/api/nap-gas", napGasRoutes);
app.route("/api/survey", surveyRoutes);
app.route("/api/vi-pham", viPhamRoutes);
app.route("/api/import", importRoutes);
app.route("/api/import/giai-trinh", importGiaiTrinhRoutes);
app.route("/api/import/giai-trinh-lap", importGiaiTrinhLapRoutes);
app.route("/api/import/khao-sat", importKhaoSatRoutes);
app.route("/api/import/nap-gas", importNapGasRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/revenue", revenueRoutes);
app.route("/api/notifications", notificationsRoutes);
app.route("/api/greeting", greetingRoutes);
app.route("/api/ca-lap", caLapRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "INTERNAL_ERROR" }, 500);
});

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

const ARCHIVE_AFTER = "-3 months";
// Lich chay hang ngay (archive) - giu nguyen. Cron nay CHI con la luoi an toan du phong cho "ca
// lap" (vd 1 duong ghi du lieu nao khac quen goi refreshCaLapPrecompute() truc tiep) - co che
// CHINH gio la goi ngay sau khi import/dong bo ghi du lieu that (xem importRoute.ts), nen giam
// tan suat xuong 1 gio/lan (truoc la 20 phut/lan) - phai khai bao ca 2 trong wrangler*.jsonc
// "triggers.crons".
const CA_LAP_REFRESH_CRON = "0 * * * *";

// 3 lan/ngay - 9h/13h/16h gio VN = 2h/6h/9h UTC (chot voi chu he thong 2026-07-29) - tu dong dong
// bo 4 Google Sheet "cu" (giai_trinh/giai_trinh_lap/khao_sat/nap_gas_danh_gia) do AppSheet dien du
// lieu, thay cho viec phai tu bam "Dong bo ngay" trong module Import moi ngay. KHONG dong toi CRM
// chinh (case_dvbh, POST /api/import/sync-sheet) - van dong bo tay theo yeu cau rieng cua chu he
// thong. Actor la user "he thong" co dinh (migration 0033) - can vi import_history.nguoi_import co
// FK REFERENCES users(email), khong the ghi 1 email tuy y.
const SHEET_SYNC_CRON = "0 2,6,9 * * *";
const SHEET_SYNC_ACTOR_EMAIL = "he-thong-tu-dong@dvbh.internal";

// Chay 1 sync, ghi log neu that bai (nuot loi - KHONG throw) de 1 sync loi khong chan cac sync con
// lai trong cung dot cron. Log qua console.error (xem qua `wrangler tail`) vi day la tac vu nen,
// khong co response HTTP nao de bao loi cho nguoi dung nhu route /sync-sheet thu cong.
async function runSheetSync(label: string, fn: () => Promise<{ ok: boolean; reason?: string; message?: string }>): Promise<void> {
  try {
    const result = await fn();
    if (!result.ok) {
      console.error(`[cron-sheet-sync] ${label} that bai (${result.reason})${result.message ? `: ${result.message}` : ""}`);
    }
  } catch (err) {
    console.error(`[cron-sheet-sync] ${label} loi khong mong doi:`, err instanceof Error ? err.message : String(err));
  }
}

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    if (event.cron === CA_LAP_REFRESH_CRON) {
      // Guard: chi thuc su recompute (full - luoi an toan) khi du lieu nguon THAT SU doi ke tu lan
      // refresh truoc (xem shouldSkipCronRefresh o caLapRefresh.ts) - tranh quet toan bang moi gio
      // du khong co import/dong bo/sua ca nao xay ra trong khung gio do.
      if (await shouldSkipCronRefresh(env.DB)) return;
      await refreshCaLapPrecompute(env.DB);
      return;
    }

    if (event.cron === SHEET_SYNC_CRON) {
      // Tuan tu (khong Promise.all) - 4 sync doc lap nhau, khong can chay song song; don gian va
      // de doc log theo dung thu tu hon la chay dong thoi khong can thiet.
      await runSheetSync("giai_trinh_cu", () => syncGiaiTrinhFromSheet(env.DB, SHEET_SYNC_ACTOR_EMAIL));
      await runSheetSync("giai_trinh_lap_cu", () => syncGiaiTrinhLapFromSheet(env.DB, SHEET_SYNC_ACTOR_EMAIL));
      await runSheetSync("khao_sat_cu", () => syncKhaoSatFromSheet(env.DB, SHEET_SYNC_ACTOR_EMAIL));
      await runSheetSync("nap_gas_danh_gia_cu", () => syncNapGasFromSheet(env.DB, SHEET_SYNC_ACTOR_EMAIL));
      return;
    }

    // idx_case_archive_pending (migration 0019) phuc vu dung cau nay: chi giu lai cac dong
    // archived_at IS NULL nen SQLite khong phai quet lai ca phan da archive tu lau.
    // Khong bump domain "cases" o day - archive tu dong KHONG lam bao cao tinh san cu di, chi
    // import (commit/sync-sheet) moi bump domain nay (xem R8 trong YEU_CAU_BAO_CAO_TINH_SAN.md
    // va comment o lib/dataVersions.ts).
    await env.DB.prepare(
      `UPDATE case_dvbh SET archived_at = datetime('now', '+7 hours')
       WHERE thoi_gian_hoan_thanh IS NOT NULL AND archived_at IS NULL
         AND thoi_gian_hoan_thanh < datetime('now', '+7 hours', ?)`,
    )
      .bind(ARCHIVE_AFTER)
      .run();
  },
};
