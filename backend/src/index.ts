import { Hono } from "hono";
import type { Env } from "./types";
import authRoutes from "./routes/auth";
import casesRoutes from "./routes/cases";
import missingPartsRoutes from "./routes/missingParts";
import surveyRoutes from "./routes/survey";
import viPhamRoutes from "./routes/viPham";
import importRoutes from "./routes/importRoute";
import importGiaiTrinhRoutes from "./routes/importGiaiTrinh";
import importGiaiTrinhLapRoutes from "./routes/importGiaiTrinhLap";
import importKhaoSatRoutes from "./routes/importKhaoSat";
import settingsRoutes from "./routes/settings";
import usersRoutes from "./routes/users";
import dashboardRoutes from "./routes/dashboard";
import revenueRoutes from "./routes/revenue";
import notificationsRoutes from "./routes/notifications";
import greetingRoutes from "./routes/greeting";
import caLapRoutes from "./routes/caLap";
import { refreshCaLapPrecompute } from "./lib/caLapRefresh";

const app = new Hono<{ Bindings: Env }>();

app.route("/api/auth", authRoutes);
app.route("/api/cases", casesRoutes);
app.route("/api/missing-parts", missingPartsRoutes);
app.route("/api/survey", surveyRoutes);
app.route("/api/vi-pham", viPhamRoutes);
app.route("/api/import", importRoutes);
app.route("/api/import/giai-trinh", importGiaiTrinhRoutes);
app.route("/api/import/giai-trinh-lap", importGiaiTrinhLapRoutes);
app.route("/api/import/khao-sat", importKhaoSatRoutes);
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
// Lich chay hang ngay (archive) - giu nguyen. Them 1 lich moi, day hon (cu 20 phut) rieng cho tinh
// san "ca lap" (xem lib/caLapRefresh.ts) - phai khai bao ca 2 trong wrangler*.jsonc "triggers.crons".
const CA_LAP_REFRESH_CRON = "*/20 * * * *";

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    if (event.cron === CA_LAP_REFRESH_CRON) {
      await refreshCaLapPrecompute(env.DB);
      return;
    }

    await env.DB.prepare(
      `UPDATE case_dvbh SET archived_at = datetime('now')
       WHERE thoi_gian_hoan_thanh IS NOT NULL AND archived_at IS NULL
         AND thoi_gian_hoan_thanh < datetime('now', ?)`,
    )
      .bind(ARCHIVE_AFTER)
      .run();
  },
};
