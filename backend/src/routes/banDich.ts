import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { bumpVersions } from "../lib/dataVersions";
import { buildReportKey, cachedReport } from "../lib/reportCache";
import { dbGoc } from "../lib/phamVi";
import { computeAndStoreHash } from "../lib/contentHash";

// /api/ban-dich (2026-10-29, migration 0150, "Đa quốc gia" SRS §12 Q3): ban dich EN / ID cua cac lua chon trong Cai dat
// (ly do cham, loai loi vi pham, phan loai tranh chap...). Du lieu LUU van la tieng Viet - frontend
// (lib/banDichDuLieu.ts) chi dich luc hien thi theo ngon ngu nguoi dung. Them bang lua chon moi: them vao BANG_LUA_CHON.
const banDich = new Hono<{ Bindings: Env }>();
banDich.use("*", verifySessionMiddleware, loadUser);

/** bang -> cot ten (gia tri tieng Viet). settings_loai_vi_pham co them cap nhom_loi / nhom_loi_en / nhom_loi_id. */
export const BANG_LUA_CHON: Record<string, string> = {
  settings_ly_do: "ten_ly_do",
  settings_ly_do_cham: "ten_ly_do",
  settings_loai_vi_pham: "ten_loi",
  settings_phan_loai_tranh_chap: "ten_phan_loai",
  settings_ket_qua_xu_ly_tranh_chap: "ten_ket_qua",
  settings_ly_do_ton_tranh_chap: "ten_ly_do",
  settings_loai_yeu_cau_bo_qua_lap: "loai_yeu_cau",
  settings_loai_yeu_cau_doi_tra: "loai_yeu_cau",
  settings_luu_y_loi_linh_kien_doi_tra: "luu_y_loi_linh_kien",
  settings_loai_de_xuat: "ten_option",
  settings_loai_de_xuat_nhom: "ten_nhom",
};

interface DongDich {
  vi: string | null;
  en: string | null;
  id: string | null;
}

// GET / - { en: {vi: en}, id: {vi: id} } gop moi bang. Cache theo domain "settings" (PUT ben duoi bump).
banDich.get("/", async (c) => {
  const db = c.env.DB;
  const data = await cachedReport(db, buildReportKey("ban-dich-lua-chon", {}, null), ["settings"], async () => {
    const goc = dbGoc(db);
    const cau = Object.entries(BANG_LUA_CHON).map(([bang, cot]) =>
      goc.prepare(`SELECT ${cot} AS vi, ban_dich_en AS en, ban_dich_id AS id FROM ${bang} WHERE ban_dich_en IS NOT NULL OR ban_dich_id IS NOT NULL`),
    );
    cau.push(
      goc.prepare(
        "SELECT DISTINCT nhom_loi AS vi, nhom_loi_en AS en, nhom_loi_id AS id FROM settings_loai_vi_pham WHERE nhom_loi_en IS NOT NULL OR nhom_loi_id IS NOT NULL",
      ),
    );
    const kq = await goc.batch<DongDich>(cau);
    const en: Record<string, string> = {};
    const id: Record<string, string> = {};
    for (const r of kq.flatMap((k) => k.results)) {
      if (!r.vi) continue;
      if (r.en?.trim() && !(r.vi in en)) en[r.vi] = r.en.trim();
      if (r.id?.trim() && !(r.vi in id)) id[r.vi] = r.id.trim();
    }
    return { en, id };
  });
  return c.json(data);
});

// PUT / {bang, id, ban_dich_en?, ban_dich_id?, nhom_loi_en?, nhom_loi_id?} - sua ban dich 1 lua chon (undefined = giu nguyen,
// "" = xoa ban dich -> hien tieng Viet).
banDich.put("/", requireRole("Admin", "TBP DVBH"), async (c) => {
  const body = await c.req.json<{
    bang?: string;
    id?: number;
    ban_dich_en?: string | null;
    ban_dich_id?: string | null;
    nhom_loi_en?: string | null;
    nhom_loi_id?: string | null;
  }>();
  const bang = body.bang ?? "";
  if (!(bang in BANG_LUA_CHON) || !Number.isInteger(body.id)) return c.json({ error: "INVALID" }, 400);
  const set: string[] = [];
  const binds: (string | null)[] = [];
  const cotSua: (keyof typeof body)[] = bang === "settings_loai_vi_pham" ? ["ban_dich_en", "ban_dich_id", "nhom_loi_en", "nhom_loi_id"] : ["ban_dich_en", "ban_dich_id"];
  for (const k of cotSua) {
    const v = body[k];
    if (v === undefined) continue;
    set.push(`${k} = ?`);
    binds.push(typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null);
  }
  if (!set.length) return c.json({ ok: true });
  await c.env.DB.prepare(`UPDATE ${bang} SET ${set.join(", ")} WHERE id = ?`)
    .bind(...binds, body.id as number)
    .run();
  await bumpVersions(c.env.DB, ["settings"]);
  // settings_ly_do co cache trinh duyet theo hash noi dung (content_versions, GET /settings/ly-do/version) - tinh lai.
  if (bang === "settings_ly_do") {
    const { results } = await c.env.DB.prepare("SELECT * FROM settings_ly_do ORDER BY id").all();
    await computeAndStoreHash(c.env.DB, "settings_ly_do", results);
  }
  return c.json({ ok: true });
});

export default banDich;
