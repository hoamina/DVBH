/**
 * Module "Sửa DT · HĐ · BH" (2026-11-14, chủ hệ thống, migration 0170):
 *  1) Doanh thu chuẩn: GS (khu vực mình phụ trách) / CSKH / TN CSKH / TBP DVBH / TBP CSKH / Admin sửa lại 3 thành phần doanh thu
 *     thực tế (tay trên chi tiết ca hoặc import Excel). Số sửa ghi thẳng vào dt_* (=> mọi báo cáo doanh thu dùng số sửa), bản CRM
 *     gốc ở dt_*_crm; import CRM sau đó không ghi đè (importProcessor). Bump "cases" để báo cáo doanh thu tính lại (như sửa khu vực).
 *     Lưu ý: chunk R2 "Ca đã đóng" giữ số cũ tới lần import kế tiếp ghi lại ngày đó (không thêm điểm ghi R2 - quy tắc CLAUDE.md);
 *     "Báo cáo ngày 08:00" đã chốt giữ số cũ tới lần chốt sau.
 *  2) Đơn xuất hóa đơn: tự động từ app Đặt mua linh kiện (lib/hoaDonLk.ts, đẩy khi Kế toán chốt + nút đồng bộ) - GS sửa tay được.
 *  3) Hạn bảo hành: tự tính (lib/hanBaoHanh.ts, ca tiếp nhận từ 01/11/2026) - GS sửa tay được.
 *
 *  GET    /ca/:id                 dữ liệu cho chi tiết ca (đánh giá tay, đơn HĐ, nhật ký, quyền sửa)
 *  PUT    /ca/:id/doanh-thu       {dt_san_pham, dt_linh_kien, dt_dich_vu, ly_do}
 *  DELETE /ca/:id/doanh-thu       khôi phục theo CRM
 *  PUT    /ca/:id/hoa-don         {xuat_hoa_don: 1|0|null, ghi_chu?}
 *  PUT    /ca/:id/bao-hanh        {con_bao_hanh: 1|0|null, ghi_chu?}
 *  GET    /doanh-thu              bảng "Ca đã sửa doanh thu"
 *  GET    /hoa-don                bảng "Đơn xuất hóa đơn" (+ ca đánh giá tay)
 *  POST   /hoa-don/dong-bo        kéo đơn hóa đơn từ app linh kiện
 *  GET    /bao-hanh?thang=YYYY-MM bảng "Hạn bảo hành" theo tháng tiếp nhận (từ 11/2026)
 *  POST   /import?commit=0|1      import Excel {rows:[{id, dt_san_pham?, dt_linh_kien?, dt_dich_vu?, ly_do?, xuat_hoa_don?, con_bao_hanh?}]}
 * Đọc sống (không cachedReport): bảng 1-2 nhỏ (quét partial index), bảng 3 theo 1 tháng qua idx_case_thoi_gian_tiep_nhan.
 */
import { Hono, type Context } from "hono";
import type { AppUser, Env } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { hasModule } from "../lib/moduleAccess";
import { nowVN } from "../lib/vnTime";
import { bumpVersions, type DataDomain } from "../lib/dataVersions";
import { HAN_BH_TU_NGAY, tinhHanBaoHanh, trangThaiBhCuoi } from "../lib/hanBaoHanh";
import { keoDonHoaDon, LoiKeoHoaDon } from "../lib/hoaDonLk";

type C = Context<{ Bindings: Env }>;
const r = new Hono<{ Bindings: Env }>();
r.use("*", verifySessionMiddleware, loadUser);

const MODULE = "sua-doanh-thu";
const VAI_TRO_SUA = new Set(["Admin", "TBP DVBH", "TBP CSKH", "CSKH", "TN CSKH", "Giam sat"]);
const IMPORT_TOI_DA = 3000;

/** Được sửa ca thuộc khu vực này không: GS chỉ khu vực mình phụ trách; vai trò khác theo phạm vi xem. */
function duocSua(c: C, khuVuc: string | null): boolean {
  const user = c.get("user") as AppUser;
  if (!user.vai_tro || !VAI_TRO_SUA.has(user.vai_tro)) return false;
  if (user.vai_tro === "Giam sat") return !!khuVuc && (user.khu_vuc_phu_trach ?? []).includes(khuVuc);
  const scope = scopeByKhuVuc(c);
  return scope === null || (!!khuVuc && scope.includes(khuVuc));
}
function coVaiTroSua(c: C): boolean {
  const v = (c.get("user") as AppUser).vai_tro;
  return !!v && VAI_TRO_SUA.has(v);
}
function canModule(c: C) {
  return hasModule(c.get("user") as AppUser, MODULE);
}

interface CaGoc {
  id: string;
  khu_vuc: string | null;
  dt_san_pham: number | null;
  dt_linh_kien: number | null;
  dt_dich_vu: number | null;
  dt_sua_at: string | null;
}

async function docCa(db: D1Database, id: string): Promise<CaGoc | null> {
  return db.prepare("SELECT id, khu_vuc, dt_san_pham, dt_linh_kien, dt_dich_vu, dt_sua_at FROM case_dvbh WHERE id = ?").bind(id).first<CaGoc>();
}

function soTien(v: unknown): number | null | "loi" {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
  // Excel thường trả số; chuỗi kiểu "1.500.000" / "1,500,000 đ" -> bỏ mọi ký tự không phải số (doanh thu VNĐ là số nguyên).
  const n = typeof v === "number" ? v : /\d/.test(String(v)) && !String(v).trim().startsWith("-") ? Number(String(v).replace(/\D/g, "")) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 1e12) return "loi";
  return Math.round(n);
}

function stmtSuaDt(db: D1Database, id: string, dt: [number | null, number | null, number | null], lyDo: string | null, nguoi: string, luc: string) {
  return db
    .prepare(
      `UPDATE case_dvbh SET
         dt_san_pham_crm = CASE WHEN dt_sua_at IS NULL THEN dt_san_pham ELSE dt_san_pham_crm END,
         dt_linh_kien_crm = CASE WHEN dt_sua_at IS NULL THEN dt_linh_kien ELSE dt_linh_kien_crm END,
         dt_dich_vu_crm = CASE WHEN dt_sua_at IS NULL THEN dt_dich_vu ELSE dt_dich_vu_crm END,
         dt_san_pham = ?, dt_linh_kien = ?, dt_dich_vu = ?, dt_sua_at = ?, dt_sua_by = ?, dt_sua_ly_do = ?
       WHERE id = ?`,
    )
    .bind(dt[0], dt[1], dt[2], luc, nguoi, lyDo, id);
}

function stmtLog(db: D1Database, caseId: string, loai: "dt" | "hd" | "bh", cu: unknown, moi: unknown, lyDo: string | null, nguon: string, nguoi: string, luc: string) {
  return db
    .prepare("INSERT INTO case_sua_log (case_id, loai, gia_tri_cu, gia_tri_moi, ly_do, nguon, nguoi, luc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(caseId, loai, cu === undefined ? null : JSON.stringify(cu), moi === undefined ? null : JSON.stringify(moi), lyDo, nguon, nguoi, luc);
}

function stmtHd(db: D1Database, caseId: string, v: number | null, nguoi: string, luc: string, ghiChu: string | null) {
  return db
    .prepare(
      `INSERT INTO case_hd_bh (case_id, xuat_hoa_don, hd_sua_by, hd_sua_at, ghi_chu) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(case_id) DO UPDATE SET xuat_hoa_don = excluded.xuat_hoa_don, hd_sua_by = excluded.hd_sua_by, hd_sua_at = excluded.hd_sua_at,
         ghi_chu = COALESCE(excluded.ghi_chu, case_hd_bh.ghi_chu)`,
    )
    .bind(caseId, v, nguoi, luc, ghiChu);
}
function stmtBh(db: D1Database, caseId: string, v: number | null, nguoi: string, luc: string, ghiChu: string | null) {
  return db
    .prepare(
      `INSERT INTO case_hd_bh (case_id, con_bao_hanh, bh_sua_by, bh_sua_at, ghi_chu) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(case_id) DO UPDATE SET con_bao_hanh = excluded.con_bao_hanh, bh_sua_by = excluded.bh_sua_by, bh_sua_at = excluded.bh_sua_at,
         ghi_chu = COALESCE(excluded.ghi_chu, case_hd_bh.ghi_chu)`,
    )
    .bind(caseId, v, nguoi, luc, ghiChu);
}

function chuoi(v: unknown, max = 500): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}
function coKhong(v: unknown): 1 | 0 | null | "loi" {
  if (v === null) return null;
  if (v === 1 || v === 0) return v;
  return "loi";
}

// ---------- Chi tiết 1 ca ----------
r.get("/ca/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const [caKq, hdBh, don, log] = await db.batch([
    db.prepare("SELECT id, khu_vuc FROM case_dvbh WHERE id = ?").bind(id),
    db.prepare("SELECT * FROM case_hd_bh WHERE case_id = ?").bind(id),
    db.prepare("SELECT * FROM don_hoa_don_lk WHERE case_id = ? ORDER BY chot_ke_toan_luc DESC").bind(id),
    db.prepare("SELECT * FROM case_sua_log WHERE case_id = ? ORDER BY id DESC LIMIT 100").bind(id),
  ]);
  const ca = caKq.results[0] as { id: string; khu_vuc: string | null } | undefined;
  if (!ca) return c.json({ error: "NOT_FOUND" }, 404);
  const scope = scopeByKhuVuc(c);
  if (scope !== null && !scope.includes(String(ca.khu_vuc))) return c.json({ error: "FORBIDDEN_KHU_VUC" }, 403);
  return c.json({ hdBh: hdBh.results[0] ?? null, donHoaDon: don.results, log: log.results, duocSua: duocSua(c, ca.khu_vuc) });
});

r.put("/ca/:id/doanh-thu", async (c) => {
  const id = c.req.param("id");
  const ca = await docCa(c.env.DB, id);
  if (!ca) return c.json({ error: "NOT_FOUND" }, 404);
  if (!duocSua(c, ca.khu_vuc)) return c.json({ error: "FORBIDDEN", message: "Bạn không có quyền sửa doanh thu ca này." }, 403);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const dt = [soTien(body.dt_san_pham), soTien(body.dt_linh_kien), soTien(body.dt_dich_vu)];
  if (dt.some((x) => x === "loi")) return c.json({ error: "INVALID", message: "Doanh thu phải là số ≥ 0." }, 400);
  const lyDo = chuoi(body.ly_do);
  if (!lyDo) return c.json({ error: "INVALID", message: "Nhập lý do sửa doanh thu." }, 400);
  const user = c.get("user") as AppUser;
  const luc = nowVN();
  const moi = dt as [number | null, number | null, number | null];
  await c.env.DB.batch([
    stmtSuaDt(c.env.DB, id, moi, lyDo, user.email, luc),
    stmtLog(c.env.DB, id, "dt", [ca.dt_san_pham, ca.dt_linh_kien, ca.dt_dich_vu], moi, lyDo, "tay", user.email, luc),
  ]);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["cases"]));
  return c.json({ ok: true });
});

r.delete("/ca/:id/doanh-thu", async (c) => {
  const id = c.req.param("id");
  const ca = await docCa(c.env.DB, id);
  if (!ca) return c.json({ error: "NOT_FOUND" }, 404);
  if (!ca.dt_sua_at) return c.json({ error: "KHONG_CO_SUA" }, 404);
  if (!duocSua(c, ca.khu_vuc)) return c.json({ error: "FORBIDDEN" }, 403);
  const user = c.get("user") as AppUser;
  const luc = nowVN();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE case_dvbh SET dt_san_pham = dt_san_pham_crm, dt_linh_kien = dt_linh_kien_crm, dt_dich_vu = dt_dich_vu_crm,
         dt_san_pham_crm = NULL, dt_linh_kien_crm = NULL, dt_dich_vu_crm = NULL, dt_sua_at = NULL, dt_sua_by = NULL, dt_sua_ly_do = NULL
       WHERE id = ? AND dt_sua_at IS NOT NULL`,
    ).bind(id),
    stmtLog(c.env.DB, id, "dt", [ca.dt_san_pham, ca.dt_linh_kien, ca.dt_dich_vu], "CRM", "Khôi phục theo CRM", "khoi_phuc", user.email, luc),
  ]);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["cases"]));
  return c.json({ ok: true });
});

async function suaHdBh(c: C, loai: "hd" | "bh") {
  const id = c.req.param("id")!;
  const ca = await docCa(c.env.DB, id);
  if (!ca) return c.json({ error: "NOT_FOUND" }, 404);
  if (!duocSua(c, ca.khu_vuc)) return c.json({ error: "FORBIDDEN", message: "Bạn không có quyền sửa ca này." }, 403);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const v = coKhong(loai === "hd" ? body.xuat_hoa_don : body.con_bao_hanh);
  if (v === "loi") return c.json({ error: "INVALID" }, 400);
  const ghiChu = chuoi(body.ghi_chu);
  const user = c.get("user") as AppUser;
  const luc = nowVN();
  const cu = await c.env.DB.prepare(`SELECT ${loai === "hd" ? "xuat_hoa_don" : "con_bao_hanh"} AS v FROM case_hd_bh WHERE case_id = ?`).bind(id).first<{ v: number | null }>();
  await c.env.DB.batch([
    loai === "hd" ? stmtHd(c.env.DB, id, v, user.email, luc, ghiChu) : stmtBh(c.env.DB, id, v, user.email, luc, ghiChu),
    stmtLog(c.env.DB, id, loai, cu?.v ?? null, v, ghiChu, "tay", user.email, luc),
  ]);
  c.executionCtx.waitUntil(bumpVersions(c.env.DB, ["hd_bh"]));
  return c.json({ ok: true });
}
r.put("/ca/:id/hoa-don", (c) => suaHdBh(c, "hd"));
r.put("/ca/:id/bao-hanh", (c) => suaHdBh(c, "bh"));

// ---------- Bảng theo dõi ----------
r.get("/doanh-thu", async (c) => {
  if (!canModule(c)) return c.json({ error: "FORBIDDEN" }, 403);
  const sc = khuVucWhereClause(scopeByKhuVuc(c), "c.khu_vuc");
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.khach_hang, c.khu_vuc, c.ky_thuat_vien, c.hang, c.loai_yeu_cau, c.tien_do_hoan_thanh,
            c.thoi_gian_cskh_tiep_nhan, c.thoi_gian_hoan_thanh,
            c.dt_san_pham, c.dt_linh_kien, c.dt_dich_vu, c.dt_san_pham_crm, c.dt_linh_kien_crm, c.dt_dich_vu_crm,
            c.dt_sua_at, c.dt_sua_by, c.dt_sua_ly_do,
            (SELECT COALESCE(u.ten, u.email) FROM users u WHERE u.email = c.dt_sua_by) AS dt_sua_ten
     FROM case_hieu_luc c WHERE c.dt_sua_at IS NOT NULL${sc.sql}
     ORDER BY c.dt_sua_at DESC LIMIT 5000`,
  )
    .bind(...sc.binds)
    .all();
  return c.json({ rows: results, duocSua: coVaiTroSua(c) });
});

r.get("/hoa-don", async (c) => {
  if (!canModule(c)) return c.json({ error: "FORBIDDEN" }, 403);
  const scope = scopeByKhuVuc(c);
  const sc = khuVucWhereClause(scope, "c.khu_vuc");
  const db = c.env.DB;
  // Đơn chưa khớp ca (case_id = '') chỉ người xem toàn bộ mới thấy.
  const [don, tay, tt] = await db.batch([
    db.prepare(
      `SELECT d.don_id, d.case_id, d.ma_ca_tren_don, d.ma_lada, d.pxk_id, d.ma_misa, d.chot_ke_toan_luc, d.trang_thai_pxk, d.trang_thai_don,
              d.da_huy, d.yeu_cau_hoa_don, d.ma_lk, d.ten_lk, d.so_luong, d.loai_de_xuat, d.nguoi_nhan_hang, d.dong_bo_luc,
              c.khach_hang, c.khu_vuc, c.ky_thuat_vien, c.thoi_gian_hoan_thanh,
              c.dt_san_pham, c.dt_linh_kien, c.dt_dich_vu, h.xuat_hoa_don AS hd_tay, h.hd_sua_by, h.hd_sua_at
       FROM don_hoa_don_lk d
       LEFT JOIN case_dvbh c ON c.id = d.case_id
       LEFT JOIN case_hd_bh h ON h.case_id = d.case_id
       WHERE ${scope === null ? "1=1" : "c.id IS NOT NULL"}${sc.sql}
       ORDER BY d.chot_ke_toan_luc DESC LIMIT 5000`,
    ).bind(...sc.binds),
    db.prepare(
      `SELECT h.case_id, h.xuat_hoa_don AS hd_tay, h.hd_sua_by, h.hd_sua_at, h.ghi_chu,
              c.khach_hang, c.khu_vuc, c.ky_thuat_vien, c.thoi_gian_hoan_thanh, c.dt_san_pham, c.dt_linh_kien, c.dt_dich_vu
       FROM case_hd_bh h JOIN case_dvbh c ON c.id = h.case_id
       WHERE h.xuat_hoa_don IS NOT NULL AND NOT EXISTS (SELECT 1 FROM don_hoa_don_lk d WHERE d.case_id = h.case_id)${sc.sql}
       ORDER BY h.hd_sua_at DESC LIMIT 5000`,
    ).bind(...sc.binds),
    db.prepare("SELECT gia_tri, updated_at FROM cai_dat_he_thong WHERE khoa = 'don_hoa_don_dong_bo'"),
  ]);
  const dongBo = tt.results[0] as { gia_tri: string; updated_at: string } | undefined;
  return c.json({ don: don.results, tay: tay.results, dongBo: dongBo ? { ...JSON.parse(dongBo.gia_tri), luc: dongBo.updated_at } : null, duocSua: coVaiTroSua(c) });
});

r.post("/hoa-don/dong-bo", async (c) => {
  if (!canModule(c) || !coVaiTroSua(c)) return c.json({ error: "FORBIDDEN" }, 403);
  try {
    return c.json({ ok: true, ...(await keoDonHoaDon(c.env)) });
  } catch (e) {
    const message = e instanceof LoiKeoHoaDon ? e.message : `Lỗi đồng bộ: ${String(e).slice(0, 200)}`;
    return c.json({ error: "DONG_BO_LOI", message }, 502);
  }
});

r.get("/bao-hanh", async (c) => {
  if (!canModule(c)) return c.json({ error: "FORBIDDEN" }, 403);
  const thang = c.req.query("thang") ?? "";
  if (!/^\d{4}-\d{2}$/.test(thang) || `${thang}-01` < HAN_BH_TU_NGAY) {
    return c.json({ error: "INVALID_THANG", message: `Chỉ tính hạn bảo hành cho ca tiếp nhận từ ${HAN_BH_TU_NGAY}.` }, 400);
  }
  const sc = khuVucWhereClause(scopeByKhuVuc(c), "c.khu_vuc");
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.khach_hang, c.khu_vuc, c.ky_thuat_vien, c.hang, c.san_pham_bao_hanh, c.seri_san_pham, c.loai_yeu_cau, c.hinh_thuc_bao_hanh,
            c.tien_do_hoan_thanh, c.thoi_gian_cskh_tiep_nhan, c.thoi_gian_hoan_thanh, c.ngay_mua, c.ngay_san_xuat,
            h.con_bao_hanh AS bh_tay, h.bh_sua_by, h.bh_sua_at
     FROM case_hieu_luc c LEFT JOIN case_hd_bh h ON h.case_id = c.id
     WHERE c.thoi_gian_cskh_tiep_nhan >= ? || '-01' AND c.thoi_gian_cskh_tiep_nhan < date(? || '-01', '+1 month')${sc.sql}
     ORDER BY c.thoi_gian_cskh_tiep_nhan DESC`,
  )
    .bind(thang, thang, ...sc.binds)
    .all<Record<string, unknown> & { ngay_mua: string | null; ngay_san_xuat: string | null; thoi_gian_cskh_tiep_nhan: string | null; bh_tay: number | null }>();
  const rows = results.map((x) => {
    const k = tinhHanBaoHanh(x.ngay_mua, x.ngay_san_xuat, x.thoi_gian_cskh_tiep_nhan);
    return { ...x, han_bh: k.han, han_theo: k.theo, bh_tu_dong: k.tu_dong, bh_cuoi: trangThaiBhCuoi(x.bh_tay, k.tu_dong) };
  });
  return c.json({ rows, duocSua: coVaiTroSua(c) });
});

// ---------- Import Excel ----------
function parseHd(v: unknown): 1 | 0 | null | undefined | "loi" {
  if (v === undefined) return undefined;
  const s = String(v ?? "").trim().toLowerCase().normalize("NFC");
  if (!s) return undefined;
  if (["1", "có", "co", "x", "yes", "y", "true", "có xuất", "xuất"].includes(s)) return 1;
  if (["0", "không", "khong", "no", "n", "false", "không xuất"].includes(s)) return 0;
  if (["tự động", "tu dong", "auto", "xoá", "xóa"].includes(s)) return null;
  return "loi";
}
function parseBh(v: unknown): 1 | 0 | null | undefined | "loi" {
  if (v === undefined) return undefined;
  const s = String(v ?? "").trim().toLowerCase().normalize("NFC");
  if (!s) return undefined;
  if (["1", "còn", "con", "còn bảo hành", "còn hạn", "còn hạn bảo hành", "trong bảo hành"].includes(s)) return 1;
  if (["0", "hết", "het", "hết bảo hành", "hết hạn", "hết hạn bảo hành", "ngoài bảo hành"].includes(s)) return 0;
  if (["tự động", "tu dong", "auto", "xoá", "xóa"].includes(s)) return null;
  return "loi";
}

r.post("/import", async (c) => {
  if (!canModule(c) || !coVaiTroSua(c)) return c.json({ error: "FORBIDDEN" }, 403);
  const commit = c.req.query("commit") === "1";
  const body = await c.req.json<{ rows?: Record<string, unknown>[] }>().catch(() => null);
  if (!body || !Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  if (body.rows.length > IMPORT_TOI_DA) return c.json({ error: "TOO_MANY_ROWS", message: `Tối đa ${IMPORT_TOI_DA} dòng / lần.` }, 400);

  const loi: string[] = [];
  const theoId = new Map<string, { dong: number; raw: Record<string, unknown> }>();
  body.rows.forEach((raw, i) => {
    const id = String(raw?.id ?? "").trim();
    if (!id) loi.push(`Dòng ${i + 2}: thiếu ID ca`);
    else theoId.set(id, { dong: i + 2, raw });
  });
  const ids = [...theoId.keys()];
  const db = c.env.DB;
  const caMap = new Map<string, CaGoc>();
  const hdBhMap = new Map<string, { xuat_hoa_don: number | null; con_bao_hanh: number | null }>();
  for (let i = 0; i < ids.length; i += 500) {
    const j = JSON.stringify(ids.slice(i, i + 500));
    const [a, b] = await db.batch([
      db.prepare("SELECT id, khu_vuc, dt_san_pham, dt_linh_kien, dt_dich_vu, dt_sua_at FROM case_dvbh WHERE id IN (SELECT value FROM json_each(?))").bind(j),
      db.prepare("SELECT case_id, xuat_hoa_don, con_bao_hanh FROM case_hd_bh WHERE case_id IN (SELECT value FROM json_each(?))").bind(j),
    ]);
    for (const x of a.results as unknown as CaGoc[]) caMap.set(x.id, x);
    for (const x of b.results as { case_id: string; xuat_hoa_don: number | null; con_bao_hanh: number | null }[]) hdBhMap.set(x.case_id, x);
  }

  const user = c.get("user") as AppUser;
  const luc = nowVN();
  const stmts: D1PreparedStatement[] = [];
  const dem = { doanh_thu: 0, hoa_don: 0, bao_hanh: 0, khong_doi: 0, khong_tim_thay: 0, khong_quyen: 0, loi: 0 };
  const mau: unknown[] = [];
  for (const [id, { dong, raw }] of theoId) {
    const ca = caMap.get(id);
    if (!ca) {
      dem.khong_tim_thay++;
      if (loi.length < 200) loi.push(`Dòng ${dong}: không tìm thấy ca ${id}`);
      continue;
    }
    if (!duocSua(c, ca.khu_vuc)) {
      dem.khong_quyen++;
      if (loi.length < 200) loi.push(`Dòng ${dong}: không có quyền sửa ca ${id} (khu vực ${ca.khu_vuc ?? "—"})`);
      continue;
    }
    const coDt = ["dt_san_pham", "dt_linh_kien", "dt_dich_vu"].some((k) => raw[k] !== undefined && String(raw[k] ?? "").trim() !== "");
    const dtVao = ["dt_san_pham", "dt_linh_kien", "dt_dich_vu"].map((k) => (raw[k] === undefined || String(raw[k] ?? "").trim() === "" ? undefined : soTien(raw[k])));
    const hd = parseHd(raw.xuat_hoa_don);
    const bh = parseBh(raw.con_bao_hanh);
    if (dtVao.includes("loi") || hd === "loi" || bh === "loi") {
      dem.loi++;
      if (loi.length < 200) loi.push(`Dòng ${dong}: giá trị không hợp lệ (doanh thu phải là số ≥ 0; Xuất HĐ: Có/Không; Bảo hành: Còn/Hết)`);
      continue;
    }
    const lyDo = chuoi(raw.ly_do) ?? "Import Excel";
    let doi = false;
    if (coDt) {
      const cu: [number | null, number | null, number | null] = [ca.dt_san_pham, ca.dt_linh_kien, ca.dt_dich_vu];
      const moi = dtVao.map((v, k) => (v === undefined ? cu[k] : (v as number | null))) as [number | null, number | null, number | null];
      if (moi.some((v, k) => (v ?? 0) !== (cu[k] ?? 0)) || !ca.dt_sua_at) {
        dem.doanh_thu++;
        doi = true;
        if (mau.length < 50) mau.push({ id, loai: "dt", cu, moi });
        stmts.push(stmtSuaDt(db, id, moi, lyDo, user.email, luc), stmtLog(db, id, "dt", cu, moi, lyDo, "excel", user.email, luc));
      }
    }
    const hb = hdBhMap.get(id);
    if (hd !== undefined && (hb?.xuat_hoa_don ?? null) !== hd) {
      dem.hoa_don++;
      doi = true;
      if (mau.length < 50) mau.push({ id, loai: "hd", cu: hb?.xuat_hoa_don ?? null, moi: hd });
      stmts.push(stmtHd(db, id, hd, user.email, luc, null), stmtLog(db, id, "hd", hb?.xuat_hoa_don ?? null, hd, lyDo, "excel", user.email, luc));
    }
    if (bh !== undefined && (hb?.con_bao_hanh ?? null) !== bh) {
      dem.bao_hanh++;
      doi = true;
      if (mau.length < 50) mau.push({ id, loai: "bh", cu: hb?.con_bao_hanh ?? null, moi: bh });
      stmts.push(stmtBh(db, id, bh, user.email, luc, null), stmtLog(db, id, "bh", hb?.con_bao_hanh ?? null, bh, lyDo, "excel", user.email, luc));
    }
    if (!doi) dem.khong_doi++;
  }

  if (commit && stmts.length) {
    for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
    const domains: DataDomain[] = [];
    if (dem.doanh_thu) domains.push("cases");
    if (dem.hoa_don || dem.bao_hanh) domains.push("hd_bh");
    if (domains.length) c.executionCtx.waitUntil(bumpVersions(db, domains));
  }
  return c.json({ commit, ...dem, loi, mau });
});

export default r;
