import { Hono } from "hono";
import { bumpVersions } from "../lib/dataVersions";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { nowVN } from "../lib/vnTime";
import { RE_MA_QUOC_GIA, docBoMauId, globSangRegex, QUOC_GIA_MAC_DINH, xoaCacheQuocGia } from "../lib/quocGia";
import { damBaoBangQuocGia } from "../lib/quocGiaKichHoat";

// /api/quoc-gia (2026-10-29, migration 0148) - "Đa quốc gia" GĐ1: danh muc quoc gia + mau ID -> quoc gia/nguon.
// Doc: moi user dang nhap (can danh sach nuoc de hien thi); mau ID + sua: Admin. Mau ID chi anh huong ca TAO MOI tu
// lan import sau (lib/importProcessor.ts) - khong tu ap lai cho ca da co.
const quocGia = new Hono<{ Bindings: Env }>();
quocGia.use("*", verifySessionMiddleware, loadUser);
const adminOnly = requireRole("Admin");

interface QuocGiaRow {
  ma: string;
  ten: string;
  thu_tu: number;
  kich_hoat: number;
  telegram_chat_id: string | null;
  moc_ton_giai_trinh: number;
  nguoi_sua: string | null;
  ngay_sua: string | null;
}
interface MauIdRow {
  id: number;
  mau_glob: string;
  ma_quoc_gia: string;
  nguon: string;
  do_uu_tien: number;
  ghi_chu: string | null;
  nguoi_sua: string | null;
  ngay_sua: string | null;
}

// GET / - { quoc_gia, mau_id (rong neu khong phai Admin), canEdit, mac_dinh }
quocGia.get("/", async (c) => {
  const laAdmin = c.get("user").vai_tro === "Admin";
  const [{ results: nuoc }, mau] = await Promise.all([
    c.env.DB.prepare("SELECT ma, ten, thu_tu, kich_hoat, telegram_chat_id, moc_ton_giai_trinh, nguoi_sua, ngay_sua FROM quoc_gia ORDER BY thu_tu, ma").all<QuocGiaRow>(),
    laAdmin
      ? c.env.DB.prepare(
          "SELECT id, mau_glob, ma_quoc_gia, nguon, do_uu_tien, ghi_chu, nguoi_sua, ngay_sua FROM quoc_gia_mau_id ORDER BY do_uu_tien, length(mau_glob) DESC, mau_glob",
        ).all<MauIdRow>()
      : Promise.resolve({ results: [] as MauIdRow[] }),
  ]);
  // Nhom Telegram chi Admin can thay (an voi nguoi khac).
  const dsNuoc = laAdmin ? nuoc : nuoc.map((q) => ({ ...q, telegram_chat_id: null }));
  return c.json({ quoc_gia: dsNuoc, mau_id: mau.results, canEdit: laAdmin, mac_dinh: QUOC_GIA_MAC_DINH });
});

// PUT /nuoc {ma, ten, thu_tu?, kich_hoat?, telegram_chat_id?} - them/sua 1 quoc gia (khong xoa: ca/user da gan ma nay).
// telegram_chat_id: nhom nhan anh 08:00/17:30 cua nuoc (migration 0150) - undefined = giu nguyen, "" = khong gui.
quocGia.put("/nuoc", adminOnly, async (c) => {
  const body = await c.req.json<{ ma?: string; ten?: string; thu_tu?: number; kich_hoat?: boolean; telegram_chat_id?: string | null; moc_ton_giai_trinh?: number }>();
  const ma = body.ma?.trim().toUpperCase() ?? "";
  const ten = body.ten?.trim() ?? "";
  if (!RE_MA_QUOC_GIA.test(ma)) return c.json({ error: "INVALID", message: "Mã quốc gia phải là 2-5 chữ in hoa (vd VN, ID)" }, 400);
  if (!ten) return c.json({ error: "INVALID", message: "Thiếu tên quốc gia" }, 400);
  const chat = body.telegram_chat_id === undefined ? undefined : (body.telegram_chat_id ?? "").trim() || null;
  if (chat && !/^-?\d{5,20}$/.test(chat)) return c.json({ error: "INVALID", message: "Mã nhóm Telegram phải là số (vd -100…)" }, 400);
  await c.env.DB.prepare(
    `INSERT INTO quoc_gia (ma, ten, thu_tu, kich_hoat, telegram_chat_id, nguoi_sua, ngay_sua) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ma) DO UPDATE SET ten = excluded.ten, thu_tu = excluded.thu_tu, kich_hoat = excluded.kich_hoat,
       telegram_chat_id = CASE WHEN ?8 THEN excluded.telegram_chat_id ELSE quoc_gia.telegram_chat_id END,
       nguoi_sua = excluded.nguoi_sua, ngay_sua = excluded.ngay_sua`,
  )
    .bind(ma, ten, Number.isFinite(body.thu_tu) ? Number(body.thu_tu) : 0, body.kich_hoat === false ? 0 : 1, chat ?? null, c.get("user").email, nowVN(), chat === undefined ? 0 : 1)
    .run();
  // "Mốc tồn cần giải trình" (migration 0167): undefined = giu nguyen. Doi moc lam doi NEED_TONG -> bump cache bao cao.
  if (body.moc_ton_giai_trinh !== undefined) {
    const moc = Number(body.moc_ton_giai_trinh);
    if (!Number.isInteger(moc) || moc < 1 || moc > 60) return c.json({ error: "INVALID", message: "Mốc tồn cần giải trình phải là số ngày 1-60" }, 400);
    await c.env.DB.prepare("UPDATE quoc_gia SET moc_ton_giai_trinh = ?, nguoi_sua = ?, ngay_sua = ? WHERE ma = ? AND moc_ton_giai_trinh IS NOT ?")
      .bind(moc, c.get("user").email, nowVN(), ma, moc)
      .run();
    await bumpVersions(c.env.DB, ["settings", "cases", "giai_trinh"]);
  }
  xoaCacheQuocGia();
  // Nuoc dang bat phai co san view/bang theo pham vi (lib/phamVi.ts) truoc khi ai chon xem - tao ngay (chi cai con thieu).
  if (body.kich_hoat !== false) await damBaoBangQuocGia(c.env.DB, [ma]);
  return c.json({ ok: true });
});

// PUT /mau-id {id?, mau_glob, ma_quoc_gia, nguon, do_uu_tien?, ghi_chu?} - them (khong id) / sua (co id) 1 mau.
quocGia.put("/mau-id", adminOnly, async (c) => {
  const body = await c.req.json<{ id?: number; mau_glob?: string; ma_quoc_gia?: string; nguon?: string; do_uu_tien?: number; ghi_chu?: string | null }>();
  const mau = body.mau_glob?.trim() ?? "";
  const ma = body.ma_quoc_gia?.trim().toUpperCase() ?? "";
  const nguon = body.nguon?.trim() ?? "";
  if (!mau || !globSangRegex(mau)) return c.json({ error: "INVALID", message: "Mẫu ID không hợp lệ (dùng * ? [0-9])" }, 400);
  if (!nguon) return c.json({ error: "INVALID", message: "Thiếu tên nguồn" }, 400);
  const nuoc = await c.env.DB.prepare("SELECT 1 AS x FROM quoc_gia WHERE ma = ?").bind(ma).first();
  if (!nuoc) return c.json({ error: "INVALID", message: "Quốc gia chưa có trong danh mục" }, 400);
  const uuTien = Number.isFinite(body.do_uu_tien) ? Number(body.do_uu_tien) : 100;
  const ghiChu = body.ghi_chu?.trim() || null;
  const nguoi = c.get("user").email;
  try {
    if (body.id) {
      await c.env.DB.prepare(
        "UPDATE quoc_gia_mau_id SET mau_glob = ?, ma_quoc_gia = ?, nguon = ?, do_uu_tien = ?, ghi_chu = ?, nguoi_sua = ?, ngay_sua = ? WHERE id = ?",
      )
        .bind(mau, ma, nguon, uuTien, ghiChu, nguoi, nowVN(), body.id)
        .run();
    } else {
      await c.env.DB.prepare(
        "INSERT INTO quoc_gia_mau_id (mau_glob, ma_quoc_gia, nguon, do_uu_tien, ghi_chu, nguoi_sua, ngay_sua) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(mau, ma, nguon, uuTien, ghiChu, nguoi, nowVN())
        .run();
    }
  } catch (e) {
    if (String(e).includes("UNIQUE")) return c.json({ error: "DUPLICATE", message: "Mẫu ID này đã có" }, 409);
    throw e;
  }
  return c.json({ ok: true });
});

// DELETE /mau-id?id=
quocGia.delete("/mau-id", adminOnly, async (c) => {
  const id = Number(c.req.query("id"));
  if (!id) return c.json({ error: "INVALID" }, 400);
  await c.env.DB.prepare("DELETE FROM quoc_gia_mau_id WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});

// GET /thu?id= - thu 1 ID se duoc xep vao nuoc/nguon nao theo bo mau hien tai (dung dung ham cua import).
quocGia.get("/thu", adminOnly, async (c) => {
  const id = c.req.query("id")?.trim() ?? "";
  if (!id) return c.json({ error: "INVALID" }, 400);
  const khop = (await docBoMauId(c.env.DB)).khop(id);
  return c.json({ id, khop, ma_quoc_gia: khop?.ma_quoc_gia ?? QUOC_GIA_MAC_DINH });
});

export default quocGia;
