import type { Context } from "hono";
import type { Env } from "../types";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";

export const QLDVBH_FILTER_VALUE = "__QLDVBH__";
export const CURRENT_MONTH_VALUE = "CURRENT";

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

  const khuVuc = c.req.query("khu_vuc");
  if (khuVuc === QLDVBH_FILTER_VALUE) {
    sql += ` AND ${prefix}khu_vuc LIKE '%qldvbh%'`;
  } else if (khuVuc) {
    sql += ` AND ${prefix}khu_vuc = ?`;
    binds.push(khuVuc);
  }

  const hang = c.req.query("hang");
  if (hang) {
    sql += ` AND ${prefix}hang = ?`;
    binds.push(hang);
  }

  const thang = c.req.query("thang");
  if (thang === CURRENT_MONTH_VALUE) {
    sql += ` AND (strftime('%Y-%m', ${prefix}thoi_gian_hoan_thanh) = strftime('%Y-%m', 'now') OR ${prefix}thoi_gian_hoan_thanh IS NULL)`;
  } else if (thang) {
    sql += ` AND strftime('%Y-%m', ${prefix}thoi_gian_hoan_thanh) = ?`;
    binds.push(thang);
  }

  return { sql, binds };
}

/**
 * Ad-hoc khu_vuc filter (1 gia tri nguoi dung tu chon tren UI, khac voi scopeByKhuVuc la
 * pham vi duoc PHEP xem theo vai tro) - ho tro ca gia tri ao __QLDVBH__. Dung cho cac route
 * khong dung chung whole-clause shape cua parseFilterParams (cases.ts, missingParts.ts,
 * survey.ts - moi route co WHERE goc khac nhau, chi can rieng doan khu_vuc nay).
 */
export function khuVucAdHocClause(column: string, khuVucFilter: string | undefined): { sql: string; binds: unknown[] } {
  if (!khuVucFilter) return { sql: "", binds: [] };
  if (khuVucFilter === QLDVBH_FILTER_VALUE) return { sql: ` AND ${column} LIKE '%qldvbh%'`, binds: [] };
  return { sql: ` AND ${column} = ?`, binds: [khuVucFilter] };
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
