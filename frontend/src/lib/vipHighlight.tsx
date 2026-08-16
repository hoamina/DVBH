// Dung chung cho MOI danh sach ca trong he thong (CHOT 2026-08-16: "toan bo danh sach ca ton chi
// tiet o moi cho, ca VIP/SVIP dua len dau, mau sac dac biet dap vao mat") - 1 nguon duy nhat cho
// dieu kien nhan biet + class to mau, tranh lap lai o tung module. Khop DUNG voi dieu kien backend
// dang dung (canhBaoTon.ts, cases.ts: "c.nhom_kh LIKE '%VIP%'") - SQLite LIKE mac dinh khong phan
// biet hoa/thuong voi ky tu ASCII, nen ".toUpperCase().includes('VIP')" la tuong duong o phia client.
export function isVipKh(nhomKh: string | null | undefined): boolean {
  return !!nhomKh && nhomKh.toUpperCase().includes("VIP");
}

// Class to nen hang trong PaginatedTable (rowClassName) khi ca thuoc nhom VIP/SVIP - dung mau amber
// (rieng biet voi coral dang danh cho "qua han/khan cap" o cac noi khac) de khong lam nguoi dung
// nham VIP voi canh bao qua han.
export function vipRowClassName(nhomKh: string | null | undefined): string {
  return isVipKh(nhomKh) ? "bg-[var(--amber-100)]" : "";
}

// Nhan nho "★ VIP" gan ten khach hang/ID - dap vao mat theo dung yeu cau, dung lai token mau san co
// (--amber-500), khong them mau moi.
export function VipBadge() {
  return <span className="inline-flex items-center gap-0.5 font-bold text-[10px] px-1 py-0.5 rounded bg-[var(--amber-500)] text-white mr-1 align-middle">★ VIP</span>;
}
