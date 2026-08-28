import { Hono } from "hono";
import type { Env } from "../types";
import { ROLES_XEM_TOAN_BO } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { generateBacklogAgeSnapshot, getBacklogAgeManifest, getBacklogAgeMonthRows } from "../lib/backlogAgeSnapshot";

// Bao cao "Tuoi ton trung binh" - du lieu tong hop TOAN HE THONG (khong cross-tab theo khu_vuc_phu_trach
// cua tung nguoi dung), nen gac quyen bang ROLES_XEM_TOAN_BO (giong revenue.ts) thay vi chi hasModule
// "backlog" - vai tro bi gioi han khu_vuc (Giam sat...) van vao duoc "Quan ly ton" nhung KHONG thay
// tab bao cao nay, tranh lo du lieu ngoai pham vi phu trach.
const backlogAgeReport = new Hono<{ Bindings: Env }>();
backlogAgeReport.use("*", verifySessionMiddleware, loadUser, requireRole(...ROLES_XEM_TOAN_BO));

// GET /api/backlog-age-report/manifest - hash tung thang da co, client so voi cache IndexedDB cuc bo
// (xem hooks/useBacklogAgeChunked.ts) de biet thang nao can goi /data.
backlogAgeReport.get("/manifest", async (c) => {
  const manifest = await getBacklogAgeManifest(c.env.DB);
  return c.json({ manifest });
});

// GET /api/backlog-age-report/data?thang=YYYY-MM - toan bo dong snapshot cua 1 thang, client tu tinh
// trung binh (tong_tuoi/so_ca) va loc/gop theo dimension nguoi dung chon, khong goi lai server.
backlogAgeReport.get("/data", async (c) => {
  const thang = c.req.query("thang") ?? "";
  if (!/^\d{4}-\d{2}$/.test(thang)) return c.json({ error: "INVALID_THANG" }, 400);
  const rows = await getBacklogAgeMonthRows(c.env.DB, thang);
  return c.json({ thang, rows });
});

// POST /api/backlog-age-report/refresh - tinh lai NGAY snapshot cua "hom nay" (Admin/TBP DVBH), dung
// khi can kiem tra/backfill ngay trong ngay thay vi cho cron 08:00 hom sau.
backlogAgeReport.post("/refresh", requireRole("Admin", "TBP DVBH"), async (c) => {
  await generateBacklogAgeSnapshot(c.env.DB);
  return c.json({ ok: true });
});

export default backlogAgeReport;
