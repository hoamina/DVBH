import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { bumpVersions } from "../lib/dataVersions";
import { nowVN } from "../lib/vnTime";

// Vi pham import KHONG gan ID case (migration 0115) - chi 1 endpoint: QC chot/bo cap 2. Khong co
// buoc "giai trinh qua app ngoai" (khac vi_pham thuong, xem chu thich dau routes/importViPham.ts) -
// GS/QC xem truc tiep trong tab "Tat ca vi pham" (Bao cao vi pham) roi chot/bo tai day.
const viPhamKtv = new Hono<{ Bindings: Env }>();
viPhamKtv.use("*", verifySessionMiddleware, loadUser);

// PATCH /api/vi-pham-ktv/:id/cap2 - mirror PATCH /api/vi-pham/:id/cap2, bo phan doi ket_qua_cap_1 +
// push sang app ngoai (khong ap dung cho nhanh nay).
viPhamKtv.patch("/:id/cap2", requireRole("QC", "Admin"), async (c) => {
  const id = c.req.param("id")!;
  const body = await c.req.json<{ chot: boolean }>();
  if (typeof body.chot !== "boolean") return c.json({ error: "INVALID_BODY" }, 400);

  const row = await c.env.DB.prepare("SELECT id, ket_qua_cap_1 FROM vi_pham_ktv WHERE id = ?").bind(id).first<{ id: string; ket_qua_cap_1: string | null }>();
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  if (row.ket_qua_cap_1 === null) return c.json({ error: "CAP1_CHUA_CO" }, 400);

  const user = c.get("user");
  const ngayChot = nowVN();
  await c.env.DB.prepare("UPDATE vi_pham_ktv SET chot_bo_cap_2 = ?, nguoi_chot = ?, ngay_chot = ? WHERE id = ?")
    .bind(body.chot ? 1 : 0, user.email, ngayChot, id)
    .run();

  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["vi_pham"]));
  return c.json({ ok: true });
});

export default viPhamKtv;
