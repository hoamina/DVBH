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
