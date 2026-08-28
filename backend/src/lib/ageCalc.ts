/**
 * Tuoi ton (so nguyen ngay, lam tron xuong): tinh tu thoi_gian tiep nhan ca den moc 0h sang
 * (nua dem) gio Viet Nam cua ngay xem bao cao - chot lai voi user 2026-07-20, doi tu moc 8h sang
 * truoc day. Tuong duong "(ngay lich hom nay - ngay lich tiep nhan) - 1" (khong quan tam gio phut
 * trong ngay tiep nhan) cho MOI truong hop thuc te. Toan he thong quy uoc luu gio VN dia phuong
 * (khong phai UTC - du lieu nhap tu Excel/Sheet la gio VN "tho", giu nguyen khong quy doi, xem
 * ratchet.ts businessFieldValue), nen D1/SQLite datetime('now') (tra ve UTC) phai duoc quy doi +7h
 * de ra dung "gio VN hien tai" TRUOC KHI lay ngay va dat 0h sang - KHONG tru lai 7h nua vi cac cot
 * so sanh (thoi_gian_cskh_tiep_nhan, ngay_du_kien_hoan_thanh...) khong phai UTC.
 */
const AGE_ANCHOR = "(date(datetime('now','+7 hours')) || ' 00:00:00')";

export function ageExprAtAnchor(anchor: string, column: string): string {
  return `CAST((julianday(${anchor}) - julianday(${column})) AS INTEGER)`;
}

export function ageExpr(column: string): string {
  return ageExprAtAnchor(AGE_ANCHOR, column);
}

export function ageFilterClause(column: string, tuoiTu?: string, tuoiDen?: string): { sql: string; binds: unknown[] } {
  const binds: unknown[] = [];
  let sql = "";
  const expr = ageExpr(column);
  if (tuoiTu !== undefined && tuoiTu !== "") {
    sql += ` AND ${expr} >= ?`;
    binds.push(Number(tuoiTu));
  }
  if (tuoiDen !== undefined && tuoiDen !== "") {
    sql += ` AND ${expr} < ?`;
    binds.push(Number(tuoiDen));
  }
  return { sql, binds };
}

export { AGE_ANCHOR };
