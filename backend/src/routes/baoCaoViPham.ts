import { Hono, type Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc } from "../middleware/scopeByKhuVuc";
import { hasModule } from "../lib/moduleAccess";
import { cachedReport, buildReportKey } from "../lib/reportCache";
import { computeViPhamBaoCaoTongQuan, computeViPhamBaoCaoDaChieu, computeViPhamDiemThe, type ViPhamBaoCaoParams } from "../lib/viPhamBaoCao";

// Module rieng "Bao cao vi pham" (tach khoi tab "Bao cao" cua Quan ly khao sat - yeu cau chu he
// thong 2026-09-20, xem lib/viPhamBaoCao.ts cho toan bo logic tinh toan + quy uoc moc thoi gian).
const baoCaoViPham = new Hono<{ Bindings: Env }>();
baoCaoViPham.use("*", verifySessionMiddleware, loadUser, async (c, next) => {
  if (!hasModule(c.get("user"), "bao-cao-vi-pham")) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  await next();
});

function readParams(c: Context<{ Bindings: Env }>): ViPhamBaoCaoParams {
  return {
    thang: c.req.query("thang"),
    khu_vuc: c.req.query("khu_vuc"),
    ky_thuat_vien: c.req.query("ky_thuat_vien"),
    nhom_kh: c.req.query("nhom_kh"),
    nguon_crm: c.req.query("nguon_crm"),
    ket_qua_cap_1: c.req.query("ket_qua_cap_1"),
  };
}

// GET /api/bao-cao-vi-pham/tong-quan?thang=YYYY-MM&... - 6 chi so dem nhanh (yeu cau #1). Phu thuoc
// "vi_pham_giai_trinh" (khac "vi_pham"/"vi_pham_giai_trinh" domain, xem lib/dataVersions.ts) vi 2
// trong 6 chi so doc bang do (SL KTV/GS da giai trinh) - CHUA Tong quan/Da chieu KHONG the dung
// domain list giong nhau du 1 phan lon logic giong het nhau.
baoCaoViPham.get("/tong-quan", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params = readParams(c);
  const key = buildReportKey("bao-cao-vi-pham/tong-quan", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases", "vi_pham", "vi_pham_giai_trinh"], () => computeViPhamBaoCaoTongQuan(c.env.DB, params, scope));
  return c.json(payload);
});

// GET /api/bao-cao-vi-pham/da-chieu?thang=...&nhom=khu_vuc|ky_thuat_vien|ket_qua_cap_1|nhom_kh|nguon_crm
// - bang nhom theo 1 chieu (yeu cau #2). Phu thuoc them domain "settings" vi co cot tong diem the
// (doc settings_loai_vi_pham.diem_the).
baoCaoViPham.get("/da-chieu", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params = { ...readParams(c), nhom: c.req.query("nhom") };
  const key = buildReportKey("bao-cao-vi-pham/da-chieu", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases", "vi_pham", "settings"], () => computeViPhamBaoCaoDaChieu(c.env.DB, params, scope));
  return c.json(payload);
});

// GET /api/bao-cao-vi-pham/diem-the?thang=...&khu_vuc=... - bang xep hang diem the theo KTV (yeu
// cau #3, xem quy uoc moc thoi gian rieng "ngay_chot" o lib/viPhamBaoCao.ts).
baoCaoViPham.get("/diem-the", async (c) => {
  const scope = scopeByKhuVuc(c);
  const params = readParams(c);
  const key = buildReportKey("bao-cao-vi-pham/diem-the", params, scope);
  const payload = await cachedReport(c.env.DB, key, ["cases", "vi_pham", "settings"], () => computeViPhamDiemThe(c.env.DB, params, scope));
  return c.json(payload);
});

export default baoCaoViPham;
