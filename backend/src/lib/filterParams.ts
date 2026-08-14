import type { Context } from "hono";
import type { Env } from "../types";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";

export const QLDVBH_FILTER_VALUE = "__QLDVBH__";
export const CURRENT_MONTH_VALUE = "CURRENT";

/**
 * CHOT 2026-08-01 (chu he thong xac nhan): 2 khu_vuc nay bi AN KHOI MOI he thong bao cao/thong ke
 * (Tong quat, Doanh thu, Quan ly ton, Ca lap, Danh gia nap gas, Khao sat, Tranh chap, Ca thieu linh
 * kien - ke ca dropdown loc khu_vuc dung chung) - CHI con hien trong "Danh sach tong" (route
 * /cases/tong-hop, KHONG ap dung khuVucReportExclusionClause() o do). Khong phai xoa du lieu, chi an
 * khoi thong ke/bao cao - "(teamkdbl.krf) Kinh doanh ban le KRF" va "Quan ly DMX CSKH" la 2 don vi
 * kinh doanh KHAC, khong thuoc luong "giai trinh ton" DVBH ma Quan ly ton/cac bao cao con lai theo
 * doi. KHONG dung o: route /cases/tong-hop, cac route chi tiet/sua 1 case theo id, va cac duong ghi
 * (import) - xem chi tiet tung diem ap dung o filterParams.ts va cac file dung ham nay.
 */
// CHOT 2026-08-13: them "Bản nháp đẩy lên drive truy vấn NSKX" - gia tri khu_vuc rac (khong phai don
// vi kinh doanh that, chi la nhan/ghi chu lot vao du lieu CRM) chu he thong yeu cau an khoi danh sach
// loc khu vuc - ap dung CHUNG co che voi 2 gia tri cu (an khoi bao cao, KHONG xoa du lieu, van hien o
// "Danh sach tong").
export const KHU_VUC_AN_KHOI_BAO_CAO = ["(teamkdbl.krf) Kinh doanh bán lẻ KRF", "Quản lý ĐMX CSKH", "Bản nháp đẩy lên drive truy vấn NSKX"];

/** Doan " AND <column> NOT IN (...)" + bind - ghep vao CUOI (hoac bat ky vi tri nao trong) 1 WHERE da
 * co san cua cac truy van bao cao/thong ke doc case_dvbh. AN TOAN de ghep vao outer WHERE cua truy van
 * co latestGiaiTrinhJoin()/missingPartsJoin() (khac voi dieu kien "ton theo moc 08:00" o needGiaiTrinh.ts
 * PHAI khop voi join - dieu kien nay chi THU HEP outer WHERE, khong lam no rong hon join scope, nen
 * khong pha vo tinh chat "superset" cua join). */
export function khuVucReportExclusionClause(column = "khu_vuc"): { sql: string; binds: string[] } {
  const placeholders = KHU_VUC_AN_KHOI_BAO_CAO.map(() => "?").join(", ");
  return { sql: ` AND ${column} NOT IN (${placeholders})`, binds: [...KHU_VUC_AN_KHOI_BAO_CAO] };
}

/**
 * Doc khu_vuc (ke ca gia tri ao __QLDVBH__ - gop tat ca khu vuc co chua "qldvbh")
 * va thang (thang xu ly, dua theo thoi_gian_hoan_thanh) tu query string, tra ve
 * mot doan WHERE + bind dung chung cho dashboard.ts/revenue.ts.
 *
 * prefix vd: "" khi case_dvbh khong alias, "c." khi alias la c.
 */
export function parseFilterParams(c: Context<{ Bindings: Env }>, prefix = "") {
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, `${prefix}khu_vuc`);
  const binds: unknown[] = [...scopeClause.binds];
  let sql = ` AND ${prefix}archived_at IS NULL${scopeClause.sql}`;

  const khuVucClause = khuVucAdHocClause(`${prefix}khu_vuc`, c.req.query("khu_vuc"));
  sql += khuVucClause.sql;
  binds.push(...khuVucClause.binds);

  const exclusionClause = khuVucReportExclusionClause(`${prefix}khu_vuc`);
  sql += exclusionClause.sql;
  binds.push(...exclusionClause.binds);

  const hang = c.req.query("hang");
  if (hang) {
    sql += ` AND ${prefix}hang = ?`;
    binds.push(hang);
  }

  // Doi strftime('%Y-%m', cot) = ... sang dang RANGE (>=, <) de planner dung duoc index tren
  // thoi_gian_hoan_thanh thay vi phai quet toan bo case_dvbh (strftime la expression tren cot nen
  // khong dung duoc index - xem migration 0007 idx_case_hoan_thanh_not_null va migration 0001
  // idx_case_ton). So sanh chuoi ISO 'YYYY-MM-DD HH:MM:SS' >= 'YYYY-MM-01' va < 'YYYY-MM-01' (thang
  // ke tiep) tuong duong so thang, giu nguyen ngu nghia. 'now' trong SQLite la UTC nen range cung
  // tinh theo UTC, khop voi ban goc strftime('%Y-%m','now').
  // Chot 2026-07-24: BAT BUOC luon gioi han theo 1 thang - "thang" rong/thieu mac dinh ve
  // CURRENT_MONTH_VALUE, khong con nhanh "khong chon = toan thoi gian".
  const thang = c.req.query("thang") || CURRENT_MONTH_VALUE;
  if (thang === CURRENT_MONTH_VALUE) {
    sql += ` AND ((${prefix}thoi_gian_hoan_thanh >= date('now','start of month') AND ${prefix}thoi_gian_hoan_thanh < date('now','start of month','+1 month')) OR ${prefix}thoi_gian_hoan_thanh IS NULL)`;
  } else {
    sql += ` AND ${prefix}thoi_gian_hoan_thanh >= ? || '-01' AND ${prefix}thoi_gian_hoan_thanh < date(? || '-01', '+1 month')`;
    binds.push(thang, thang);
  }

  return { sql, binds };
}

/**
 * Ad-hoc khu_vuc filter (nguoi dung tu chon tren UI, khac voi scopeByKhuVuc la pham vi duoc PHEP
 * xem theo vai tro - 2 tang loc doc lap, luon AND lai voi nhau nen KHONG the dung ad-hoc filter de
 * "mo rong" ra ngoai pham vi da bi scopeByKhuVuc gioi han). Ho tro ca gia tri ao __QLDVBH__, va
 * NHIEU khu vuc cung luc (nguoi dung phu trach nhieu khu vuc, chon 1 phan trong so do - xem
 * KhuVucFilterControl.tsx o frontend) - cac gia tri phan cach boi dau phay, vd "Ha Noi,Da Nang".
 * Dung cho cac route khong dung chung whole-clause shape cua parseFilterParams (cases.ts,
 * missingParts.ts, survey.ts, caLap.ts - moi route co WHERE goc khac nhau, chi can rieng doan
 * khu_vuc nay).
 */
export function khuVucAdHocClause(column: string, khuVucFilter: string | undefined): { sql: string; binds: unknown[] } {
  if (!khuVucFilter) return { sql: "", binds: [] };
  if (khuVucFilter === QLDVBH_FILTER_VALUE) return { sql: ` AND ${column} LIKE '%qldvbh%'`, binds: [] };
  const values = khuVucFilter
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (values.length === 0) return { sql: "", binds: [] };
  if (values.length === 1) return { sql: ` AND ${column} = ?`, binds: values };
  const placeholders = values.map(() => "?").join(", ");
  return { sql: ` AND ${column} IN (${placeholders})`, binds: values };
}

/**
 * Cac cot duoc phep dung lam "nhom theo" trong cac bao cao dang GROUP BY 1 chieu tuy chon
 * (missingParts.ts /by-khu-vuc, cases.ts /backlog-by-khu-vuc) - whitelist chong SQL injection ten
 * cot (khong the bind ten cot nhu gia tri thuong). Gia tri la ten cot THUAN (khong alias) - noi
 * goi tu ghep them alias bang (vd "c.") neu can.
 */
export const REPORT_DIMS: Record<string, string> = {
  khu_vuc: "khu_vuc",
  tinh: "tinh",
  doi_tac: "doi_tac",
  hang: "hang",
  nhom_san_pham: "nhom_san_pham",
  nhom_kh: "nhom_kh",
  nganh: "nganh",
};

/**
 * Ad-hoc filter cho dim KHAC khu_vuc (khu_vuc da co rieng khuVucAdHocClause voi ho tro gia tri ao
 * __QLDVBH__) - dung khi drill-down tu 1 dong bao cao duoc nhom theo dim khac. "column" da bao gom
 * alias neu can (vd "c.hang").
 */
export function dimAdHocClause(column: string, dimKey: string | undefined, value: string | undefined): { sql: string; binds: unknown[] } {
  if (!dimKey || !value || dimKey === "khu_vuc" || !(dimKey in REPORT_DIMS)) return { sql: "", binds: [] };
  return { sql: ` AND ${column} = ?`, binds: [value] };
}

/**
 * Bo loc chung cho ca the "Bao cao ton can giai trinh" (BacklogModule) - ap dung DONG THOI nhieu
 * dim cung luc (khac dimAdHocClause chi loc 1 dim tai 1 thoi diem, dung cho drill-down tu 1 dong
 * bao cao). Doc tat ca REPORT_DIMS TRU khu_vuc (khu_vuc da co rieng khuVucAdHocClause voi ho tro gia
 * tri ao __QLDVBH__, khong lap lai o day) tu query string, AND lai nhung dim nao co gia tri.
 */
export function sharedReportFilters(c: Context<{ Bindings: Env }>, prefix = ""): { sql: string; binds: unknown[] } {
  let sql = "";
  const binds: unknown[] = [];
  for (const [dimKey, col] of Object.entries(REPORT_DIMS)) {
    if (dimKey === "khu_vuc") continue;
    const value = c.req.query(dimKey);
    if (value) {
      sql += ` AND ${prefix}${col} = ?`;
      binds.push(value);
    }
  }
  return { sql, binds };
}
