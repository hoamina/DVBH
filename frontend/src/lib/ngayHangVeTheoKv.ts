// Ngay hang ve THEO KHU VUC cua ca (2026-11-11, chu he thong): Quan ly ton > "Danh sach chi tiet" them 3 cot cho ca co
// "Mã linh kiện thiếu" - doi chieu ma do voi PO dat hang (Google Sheet + app EO, cung nguon voi menu "Thiếu linh kiện" /
// Ho so linh kien), CHI lay PO cua kho cung MIEN voi khu vuc cua ca:
//   - "Ngày hàng về dự kiến theo KV" = ngay du kien gan nhat SOM NHAT trong cac PO dang cho hang cua mien do
//   - "Ngày về gần nhất theo KV"    = lan ma LK ve kho mien do gan nhat (ngay ve dung kho cua app EO, khong co thi ngay ve
//                                     thuc te / phieu nhap AMIS cua PO)
//   - "Ngày NM cam kết có hàng"     = ngay nha may cam ket cua PO dang cho co ngay du kien som nhat (khong co thi PO dang cho
//                                     gan nhat co nhap ngay cam ket)
// Mien ca: khu vuc chua "qldvbh.mb"/"miền Bắc" = MB, "qldvbh.mn"/"miền Nam" = MN (giong so_ca_mb/so_ca_mn cua
// backend missingParts.ts); khu vuc khong ro mien (KDDV...) -> dung PO moi kho. Mien kho: ten kho co "MB"/"Bắc"/"HN" = MB,
// "MN"/"Nam"/"HCM" = MN; kho khong ro mien -> tinh cho ca 2 mien. Ngay deu dang 'dd/mm/yyyy[ ...]' nhu SheetRow.
import type { SheetRow } from "./purchaseWarrantySync";
import { poSortKey } from "./poDatHangEo";

export const soNguyen = (v: string | undefined): number | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const x = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(x) ? x : null;
};

/** PO huy / tu choi / SL dat = 0 - bo khoi moi doi chieu. */
export function poBiHuy(r: SheetRow): boolean {
  const eo = (r.trangThaiEo ?? "").toLowerCase();
  if (eo.includes("hủy") || eo.includes("từ chối")) return true;
  if (/hủy|huỷ|từ chối/i.test(`${r.trangThai ?? ""} ${r.tatCa ?? ""}`)) return true;
  return soNguyen(r.soLuongDat) === 0;
}
/** PO con thieu hang (dang cho ve). */
export function poDangCho(r: SheetRow): boolean {
  const thieu = soNguyen(r.soLuongConThieu);
  if (thieu !== null) return thieu > 0;
  return !/kết thúc|hoàn thành|đã về|đủ/i.test(r.trangThai ?? "");
}
/** Ngay ve thuc te cua CHINH PO: cot app EO, khong co thi lay ngay phieu nhap AMIS muon nhat cua PO. */
export function poNgayVe(r: SheetRow): string {
  if (r.ngayVeThucTe) return r.ngayVeThucTe;
  const ds = (r.phieuNhap ?? "").match(/\d{1,2}\/\d{1,2}\/\d{4}/g) ?? [];
  return ds.sort((a, b) => (poSortKey(a) < poSortKey(b) ? 1 : -1))[0] ?? "";
}

export type Mien = "MB" | "MN";

export function mienCuaKhuVuc(khuVuc: string | null | undefined): Mien | null {
  const s = (khuVuc ?? "").toLowerCase();
  if (s.includes("qldvbh.mb") || s.includes("miền bắc")) return "MB";
  if (s.includes("qldvbh.mn") || s.includes("miền nam")) return "MN";
  return null;
}

const boDau = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

export function mienCuaKho(kho: string | undefined): Mien | null {
  const s = ` ${boDau(kho ?? "").replace(/[^a-z0-9]+/g, " ")} `;
  if (/ (mb|bac|hn|ha noi) /.test(s) || s.includes("mien bac")) return "MB";
  if (/ (mn|nam|hcm|sg) /.test(s) || s.includes("mien nam") || s.includes("ho chi minh")) return "MN";
  return null;
}

/** Index PO (da bo huy) theo ma LK (ca ma de xuat lan ma goc truoc khi thay tuong duong) - tao 1 lan / lan tai PO. */
export function indexPoTheoMaLk(poRows: SheetRow[]): Map<string, SheetRow[]> {
  const m = new Map<string, SheetRow[]>();
  const them = (k: string | undefined, r: SheetRow) => {
    if (!k) return;
    const a = m.get(k);
    if (a) a.push(r);
    else m.set(k, [r]);
  };
  for (const r of poRows) {
    if (poBiHuy(r)) continue;
    them(r.maLinhKienDeXuat, r);
    if (r.maLinhKienGoc && r.maLinhKienGoc !== r.maLinhKienDeXuat) them(r.maLinhKienGoc, r);
  }
  return m;
}

export interface NgayHangVeKv {
  duKien: string;
  veGanNhat: string;
  nmCamKet: string;
}
const RONG: NgayHangVeKv = { duKien: "", veGanNhat: "", nmCamKet: "" };
const chiNgay = (s: string | undefined) => (s ? s.split(" ")[0] : "");

export function ngayHangVeTheoKv(maLk: string | null | undefined, khuVuc: string | null | undefined, idx: Map<string, SheetRow[]>): NgayHangVeKv {
  if (!maLk) return RONG;
  const tatCa = idx.get(maLk);
  if (!tatCa?.length) return RONG;
  const mien = mienCuaKhuVuc(khuVuc);
  const po = mien ? tatCa.filter((r) => {
    const mk = mienCuaKho(r.khoCanDat);
    return mk === null || mk === mien;
  }) : tatCa;
  if (!po.length) return RONG;

  const cho = po.filter(poDangCho);
  let somNhat: SheetRow | undefined;
  for (const r of cho) {
    const k = poSortKey(r.ngayDuKienGanNhat);
    if (k && (!somNhat || k < poSortKey(somNhat.ngayDuKienGanNhat))) somNhat = r;
  }
  let veGanNhat = "";
  for (const r of po) {
    for (const v of [r.ngayVeDungKho, poNgayVe(r)]) if (poSortKey(v) > poSortKey(veGanNhat)) veGanNhat = v ?? "";
  }
  let nm = somNhat?.nmCamKet ?? "";
  if (!nm) {
    let best = "";
    for (const r of cho) if (r.nmCamKet && poSortKey(r.nmCamKet) > poSortKey(best)) best = r.nmCamKet;
    nm = best;
  }
  return { duKien: chiNgay(somNhat?.ngayDuKienGanNhat), veGanNhat: chiNgay(veGanNhat), nmCamKet: chiNgay(nm) };
}
