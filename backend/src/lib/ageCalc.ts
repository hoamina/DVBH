/**
 * Tuoi ton (so nguyen ngay, lam tron xuong): tinh tu thoi_gian tiep nhan ca den moc 0h sang
 * (nua dem) gio Viet Nam (UTC+7) cua ngay xem bao cao - chot lai voi user 2026-07-20, doi tu moc
 * 8h sang truoc day. Tuong duong "(ngay lich hom nay - ngay lich tiep nhan) - 1" (khong quan tam
 * gio phut trong ngay tiep nhan) cho MOI truong hop thuc te (gio phut giay khac 00:00:00 dung -
 * chi le duy nhat neu tiep nhan dung 00:00:00 chinh xac thi lech 1 ngay, khong xay ra voi timestamp
 * that tu CRM). D1/SQLite datetime('now') tra ve UTC nen phai tu quy doi: lay ngay hien tai theo
 * gio VN (+7h) de xac dinh dung "ngay hom nay" theo lich VN, roi dat lai 0h sang VN cho ngay do,
 * cuoi cung tru lai 7h de co dung moc UTC tuong ung dung voi 0h sang VN.
 */
const AGE_ANCHOR = "datetime(date(datetime('now','+7 hours')) || ' 00:00:00', '-7 hours')";

export function ageExpr(column: string): string {
  return `CAST((julianday(${AGE_ANCHOR}) - julianday(${column})) AS INTEGER)`;
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
