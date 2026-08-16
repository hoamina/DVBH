/**
 * Tinh han "Ly do cham" cho 1 dong dat_don_hang (CHOT 2026-08-14 voi chu he thong): 24h tinh tu luc
 * dong chuyen "Cho TN duyet" (dat_don_hang_log.ngay_xu_ly); neu han (cong thuc +24h don gian) roi
 * vao thu 7/CN thi day tiep TUNG NGAY cho den khi roi vao ngay thuong - vd tao thu 6 17h => han
 * thuc te la thu 2 17h (cong ca T7 lan CN, khong phai chi 1 ngay). Dung chung boi datMuaLinhKien.ts
 * (PATCH /don-hang/:id cho TN dien ly_do_cham) va phieuXuatKho.ts (chan cung luc TN gui "Cho ke toan").
 *
 * Cac cot ngay_xu_ly/nowVN() la chuoi "YYYY-MM-DD HH:MM:SS" gio VN "tho", KHONG phai UTC that (xem
 * vnTime.ts) - parse bang cach gan hau to "Z" de Date object doc dung gio/thu trong tuan ma khong bi
 * quy doi timezone them lan nua (Workers runtime chay UTC).
 */
function parseVnTime(s: string): Date {
  return new Date(s.replace(" ", "T") + "Z");
}

export function tinhHanLyDoCham(choTnDuyetAt: string): Date {
  let deadline = new Date(parseVnTime(choTnDuyetAt).getTime() + 24 * 60 * 60 * 1000);
  while (deadline.getUTCDay() === 0 || deadline.getUTCDay() === 6) {
    deadline = new Date(deadline.getTime() + 24 * 60 * 60 * 1000);
  }
  return deadline;
}

export function quaHanLyDoCham(choTnDuyetAt: string, nowVnStr: string): boolean {
  return parseVnTime(nowVnStr).getTime() > tinhHanLyDoCham(choTnDuyetAt).getTime();
}
