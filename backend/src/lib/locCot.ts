/**
 * Loc + sap xep "kieu Excel" tren tieu de cot cua "Danh sach chi tiet" (Quan ly ton) - 2026-11-10, yeu cau chu he thong.
 * Bang phan trang phia server nen MOI bo loc cot di len server qua 1 tham so JSON "loc_cot" = { [cot]: LocCot }:
 *   { in: string[] }        chon 1/nhieu gia tri ("__TRONG__" = rong/NULL)
 *   { q: string }           chua tu khoa (khong phan biet dau / hoa thuong)
 *   { tu?: string; den?: string }  khoang ngay (YYYY-MM-DD, gom 2 dau) hoac khoang so
 *   { dg: string }          (rieng cot tinh) chuoi dg_loc cua lib/filterParams.ts diaGioiLoc - dia gioi cu/moi
 * Ten cot BAT BUOC nam trong whitelist COT_LOC (bieu thuc SQL noi thang vao cau), gia tri luon bind (json_each -> 1 bind/cot,
 * khong vuot gioi han 100 bind cua D1). "nhom_ton" / "cap_ton" la 2 cot dac biet (xem locCotClause).
 */
import { ageExpr } from "./ageCalc";
import { NEED_GIAI_TRINH_CATEGORIES } from "./needGiaiTrinh";
import { CASE_TRANH_CHAP_STATUS_EXPR, LATEST_TIEN_TRINH_ID_OF_CASE, TRANH_CHAP_TRANG_THAI_DONG } from "./tranhChapTienTrinh";
import { diaGioiLoc } from "./filterParams";

export const GIA_TRI_TRONG = "__TRONG__";

type Kieu = "list" | "text" | "date" | "number";

const tranhChapDongList = TRANH_CHAP_TRANG_THAI_DONG.map((s) => `'${s}'`).join(", ");
const latestTienTrinhNgayTaoExpr = `(SELECT tt.ngay_tao FROM tranh_chap_tien_trinh tt WHERE tt.id = ${LATEST_TIEN_TRINH_ID_OF_CASE})`;
export const TUOI_TC_EXPR = `(CASE WHEN ${CASE_TRANH_CHAP_STATUS_EXPR} NOT IN ('Chua xu ly', ${tranhChapDongList}) THEN ${ageExpr(latestTienTrinhNgayTaoExpr)} ELSE NULL END)`;

/** key cot (trung key cot o frontend BacklogModule) -> bieu thuc SQL (alias c = case, lg = giai trinh gan nhat) + kieu loc. */
export const COT_LOC: Record<string, { expr: string; kieu: Kieu }> = {
  id: { expr: "c.id", kieu: "text" },
  khach_hang: { expr: "c.khach_hang", kieu: "text" },
  ky_thuat_vien: { expr: "c.ky_thuat_vien", kieu: "list" },
  tiep_nhan: { expr: "c.thoi_gian_cskh_tiep_nhan", kieu: "date" },
  du_kien: { expr: "lg.ngay_du_kien_hoan_thanh", kieu: "date" },
  ly_do: { expr: "lg.ly_do_cham", kieu: "list" },
  last_tranh_chap_trang_thai: { expr: CASE_TRANH_CHAP_STATUS_EXPR, kieu: "list" },
  tranh_chap_so_ngay_ton: { expr: TUOI_TC_EXPR, kieu: "number" },
  tuoi_ton: { expr: ageExpr("c.thoi_gian_cskh_tiep_nhan"), kieu: "number" },
  khu_vuc: { expr: "c.khu_vuc", kieu: "list" },
  seri_san_pham: { expr: "c.seri_san_pham", kieu: "text" },
  hang: { expr: "c.hang", kieu: "list" },
  nhom_san_pham: { expr: "c.nhom_san_pham", kieu: "list" },
  nganh: { expr: "c.nganh", kieu: "list" },
  doi_tac: { expr: "c.doi_tac", kieu: "list" },
  nhom_kh: { expr: "c.nhom_kh", kieu: "list" },
  mo_ta_loi: { expr: "c.mo_ta_loi", kieu: "text" },
  thoi_gian_hen_xu_ly: { expr: "c.thoi_gian_hen_xu_ly", kieu: "date" },
  nhom_yeu_cau: { expr: "c.nhom_yeu_cau", kieu: "list" },
  loai_yeu_cau: { expr: "c.loai_yeu_cau", kieu: "list" },
  muc_do: { expr: "c.muc_do", kieu: "list" },
  hinh_thuc_bao_hanh: { expr: "c.hinh_thuc_bao_hanh", kieu: "list" },
  tien_do_hoan_thanh: { expr: "c.tien_do_hoan_thanh", kieu: "list" },
  noi_dung_xu_ly: { expr: "c.noi_dung_xu_ly", kieu: "text" },
  ly_do_ton_tranh_chap_gan_nhat: { expr: "c.ly_do_ton_tranh_chap_gan_nhat", kieu: "list" },
  dt_san_pham: { expr: "c.dt_san_pham", kieu: "number" },
  dt_linh_kien: { expr: "c.dt_linh_kien", kieu: "number" },
  dt_dich_vu: { expr: "c.dt_dich_vu", kieu: "number" },
  ngay_mua: { expr: "c.ngay_mua", kieu: "date" },
  ngay_san_xuat: { expr: "c.ngay_san_xuat", kieu: "date" },
  ghi_chu_loai_dv: { expr: "c.ghi_chu_loai_dv", kieu: "text" },
  last_ngay_giai_trinh: { expr: "lg.ngay_giai_trinh", kieu: "date" },
  last_noi_dung_giai_trinh: { expr: "lg.noi_dung", kieu: "text" },
  last_ma_linh_kien_thieu: { expr: "lg.linh_kien_thieu", kieu: "list" },
};

/** Cot "Nhom ton": gia tri = key need_* (khop NHOM_TON_BADGES frontend) -> dieu kien NEED_* tuong ung (OR). */
export const NHOM_TON_NEED: Record<string, string> = {
  need_lo_ke_hoach: NEED_GIAI_TRINH_CATEGORIES.lo_ke_hoach,
  need_tai_giai_trinh: NEED_GIAI_TRINH_CATEGORIES.tai_giai_trinh,
  need_chua_gt_3_ngay: NEED_GIAI_TRINH_CATEGORIES.chua_gt_3_ngay,
  need_chua_gt_5_ngay: NEED_GIAI_TRINH_CATEGORIES.chua_gt_5_ngay,
  need_dieu_hoa: NEED_GIAI_TRINH_CATEGORIES.dieu_hoa,
  need_b2b: NEED_GIAI_TRINH_CATEGORIES.b2b,
  need_nskx: NEED_GIAI_TRINH_CATEGORIES.nskx,
  need_loc_tong_bcn: NEED_GIAI_TRINH_CATEGORIES.loc_tong_bcn,
  need_vip_24h: NEED_GIAI_TRINH_CATEGORIES.vip_24h,
};

export interface LocCot {
  in?: unknown;
  q?: unknown;
  tu?: unknown;
  den?: unknown;
  dg?: unknown;
}

export function parseLocCot(raw: string | undefined): Record<string, LocCot> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, LocCot>) : {};
  } catch {
    return {};
  }
}

// Tim "chua tu khoa" khong phan biet dau: D1 gioi han do sau bieu thuc 100 nen KHONG bo dau bang chuoi REPLACE trong SQL duoc
// (da thu, loi "Expression tree is too large"). Route doc (id, gia tri cot) cua danh sach dang loc, so khop bang boDau() trong
// Worker roi loc lai theo tap id (qIds) - xem cases.ts GET "/".
export function boDau(v: string): string {
  return v
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

/** Dieu kien SQL cho toan bo bo loc cot (tru cot "boQua" - dung khi lay danh sach gia tri cua chinh cot do).
 * capTonIds: tap id ca Canh bao ton cap 1 / cap 2 hom nay (route lay san tu snapshot khi co loc "cap_ton"). */
export function locCotClause(
  loc: Record<string, LocCot>,
  boQua?: string,
  capTonIds?: Record<string, string[]>,
  /** Tap id khop tu khoa (khong dau) cua tung cot loc "q". undefined = bo qua moi loc "q" (buoc tinh qIds). */
  qIds?: Record<string, string[]>,
): { sql: string; binds: unknown[] } {
  let sql = "";
  const binds: unknown[] = [];
  for (const [cot, f] of Object.entries(loc)) {
    if (cot === boQua || !f || typeof f !== "object") continue;
    const arr = Array.isArray(f.in) ? f.in.map((x) => String(x ?? "")) : null;

    if (cot === "nhom_ton") {
      const dk = (arr ?? []).map((k) => NHOM_TON_NEED[k]).filter(Boolean);
      if (dk.length) sql += ` AND (${dk.map((d) => `(${d})`).join(" OR ")})`;
      continue;
    }
    if (cot === "cap_ton") {
      if (!arr?.length) continue;
      const ids = new Set<string>();
      for (const k of arr) for (const id of capTonIds?.[k] ?? []) ids.add(id);
      sql += " AND c.id IN (SELECT value FROM json_each(?))";
      binds.push(JSON.stringify([...ids]));
      continue;
    }
    if (cot === "tinh") {
      const dg = diaGioiLoc(typeof f.dg === "string" ? f.dg : undefined, "c.");
      sql += dg.sql;
      binds.push(...dg.binds);
      continue;
    }

    const def = COT_LOC[cot];
    if (!def) continue;
    if (arr && arr.length) {
      const coTrong = arr.includes(GIA_TRI_TRONG);
      const vals = arr.filter((v) => v !== GIA_TRI_TRONG);
      const phan: string[] = [];
      if (vals.length) {
        phan.push(`CAST(${def.expr} AS TEXT) IN (SELECT value FROM json_each(?))`);
        binds.push(JSON.stringify(vals));
      }
      if (coTrong) phan.push(`COALESCE(CAST(${def.expr} AS TEXT),'') = ''`);
      sql += ` AND (${phan.join(" OR ")})`;
    }
    if (typeof f.q === "string" && f.q.trim() && qIds) {
      sql += " AND c.id IN (SELECT value FROM json_each(?))";
      binds.push(JSON.stringify(qIds[cot] ?? []));
    }
    const tu = typeof f.tu === "string" || typeof f.tu === "number" ? String(f.tu).trim() : "";
    const den = typeof f.den === "string" || typeof f.den === "number" ? String(f.den).trim() : "";
    if (def.kieu === "date") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(tu)) {
        sql += ` AND substr(${def.expr},1,10) >= ?`;
        binds.push(tu);
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(den)) {
        sql += ` AND substr(${def.expr},1,10) <= ?`;
        binds.push(den);
      }
    } else if (def.kieu === "number") {
      if (tu !== "" && Number.isFinite(Number(tu))) {
        sql += ` AND ${def.expr} >= ?`;
        binds.push(Number(tu));
      }
      if (den !== "" && Number.isFinite(Number(den))) {
        sql += ` AND ${def.expr} <= ?`;
        binds.push(Number(den));
      }
    }
  }
  return { sql, binds };
}

export function coLocCot(loc: Record<string, LocCot>): boolean {
  return locCotClause(loc).sql !== "" || Object.values(loc).some((f) => typeof f?.q === "string" && f.q.trim() !== "") || Object.keys(loc).some((k) => k === "cap_ton" && Array.isArray(loc[k].in) && (loc[k].in as unknown[]).length > 0);
}
