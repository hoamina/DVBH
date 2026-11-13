// PO dat hang tu app "EO Mua hang" (GET /api/po-dat-hang, bang po_dat_hang_eo - app do day sang qua
// POST /api/partner/sync/po-dat-hang). Chot 2026-10-20: dung SONG SONG voi Google Sheet "po-dat-hang"
// ~1 thang - purchaseWarrantySync.ts gop 2 nguon, dong trung "ID ĐẶT LK" lay ban app EO.
// Chieu ve DUNG ten field SheetRow cua tap "po-dat-hang" (FIELD_ALIASES) + dinh dang ngay kieu sheet
// (dd/mm/yyyy, dd/mm/yyyy HH:MM:SS) de CaseDetail / Linh kien thieu / Ho so linh kien dung nguyen.
import { api } from "../api/client";
import { getCachedEntry, setCachedEntry } from "./closedDataCache";
import type { SheetRow } from "./purchaseWarrantySync";
import { tr } from "../i18n/tr";


export interface PoEoPayload {
  id_dat_lk: string;
  eo_item_id?: number; eo_id?: number; eo_code?: string; ma_phe_duyet?: string | null; link?: string;
  trang_thai_eo?: string; nguoi_duyet_cuoi?: string | null; ngay_ban_hanh?: string | null;
  loai_hinh?: string | null; ly_do_ps?: string | null; phan_loai?: string;
  id_crm?: string | null; id_dat_hang?: string | null; ghi_chu?: string | null;
  kho?: string; doi_tac?: string | null; ma_lk?: string; ma_lk_goc?: string | null; ten_lk?: string;
  sl_dat?: number; sl_nhap_amis?: number; sl_doi_chieu_sai_thua?: number; sl_con_thieu?: number;
  trang_thai?: string; trang_thai_gon?: string; canh_bao?: string | null; toc_do_hang_ve?: string | null;
  thoi_gian_xu_ly?: number | null; so_lan_doi_ngay?: number;
  ngay_du_kien_lan_dau?: string | null; ngay_du_kien_gan_nhat?: string | null;
  ngay_ve_theo_eo?: string | null; ngay_ve_dung_kho?: string | null; ngay_ve_toan_quoc?: string | null;
  ngay_tao?: string; ngay_cap_nhat?: string;
  ke_hoach?: { loai: string; ngay: string; tuan: string | null; sl: number; ngay_nm_cam_ket: string | null; ghi_chu: string | null }[];
  phieu_nhap?: { so_ct: string; ngay: string; kho: string; sl: number }[];
  // "Theo dõi linh kiện đặt" ben app EO (2026-10-21): han ngay du kien 24h, so loi, cap CEO
  theo_doi?: { ap_dung: boolean; tinh_trang: string; han_ngay_du_kien: string | null; han_cap_nhat_lai: string | null;
    so_lan_lui: number; so_loi: number; so_loi_cho_giai_trinh: number; cap_ceo: boolean; ceo_ly_do: string[] } | null;
}

const CACHE_KEY = "po-dat-hang-eo-v1";

/** 'YYYY-MM-DD[ HH:MM:SS]' -> 'dd/mm/yyyy[ HH:MM:SS]' (dinh dang sheet). */
function fmt(s: string | null | undefined, withTime = false): string {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/.exec(s);
  if (!m) return s;
  const d = `${m[3]}/${m[2]}/${m[1]}`;
  return withTime && m[4] ? `${d} ${m[4].length === 5 ? m[4] + ":00" : m[4]}` : d;
}
const num = (v: unknown) => (v == null || v === "" ? "" : String(v));
const TT_THEO_DOI: Record<string, string> = {
  CHO_NDK: tr("Chờ ngày dự kiến"), TRE_NDK: tr("Trễ 24h chưa có ngày dự kiến"), QUA_HAN_NDK: tr("Quá ngày dự kiến"), CHO_HANG: tr("Chờ hàng"), DONG: tr("Đã đóng"),
};
const TRANG_THAI_EO: Record<string, string> = {
  DRAFT: tr("Nháp"), IN_REVIEW: tr("Đang thẩm định"), WAITING_FINAL_APPROVAL: tr("Chờ duyệt cuối"),
  ISSUED: tr("Đã ban hành"), REJECTED: tr("Từ chối"), CANCELLED: tr("Đã hủy"),
};

export function mapPoEoRow(p: PoEoPayload): SheetRow {
  const keHoach = (p.ke_hoach ?? [])
    .map((k) => `${k.loai === "TUAN" ? `Tuần ${k.tuan}` : fmt(k.ngay)}: ${k.sl}${k.ngay_nm_cam_ket ? ` (NM cam kết ${fmt(k.ngay_nm_cam_ket)})` : ""}${k.ghi_chu ? ` - ${k.ghi_chu}` : ""}`)
    .join("; ");
  const phieuNhap = (p.phieu_nhap ?? []).map((r) => `${r.so_ct} ${fmt(r.ngay)} ${r.kho}: ${r.sl}`).join("; ");
  // Ngay NM cam ket (2026-10-23): lay dot ke hoach CUOI CUNG co nhap ngay cam ket (ben EO it khi nhap - de trong la binh thuong).
  const nmCamKet = [...(p.ke_hoach ?? [])].reverse().find((k) => k.ngay_nm_cam_ket)?.ngay_nm_cam_ket ?? null;
  // "Xem day du": nhan tieng Viet giong cot sheet + cac thong tin chi app EO co
  const raw: Record<string, string> = {
    "Nguồn": "App EO Mua hàng",
    "ID ĐẶT LK": p.id_dat_lk,
    "Mã EO": p.eo_code ?? "",
    "Mã phê duyệt": p.ma_phe_duyet ?? "",
    "Trạng thái EO": TRANG_THAI_EO[p.trang_thai_eo ?? ""] ?? p.trang_thai_eo ?? "",
    "Tất cả": p.trang_thai ?? "",
    "Trạng thái": p.trang_thai_gon ?? "",
    "Cảnh báo": p.canh_bao ?? "",
    "Tốc độ hàng về": p.toc_do_hang_ve ?? "",
    "Phân loại": p.phan_loai ?? "",
    "Loại hình cấp 1": p.loai_hinh ?? "",
    "Lý do PS khi đặt LK": p.ly_do_ps ?? "",
    "ID CRM": p.id_crm ?? "",
    "ID đặt hàng": p.id_dat_hang ?? "",
    "Ghi chú": p.ghi_chu ?? "",
    "Kho cần đặt hàng": p.kho ?? "",
    "Đối tác": p.doi_tac ?? "",
    "Mã linh kiện đề xuất": p.ma_lk ?? "",
    "Mã linh kiện gốc (trước khi thay mã)": p.ma_lk_goc ?? "",
    "Tên linh kiện": p.ten_lk ?? "",
    "Số lượng đặt": num(p.sl_dat),
    "SL nhập theo Amis": num(p.sl_nhap_amis),
    "Đối chiếu sai thừa": num(p.sl_doi_chieu_sai_thua),
    "Số lượng còn thiếu": num(p.sl_con_thieu),
    "Thời gian xử lý": num(p.thoi_gian_xu_ly),
    "Số lần thay đổi ngày dự kiến hàng về": num(p.so_lan_doi_ngay),
    "Ngày dự kiến lần đầu": fmt(p.ngay_du_kien_lan_dau),
    "Ngày dự kiến gần nhất": fmt(p.ngay_du_kien_gan_nhat),
    "Kế hoạch hàng về": keHoach,
    // 2026-10-23: dat lai nhan cho dung nghia (ngay_ve_dung_kho = ma LK ve kho do tu BAT KY PO nao, khong rieng PO nay).
    "Ngày hàng về thực tế (theo PO)": fmt(p.ngay_ve_theo_eo),
    "Ngày NM cam kết": fmt(nmCamKet),
    "Mã LK về kho gần nhất (mọi PO)": fmt(p.ngay_ve_dung_kho),
    "Ngày về gần nhất toàn quốc": fmt(p.ngay_ve_toan_quoc),
    "Phiếu nhập AMIS": phieuNhap,
    "Người duyệt cuối": p.nguoi_duyet_cuoi ?? "",
    "Ngày ban hành": fmt(p.ngay_ban_hanh, true),
    "Ngày tạo": fmt(p.ngay_tao, true),
    "Ngày cập nhật": fmt(p.ngay_cap_nhat, true),
    "Link EO": p.link ?? "",
    "Theo dõi: tình trạng": TT_THEO_DOI[p.theo_doi?.tinh_trang ?? ""] ?? "",
    "Theo dõi: số lần lùi ngày DK": num(p.theo_doi?.so_lan_lui),
    "Theo dõi: số lỗi (chờ giải trình)": p.theo_doi ? `${p.theo_doi.so_loi} (${p.theo_doi.so_loi_cho_giai_trinh})` : "",
    "Cấp CEO": p.theo_doi?.cap_ceo ? p.theo_doi.ceo_ly_do.join("; ") : "",
  };
  return {
    _region: "",
    _nguon: "app",
    _rawJson: JSON.stringify(raw),
    id: p.id_dat_lk,
    idCrm: p.id_crm ?? "",
    maLinhKienDeXuat: p.ma_lk ?? "",
    maLinhKienGoc: p.ma_lk_goc ?? "",
    tenLinhKien: p.ten_lk ?? "",
    doiTac: p.doi_tac ?? "",
    khoCanDat: p.kho ?? "",
    soLuongDat: num(p.sl_dat),
    slNhapTheoAmis: num(p.sl_nhap_amis),
    soLuongConThieu: num(p.sl_con_thieu),
    trangThai: p.trang_thai_gon ?? "",
    tocDoHangVe: p.toc_do_hang_ve ?? "",
    canhBao: p.canh_bao ?? "",
    ngayDuKienGanNhat: fmt(p.ngay_du_kien_gan_nhat),
    ngayVeGanNhatToanQuoc: fmt(p.ngay_ve_toan_quoc),
    ngayTao: fmt(p.ngay_tao, true),
    ngayCapNhat: fmt(p.ngay_cap_nhat, true),
    ghiChu: p.ghi_chu ?? "",
    // 2026-10-23 (chu he thong): ngay ban hanh EO = "ngay tao PO"; ngay hang ve THUC TE cua chinh PO (phieu nhap AMIS khop
    // dong EO nay, phieu gan nhat) + danh sach phieu nhap; ngay NM cam ket (dot ke hoach cuoi co nhap).
    ngayBanHanh: fmt(p.ngay_ban_hanh),
    ngayVeThucTe: fmt(p.ngay_ve_theo_eo),
    // 2026-11-11: lan ma LK ve DUNG kho nay gan nhat (moi PO) - cot "Ngày về gần nhất theo KV" o Quan ly ton.
    ngayVeDungKho: fmt(p.ngay_ve_dung_kho),
    phieuNhap,
    nmCamKet: fmt(nmCamKet),
    tatCa: p.trang_thai ?? "",
    maPheDuyet: p.ma_phe_duyet ?? "",
    trangThaiEo: TRANG_THAI_EO[p.trang_thai_eo ?? ""] ?? "",
    keHoachHangVe: keHoach,
    linkEo: p.link ?? "",
    capCeo: p.theo_doi?.cap_ceo ? p.theo_doi.ceo_ly_do.join("; ") : "",
    soLoiTheoDoi: p.theo_doi?.so_loi ? String(p.theo_doi.so_loi) : "",
    // 2026-11-13: so lan lui ngay du kien (app EO "Theo dõi") - cot "Số lần lùi ngày DK" o Quan ly ton.
    soLanLuiDk: num(p.theo_doi?.so_lan_lui),
  };
}

/** Tai PO tu app EO (co cache theo version domain "po_dat_hang" ben backend). Loi -> tra cache cu / rong. */
export async function fetchPoEoRows(force = false): Promise<SheetRow[]> {
  const cached = await getCachedEntry<{ v: string; rows: PoEoPayload[] }>(CACHE_KEY);
  try {
    const v = !force && cached?.data?.v ? `?v=${encodeURIComponent(cached.data.v)}` : "";
    const r = await api.get<{ v: string; unchanged?: boolean; rows?: PoEoPayload[] }>(`/po-dat-hang${v}`);
    let rows: PoEoPayload[];
    if (r.unchanged && cached) rows = cached.data.rows;
    else {
      rows = r.rows ?? [];
      await setCachedEntry(CACHE_KEY, { v: r.v, rows });
    }
    return rows.map(mapPoEoRow);
  } catch {
    return (cached?.data?.rows ?? []).map(mapPoEoRow);
  }
}

/** 'dd/mm/yyyy[ HH:MM[:SS]]' -> 'yyyy-mm-dd HH:MM:SS' de so sanh chuoi (rong -> ''). */
export function poSortKey(v: string | undefined): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(v ?? "");
  if (!m) return "";
  const p = (x: string | undefined) => (x ?? "0").padStart(2, "0");
  return `${m[3]}-${p(m[2])}-${p(m[1])} ${p(m[4])}:${p(m[5])}:${p(m[6])}`;
}

/** Gop: dong app EO thay dong sheet cung "ID ĐẶT LK"; dong chi co tren sheet giu nguyen (gan _nguon).
 * Sap xep MOI NHAT LEN TREN theo "Ngày tạo" (2026-10-20) - moi danh sach PO (Chi tiet ca, Linh kien thieu,
 * Ho so linh kien) dung chung thu tu nay. */
export function mergePoRows(sheetRows: SheetRow[], appRows: SheetRow[]): SheetRow[] {
  const appIds = new Set(appRows.map((r) => r.id).filter(Boolean));
  const all: SheetRow[] = [...appRows, ...sheetRows.filter((r) => !r.id || !appIds.has(r.id)).map((r) => ({ ...r, _nguon: "sheet" }))];
  const keyed = all.map((r) => ({ r, k: poSortKey(r.ngayTao) }));
  keyed.sort((a, b) => (a.k < b.k ? 1 : a.k > b.k ? -1 : 0));
  return keyed.map((x) => x.r);
}
