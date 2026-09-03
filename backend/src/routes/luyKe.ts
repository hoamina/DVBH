import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { hasModule } from "../lib/moduleAccess";
import { csvTemplateResponse } from "../lib/csvTemplate";
import { logImportHistory } from "../lib/backfillImportProcessor";
import { recomputeLuyKeMonth, getLuyKeManifest, getLuyKeChunks, type LuyKeRow } from "../lib/luyKeChunks";

const luyKe = new Hono<{ Bindings: Env }>();

// "Bao cao luy ke" (pivot DVBH toan quoc) - chan boi module "luy-ke" (xem lib/moduleAccess.ts,
// giong het co che cua revenue.ts) thay vi requireRole co dinh, de Admin tuy chinh duoc theo tung
// tai khoan. Rieng 2 route import (upload file) con gac them requireRole("Admin", "TBP DVBH") ben
// duoi - xem duoc bao cao khac voi duoc NHAP du lieu.
luyKe.use("*", verifySessionMiddleware, loadUser, async (c, next) => {
  if (!hasModule(c.get("user"), "luy-ke")) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
  await next();
});

interface RawRow {
  khu_vuc?: string;
  phan_loai?: string;
  dung_han?: string;
  toc_do?: string;
  thang_hoan_thanh?: string | number;
  tren_96h?: string;
  nam_hoan_thanh?: string | number;
  hang?: string;
  doi_tuong?: string;
  nganh?: string;
  nguon_crm?: string;
  kh_vip?: string | number;
  sl?: string | number;
}

const TEMPLATE_CSV =
  "khu_vuc,phan_loai,dung_han,toc_do,thang_hoan_thanh,tren_96h,nam_hoan_thanh,hang,doi_tuong,nganh,nguon_crm,kh_vip,sl\n" +
  "(qldvbh.mb2) Quản lý khu vực MB2,SỰ CỐ,Đúng hạn,1. Dưới 24h,202606,1. Dưới 96h,2026,KAROFI,KTV,Ngành 1 (lọc nước),CRM KRF,0,10\n";

// "KH VIPs": cot RIENG khong bat buoc (thuong la 0/rong, chi vai dong co gia tri nhu "NSKX"/"MT" -
// xem file mau nguoi dung gui 2026-08-28) - CHOT: gia tri 0 (so hoac chuoi "0") tinh la RONG, khong
// phai 1 nhan phan loai that su, dong bo voi cach cac dim khac dung "" = khong co du lieu.
function normalizeKhVip(raw: unknown): string {
  const s = String(raw ?? "").trim();
  return s === "0" ? "" : s;
}

// GET /api/luy-ke/template
luyKe.get("/template", (c) => csvTemplateResponse(c, TEMPLATE_CSV, "mau_import_bao_cao_luy_ke.csv"));

// Chap nhan "202606" (6 so, dung dinh dang cot "Thang hoan thanh" trong file mau CRM) hoac da o
// dang "2026-06" (phong truong hop file duoc chinh sua tay) - tra ve null neu khong khop ca 2.
function parseThang(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{6}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}`;
  return null;
}

function processRows(rows: RawRow[]): { valid: LuyKeRow[]; loi: number; errors: string[] } {
  const errors: string[] = [];
  const valid: LuyKeRow[] = [];

  rows.forEach((row, i) => {
    const khu_vuc = String(row.khu_vuc ?? "").trim();
    const phan_loai = String(row.phan_loai ?? "").trim();
    const dung_han = String(row.dung_han ?? "").trim();
    const toc_do = String(row.toc_do ?? "").trim();
    const thang = parseThang(row.thang_hoan_thanh);
    const tren_96h = String(row.tren_96h ?? "").trim();
    const nam = String(row.nam_hoan_thanh ?? "").trim();
    const hang = String(row.hang ?? "").trim();
    const doi_tuong = String(row.doi_tuong ?? "").trim();
    const nganh = String(row.nganh ?? "").trim();
    const nguon_crm = String(row.nguon_crm ?? "").trim();
    const kh_vip = normalizeKhVip(row.kh_vip);
    // File Excel/CSV do nguoi dung tai len: SheetJS tra ve cell toan chu so dang kieu number - ep
    // String() truoc khi trim (giong ImportUploader.tsx cac luong khac).
    const slRaw = row.sl;
    const sl = typeof slRaw === "number" ? slRaw : Number(String(slRaw ?? "").trim());

    if (!khu_vuc || !phan_loai || !dung_han || !toc_do || !thang || !tren_96h || !hang || !doi_tuong || !nganh || !nguon_crm) {
      errors.push(`Dòng ${i + 1}: thiếu dữ liệu bắt buộc, hoặc "thang_hoan_thanh" sai định dạng (cần YYYYMM, vd 202606)`);
      return;
    }
    if (!Number.isFinite(sl) || sl < 0) {
      errors.push(`Dòng ${i + 1}: "sl" không hợp lệ`);
      return;
    }
    valid.push({ khu_vuc, phan_loai, dung_han, toc_do, thang, tren_96h, nam, hang, doi_tuong, nganh, nguon_crm, kh_vip, sl });
  });

  return { valid, loi: errors.length, errors };
}

function summarize(valid: LuyKeRow[], loi: number, errors: string[]) {
  const byThang = new Map<string, number>();
  for (const r of valid) byThang.set(r.thang, (byThang.get(r.thang) ?? 0) + 1);
  const thangList = [...byThang.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([thang, soDong]) => ({ thang, soDong }));
  return { thanhCong: valid.length, loi, errors, thangList };
}

// POST /api/luy-ke/import/preview - khong ghi gi ca, chi validate + tom tat so dong hop le theo thang.
luyKe.post("/import/preview", requireRole("Admin", "TBP DVBH"), async (c) => {
  const body = await c.req.json<{ rows: RawRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const { valid, loi, errors } = processRows(body.rows);
  return c.json(summarize(valid, loi, errors));
});

// POST /api/luy-ke/import/commit - diem goi DUY NHAT toi recomputeLuyKeMonth() (xem lib/luyKeChunks.ts).
// Nhom theo thang, MOI thang co mat trong file se bi THAY THE TOAN BO (khong merge voi du lieu cu).
luyKe.post("/import/commit", requireRole("Admin", "TBP DVBH"), async (c) => {
  const body = await c.req.json<{ rows: RawRow[]; filename?: string }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const { valid, loi, errors } = processRows(body.rows);

  const byThang = new Map<string, LuyKeRow[]>();
  for (const r of valid) {
    const list = byThang.get(r.thang) ?? [];
    list.push(r);
    byThang.set(r.thang, list);
  }
  for (const [thang, rowsForMonth] of byThang) {
    await recomputeLuyKeMonth(c.env, thang, rowsForMonth);
  }

  const user = c.get("user");
  c.executionCtx.waitUntil(
    logImportHistory(c.env.DB, {
      loai: "luy_ke",
      tenFile: body.filename || "(không rõ tên file)",
      nguoiImport: user.email,
      thanhCong: valid.length,
      loi,
      bgError: errors.length > 0 ? errors.join("\n") : null,
    }),
  );

  return c.json(summarize(valid, loi, errors));
});

// GET /api/luy-ke/manifest - hash + so dong tung thang da co, khong dung R2. Client so hash nay voi
// cache IndexedDB cuc bo de biet thang nao can goi POST /chunks (xem hooks/useLuyKeChunked.ts).
luyKe.get("/manifest", async (c) => {
  const manifest = await getLuyKeManifest(c.env.DB);
  return c.json({ manifest });
});

// POST /api/luy-ke/chunks {thang: string[]} - tai noi dung chunk R2 cho tung thang trong danh sach.
// Khong loc/scope gi them (bao cao toan quoc, da chan o cap module) - moi tinh toan/loc theo lua
// chon cua nguoi dung lam hoan toan tren client sau khi tai xong.
luyKe.post("/chunks", async (c) => {
  const body = await c.req.json<{ thang?: unknown }>().catch(() => ({ thang: [] }));
  const requested = Array.isArray(body.thang)
    ? [...new Set(body.thang.filter((t): t is string => typeof t === "string" && /^\d{4}-\d{2}$/.test(t)))]
    : [];
  if (requested.length === 0) return c.json({ chunks: {} });

  const chunks = await getLuyKeChunks(c.env, requested);
  return c.json({ chunks });
});

export default luyKe;
