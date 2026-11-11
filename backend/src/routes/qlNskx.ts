/**
 * Menu "QL NSKX" (2026-11-11, yeu cau chu he thong) - moi ca doi tac NSKX (chi VN), chia theo THANG tiep nhan (CSKH).
 *  - GET  /thang              danh sach thang co ca NSKX (+ so ca) cho o chon thang.
 *  - GET  /danh-sach          danh sach 1 thang, loc/sap xep kieu Excel tren tieu de cot (dung chung lib/locCot.ts voi
 *                             Danh sach chi tiet - Quan ly ton, bang cot rieng COT_NSKX), ?gia_tri_cot= / ?export=true.
 *  - PUT  /:id/loi-loc        Giam sat (khu vuc cua minh) / TBP DVBH / Admin xac nhan co thay / khong thay loi loc, thay loi gi
 *                             (ma bat buoc co trong bang linh_kien - danh muc dong bo tu linh-kien-app).
 *  - POST /dong-bo-don        dong bo THU CONG voi linh-kien-app: gui cac ca NSKX (tiep nhan tu 11/2026) chua "khong thay loi" sang
 *                             POST /api/partner/v1/don-loi-loc, nhan lai ca nao da co don loai "HỖ TRỢ NGOÀI BẢO HÀNH TG12…"
 *                             (bo don huy/tu choi) -> nskx_don_lk. Chi ghi dong thay doi.
 *  - GET  /bao-cao            bao cao nhanh theo khu vuc / KTV cua 1 thang.
 *  - GET  /dat-loi/ung-vien   ca da xac nhan "Co thay loi" + chua len don (tu 11/2026, khu vuc nguoi bam) - danh sach dat hang loat.
 *  - POST /dat-loi/xem-truoc  ke hoach dat (gom theo nguoi nhan, bo loi da co don / ngoai danh muc) [+ kiem tra truoc tung phieu].
 *  - POST /dat-loi/tao        dat that sang linh-kien-app voi tai khoan nguoi bam (lib/nskxDatLoi.ts - doc ky phan "an toan").
 * Trang thai don: da_len_don (co don con hieu luc) > khong_can (GS xac nhan khong thay loi) > chua_len_don (con lai).
 * Doc song (khong cachedReport): so ca NSKX/thang nho (vai tram), loc qua partial index idx_case_doi_tac.
 * Frontend KHONG gan ?pv= cho /ql-nskx (api/client.ts) - menu nay tu loc NSKX, khong phu thuoc nut "Pham vi bao cao".
 */
import { Hono } from "hono";
import type { Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { khuVucAdHocClause } from "../lib/filterParams";
import { hasModule } from "../lib/moduleAccess";
import { ageExpr } from "../lib/ageCalc";
import { boDau, locCotClause, parseLocCot, type Kieu } from "../lib/locCot";
import { nowVN } from "../lib/vnTime";
import {
  CA_TOI_DA_MOI_LAN, LoiLinhKienApp, NSKX_DAT_LOI_TU_NGAY, docDonLoiLocSong, ghiDonLk, khoaCa, kiemTraPhieu, lapKeHoach, moKhoaCa, moTaLoi, taoPhieu,
  type KetQuaTao,
} from "../lib/nskxDatLoi";

const qlNskx = new Hono<{ Bindings: Env }>();
qlNskx.use("*", verifySessionMiddleware, loadUser);
qlNskx.use("*", async (c, next) => {
  if (!hasModule(c.get("user"), "ql-nskx")) return c.json({ error: "FORBIDDEN" }, 403);
  await next();
});

const DK_NSKX = "c.doi_tac IN ('NSKX', '[NSKX]') AND COALESCE(c.quoc_gia, 'VN') = 'VN'";
const LOAI_DE_XUAT_LOI = "HỖ TRỢ NGOÀI BẢO HÀNH TG12";
// Chot chu he thong 2026-11-11: chi dong bo don loi loc cho ca NSKX tiep nhan tu thang 11/2026 tro di.
export const NSKX_DONG_BO_TU_NGAY = "2026-11-01";

const DE_XUAT_LOI_EXPR = "(CASE WHEN c.linh_kien_loi LIKE '%lõi%' OR c.linh_kien_loi LIKE '%LÕI%' THEN 'co' ELSE 'khong' END)";
// Danh gia loi loc. n.thay_loi: 1 = co thay, 0 = khong thay, 2 = khong ap dung (GS xac nhan). Chua xac nhan: ca DA HOAN THANH ma
// linh kien sua chua khong co chu "lõi" -> mac dinh "tu_dong_khong_thay" (chu he thong 2026-11-11); con lai "chua_danh_gia".
const TT_LOI_LOC_EXPR = `(CASE WHEN n.thay_loi = 1 THEN 'thay' WHEN n.thay_loi = 0 THEN 'khong_thay' WHEN n.thay_loi = 2 THEN 'khong_ap_dung'
  WHEN c.thoi_gian_hoan_thanh IS NOT NULL AND NOT (COALESCE(c.linh_kien_loi, '') LIKE '%lõi%' OR COALESCE(c.linh_kien_loi, '') LIKE '%LÕI%') THEN 'tu_dong_khong_thay'
  ELSE 'chua_danh_gia' END)`;
// Trang thai don: co don > khong can (khong thay / tu dong khong thay) > khong ap dung (GS chon, hoac ca truoc NSKX_DONG_BO_TU_NGAY) > chua.
const TT_DON_EXPR = `(CASE WHEN d.co_don = 1 THEN 'da_len_don' WHEN ${TT_LOI_LOC_EXPR} IN ('khong_thay', 'tu_dong_khong_thay') THEN 'khong_can'
  WHEN n.thay_loi = 2 OR c.thoi_gian_cskh_tiep_nhan < '${NSKX_DONG_BO_TU_NGAY}' THEN 'khong_ap_dung' ELSE 'chua_len_don' END)`;
const TRANG_THAI_EXPR = "(CASE WHEN c.thoi_gian_hoan_thanh IS NULL THEN 'Đang xử lý' ELSE 'Đã hoàn thành' END)";

/** Cot loc/sap xep cua QL NSKX (alias c = case, n = nskx_loi_loc, d = nskx_don_lk). */
const COT_NSKX: Record<string, { expr: string; kieu: Kieu }> = {
  id: { expr: "c.id", kieu: "text" },
  khach_hang: { expr: "c.khach_hang", kieu: "text" },
  khu_vuc: { expr: "c.khu_vuc", kieu: "list" },
  ky_thuat_vien: { expr: "c.ky_thuat_vien", kieu: "list" },
  seri_san_pham: { expr: "c.seri_san_pham", kieu: "text" },
  nhom_san_pham: { expr: "c.nhom_san_pham", kieu: "list" },
  hang: { expr: "c.hang", kieu: "list" },
  nganh: { expr: "c.nganh", kieu: "list" },
  nhom_kh: { expr: "c.nhom_kh", kieu: "list" },
  nhom_yeu_cau: { expr: "c.nhom_yeu_cau", kieu: "list" },
  loai_yeu_cau: { expr: "c.loai_yeu_cau", kieu: "list" },
  tien_do_hoan_thanh: { expr: "c.tien_do_hoan_thanh", kieu: "list" },
  dung_han: { expr: "c.dung_han", kieu: "list" },
  xu_ly_24h_bucket: { expr: "c.xu_ly_24h_bucket", kieu: "list" },
  mo_ta_loi: { expr: "c.mo_ta_loi", kieu: "text" },
  noi_dung_xu_ly: { expr: "c.noi_dung_xu_ly", kieu: "text" },
  tiep_nhan: { expr: "c.thoi_gian_cskh_tiep_nhan", kieu: "date" },
  hoan_thanh: { expr: "c.thoi_gian_hoan_thanh", kieu: "date" },
  tuoi_ton: { expr: `(CASE WHEN c.thoi_gian_hoan_thanh IS NULL THEN ${ageExpr("c.thoi_gian_cskh_tiep_nhan")} END)`, kieu: "number" },
  trang_thai: { expr: TRANG_THAI_EXPR, kieu: "list" },
  de_xuat_loi: { expr: DE_XUAT_LOI_EXPR, kieu: "list" },
  tt_loi_loc: { expr: TT_LOI_LOC_EXPR, kieu: "list" },
  tt_don: { expr: TT_DON_EXPR, kieu: "list" },
  loi_da_thay: { expr: "n.ds_loi", kieu: "text" },
  nguoi_xac_nhan: { expr: "n.nguoi_xac_nhan", kieu: "list" },
};

const FROM_NSKX = "FROM case_hieu_luc c LEFT JOIN nskx_loi_loc n ON n.case_id = c.id LEFT JOIN nskx_don_lk d ON d.case_id = c.id";

function thangBounds(thang: string | undefined): { start: string; end: string } | null {
  if (!thang || !/^\d{4}-\d{2}$/.test(thang)) return null;
  const [y, m] = thang.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return { start: `${thang}-01`, end: `${ny}-${String(nm).padStart(2, "0")}-01` };
}

/** WHERE chung: NSKX VN + thang tiep nhan + scope khu vuc cua user + o chon khu vuc + o tim ID/Serial. */
function whereGoc(c: { req: { query: (k: string) => string | undefined } }, scope: string[] | null, thang: { start: string; end: string } | null) {
  const sc = khuVucWhereClause(scope, "c.khu_vuc");
  const kv = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const id = (c.req.query("id") ?? "").trim();
  let sql = `WHERE ${DK_NSKX}`;
  const binds: unknown[] = [];
  if (thang) {
    sql += " AND c.thoi_gian_cskh_tiep_nhan >= ? AND c.thoi_gian_cskh_tiep_nhan < ?";
    binds.push(thang.start, thang.end);
  }
  sql += sc.sql + kv.sql;
  binds.push(...sc.binds, ...kv.binds);
  if (id) {
    sql += " AND (c.id LIKE ? OR c.seri_san_pham LIKE ?)";
    binds.push(`%${id}%`, `%${id}%`);
  }
  return { sql, binds };
}

qlNskx.get("/thang", async (c) => {
  const scope = scopeByKhuVuc(c);
  const sc = khuVucWhereClause(scope, "c.khu_vuc");
  const { results } = await c.env.DB.prepare(
    `SELECT substr(c.thoi_gian_cskh_tiep_nhan, 1, 7) AS thang, COUNT(*) AS n FROM case_hieu_luc c
     WHERE ${DK_NSKX} AND c.thoi_gian_cskh_tiep_nhan IS NOT NULL${sc.sql} GROUP BY 1 ORDER BY 1 DESC`,
  )
    .bind(...sc.binds)
    .all<{ thang: string; n: number }>();
  const dongBo = await c.env.DB.prepare("SELECT gia_tri, updated_at, updated_by FROM cai_dat_he_thong WHERE khoa = 'nskx_dong_bo_don'").first<{
    gia_tri: string;
    updated_at: string | null;
    updated_by: string | null;
  }>();
  return c.json({ rows: results, dong_bo: dongBo ? { ...JSON.parse(dongBo.gia_tri), luc: dongBo.updated_at, nguoi: dongBo.updated_by } : null });
});

const COT_DS = `c.id, c.khach_hang, c.khu_vuc, c.ky_thuat_vien, c.ktv_trien_khai, c.tinh, c.tinh_moi, c.seri_san_pham, c.nhom_san_pham, c.hang,
  c.nganh, c.nhom_kh, c.doi_tac, c.nhom_yeu_cau, c.loai_yeu_cau, c.mo_ta_loi, c.noi_dung_xu_ly, c.tien_do_hoan_thanh, c.dung_han,
  c.xu_ly_24h_bucket, c.thoi_gian_cskh_tiep_nhan, c.thoi_gian_hoan_thanh, c.linh_kien_loi,
  ${COT_NSKX.tuoi_ton.expr} AS tuoi_ton, ${TRANG_THAI_EXPR} AS trang_thai, ${DE_XUAT_LOI_EXPR} AS de_xuat_loi,
  ${TT_LOI_LOC_EXPR} AS tt_loi_loc, ${TT_DON_EXPR} AS tt_don,
  n.thay_loi, n.ds_loi, n.ghi_chu AS ghi_chu_loi, n.nguoi_xac_nhan, n.ngay_xac_nhan, d.don AS don_loi, d.ngay_dong_bo`;

qlNskx.get("/danh-sach", async (c) => {
  const scope = scopeByKhuVuc(c);
  const thang = thangBounds(c.req.query("thang"));
  const goc = whereGoc(c, scope, thang);
  const locCot = parseLocCot(c.req.query("loc_cot"));
  const giaTriCot = c.req.query("gia_tri_cot") ?? "";
  const isExport = c.req.query("export") === "true";

  // Loc "chua tu khoa" khong dau (giong cases.ts GET "/"): doc (id, gia tri) roi so trong Worker -> tap id.
  const qIds: Record<string, string[]> = {};
  const cotQ = Object.entries(locCot).filter(([k, f]) => COT_NSKX[k] && k !== giaTriCot && typeof f?.q === "string" && f.q.trim() !== "");
  if (cotQ.length) {
    const w0 = locCotClause(locCot, giaTriCot || undefined, undefined, undefined, COT_NSKX);
    for (const [k, f] of cotQ) {
      const tuKhoa = boDau(String(f.q).trim());
      const { results } = await c.env.DB.prepare(`SELECT CAST(c.id AS TEXT) AS id, CAST(${COT_NSKX[k].expr} AS TEXT) AS v ${FROM_NSKX} ${goc.sql}${w0.sql}`)
        .bind(...goc.binds, ...w0.binds)
        .all<{ id: string; v: string | null }>();
      qIds[k] = results.filter((r) => boDau(r.v ?? "").includes(tuKhoa)).map((r) => r.id);
    }
  }
  const loc = locCotClause(locCot, giaTriCot || undefined, undefined, qIds, COT_NSKX);
  const whereSql = goc.sql + loc.sql;
  const binds = [...goc.binds, ...loc.binds];

  if (giaTriCot) {
    if (giaTriCot === "tinh") {
      const { results } = await c.env.DB.prepare(`SELECT c.tinh AS tinh, c.tinh_moi AS tinh_moi, COUNT(*) AS n ${FROM_NSKX} ${whereSql} GROUP BY 1, 2`)
        .bind(...binds)
        .all();
      return c.json({ cot: giaTriCot, rows: results });
    }
    const def = COT_NSKX[giaTriCot];
    if (!def) return c.json({ error: "INVALID_COT" }, 400);
    const { results } = await c.env.DB.prepare(`SELECT CAST(${def.expr} AS TEXT) AS v, COUNT(*) AS n ${FROM_NSKX} ${whereSql} GROUP BY 1 ORDER BY n DESC LIMIT 3000`)
      .bind(...binds)
      .all<{ v: string | null; n: number }>();
    return c.json({ cot: giaTriCot, rows: results });
  }

  const sortExpr = COT_NSKX[c.req.query("sortBy") ?? ""]?.expr ?? "c.thoi_gian_cskh_tiep_nhan";
  const sortDir = c.req.query("sortDir") === "asc" ? "ASC" : "DESC";
  const base = `SELECT ${COT_DS} ${FROM_NSKX} ${whereSql} ORDER BY ${sortExpr} ${sortDir}, c.id DESC`;

  if (isExport) {
    const { results } = await c.env.DB.prepare(`${base} LIMIT 5000`).bind(...binds).all();
    return c.json({ rows: results });
  }
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const coLoc = loc.sql !== "";
  const stmts = [
    c.env.DB.prepare(`${base} LIMIT ? OFFSET ?`).bind(...binds, pageSize, (page - 1) * pageSize),
    c.env.DB.prepare(`SELECT COUNT(*) AS total ${FROM_NSKX} ${whereSql}`).bind(...binds),
    ...(coLoc ? [c.env.DB.prepare(`SELECT COUNT(*) AS total ${FROM_NSKX} ${goc.sql}`).bind(...goc.binds)] : []),
  ];
  const res = await c.env.DB.batch(stmts);
  const total = (res[1].results[0] as { total: number } | undefined)?.total ?? 0;
  const totalChuaLoc = coLoc ? ((res[2].results[0] as { total: number } | undefined)?.total ?? 0) : undefined;
  return c.json({ rows: res[0].results, page, pageSize, total, total_chua_loc: totalChuaLoc });
});

/** linh_kien_loi (chuoi JSON mang {ma_linh_kien, ten_linh_kien, ...} tu Odoo) -> [{ma, ten}]; loi parse = rong. */
function tachLinhKienLoi(raw: string | null): { ma: string; ten: string }[] {
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => ({ ma: String((x as { ma_linh_kien?: unknown })?.ma_linh_kien ?? "").trim(), ten: String((x as { ten_linh_kien?: unknown })?.ten_linh_kien ?? "").trim() }))
      .filter((x) => x.ma);
  } catch {
    return [];
  }
}

/** Ai duoc xac nhan loi loc: Admin, TBP DVBH, Giam sat (chi ca trong khu vuc minh phu trach - scopeByKhuVuc). */
function duocXacNhan(vaiTro: string | null): boolean {
  return vaiTro === "Admin" || vaiTro === "TBP DVBH" || vaiTro === "Giam sat";
}

qlNskx.put("/:id/loi-loc", async (c) => {
  const user = c.get("user");
  if (!duocXacNhan(user.vai_tro)) return c.json({ error: "FORBIDDEN", message: "Chỉ Giám sát / TBP DVBH / Admin được xác nhận lõi lọc." }, 403);
  const id = c.req.param("id");
  const scope = scopeByKhuVuc(c);
  const sc = khuVucWhereClause(scope, "c.khu_vuc");
  const ca = await c.env.DB.prepare(`SELECT c.id, c.linh_kien_loi FROM case_hieu_luc c WHERE c.id = ? AND ${DK_NSKX}${sc.sql}`)
    .bind(id, ...sc.binds)
    .first<{ id: string; linh_kien_loi: string | null }>();
  if (!ca) return c.json({ error: "NOT_FOUND", message: "Không tìm thấy ca NSKX trong phạm vi khu vực của bạn." }, 404);

  const body = await c.req.json<{ trang_thai?: unknown; ds_loi?: unknown; ghi_chu?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  const MA_TT: Record<string, number> = { thay: 1, khong_thay: 0, khong_ap_dung: 2 };
  const thayLoi = MA_TT[String(body.trang_thai ?? "")];
  if (thayLoi === undefined) return c.json({ error: "INVALID", message: "Chọn Có thay / Không thay / Không áp dụng." }, 400);
  const ghiChu = typeof body.ghi_chu === "string" ? body.ghi_chu.trim().slice(0, 1000) || null : null;
  let dsLoi: string | null = null;
  if (thayLoi === 1) {
    const raw = Array.isArray(body.ds_loi) ? body.ds_loi : [];
    const gop = new Map<string, number>();
    for (const x of raw as { ma_linh_kien?: unknown; so_luong?: unknown }[]) {
      const ma = String(x?.ma_linh_kien ?? "").trim();
      if (!ma) continue;
      const sl = Math.max(1, Math.min(99, Math.round(Number(x?.so_luong) || 1)));
      gop.set(ma, (gop.get(ma) ?? 0) + sl);
    }
    if (!gop.size) return c.json({ error: "INVALID", message: "Chọn ít nhất 1 lõi lọc đã thay." }, 400);
    const { results } = await c.env.DB.prepare("SELECT ma_linh_kien, ten_linh_kien FROM linh_kien WHERE ma_linh_kien IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify([...gop.keys()]))
      .all<{ ma_linh_kien: string; ten_linh_kien: string }>();
    const ten = new Map(results.map((r) => [r.ma_linh_kien, r.ten_linh_kien]));
    // Chu he thong 2026-11-11: ma lay tu bao cao linh kien Odoo CUA CHINH CA (linh_kien_loi) duoc chap nhan du chua co
    // trong danh muc linh_kien (vd 2004020410) - ten lay theo bao cao. Ma ngoai ca 2 nguon van bi tu choi.
    for (const p of tachLinhKienLoi(ca.linh_kien_loi)) if (gop.has(p.ma) && !ten.has(p.ma)) ten.set(p.ma, p.ten);
    const sai = [...gop.keys()].filter((m) => !ten.has(m));
    if (sai.length) return c.json({ error: "INVALID_MA", message: `Mã không có trong danh mục linh kiện: ${sai.join(", ")}` }, 400);
    dsLoi = JSON.stringify([...gop.entries()].map(([ma, so_luong]) => ({ ma_linh_kien: ma, ten_linh_kien: ten.get(ma), so_luong })));
  }
  const luc = nowVN();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO nskx_loi_loc (case_id, thay_loi, ds_loi, ghi_chu, nguoi_xac_nhan, ngay_xac_nhan) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(case_id) DO UPDATE SET thay_loi = excluded.thay_loi, ds_loi = excluded.ds_loi, ghi_chu = excluded.ghi_chu,
         nguoi_xac_nhan = excluded.nguoi_xac_nhan, ngay_xac_nhan = excluded.ngay_xac_nhan`,
    ).bind(id, thayLoi, dsLoi, ghiChu, user.email, luc),
    c.env.DB.prepare(
      "INSERT INTO nskx_loi_loc_log (case_id, thay_loi, ds_loi, ghi_chu, nguoi_xac_nhan, ngay_xac_nhan) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(id, thayLoi, dsLoi, ghiChu, user.email, luc),
  ]);
  return c.json({ ok: true });
});

// GET /ca/:id - tab "NSKX" chi tiet ca: trang thai danh gia + don loi (lan dong bo gan nhat) + lich su xac nhan.
qlNskx.get("/ca/:id", async (c) => {
  const id = c.req.param("id");
  const scope = scopeByKhuVuc(c);
  const sc = khuVucWhereClause(scope, "c.khu_vuc");
  const [ca, log] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT c.id, c.thoi_gian_cskh_tiep_nhan, c.thoi_gian_hoan_thanh, ${DE_XUAT_LOI_EXPR} AS de_xuat_loi,
         ${TT_LOI_LOC_EXPR} AS tt_loi_loc, ${TT_DON_EXPR} AS tt_don, n.thay_loi, n.ds_loi, n.ghi_chu AS ghi_chu_loi,
         n.nguoi_xac_nhan, n.ngay_xac_nhan, d.don AS don_loi, d.ngay_dong_bo
       ${FROM_NSKX} WHERE c.id = ? AND ${DK_NSKX}${sc.sql}`,
    ).bind(id, ...sc.binds),
    c.env.DB.prepare("SELECT thay_loi, ds_loi, ghi_chu, nguoi_xac_nhan, ngay_xac_nhan FROM nskx_loi_loc_log WHERE case_id = ? ORDER BY id DESC").bind(id),
  ]);
  const row = ca.results[0];
  if (!row) return c.json({ error: "NOT_FOUND" }, 404);
  return c.json({ row, log: log.results, duoc_xac_nhan: duocXacNhan(c.get("user").vai_tro) });
});

qlNskx.post("/dong-bo-don", async (c) => {
  const user = c.get("user");
  if (!duocXacNhan(user.vai_tro)) return c.json({ error: "FORBIDDEN" }, 403);
  const env = c.env;
  if (!env.LINHKIEN_APP_URL || !env.LINHKIEN_APP_API_KEY) return c.json({ error: "NOT_CONFIGURED", message: "Chưa cấu hình kết nối linh-kien-app." }, 500);

  // Ca NSKX VN tiep nhan tu NSKX_DONG_BO_TU_NGAY (toan he thong, khong theo khu vuc nguoi bam) tru ca GS da xac nhan "khong thay loi". Gom ca ca da len don
  // de phat hien don bi huy/tu choi sau lan dong bo truoc.
  const { results: ds } = await env.DB.prepare(
    `SELECT c.id, d.co_don, d.don FROM case_hieu_luc c LEFT JOIN nskx_loi_loc n ON n.case_id = c.id LEFT JOIN nskx_don_lk d ON d.case_id = c.id
     WHERE ${DK_NSKX} AND c.thoi_gian_cskh_tiep_nhan >= ? AND COALESCE(n.thay_loi, 1) = 1`,
  )
    .bind(NSKX_DONG_BO_TU_NGAY)
    .all<{ id: string; co_don: number | null; don: string | null }>();
  const cu = new Map(ds.map((r) => [String(r.id), r]));
  const ids = [...cu.keys()];
  // Don chi khai ID Lada (khong ghi ma ca) - gui kem cap [ID Lada, ca] tu case_lada de linh-kien-app khop them qua ma_lada.
  const { results: ladaRows } = await env.DB.prepare(
    `SELECT l.order_id, l.case_id FROM case_lada l JOIN case_dvbh c ON c.id = l.case_id WHERE ${DK_NSKX} AND c.thoi_gian_cskh_tiep_nhan >= ?`,
  )
    .bind(NSKX_DONG_BO_TU_NGAY)
    .all<{ order_id: string; case_id: string }>();
  const ladaTheoCa = new Map<string, string[][]>();
  for (const r of ladaRows) {
    const k = String(r.case_id);
    if (!cu.has(k)) continue;
    ladaTheoCa.set(k, [...(ladaTheoCa.get(k) ?? []), [String(r.order_id), k]]);
  }
  const luc = nowVN();
  const ghi: D1PreparedStatement[] = [];
  let daLenDon = 0;
  for (let i = 0; i < ids.length; i += 1000) {
    const lo = ids.slice(i, i + 1000);
    const url = `${env.LINHKIEN_APP_URL}/api/partner/v1/don-loi-loc`;
    const init: RequestInit = {
      method: "POST",
      headers: { "X-API-Key": env.LINHKIEN_APP_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ case_ids: lo, lada: lo.flatMap((id) => ladaTheoCa.get(id) ?? []) }),
      signal: AbortSignal.timeout(20000),
    };
    let body: { rows?: { case_id: string; don: unknown[] }[] };
    try {
      const res = env.LINHKIEN_APP ? await env.LINHKIEN_APP.fetch(url, init) : await fetch(url, init);
      if (!res.ok) return c.json({ error: "UPSTREAM", message: `linh-kien-app trả HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` }, 502);
      body = await res.json();
    } catch (err) {
      return c.json({ error: "UPSTREAM", message: `Không gọi được linh-kien-app: ${String(err).slice(0, 200)}` }, 502);
    }
    for (const r of body.rows ?? []) {
      const don = Array.isArray(r.don) ? r.don : [];
      const coDon = don.length ? 1 : 0;
      daLenDon += coDon;
      const donJson = don.length ? JSON.stringify(don) : null;
      const truoc = cu.get(String(r.case_id));
      if (truoc && truoc.co_don === coDon && (truoc.don ?? null) === donJson) continue;
      ghi.push(
        env.DB.prepare(
          `INSERT INTO nskx_don_lk (case_id, co_don, don, ngay_dong_bo) VALUES (?, ?, ?, ?)
           ON CONFLICT(case_id) DO UPDATE SET co_don = excluded.co_don, don = excluded.don, ngay_dong_bo = excluded.ngay_dong_bo`,
        ).bind(String(r.case_id), coDon, donJson, luc),
      );
    }
  }
  const tomTat = { so_ca: ids.length, da_len_don: daLenDon, chua_len_don: ids.length - daLenDon, thay_doi: ghi.length };
  ghi.push(
    env.DB.prepare(
      `INSERT INTO cai_dat_he_thong (khoa, gia_tri, updated_at, updated_by) VALUES ('nskx_dong_bo_don', ?, ?, ?)
       ON CONFLICT(khoa) DO UPDATE SET gia_tri = excluded.gia_tri, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    ).bind(JSON.stringify(tomTat), luc, user.email),
  );
  for (let i = 0; i < ghi.length; i += 200) await env.DB.batch(ghi.slice(i, i + 200));
  return c.json({ ok: true, ...tomTat });
});

qlNskx.get("/bao-cao", async (c) => {
  const scope = scopeByKhuVuc(c);
  const thang = thangBounds(c.req.query("thang"));
  const goc = whereGoc(c, scope, thang);
  const dim = c.req.query("dim") === "ktv" ? "c.ky_thuat_vien" : "c.khu_vuc";
  const { results } = await c.env.DB.prepare(
    `SELECT ${dim} AS nhom, ${dim === "c.ky_thuat_vien" ? "MAX(c.khu_vuc)" : "NULL"} AS khu_vuc,
       COUNT(*) AS tong_ca,
       SUM(CASE WHEN c.thoi_gian_hoan_thanh IS NOT NULL THEN 1 ELSE 0 END) AS da_hoan_thanh,
       SUM(CASE WHEN c.tinh_vao_kpi = 1 AND c.xu_ly_24h_bucket = '0. Dưới 24h' THEN 1 ELSE 0 END) AS duoi_24h,
       SUM(CASE WHEN c.tinh_vao_kpi = 1 AND c.xu_ly_24h_bucket IS NOT NULL THEN 1 ELSE 0 END) AS co_tinh_24h,
       SUM(CASE WHEN c.tinh_vao_kpi = 1 AND c.dung_han = 'Đúng hạn' THEN 1 ELSE 0 END) AS dung_han,
       SUM(CASE WHEN c.tinh_vao_kpi = 1 AND c.dung_han IS NOT NULL THEN 1 ELSE 0 END) AS co_tinh_sla,
       SUM(CASE WHEN ${TT_DON_EXPR} = 'da_len_don' THEN 1 ELSE 0 END) AS da_dat_loi,
       SUM(CASE WHEN ${TT_DON_EXPR} = 'khong_can' THEN 1 ELSE 0 END) AS khong_thay_loi,
       SUM(CASE WHEN ${TT_DON_EXPR} = 'chua_len_don' THEN 1 ELSE 0 END) AS chua_dat_loi,
       SUM(CASE WHEN ${TT_DON_EXPR} = 'khong_ap_dung' THEN 1 ELSE 0 END) AS khong_ap_dung,
       SUM(CASE WHEN ${TT_LOI_LOC_EXPR} = 'chua_danh_gia' THEN 1 ELSE 0 END) AS chua_danh_gia
     ${FROM_NSKX} ${goc.sql} GROUP BY 1 ORDER BY tong_ca DESC, 1`,
  )
    .bind(...goc.binds)
    .all();
  return c.json({ rows: results });
});

// ======================= DAT LOI LOC SANG linh-kien-app (2026-11-11, v1.571 - lib/nskxDatLoi.ts) =======================
function docIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = [...new Set(raw.map((x) => String(x ?? "").trim()).filter(Boolean))];
  return ids.length && ids.length <= CA_TOI_DA_MOI_LAN ? ids : null;
}
const loiLk = (c: { json: (b: unknown, s: 500 | 502) => Response }, err: unknown) =>
  err instanceof LoiLinhKienApp ? c.json({ error: "UPSTREAM", message: err.message }, err.status === 500 ? 500 : 502) : null;

qlNskx.get("/dat-loi/ung-vien", async (c) => {
  if (!duocXacNhan(c.get("user").vai_tro)) return c.json({ error: "FORBIDDEN" }, 403);
  const scope = scopeByKhuVuc(c);
  const sc = khuVucWhereClause(scope, "c.khu_vuc");
  const kv = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const { results } = await c.env.DB.prepare(
    `SELECT c.id ${FROM_NSKX} WHERE ${DK_NSKX} AND c.thoi_gian_cskh_tiep_nhan >= ? AND n.thay_loi = 1 AND COALESCE(d.co_don, 0) = 0${sc.sql}${kv.sql}
     ORDER BY c.thoi_gian_cskh_tiep_nhan LIMIT ${CA_TOI_DA_MOI_LAN}`,
  )
    .bind(NSKX_DAT_LOI_TU_NGAY, ...sc.binds, ...kv.binds)
    .all<{ id: string }>();
  return c.json({ ids: results.map((r) => String(r.id)), toi_da: CA_TOI_DA_MOI_LAN });
});

qlNskx.post("/dat-loi/xem-truoc", async (c) => {
  const user = c.get("user");
  if (!duocXacNhan(user.vai_tro)) return c.json({ error: "FORBIDDEN", message: "Chỉ Giám sát / TBP DVBH / Admin được đặt lõi." }, 403);
  const body = await c.req.json<{ case_ids?: unknown; kiem_tra?: unknown }>().catch(() => ({}) as { case_ids?: unknown; kiem_tra?: unknown });
  const ids = docIds(body.case_ids);
  if (!ids) return c.json({ error: "INVALID", message: `Chọn 1–${CA_TOI_DA_MOI_LAN} ca.` }, 400);
  const sc = khuVucWhereClause(scopeByKhuVuc(c), "c.khu_vuc");
  try {
    const { keHoach, donSong } = await lapKeHoach(c.env, c.env.DB, ids, sc);
    await ghiDonLk(c.env.DB, donSong);
    // Kiem tra truoc (khong ghi) - chi khi it phieu (dat le / nhom nho); dat hang loat se kiem tra lai luc tao tung phieu.
    const kiemTra = body.kiem_tra === true && keHoach.phieu.length <= 5;
    const phieu = [];
    for (const p of keHoach.phieu) {
      if (!kiemTra) {
        phieu.push({ ...p, loi_phieu: null, dong: p.dong.map((d) => ({ ...d, trang_thai: null, loi: null, thong_diep: null })) });
        continue;
      }
      const kt = await kiemTraPhieu(c.env, p, user.email);
      phieu.push({ ...p, loi_phieu: moTaLoi(kt.loi_phieu), dong: kt.dong });
    }
    return c.json({ phieu, bo_qua: keHoach.bo_qua, da_kiem_tra: kiemTra });
  } catch (err) {
    const r = loiLk(c, err);
    if (r) return r;
    throw err;
  }
});

qlNskx.post("/dat-loi/tao", async (c) => {
  const user = c.get("user");
  if (!duocXacNhan(user.vai_tro)) return c.json({ error: "FORBIDDEN", message: "Chỉ Giám sát / TBP DVBH / Admin được đặt lõi." }, 403);
  const body = await c.req.json<{ case_ids?: unknown }>().catch(() => ({}) as { case_ids?: unknown });
  const ids = docIds(body.case_ids);
  if (!ids) return c.json({ error: "INVALID", message: `Chọn 1–${CA_TOI_DA_MOI_LAN} ca.` }, 400);
  const sc = khuVucWhereClause(scopeByKhuVuc(c), "c.khu_vuc");
  const db = c.env.DB;
  const khoa = await khoaCa(db, ids, user.email);
  const boQuaKhoa = khoa.nguoiKhac.map((id) => ({ case_id: id, ly_do: "Đang có người khác đặt lõi cho ca này — thử lại sau ít phút" }));
  try {
    if (!khoa.cuaMinh.length) return c.json({ ket_qua: [], bo_qua: boQuaKhoa });
    // Lap ke hoach NGAY LUC DAT (doc song don TG12) - khong tin ke hoach xem truoc tren may nguoi dung.
    const { keHoach } = await lapKeHoach(c.env, db, khoa.cuaMinh, sc);
    const ketQua: KetQuaTao[] = [];
    for (const p of keHoach.phieu) ketQua.push(await taoPhieu(c.env, db, p, user.email)); // TUAN TU - khong Promise.all
    // Cap nhat trang thai don cua cac ca vua dat (doc song lai, ghi dong thay doi) - loi doc lai khong lam hong ket qua dat.
    const daDat = [...new Set(ketQua.filter((k) => k.phieu_id).flatMap((k) => k.ca))];
    if (daDat.length) {
      try {
        await ghiDonLk(db, await docDonLoiLocSong(c.env, db, daDat));
      } catch (err) {
        console.warn("[nskx-dat-loi] cap nhat nskx_don_lk sau khi dat loi", String(err));
      }
    }
    return c.json({ ket_qua: ketQua, bo_qua: [...boQuaKhoa, ...keHoach.bo_qua] });
  } catch (err) {
    const r = loiLk(c, err);
    if (r) return r;
    throw err;
  } finally {
    await moKhoaCa(db, khoa.cuaMinh, user.email);
  }
});

export default qlNskx;
