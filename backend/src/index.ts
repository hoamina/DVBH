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
import externalImportRoutes from "./routes/externalImport";
import settingsRoutes from "./routes/settings";
import usersRoutes from "./routes/users";
import dashboardRoutes from "./routes/dashboard";
import revenueRoutes from "./routes/revenue";
import notificationsRoutes from "./routes/notifications";
import greetingRoutes from "./routes/greeting";
import caLapRoutes from "./routes/caLap";
import partnerApiRoutes from "./routes/partnerApi";
import lkSettingsRoutes from "./routes/lkSettings";
import datMuaLinhKienRoutes from "./routes/datMuaLinhKien";
import phieuXuatKhoRoutes from "./routes/phieuXuatKho";
import traHangRoutes from "./routes/traHang";
import { refreshCaLapPrecompute, shouldSkipCronRefresh } from "./lib/caLapRefresh";
import { selfHealDaDongDayChunks } from "./lib/daDongDayChunks";
import { warmDefaultReports } from "./lib/reportWarmup";
import { generateDailySnapshot, chotGiaiTrinhDailyLog, generateKhuVucBacklogSnapshots } from "./lib/dailySnapshot";
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
// Prefix rieng biet hoan toan voi "/api/import" (khong dung verifySessionMiddleware - xem
// routes/externalImport.ts) - pipeline Python QuickSight goi qua API key tinh.
app.route("/api/external-import", externalImportRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/revenue", revenueRoutes);
app.route("/api/notifications", notificationsRoutes);
app.route("/api/greeting", greetingRoutes);
app.route("/api/ca-lap", caLapRoutes);
// Doi tac ben ngoai quet du lieu CRM dinh ky (xem PARTNER_API_GUIDE.md) - khong dung session/OAuth,
// xac thuc rieng qua X-API-Key trong routes/partnerApi.ts.
app.route("/api/partner", partnerApiRoutes);
app.route("/api/lk-settings", lkSettingsRoutes);
app.route("/api/dat-mua-lk", datMuaLinhKienRoutes);
app.route("/api/phieu-xuat-kho", phieuXuatKhoRoutes);
app.route("/api/tra-hang", traHangRoutes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "INTERNAL_ERROR" }, 500);
});

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

const ARCHIVE_AFTER = "-3 months";
// Chot voi chu he thong 2026-08-02: archive khong can chay hang ngay nua, gom vao 1 lan/thang vao
// ngay 1 (20:00 UTC ngay 1 = 03:00 gio VN ngay 2) - luong ghi archived_at khong nhay cam thoi gian
// thuc, gom 1 thang/lan van du don ca da hoan thanh >3 thang. Phai khai bao trong ca 2
// wrangler*.jsonc "triggers.crons".
const ARCHIVE_CRON = "0 20 1 * *";

// 3 lan/ngay - 9h/13h/16h gio VN = 2h/6h/9h UTC (chot voi chu he thong 2026-07-29) - tu dong dong
// bo 4 Google Sheet "cu" (giai_trinh/giai_trinh_lap/khao_sat/nap_gas_danh_gia) do AppSheet dien du
// lieu, thay cho viec phai tu bam "Dong bo ngay" trong module Import moi ngay. KHONG dong toi CRM
// chinh (case_dvbh, POST /api/import/sync-sheet) - van dong bo tay theo yeu cau rieng cua chu he
// thong. Actor la user "he thong" co dinh (migration 0033) - can vi import_history.nguoi_import co
// FK REFERENCES users(email), khong the ghi 1 email tuy y.
const SHEET_SYNC_CRON = "0 2,6,9 * * *";
const SHEET_SYNC_ACTOR_EMAIL = "he-thong-tu-dong@dvbh.internal";

// 08:00 sang gio VN = 01:00 UTC. Chot voi chu he thong 2026-08-02: gom luoi an toan "ca lap"/
// dashboard (truoc la CA_LAP_REFRESH_CRON rieng, chay moi gio) vao chung 1 dot voi "Bao cao ngay
// 08:00" (banner Tong quat, xem lib/dailySnapshot.ts) - co che CHINH cua ca 2 van la goi truc tiep
// ngay sau khi import/ghi du lieu that (importRoute.ts/externalImport.ts), nen day chi con la luoi
// an toan du phong, khong can tan suat cao hon 1 lan/ngay. Phai khai bao trong ca 2
// wrangler*.jsonc "triggers.crons".
const DAILY_SNAPSHOT_CRON = "0 1 * * *";

// 17:30 chieu gio VN = 10:30 UTC - "chot" ty le giai trinh trong ngay theo khu vuc vao bang
// giai_trinh_daily_log (migration 0040, xem lib/dailySnapshot.ts chotGiaiTrinhDailyLog) - LICH SU
// vinh vien, khong co duong ghi tay, khac DAILY_SNAPSHOT_CRON (bi ghi de moi ngay). CO Y giu rieng
// voi DAILY_SNAPSHOT_CRON (khong gom ve 08:00) - neu chot cung luc voi baseline 08:00 thi ty le
// "da giai trinh trong ngay" se luon bang 0%, mat tac dung theo doi cuoi ngay. Phai khai bao trong
// ca 2 wrangler*.jsonc "triggers.crons".
const DAILY_LOG_1730_CRON = "30 10 * * *";

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
    if (event.cron === SHEET_SYNC_CRON) {
      // Tuan tu (khong Promise.all) - 4 sync doc lap nhau, khong can chay song song; don gian va
      // de doc log theo dung thu tu hon la chay dong thoi khong can thiet.
      await runSheetSync("giai_trinh_cu", () => syncGiaiTrinhFromSheet(env.DB, SHEET_SYNC_ACTOR_EMAIL));
      await runSheetSync("giai_trinh_lap_cu", () => syncGiaiTrinhLapFromSheet(env.DB, SHEET_SYNC_ACTOR_EMAIL));
      await runSheetSync("khao_sat_cu", () => syncKhaoSatFromSheet(env.DB, SHEET_SYNC_ACTOR_EMAIL));
      await runSheetSync("nap_gas_danh_gia_cu", () => syncNapGasFromSheet(env.DB, SHEET_SYNC_ACTOR_EMAIL));
      return;
    }

    if (event.cron === DAILY_SNAPSHOT_CRON) {
      try {
        await generateDailySnapshot(env.DB, "auto");
      } catch (err) {
        console.error("[cron-daily-snapshot] generateDailySnapshot loi:", err instanceof Error ? err.message : String(err));
      }
      try {
        await generateKhuVucBacklogSnapshots(env.DB, "auto");
      } catch (err) {
        console.error("[cron-daily-snapshot] generateKhuVucBacklogSnapshots loi:", err instanceof Error ? err.message : String(err));
      }
      // Luoi an toan cho "ca lap" (gop tu CA_LAP_REFRESH_CRON rieng, truoc chay moi gio) - guard chi
      // thuc su recompute (full) khi du lieu nguon THAT SU doi ke tu lan refresh truoc (xem
      // shouldSkipCronRefresh o caLapRefresh.ts).
      if (!(await shouldSkipCronRefresh(env.DB))) {
        await refreshCaLapPrecompute(env.DB);
      }
      // Tu do + tu va snapshot R2 "ca da dong" (xem lib/daDongDayChunks.ts selfHealDaDongDayChunks)
      // - doc lap voi ca lap, boc rieng try/catch de 1 ben loi khong chan ben con lai (dung nguyen
      // tac voi runBgTask o importRoute.ts). Rat re khi khong co gi doi (xem chu thich trong ham).
      try {
        await selfHealDaDongDayChunks(env);
      } catch (err) {
        console.error("[self-heal] da-dong-day-chunks loi:", err instanceof Error ? err.message : String(err));
      }
      // Luoi an toan cho bao cao dashboard - co che CHINH la pipeline QuickSight tu goi
      // POST /api/external-import/refresh-reports dung 1 lan sau moi dot day file (xem
      // externalImport.ts). Neu tin hieu do bi mat (loi mang, pipeline quen goi...), cache van tu
      // lam moi toi da sau 1 lan/ngay nho nhanh nay - warmDefaultReports() tu bo qua (chi 1 luot doc
      // re) nhung bao cao nao chua doi tu lan tinh truoc, khong ton kem khi khong co gi moi.
      try {
        await warmDefaultReports(env.DB);
      } catch (err) {
        console.error("[cron-daily-snapshot] warmDefaultReports loi:", err instanceof Error ? err.message : String(err));
      }
      return;
    }

    if (event.cron === DAILY_LOG_1730_CRON) {
      try {
        await chotGiaiTrinhDailyLog(env.DB);
      } catch (err) {
        console.error("[cron-daily-log-1730] chotGiaiTrinhDailyLog loi:", err instanceof Error ? err.message : String(err));
      }
      return;
    }

    if (event.cron === ARCHIVE_CRON) {
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
    }
  },
};
