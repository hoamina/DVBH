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

export function matchThieuHang(muaHangMatched: SheetRow[], baoHanhMatched: SheetRow[], thieuHangRows: SheetRow[]): SheetRow[] {
  const muaHangIds = new Set(muaHangMatched.map((r) => r.id));
  const baoHanhIds = new Set(baoHanhMatched.map((r) => r.id));
  return thieuHangRows.filter((r) => {
    if (r.nguon.includes("Đơn mua DVBH")) return muaHangIds.has(r.idLienKet);
    if (r.nguon.includes("Đơn SCBH")) return baoHanhIds.has(r.idLienKet);
    return false;
  });
}
