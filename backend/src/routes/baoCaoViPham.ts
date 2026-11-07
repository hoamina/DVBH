import { Hono, type Context } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc } from "../middleware/scopeByKhuVuc";
import { hasModule } from "../lib/moduleAccess";
import { cachedReport, buildReportKey, chayGomDoc } from "../lib/reportCache";
import { computeViPhamBaoCaoTongQuan, computeViPhamBaoCaoDaChieu, computeViPhamDiemThe, computeViPhamDanhSach, type ViPhamBaoCaoParams } from "../lib/viPhamBaoCao";

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
async function docTongQuan(c: Context<{ Bindings: Env }>) {
  const scope = scopeByKhuVuc(c);
  const params = readParams(c);
  const key = buildReportKey("bao-cao-vi-pham/tong-quan", params, scope);
  return cachedReport(c.env.DB, key, ["cases", "vi_pham", "vi_pham_giai_trinh"], () => computeViPhamBaoCaoTongQuan(c.env.DB, params, scope));
}

// GET /api/bao-cao-vi-pham/da-chieu?thang=...&nhom=khu_vuc|ky_thuat_vien|ket_qua_cap_1|nhom_kh|nguon_crm
// - bang nhom theo 1 chieu (yeu cau #2). Phu thuoc them domain "settings" vi co cot tong diem the
// (doc settings_loai_vi_pham.diem_the). Them domain "vi_pham_giai_trinh" 2026-09-28 (them 3 cot
// KTV/GS/cho giai trinh + ty le giai trinh, doc bang do) - bump key sang "-v2" vi shape response
// doi (them field moi).
async function docDaChieu(c: Context<{ Bindings: Env }>) {
  const scope = scopeByKhuVuc(c);
  const params = { ...readParams(c), nhom: c.req.query("nhom") };
  // "-v3" (2026-10-24): them so ca dong trong thang + ty le chot loi.
  const key = buildReportKey("bao-cao-vi-pham/da-chieu-v3", params, scope);
  return cachedReport(c.env.DB, key, ["cases", "vi_pham", "vi_pham_giai_trinh", "settings"], () => computeViPhamBaoCaoDaChieu(c.env.DB, params, scope));
}

// GET /api/bao-cao-vi-pham/diem-the?thang=...&khu_vuc=... - bang xep hang diem the theo KTV (yeu
// cau #3, xem quy uoc moc thoi gian rieng "ngay_chot" o lib/viPhamBaoCao.ts).
async function docDiemThe(c: Context<{ Bindings: Env }>) {
  const scope = scopeByKhuVuc(c);
  const params = readParams(c);
  const key = buildReportKey("bao-cao-vi-pham/diem-the", params, scope);
  return cachedReport(c.env.DB, key, ["cases", "vi_pham", "settings"], () => computeViPhamDiemThe(c.env.DB, params, scope));
}

// GET /api/bao-cao-vi-pham/danh-sach?thang=...&trang_thai=...&export=true - tab "Tat ca vi pham",
// danh sach tung dong de tai Excel (yeu cau them 2026-09-22). "trang_thai" KHONG bat buoc phai la
// "co loi" nhu 3 bao cao tren - xem TRANG_THAI_CLAUSES trong lib/viPhamBaoCao.ts.
async function docDanhSach(c: Context<{ Bindings: Env }>) {
  const scope = scopeByKhuVuc(c);
  const params = { ...readParams(c), trang_thai: c.req.query("trang_thai"), export: c.req.query("export") };
  const key = buildReportKey("bao-cao-vi-pham/danh-sach", params, scope);
  return cachedReport(c.env.DB, key, ["cases", "vi_pham", "vi_pham_giai_trinh", "settings"], () => computeViPhamDanhSach(c.env.DB, params, scope));
}

// Tach than 4 route thanh ham (2026-11-07) de endpoint gop /man dung chung - route le giu nguyen.
baoCaoViPham.get("/tong-quan", async (c) => c.json(await docTongQuan(c)));
baoCaoViPham.get("/da-chieu", async (c) => c.json(await docDaChieu(c)));
baoCaoViPham.get("/diem-the", async (c) => c.json(await docDiemThe(c)));
baoCaoViPham.get("/danh-sach", async (c) => c.json(await docDanhSach(c)));

// GET /api/bao-cao-vi-pham/man?<bo loc>&tab=da-chieu|diem-the|danh-sach&nhom=&trang_thai= (2026-11-07) - mo man / doi bo loc KEO 1 LAN:
// Tong quan + du lieu dung tab dang mo trong 1 request, doc cache gom 1 db.batch (chayGomDoc). Tung phan GIONG HET route le (cung
// ham, cung khoa cache). Chuyen sang tab khac sau do van goi route le cua tab do (Tong quan da co san o client).
baoCaoViPham.get("/man", async (c) =>
  chayGomDoc(async () => {
    const tab = c.req.query("tab");
    const [tongQuan, daChieu, diemThe, danhSach] = await Promise.all([
      docTongQuan(c),
      tab === "da-chieu" ? docDaChieu(c) : null,
      tab === "diem-the" ? docDiemThe(c) : null,
      tab === "danh-sach" ? docDanhSach(c) : null,
    ]);
    return c.json({ tongQuan, daChieu, diemThe, danhSach });
  }),
);

export default baoCaoViPham;
