// Logic doi chieu ID ca hien dang xem voi 3 tap du lieu Google Sheet (mua hang/bao hanh/xu ly thieu
// hang) da tai ve cache trinh duyet (xem lib/purchaseWarrantySync.ts). Da xac nhan quy tac lien ket
// truc tiep voi chu he thong 2026-08-02 - xem plan trong phien lam viec, khong tu suy dien them.
import type { SheetRow } from "./purchaseWarrantySync";

const SENTINEL_NHAP_TAY = "NHẬP MÃ THỦ CÔNG";

function wordBoundaryIncludes(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  // Escape ky tu dac biet trong needle (ID ca thuong chi co chu/so nhung an toan vi la du lieu ben
  // ngoai). "\b" chi hoat dong dung voi ky tu word (a-z0-9_) - ID ca (vd "T18685", "1017677") chi
  // gom nhung ky tu nay nen du dung.
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(haystack);
}

/** Cot "Ngay tao"/"Ngay cap nhat" tren cac sheet nay la chuoi DD/MM/YYYY H:MM:SS (vd
 * "04/01/2026 8:50:31", gio khong luon co so 0 dau) - localeCompare truc tiep tren chuoi SAI vi
 * ngay dung truoc thang (vd "31/01/2026" so sanh chuoi > "05/05/2026" du 31/01 xay ra truoc). Tra ve
 * 0 (xep cuoi khi sort desc) neu khong parse duoc. */
export function parseSheetDateTime(s: string | undefined): number {
  if (!s) return 0;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return 0;
  const [, d, mo, y, h, mi, se] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se ?? "0")).getTime();
}

/** Cac ma xuat hang lien quan da duoc ghi trong log giai trinh CUA CHINH ca dang xem (da co san tu
 * GET /cases/:id, khong can fetch them). */
export function matchMuaHang(caseId: string, giaiTrinhList: { ma_xuat_hang_lien_quan?: string | null }[], muaHangRows: SheetRow[]): SheetRow[] {
  const xuatHangCodes = new Set(giaiTrinhList.map((g) => g.ma_xuat_hang_lien_quan).filter((v): v is string => !!v));
  return muaHangRows.filter((r) => xuatHangCodes.has(r.id) || wordBoundaryIncludes(r.maSuCoLienQuan, caseId));
}

export function matchBaoHanh(caseId: string, baoHanhRows: SheetRow[]): SheetRow[] {
  return baoHanhRows.filter((r) => {
    const effective = r.maYeuCau === SENTINEL_NHAP_TAY ? r.maYeuCauNhapTay : r.maYeuCau;
    return effective === caseId;
  });
}

export function matchQcThucTe(caseId: string, qcThucTeRows: SheetRow[]): SheetRow[] {
  return qcThucTeRows.filter((r) => r.idCrm === caseId);
}

/** Khop theo 2 tieu chi (OR, giong matchMuaHang): "ID CRM" = ID ca (thuong de trong tren sheet nen
 * khong the dung rieng), HOAC "Ma linh kien de xuat" trung ma linh_kien_thieu tu cac giai trinh CUA
 * CHINH ca dang xem (da co san tu GET /cases/:id, khong can fetch them). */
export function matchPoDatHang(caseId: string, giaiTrinhList: { linh_kien_thieu?: string | null }[], poDatHangRows: SheetRow[]): SheetRow[] {
  const linhKienThieuCodes = new Set(giaiTrinhList.map((g) => g.linh_kien_thieu).filter((v): v is string => !!v));
  return poDatHangRows.filter((r) => r.idCrm === caseId || (r.maLinhKienDeXuat && linhKienThieuCodes.has(r.maLinhKienDeXuat)));
}

/** Doi chieu THEO MA LINH KIEN (khong can case id) - dung cho tab "Linh kien thieu" (gom nhieu ca lai
 * theo 1 ma), khac 3 ham matchXxx() o tren la doi chieu THEO 1 CA dang xem. */
export function matchPoDatHangByLinhKien(maLk: string, poDatHangRows: SheetRow[]): SheetRow[] {
  return poDatHangRows.filter((r) => r.maLinhKienDeXuat === maLk);
}

export function matchMuaHangByLinhKien(maLk: string, muaHangRows: SheetRow[]): SheetRow[] {
  return muaHangRows.filter((r) => r.maLinhKien === maLk);
}

/** "linhKienSua" la truong mo ta (khong phai ma chuan hoa) nen dung khop theo tu/cum tu (word-boundary,
 * giong wordBoundaryIncludes o tren) thay vi so bang tuyet doi - se bo sot mot so bien the viet khac
 * nhung tranh khop nham (vd "LK001" khop nham "LK0011"). */
export function matchBaoHanhByLinhKien(maLk: string, baoHanhRows: SheetRow[]): SheetRow[] {
  return baoHanhRows.filter((r) => wordBoundaryIncludes(r.linhKienSua, maLk));
}

export function matchThieuHang(muaHangMatched: SheetRow[], baoHanhMatched: SheetRow[], thieuHangRows: SheetRow[]): SheetRow[] {
  const muaHangIds = new Set(muaHangMatched.map((r) => r.id));
  const baoHanhIds = new Set(baoHanhMatched.map((r) => r.id));
  return thieuHangRows.filter((r) => {
    if (r.nguon.includes("Đơn mua DVBH")) return muaHangIds.has(r.idLienKet);
    if (r.nguon.includes("Đơn SCBH")) return baoHanhIds.has(r.idLienKet);
    return false;
  });
}
