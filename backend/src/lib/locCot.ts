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
import { MIEN_CA_SQL } from "./poHangVeMien";

export const GIA_TRI_TRONG = "__TRONG__";

export type Kieu = "list" | "text" | "date" | "number";

const tranhChapDongList = TRANH_CHAP_TRANG_THAI_DONG.map((s) => `'${s}'`).join(", ");
const latestTienTrinhNgayTaoExpr = `(SELECT tt.ngay_tao FROM tranh_chap_tien_trinh tt WHERE tt.id = ${LATEST_TIEN_TRINH_ID_OF_CASE})`;
const TUOI_TON_EXPR = ageExpr("c.thoi_gian_cskh_tiep_nhan");
export const KHOANG_TON_EXPR = `(CASE WHEN ${TUOI_TON_EXPR} IS NULL THEN NULL WHEN ${TUOI_TON_EXPR} < 1 THEN 'lt1' WHEN ${TUOI_TON_EXPR} < 3 THEN '1-3'
  WHEN ${TUOI_TON_EXPR} < 5 THEN '3-5' WHEN ${TUOI_TON_EXPR} < 7 THEN '5-7' WHEN ${TUOI_TON_EXPR} < 10 THEN '7-10'
  WHEN ${TUOI_TON_EXPR} < 14 THEN '10-14' ELSE 'gt14' END)`;
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
  // "ID đặt hàng gần nhất" (lib/donLkGanNhat.ts, 2026-11-12) - subquery theo khoa chinh, chi chay khi dang loc/sap xep cot nay.
  // Dieu kien "lg.linh_kien_thieu" de khop dung cai dang hien (frontend chi hien khi ca co ma LK thieu).
  ...Object.fromEntries(
    ([
      ["don_lk_id", "don_id", "text"],
      ["don_lk_trang_thai", "trang_thai", "list"],
      ["don_lk_ngay_dat", "ngay_dat", "date"],
      ["don_lk_ngay_duyet", "ngay_duyet", "date"],
      ["don_lk_ngay_xuat", "ngay_xuat", "date"],
    ] as const).map(([k, cot, kieu]) => [
      k,
      { expr: `(CASE WHEN COALESCE(lg.linh_kien_thieu, '') <> '' THEN (SELECT x.${cot} FROM don_lk_gan_nhat x WHERE x.case_id = c.id) END)`, kieu },
    ]),
  ),
  // 2026-11-14: them loc / sap xep cho cac cot con thieu cua Danh sach chi tiet.
  // 4 cot PO theo mien cua ca - bang tinh san po_hang_ve_mien (lib/poHangVeMien.ts), cung so voi cai dang hien.
  ...Object.fromEntries(
    ([
      ["ngay_hang_ve_du_kien_kv", "du_kien", "date"],
      ["so_lan_lui_dk", "so_lan_lui", "number"],
      ["ngay_ve_gan_nhat_kv", "ve_gan_nhat", "date"],
      ["ngay_nm_cam_ket", "nm_cam_ket", "date"],
    ] as const).map(([k, cot, kieu]) => [
      k,
      { expr: `(CASE WHEN COALESCE(lg.linh_kien_thieu, '') <> '' THEN (SELECT p.${cot} FROM po_hang_ve_mien p WHERE p.ma_lk = lg.linh_kien_thieu AND p.mien = ${MIEN_CA_SQL}) END)`, kieu },
    ]),
  ),
  // Ton kho MB/MN cua ma LK thieu (cung cach tinh /ton-kho-lk/tong-hop; ma khong co trong ton kho = 0).
  ...Object.fromEntries(
    (["MB", "MN"] as const).map((n) => [
      `ton_kho_${n.toLowerCase()}`,
      {
        expr: `(CASE WHEN COALESCE(lg.linh_kien_thieu, '') <> '' THEN COALESCE((SELECT SUM(t.cuoi_ky) FROM ton_kho_lk t JOIN ton_kho_nhom_kho n ON n.ma_kho = t.ma_kho WHERE t.ma_hang = lg.linh_kien_thieu AND n.nhom = '${n}'), 0) END)`,
        kieu: "number" as Kieu,
      },
    ]),
  ),
  last_ten_linh_kien_thieu: {
    expr: "(CASE WHEN COALESCE(lg.linh_kien_thieu, '') <> '' THEN COALESCE((SELECT lk.ten_linh_kien FROM linh_kien lk WHERE lk.ma_linh_kien = lg.linh_kien_thieu), lg.linh_kien_thieu) END)",
    kieu: "text",
  },
  // Khoang ton: gia tri = khoa dai (frontend KHOANG_TON_BUCKETS doi ra nhan); moc duoi >=, moc tren <.
  khoang_ton: { expr: KHOANG_TON_EXPR, kieu: "list" },
  quan_huyen: { expr: "c.quan_huyen", kieu: "list" },
  xa_moi: { expr: "c.xa_moi", kieu: "list" },
  link_crm: { expr: "c.link_crm", kieu: "text" },
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
  /** Bang cot rieng cua man khac (vd QL NSKX) - mac dinh COT_LOC cua Danh sach chi tiet. */
  cotMap: Record<string, { expr: string; kieu: Kieu }> = COT_LOC,
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

    const def = cotMap[cot];
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
