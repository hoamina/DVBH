import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { cachedReport } from "../lib/reportCache";
import { nowVN } from "../lib/vnTime";

// /api/dia-gioi (2026-10-10) - "Dia gioi cu / moi" dung chung moi bao cao. Server CHI tra du lieu THO (khong chuan hoa
// ten): bang quy doi tinh cu -> tinh moi (migration 0130) + danh sach to hop dia gioi co trong case_dvbh. Frontend
// (lib/diaGioi.ts) chuan hoa ten, gom nhom theo che do cu/moi va dung bo loc "dg_loc" (xem filterParams.ts diaGioiLoc).
const diaGioi = new Hono<{ Bindings: Env }>();
diaGioi.use("*", verifySessionMiddleware, loadUser);

// GET /quy-doi - bang quy doi (63 dong mac dinh), moi user dang nhap doc duoc (can de quy doi o client).
diaGioi.get("/quy-doi", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT tinh_cu, tinh_moi, nguoi_sua, ngay_sua FROM tinh_quy_doi ORDER BY tinh_moi, tinh_cu",
  ).all<{ tinh_cu: string; tinh_moi: string; nguoi_sua: string | null; ngay_sua: string | null }>();
  const vaiTro = c.get("user").vai_tro;
  return c.json({ rows: results, canEdit: vaiTro === "Admin" || vaiTro === "TBP DVBH" });
});

// PUT /quy-doi {tinh_cu, tinh_moi} - them/sua 1 dong (tinh_cu co the la ten bien the bat ky, vd "Ha Tay").
diaGioi.put("/quy-doi", requireRole("Admin", "TBP DVBH"), async (c) => {
  const body = await c.req.json<{ tinh_cu?: string; tinh_moi?: string }>();
  const tinhCu = body.tinh_cu?.trim().replace(/\s+/g, " ");
  const tinhMoi = body.tinh_moi?.trim().replace(/\s+/g, " ");
  if (!tinhCu || !tinhMoi) return c.json({ error: "INVALID", message: "Thiếu tỉnh cũ hoặc tỉnh mới" }, 400);
  await c.env.DB.prepare(
    `INSERT INTO tinh_quy_doi (tinh_cu, tinh_moi, nguoi_sua, ngay_sua) VALUES (?, ?, ?, ?)
     ON CONFLICT(tinh_cu) DO UPDATE SET tinh_moi = excluded.tinh_moi, nguoi_sua = excluded.nguoi_sua, ngay_sua = excluded.ngay_sua`,
  )
    .bind(tinhCu, tinhMoi, c.get("user").email, nowVN())
    .run();
  return c.json({ ok: true });
});

// DELETE /quy-doi?tinh_cu=
diaGioi.delete("/quy-doi", requireRole("Admin", "TBP DVBH"), async (c) => {
  const tinhCu = c.req.query("tinh_cu");
  if (!tinhCu) return c.json({ error: "INVALID" }, 400);
  await c.env.DB.prepare("DELETE FROM tinh_quy_doi WHERE tinh_cu = ?").bind(tinhCu).run();
  return c.json({ ok: true });
});

// GET /to-hop - moi to hop (tinh, quan_huyen, tinh_moi, xa_moi) DISTINCT trong case_dvbh (~3.200 to hop, 2026-10-10),
// dang mang tuple cho gon. 1 lan quet case_dvbh / lan import (domain "cases") / ngay - KHONG chia theo pham vi khu_vuc
// (ten dia danh khong nhay cam, chia scope se nhan so lan quet theo so pham vi). Client dung de dung danh sach chon
// tinh/huyen/xa theo che do cu/moi va de khai trien 1 lua chon da chuan hoa ve cac gia tri tho gui len "dg_loc".
diaGioi.get("/to-hop", async (c) => {
  const data = await cachedReport(c.env.DB, "dia-gioi/to-hop", ["cases"], async () => {
    const rows = await c.env.DB.prepare(
      "SELECT DISTINCT tinh, quan_huyen, tinh_moi, xa_moi FROM case_dvbh",
    ).raw<[string | null, string | null, string | null, string | null]>();
    return { rows };
  });
  return c.json(data);
});

export default diaGioi;
