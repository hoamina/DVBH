/**
 * Gửi bảo hành theo ca (2026-11-18, chủ hệ thống) - Quản lý tồn > Danh sách chi tiết thêm 6 cột: hạn bảo hành, số LK Odoo báo gửi BH,
 * số LK thực tế đã gửi (app suachua), trạng thái đổi trả BH thấp nhất + diễn giải, tốc độ tồn đổi trả.
 *
 * Nguồn suachua: KHÔNG kéo riêng. suachua tính tóm tắt theo ca (repo gui-bao-hanh-linh-kien lib/tomTatCa.ts) và gửi kèm field "ca"
 * trong POST /api/partner/sync/sua-chua-trang-thai sẵn có (cron 15 phút, chỉ ca có thay đổi) -> bảng gui_bh_ca (migration 0176),
 * dùng chung cho mọi màn cần. Server chỉ lưu số thô; nhãn / diễn giải / số ngày / hạn BH tính trên máy người dùng
 * (frontend lib/guiBhCa.ts + lib/hanBaoHanh.ts). Biểu thức SQL dưới đây chỉ dùng khi LỌC / SẮP XẾP cột (lib/locCot.ts COT_LOC).
 */
import { ageExpr } from "./ageCalc";
import { HAN_BH_TU_NGAY, THANG_THEO_NGAY_MUA, THANG_THEO_NGAY_SX } from "./hanBaoHanh";

export interface TomTatGuiBhCa {
  case_id: string;
  xoa?: boolean;
  so_lk?: number;
  gd?: Record<string, number>;
  gd_thap_nhat?: string;
  ngay_gui_cuoi?: string | null;
  hoan_tat?: number;
  xu_ly_max_ngay?: number | null;
  thoi_diem: string;
}

/** Ghi các ca suachua gửi sang. Bỏ bản tin cũ đến muộn (cap_nhat_nguon > thoi_diem). Trả số dòng đã ghi / xoá. */
export async function ghiTomTatGuiBhCa(db: D1Database, ca: TomTatGuiBhCa[], now: string): Promise<{ ghi: number; xoa: number; loi: number }> {
  const stmts: D1PreparedStatement[] = [];
  const laXoa: boolean[] = [];
  let loi = 0;
  for (const t of ca) {
    const id = typeof t?.case_id === "string" ? t.case_id.trim() : "";
    if (!id || id.length > 64 || typeof t.thoi_diem !== "string" || !t.thoi_diem) {
      loi++;
      continue;
    }
    if (t.xoa) {
      stmts.push(db.prepare("DELETE FROM gui_bh_ca WHERE case_id = ? AND cap_nhat_nguon <= ?").bind(id, t.thoi_diem));
      laXoa.push(true);
      continue;
    }
    const gd = t.gd && typeof t.gd === "object" ? JSON.stringify(t.gd) : null;
    if (!gd || typeof t.gd_thap_nhat !== "string" || !Number.isFinite(Number(t.so_lk))) {
      loi++;
      continue;
    }
    const xuLy = t.xu_ly_max_ngay == null || !Number.isFinite(Number(t.xu_ly_max_ngay)) ? null : Number(t.xu_ly_max_ngay);
    stmts.push(
      db
        .prepare(
          `INSERT INTO gui_bh_ca (case_id, so_lk, gd_json, gd_thap_nhat, ngay_gui_cuoi, hoan_tat, xu_ly_max_ngay, cap_nhat_nguon, nhan_luc)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(case_id) DO UPDATE SET so_lk = excluded.so_lk, gd_json = excluded.gd_json, gd_thap_nhat = excluded.gd_thap_nhat,
             ngay_gui_cuoi = excluded.ngay_gui_cuoi, hoan_tat = excluded.hoan_tat, xu_ly_max_ngay = excluded.xu_ly_max_ngay,
             cap_nhat_nguon = excluded.cap_nhat_nguon, nhan_luc = excluded.nhan_luc
           WHERE gui_bh_ca.cap_nhat_nguon <= excluded.cap_nhat_nguon`,
        )
        .bind(id, Math.round(Number(t.so_lk)), gd, t.gd_thap_nhat.slice(0, 64), t.ngay_gui_cuoi ?? null, t.hoan_tat ? 1 : 0, xuLy, t.thoi_diem, now),
    );
    laXoa.push(false);
  }
  if (!stmts.length) return { ghi: 0, xoa: 0, loi };
  const res = await db.batch(stmts);
  let ghi = 0;
  let xoa = 0;
  res.forEach((r, i) => {
    const n = r.meta?.changes ?? 0;
    if (laXoa[i]) xoa += n;
    else ghi += n;
  });
  return { ghi, xoa, loi };
}

// ---- Biểu thức SQL cho lọc / sắp xếp (alias c = case) ----

const gbh = (cot: string) => `(SELECT g.${cot} FROM gui_bh_ca g WHERE g.case_id = c.id)`;

/** Số LK Odoo báo gửi BH = tổng số lượng các đơn bảo hành Odoo của ca (bỏ đơn huỷ / từ chối / đã lưu trữ). */
export const SO_LK_ODOO_BH_EXPR = `(SELECT SUM(COALESCE(d.so_luong, 1)) FROM don_bao_hanh_odoo d
  WHERE d.case_id = c.id AND d.con_hieu_luc = 1 AND COALESCE(d.trang_thai, '') NOT IN ('cancelled', 'rejected'))`;

export const GUI_BH_SO_LK_EXPR = gbh("so_lk");
export const GUI_BH_TRANG_THAI_EXPR = gbh("gd_thap_nhat");
/** Tốc độ tồn đổi trả (ngày): xong hết -> thời gian xử lý lâu nhất; chưa xong -> 0h hôm nay - lần gửi xe cuối (giống tuổi tồn). */
export const GUI_BH_TON_NGAY_EXPR = `(SELECT CASE WHEN g.hoan_tat = 1 THEN g.xu_ly_max_ngay
  WHEN g.ngay_gui_cuoi IS NOT NULL THEN ${ageExpr("g.ngay_gui_cuoi")} END FROM gui_bh_ca g WHERE g.case_id = c.id)`;

// Hạn BH (bản SQL của lib/hanBaoHanh.ts, chỉ để lọc / sắp xếp; hiển thị tính trên máy người dùng). Cộng n tháng: ngày vượt cuối
// tháng lùi về ngày cuối tháng như congThang().
const congThangSql = (x: string, n: number) =>
  `(CASE WHEN strftime('%d', date(${x}, '+${n} months')) = strftime('%d', ${x}) THEN date(${x}, '+${n} months')
     ELSE date(${x}, 'start of month', '+${n + 1} months', '-1 day') END)`;
const ngaySql = (cot: string) => `(CASE WHEN ${cot} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*' THEN substr(${cot}, 1, 10) END)`;
const HAN_MUA = congThangSql(ngaySql("c.ngay_mua"), THANG_THEO_NGAY_MUA);
const HAN_SX = congThangSql(ngaySql("c.ngay_san_xuat"), THANG_THEO_NGAY_SX);
const HAN = `(CASE WHEN ${HAN_MUA} IS NOT NULL AND (${HAN_SX} IS NULL OR ${HAN_MUA} <= ${HAN_SX}) THEN ${HAN_MUA} ELSE ${HAN_SX} END)`;
const TN = "substr(c.thoi_gian_cskh_tiep_nhan, 1, 10)";
/** 'con' | 'het' | 'khong_ro' | 'khong_ap_dung' - giá trị sửa tay (case_hd_bh.con_bao_hanh) thắng. */
export const HAN_BH_EXPR = `(CASE (SELECT h.con_bao_hanh FROM case_hd_bh h WHERE h.case_id = c.id)
  WHEN 1 THEN 'con' WHEN 0 THEN 'het'
  ELSE (CASE WHEN c.thoi_gian_cskh_tiep_nhan IS NULL OR ${TN} < '${HAN_BH_TU_NGAY}' THEN 'khong_ap_dung'
             WHEN ${HAN} IS NULL THEN 'khong_ro' WHEN ${TN} > ${HAN} THEN 'het' ELSE 'con' END) END)`;

/** Số liệu hiển thị cho đúng các ca của trang (theo khoá chính, 1 lượt db.batch) - ghép vào dòng ở cases.ts layDuCotCa. */
export async function layGuiBhTheoCa(db: D1Database, ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  if (!ids.length) return out;
  const json = JSON.stringify(ids);
  const [g, o, h] = await db.batch([
    db.prepare(
      `SELECT case_id, so_lk AS gui_bh_so_lk, gd_json AS gui_bh_gd_json, gd_thap_nhat AS gui_bh_trang_thai, ngay_gui_cuoi AS gui_bh_ngay_gui_cuoi,
              hoan_tat AS gui_bh_hoan_tat, xu_ly_max_ngay AS gui_bh_xu_ly_max_ngay, cap_nhat_nguon AS gui_bh_cap_nhat
       FROM gui_bh_ca WHERE case_id IN (SELECT value FROM json_each(?))`,
    ).bind(json),
    db.prepare(
      `SELECT d.case_id, SUM(COALESCE(d.so_luong, 1)) AS so_lk_odoo_bh FROM don_bao_hanh_odoo d
       WHERE d.case_id IN (SELECT value FROM json_each(?)) AND d.con_hieu_luc = 1 AND COALESCE(d.trang_thai, '') NOT IN ('cancelled', 'rejected')
       GROUP BY d.case_id`,
    ).bind(json),
    db.prepare("SELECT case_id, con_bao_hanh AS han_bh_tay FROM case_hd_bh WHERE case_id IN (SELECT value FROM json_each(?)) AND con_bao_hanh IS NOT NULL").bind(json),
  ]);
  for (const res of [g, o, h]) {
    for (const r of (res.results ?? []) as Record<string, unknown>[]) {
      const { case_id, ...rest } = r;
      const k = String(case_id);
      out.set(k, { ...(out.get(k) ?? {}), ...rest });
    }
  }
  return out;
}
