import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { hasModule } from "../lib/moduleAccess";
import { cachedReport } from "../lib/reportCache";
import { bumpVersions } from "../lib/dataVersions";
import { getTonKhoLkMeta, syncTonKhoLk, callLinhKienPartner } from "../lib/tonKhoLk";
import { nowVN } from "../lib/vnTime";

// /api/ton-kho-lk - ton kho linh kien keo tu linh-kien-app (2026-10-08, xem lib/tonKhoLk.ts). Dung trong module
// "Ca thiếu linh kiện" (cot "Tồn kho MB/MN" tab Linh kien thieu + tab "Cấu hình kho"). Ton kho la so lieu toan
// cong ty, khong chia theo khu_vuc phu trach -> khong ap scopeByKhuVuc, chi gate theo quyen vao module.
const tonKhoLk = new Hono<{ Bindings: Env }>();
tonKhoLk.use("*", verifySessionMiddleware, loadUser, async (c, next) => {
  if (!hasModule(c.get("user"), "missing-parts")) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  await next();
});

// Sua cau hinh kho / ep keo lai du phien ban khong doi.
const canCauHinh = (vaiTro: string | null) => vaiTro === "Admin" || vaiTro === "TBP DVBH";

// GET /meta - trang thai dong bo (phien ban dang luu, luc keo, lan hoi gan nhat, loi neu co).
tonKhoLk.get("/meta", async (c) => {
  const meta = await getTonKhoLkMeta(c.env.DB);
  return c.json({ meta, canCauHinh: canCauHinh(c.get("user").vai_tro) });
});

// POST /sync?force=1 - nut "Đồng bộ ngay". Khong force: chi keo khi phien ban ben linh-kien-app khac ban dang luu
// (re, ai vao module cung bam duoc). force: keo lai toan bo du cung phien ban - chi Admin/TBP DVBH.
tonKhoLk.post("/sync", async (c) => {
  const user = c.get("user");
  const force = c.req.query("force") === "1";
  if (force && !canCauHinh(user.vai_tro)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const result = await syncTonKhoLk(c.env, { force, actor: user.email });
  if (!result.ok) return c.json({ error: "SYNC_FAILED", message: result.error }, 502);
  return c.json(result);
});

// GET /tong-hop - ton theo ma hang: ton_mb/ton_mn (cong cac kho khai bao trong ton_kho_nhom_kho) + ton_ktv (tong
// moi kho KTV). Quet ~8.700 dong 1 lan moi phien ban/cau hinh moi (cachedReport domain "ton_kho").
tonKhoLk.get("/tong-hop", async (c) => {
  const data = await cachedReport(c.env.DB, "ton-kho-lk/tong-hop", ["ton_kho"], async () => {
    const { results } = await c.env.DB.prepare(
      `SELECT t.ma_hang,
              SUM(CASE WHEN n.nhom = 'MB' THEN t.cuoi_ky ELSE 0 END) AS ton_mb,
              SUM(CASE WHEN n.nhom = 'MN' THEN t.cuoi_ky ELSE 0 END) AS ton_mn,
              SUM(CASE WHEN t.nguon = 'ktv' THEN t.cuoi_ky ELSE 0 END) AS ton_ktv
       FROM ton_kho_lk t LEFT JOIN ton_kho_nhom_kho n ON n.ma_kho = t.ma_kho
       GROUP BY t.ma_hang`,
    ).all<{ ma_hang: string; ton_mb: number; ton_mn: number; ton_ktv: number }>();
    return { rows: results };
  });
  return c.json(data);
});

// GET /kho - danh sach moi ma kho dang co trong du lieu (kem nguon, so ma hang, tong SL) + nhom MB/MN da khai bao;
// kho da khai bao nhung khong con trong du lieu van tra ve (so_ma = 0) de sua/xoa duoc.
tonKhoLk.get("/kho", async (c) => {
  const data = await cachedReport(c.env.DB, "ton-kho-lk/kho", ["ton_kho"], async () => {
    const { results } = await c.env.DB.prepare(
      `SELECT k.ma_kho, k.ten_kho, k.nguon, k.co_ktv, k.so_ma, k.tong_sl, n.nhom, n.nguoi_cap_nhat, n.ngay_cap_nhat
       FROM (
         SELECT ma_kho, MAX(ten_kho) AS ten_kho, MAX(nguon) AS nguon, MAX(ma_ktv IS NOT NULL) AS co_ktv,
                COUNT(*) AS so_ma, SUM(cuoi_ky) AS tong_sl
         FROM ton_kho_lk GROUP BY ma_kho
       ) k LEFT JOIN ton_kho_nhom_kho n ON n.ma_kho = k.ma_kho
       UNION ALL
       SELECT n.ma_kho, NULL, NULL, 0, 0, 0, n.nhom, n.nguoi_cap_nhat, n.ngay_cap_nhat
       FROM ton_kho_nhom_kho n WHERE NOT EXISTS (SELECT 1 FROM ton_kho_lk t WHERE t.ma_kho = n.ma_kho)`,
    ).all();
    return { rows: results };
  });
  return c.json(data);
});

// PUT /kho/:ma { nhom: "MB" | "MN" | null } - khai bao kho cong vao Ton kho MB/MN (null = khong tinh).
tonKhoLk.put("/kho/:ma", async (c) => {
  const user = c.get("user");
  if (!canCauHinh(user.vai_tro)) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  const maKho = c.req.param("ma");
  const body = await c.req.json<{ nhom?: string | null }>().catch(() => ({}) as { nhom?: string | null });
  const nhom = body.nhom ?? null;
  if (nhom !== null && nhom !== "MB" && nhom !== "MN") return c.json({ error: "INVALID_NHOM" }, 400);
  if (nhom === null) {
    await c.env.DB.prepare("DELETE FROM ton_kho_nhom_kho WHERE ma_kho = ?").bind(maKho).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO ton_kho_nhom_kho (ma_kho, nhom, nguoi_cap_nhat, ngay_cap_nhat) VALUES (?, ?, ?, ?)
       ON CONFLICT(ma_kho) DO UPDATE SET nhom = excluded.nhom, nguoi_cap_nhat = excluded.nguoi_cap_nhat, ngay_cap_nhat = excluded.ngay_cap_nhat`,
    )
      .bind(maKho, nhom, user.email, nowVN())
      .run();
  }
  await bumpVersions(c.env.DB, ["ton_kho"]);
  return c.json({ ok: true });
});

// GET /ma/:ma - ton cua 1 ma hang o TUNG kho (kho cong ty + kho KTV) kem nhom MB/MN - "Ho so linh kien" (GD2).
// idx_ton_kho_lk_ma_hang -> chi doc dung so dong cua ma do.
tonKhoLk.get("/ma/:ma", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.nguon, t.ma_kho, t.ten_kho, t.ma_ktv, t.ten_ktv, t.khu_vuc_ma, t.ten_hang, t.dvt, t.cuoi_ky, n.nhom
     FROM ton_kho_lk t LEFT JOIN ton_kho_nhom_kho n ON n.ma_kho = t.ma_kho
     WHERE t.ma_hang = ? ORDER BY t.cuoi_ky DESC`,
  )
    .bind(c.req.param("ma"))
    .all();
  return c.json({ rows: results });
});

// GET /ma/:ma/lich-su - don dat hang gan nhat + ticket thieu hang cua 1 ma ben linh-kien-app (goi THEO YEU CAU luc mo
// Ho so linh kien, khong luu D1 - cung chot voi lib/linhKienTimeline.ts). Loi -> 502 de UI hien "khong tai duoc".
tonKhoLk.get("/ma/:ma/lich-su", async (c) => {
  try {
    const data = await callLinhKienPartner(c.env, `/v1/linh-kien/lich-su?ma=${encodeURIComponent(c.req.param("ma"))}&limit=50`);
    return c.json(data);
  } catch (err) {
    return c.json({ error: "LINHKIEN_APP_ERROR", message: err instanceof Error ? err.message : String(err) }, 502);
  }
});

export default tonKhoLk;
