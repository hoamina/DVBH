import { Hono } from "hono";
import type { Env } from "../types";
import { NAP_GAS_DANH_GIA_KEYS, NAP_GAS_PHI_DICH_VU_KEYS } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { khuVucAdHocClause, REPORT_DIMS, dimAdHocClause } from "../lib/filterParams";
import { bumpVersions } from "../lib/dataVersions";
import { cachedReport, buildReportKey } from "../lib/reportCache";
import { ageExpr } from "../lib/ageCalc";

// So ngay toi da ke tu thoi_gian_hoan_thanh de con duoc chot/chot lai danh gia nap gas thu cong (xem
// PATCH /:id/danh-gia ben duoi) - CHOT 2026-07-30 cung luc bo dieu kien "nghi_ngo_nap_gas=1" cho
// thao tac nay, tranh sua danh gia cho ca qua cu vo thoi han.
const NAP_GAS_DANH_GIA_LOCK_DAYS = 45;

const napGas = new Hono<{ Bindings: Env }>();
napGas.use("*", verifySessionMiddleware, loadUser);

// "Nghi ngo nap gas" chi duoc CRM dien khi DONG ca voi trang thai "Hoan thanh XLSC" - xac nhan qua
// du lieu that tren production (2026-07-24): 229/229 ca co co nay deu co tien_do_hoan_thanh =
// 'Hoan thanh XLSC', KHONG ca nao dang ton. Khac tranh-chap (van con nguon giai_trinh cho ca dang
// ton), module nay vi vay KHONG co khai niem "dang ton": quan ly hoan toan theo khu vuc + thang
// dong, giong Ca lap (xem frontend/src/modules/CaLapModule.tsx, backend/src/routes/caLap.ts) -
// dung chung idiom voi kpiEligibleClause()/caLapEligible.ts (cung check tien_do_hoan_thanh =
// 'Hoàn thành XLSC').
const NAP_GAS_ELIGIBLE = "c.nghi_ngo_nap_gas = 1 AND c.tien_do_hoan_thanh = 'Hoàn thành XLSC' AND c.huy_bo_at IS NULL";

// "Da danh gia" = co dong trong nap_gas_danh_gia (bang log rieng, xem migration 0025) - THAY THE
// cach cu dua vao bang giai_trinh chung (von thiet ke cho "giai trinh ca ton", khac muc dich).
const JOIN_DANH_GIA = "LEFT JOIN nap_gas_danh_gia ndg ON ndg.case_id = c.id";
const SELECT_COLS = `c.*, ndg.danh_gia_nap_gas, ndg.phi_dich_vu, ndg.nguoi_chot, ndg.ngay_chot,
  CASE WHEN ndg.case_id IS NOT NULL THEN 1 ELSE 0 END as da_danh_gia`;

// "trang_thai" query param - loc them theo da/chua danh gia, dung cho nut drill-down "Chua danh
// gia" o tab Tong quan (StatCard/bang bao cao) chuyen thang sang danh sach chi tiet da loc san.
function trangThaiClause(trangThai: string | undefined): string {
  if (trangThai === "da-danh-gia") return " AND ndg.case_id IS NOT NULL";
  if (trangThai === "chua-danh-gia") return " AND ndg.case_id IS NULL";
  return "";
}

// KHONG them gio "00:00:00" vao bound - xem giai thich chi tiet o monthBounds() trong cases.ts
// (mot so ca co thoi_gian_hoan_thanh chi la ngay thuan, so sanh chuoi voi bound co gio se sai).
function monthBounds(thang: string): { start: string; end: string } {
  const m = thang.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const [y, mo] = m ? [Number(m[1]), Number(m[2])] : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const start = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-01`;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const nextY = mo === 12 ? y + 1 : y;
  const end = `${String(nextY).padStart(4, "0")}-${String(nextMo).padStart(2, "0")}-01`;
  return { start, end };
}

// GET /api/nap-gas?khu_vuc=&thang=&dim=&dim_value=&trang_thai=&page=&pageSize= - danh sach ca nghi
// ngo nap gas (xem NAP_GAS_ELIGIBLE) hoan thanh trong 1 thang. "trang_thai=da-danh-gia|chua-danh-gia"
// loc them theo trang thai danh gia. Tra "chuaDanhGia" (so ca CHUA danh gia trong PHAM VI DANG LOC,
// ke ca sau khi ap trang_thai) cho StatCard cua tab "Danh sach chi tiet".
napGas.get("/", async (c) => {
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const thang = c.req.query("thang") || new Date().toISOString().slice(0, 7);
  const { start, end } = monthBounds(thang);
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const dimClause = dimAdHocClause(`c.${REPORT_DIMS[c.req.query("dim") ?? ""] ?? "khu_vuc"}`, c.req.query("dim"), c.req.query("dim_value"));
  const trangThai = trangThaiClause(c.req.query("trang_thai"));

  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  const query = `
    SELECT ${SELECT_COLS}
    FROM case_dvbh c
    ${JOIN_DANH_GIA}
    WHERE ${NAP_GAS_ELIGIBLE} AND c.thoi_gian_hoan_thanh >= ? AND c.thoi_gian_hoan_thanh < ?${scopeClause.sql}${khuVucClause.sql}${dimClause.sql}${trangThai}
  `;
  const binds = [start, end, ...scopeClause.binds, ...khuVucClause.binds, ...dimClause.binds];

  const countRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM (${query})`)
    .bind(...binds)
    .first<{ total: number }>();
  const chuaDanhGiaRow = await c.env.DB.prepare(`SELECT COUNT(*) as total FROM (${query}) WHERE da_danh_gia = 0`)
    .bind(...binds)
    .first<{ total: number }>();
  const { results } = await c.env.DB.prepare(`${query} ORDER BY c.thoi_gian_hoan_thanh DESC LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, offset)
    .all();

  return c.json({ rows: results, page, pageSize, total: countRow?.total ?? 0, chuaDanhGia: chuaDanhGiaRow?.total ?? 0, thang });
});

// PATCH /api/nap-gas/:id/danh-gia - chot (hoac chot lai, ghi de) danh gia nap gas cho 1 ca. UPSERT
// theo case_id (PRIMARY KEY cua nap_gas_danh_gia, xem migration 0025) - moi ca CHI co 1 dong, chot
// lai se ghi de danh_gia_nap_gas/phi_dich_vu VA cap nhat nguoi_chot/ngay_chot theo LAN CHOT GAN
// NHAT (khong giu lich su nhieu lan chot, khac giai_trinh append-only). Dung PATCH (khong phai PUT)
// de khop dung idiom "chot/toggle" hien co cua repo (vd vi-pham/:id/cap2) - api/client.ts (FE)
// khong co helper "put".
napGas.patch(
  "/:id/danh-gia",
  requireRole("Giam sat", "TBP DVBH", "Admin"),
  async (c) => {
    const id = c.req.param("id");
    if (!id) return c.json({ error: "INVALID_ID" }, 400);

    // CHOT 2026-07-30: bo dieu kien nghi_ngo_nap_gas=1 (NAP_GAS_ELIGIBLE, danh cho danh sach/bao cao
    // "nghi ngo nap gas" chinh thuc) - Giam sat khu vuc duoc chu dong danh gia BAT KY ca da "Hoan
    // thanh XLSC" nao. Van gioi han: ca phai da Hoan thanh XLSC, chua bi huy, VA chua qua
    // NAP_GAS_DANH_GIA_LOCK_DAYS ngay ke tu thoi_gian_hoan_thanh (khoa chot ca qua cu).
    const caseRow = await c.env.DB.prepare(
      `SELECT id, khu_vuc, ${ageExpr("c.thoi_gian_hoan_thanh")} as tuoi_hoan_thanh
       FROM case_dvbh c
       WHERE c.id = ? AND c.tien_do_hoan_thanh = 'Hoàn thành XLSC' AND c.huy_bo_at IS NULL`,
    )
      .bind(id)
      .first<{ id: string; khu_vuc: string | null; tuoi_hoan_thanh: number }>();
    if (!caseRow) return c.json({ error: "NOT_FOUND_OR_NOT_ELIGIBLE" }, 404);
    if (caseRow.tuoi_hoan_thanh > NAP_GAS_DANH_GIA_LOCK_DAYS) return c.json({ error: "NAP_GAS_DANH_GIA_LOCKED" }, 400);

    const scope = scopeByKhuVuc(c);
    if (scope !== null && !scope.includes(String(caseRow.khu_vuc))) {
      return c.json({ error: "FORBIDDEN_KHU_VUC" }, 403);
    }

    const body = await c.req.json<{ danh_gia_nap_gas?: string; phi_dich_vu?: string }>();
    if (!body.danh_gia_nap_gas || !(NAP_GAS_DANH_GIA_KEYS as readonly string[]).includes(body.danh_gia_nap_gas)) {
      return c.json({ error: "INVALID_DANH_GIA_NAP_GAS" }, 400);
    }
    if (!body.phi_dich_vu || !(NAP_GAS_PHI_DICH_VU_KEYS as readonly string[]).includes(body.phi_dich_vu)) {
      return c.json({ error: "INVALID_PHI_DICH_VU" }, 400);
    }

    const user = c.get("user");
    await c.env.DB.prepare(
      `INSERT INTO nap_gas_danh_gia (case_id, danh_gia_nap_gas, phi_dich_vu, nguoi_chot, ngay_chot)
       VALUES (?, ?, ?, ?, datetime('now', '+7 hours'))
       ON CONFLICT(case_id) DO UPDATE SET danh_gia_nap_gas = excluded.danh_gia_nap_gas, phi_dich_vu = excluded.phi_dich_vu,
         nguoi_chot = excluded.nguoi_chot, ngay_chot = datetime('now', '+7 hours')`,
    )
      .bind(id, body.danh_gia_nap_gas, body.phi_dich_vu, user.email)
      .run();

    c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["nap_gas_danh_gia"]));

    return c.json({ ok: true });
  },
);

export interface NapGasByKhuVucParams {
  dim?: string;
  khu_vuc?: string;
  thang?: string;
  [key: string]: string | undefined;
}

/** Tach tu napGas.get("/by-khu-vuc") - xem chu thich route ben duoi. "dim" da qua whitelist
 * REPORT_DIMS o route (tra 400 NGOAI cache) truoc khi toi day. Tra them 6 cot dem theo tung phan
 * loai "danh_gia_nap_gas" (ma noi bo khong dau, xem NAP_GAS_DANH_GIA_KEYS trong backend/src/types.ts)
 * de FE hien "liet ke cac phan loai danh gia nap gas theo tung cot" trong bang bao cao. */
export async function computeNapGasByKhuVuc(db: D1Database, params: NapGasByKhuVucParams, scope: string[] | null) {
  const dimColRaw = REPORT_DIMS[params.dim ?? "khu_vuc"] ?? "khu_vuc";
  const dimCol = `c.${dimColRaw}`;
  const thang = params.thang || new Date().toISOString().slice(0, 7);
  const { start, end } = monthBounds(thang);

  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", params.khu_vuc);

  const { results } = await db
    .prepare(
      `SELECT ${dimCol} as nhom,
         COUNT(*) as tong,
         SUM(CASE WHEN ndg.case_id IS NOT NULL THEN 1 ELSE 0 END) as da_danh_gia,
         SUM(CASE WHEN ndg.case_id IS NULL THEN 1 ELSE 0 END) as chua_danh_gia,
         SUM(CASE WHEN ndg.danh_gia_nap_gas = 'Tu nap gas' THEN 1 ELSE 0 END) as tu_nap_gas,
         SUM(CASE WHEN ndg.danh_gia_nap_gas = 'Khong nap gas' THEN 1 ELSE 0 END) as khong_nap_gas,
         SUM(CASE WHEN ndg.danh_gia_nap_gas = 'Gui ve Hang nap gas' THEN 1 ELSE 0 END) as gui_ve_hang_nap_gas,
         SUM(CASE WHEN ndg.danh_gia_nap_gas = 'Tu nap gas thay Block' THEN 1 ELSE 0 END) as tu_nap_gas_thay_block,
         SUM(CASE WHEN ndg.danh_gia_nap_gas = 'Sua chua khac' THEN 1 ELSE 0 END) as sua_chua_khac,
         SUM(CASE WHEN ndg.danh_gia_nap_gas = 'Kiem tra' THEN 1 ELSE 0 END) as kiem_tra
       FROM case_dvbh c
       ${JOIN_DANH_GIA}
       WHERE ${NAP_GAS_ELIGIBLE} AND c.thoi_gian_hoan_thanh >= ? AND c.thoi_gian_hoan_thanh < ? AND ${dimCol} IS NOT NULL${scopeClause.sql}${khuVucClause.sql}
       GROUP BY ${dimCol}
       ORDER BY tong DESC`,
    )
    .bind(start, end, ...scopeClause.binds, ...khuVucClause.binds)
    .all();

  return { rows: results, thang };
}

// GET /api/nap-gas/by-khu-vuc?dim=&khu_vuc=&thang= - bao cao ca nghi ngo nap gas hoan thanh trong
// 1 thang, nhom theo 1 cot bat ky trong REPORT_DIMS (mac dinh khu_vuc). Boc qua cachedReport (xem
// lib/reportCache.ts) - domain "cases"+"nap_gas_danh_gia" (nap_gas_danh_gia anh huong cac cot
// da_danh_gia/chua_danh_gia/tung phan loai).
napGas.get("/by-khu-vuc", async (c) => {
  const dimKey = c.req.query("dim") ?? "khu_vuc";
  if (!REPORT_DIMS[dimKey]) return c.json({ error: "INVALID_DIM" }, 400);

  const scope = scopeByKhuVuc(c);
  const params: NapGasByKhuVucParams = { dim: dimKey, khu_vuc: c.req.query("khu_vuc"), thang: c.req.query("thang") };
  const key = buildReportKey("nap-gas/by-khu-vuc", params, scope);
  const data = await cachedReport(c.env.DB, key, ["cases", "nap_gas_danh_gia"], () => computeNapGasByKhuVuc(c.env.DB, params, scope));
  return c.json(data);
});

export default napGas;
