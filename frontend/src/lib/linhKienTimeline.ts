// Log "Dat mua linh kien" cua 1 ca keo tu he linh-kien-app qua backend DVBH
// (GET /api/cases/:id/linh-kien-timeline -> backend/src/lib/linhKienTimeline.ts). CHOT 2026-09-30: goi
// theo yeu cau khi mo chi tiet ca, khong luu D1; nguon AppSheet (Google Sheet mua-hang/thieu-hang,
// lib/purchaseWarrantySync.ts) van giu SONG SONG, 2 nguon phan biet qua nhan tren timeline.
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { tr } from "../i18n/tr";

export interface LinhKienTimelineEvent {
  at: string; // ISO 8601 +07:00
  event: string;
  actor: string | null;
  actor_name?: string | null;
  note: string | null;
  source: "mua_hang" | "thieu_lk" | "phieu_xuat_kho" | "tra_hang";
}

export interface LinhKienThieuLk {
  id: string;
  ly_do: string | null;
  ngay_tao: string;
  ngay_du_kien_co_hang: string | null;
  ngay_hang_ve_thuc_te: string | null;
}

export interface LinhKienOrder {
  order_id: string;
  ma_lk: string;
  ten_lk: string | null;
  loai_don: string;
  trang_thai_hien_tai: string | null;
  nguoi_tao: string;
  nguoi_nhan_hang: string | null;
  ngay_tao: string;
  phieu_xuat_kho: { id: string; ma_xuat_kho: string }[];
  timeline: LinhKienTimelineEvent[];
  loai_de_xuat?: string | null;
  so_luong_de_xuat?: number;
  so_luong_thuc_xuat?: number | null;
  ly_do_cham?: string | null;
  nguoi_tao_ten?: string | null;
  nguoi_nhan_hang_ten?: string | null;
  thieu_lk?: LinhKienThieuLk[];
}

export interface LinhKienTimelineResult {
  configured: boolean;
  ok: boolean;
  error: string | null;
  orders: LinhKienOrder[];
}

export function useLinhKienTimeline(caseId: string | null | undefined) {
  return useQuery({
    queryKey: ["linh-kien-timeline", caseId],
    queryFn: () => api.get<LinhKienTimelineResult>(`/cases/${encodeURIComponent(caseId!)}/linh-kien-timeline`),
    enabled: !!caseId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

// Enum su kien on dinh cua linh-kien-app (lib/partnerTimeline.ts ben repo do) -> nhan tieng Viet.
// Ma chua biet (linh-kien-app them trang thai moi) hien nguyen ma, khong vo UI.
const EVENT_LABELS: Record<string, string> = {
  cho_tram_duyet: tr("Chờ Trạm duyệt"),
  cho_tbp_xac_nhan: tr("Chờ TBP xác nhận"),
  cho_tn_duyet: tr("Chờ TN duyệt"),
  tn_da_duyet: tr("TN đã duyệt"),
  tn_tu_choi: tr("TN từ chối"),
  cho_hang: tr("Chờ hàng"),
  da_huy: tr("Đã hủy"),
  thieu_lk_cho_kho_xu_ly: tr("Tạo yêu cầu – chờ Kho xử lý"),
  thieu_lk_kho_da_tiep_nhan: tr("Kho đã tiếp nhận"),
  thieu_lk_kho_da_cap_nhat: tr("Kho cập nhật thông tin"),
  thieu_lk_kho_xac_nhan_hang_ve: tr("Kho xác nhận hàng về"),
  thieu_lk_kho_tu_choi: tr("Kho từ chối (sai thông tin)"),
  thieu_lk_huy_bo: tr("Đã hủy bỏ"),
  thieu_lk_ket_thuc: tr("Kết thúc"),
  pxk_dang_tao_phieu: tr("Đang tạo phiếu xuất kho"),
  pxk_cho_ke_toan: tr("Chờ Kế toán duyệt"),
  pxk_da_chot_don_xuat: tr("Đã chốt đơn xuất"),
  pxk_dang_gui_ktv: tr("Đang gửi hàng cho KTV"),
  pxk_ktv_da_nhan: tr("KTV đã nhận hàng"),
  pxk_ke_toan_huy: tr("Kế toán hủy phiếu"),
  pxk_hang_tru_kho: tr("Hàng trừ kho"),
  pxk_kho_da_ket_thuc: tr("Kho đã kết thúc"),
  pxk_kho_da_nhan_hang_tra: tr("Kho đã nhận hàng trả"),
  pxk_chuyen_tien_yeu_cau: tr("Yêu cầu KTV chuyển tiền"),
  pxk_chuyen_tien_da_dinh_bang_chung: tr("KTV đính bằng chứng chuyển tiền"),
  pxk_chuyen_tien_ke_toan_duyet: tr("Kế toán duyệt chuyển tiền"),
  tra_hang_cho_ke_toan_duyet_mem: tr("Chờ Kế toán duyệt"),
  tra_hang_cho_kho_xac_nhan: tr("Chờ Kho xác nhận"),
  tra_hang_cho_qc_xac_nhan: tr("Chờ QC xác nhận"),
  tra_hang_cho_tn_duyet_tong: tr("Chờ TN duyệt tổng"),
  tra_hang_tn_da_duyet: tr("TN đã duyệt"),
  tra_hang_tu_choi: tr("Từ chối"),
  tra_hang_da_huy: tr("Đã hủy"),
};

export function linhKienEventLabel(event: string): string {
  return EVENT_LABELS[event] ?? event;
}

const SOURCE_LABELS: Record<LinhKienTimelineEvent["source"], string> = {
  mua_hang: tr("Đặt mua LK"),
  thieu_lk: tr("Thiếu LK"),
  phieu_xuat_kho: tr("Xuất kho LK"),
  tra_hang: tr("Trả hàng LK"),
};

export function linhKienSourceLabel(source: LinhKienTimelineEvent["source"], loaiDon: string): string {
  if (source === "mua_hang" && loaiDon === "tra_hang") return SOURCE_LABELS.tra_hang;
  return SOURCE_LABELS[source] ?? source;
}

const LOAI_DON_LABELS: Record<string, string> = { mua: tr("Mua hàng"), cong_no: tr("Công nợ"), tra_hang: tr("Trả hàng") };
export function linhKienLoaiDonLabel(loaiDon: string): string {
  return LOAI_DON_LABELS[loaiDon] ?? loaiDon;
}

// trang_thai_hien_tai la gia tri DB khong dau (vd "TN da duyet") - quy ve nhan co dau qua cung bang
// EVENT_LABELS (ma su kien = gia tri DB viet thuong, noi "_").
export function linhKienTrangThaiLabel(raw: string | null): string {
  if (!raw) return "—";
  const key = raw.toLowerCase().replace(/\s+/g, "_");
  return EVENT_LABELS[key] ?? raw;
}

export function linhKienActorDisplay(e: { actor: string | null; actor_name?: string | null }): string | null {
  if (!e.actor) return null;
  return e.actor_name ? `${e.actor_name} (${e.actor})` : e.actor;
}

/** "2026-09-10T10:13:08+07:00" -> "YYYY-MM-DD HH:MM:SS" gio VN (dung dinh dang D1 de fmtDateTime()
 * hien giong cac moc D1 khac); chuoi chi co ngay giu nguyen. */
export function linhKienIsoToVnLocal(iso: string): string {
  return iso.length > 10 ? iso.slice(0, 19).replace("T", " ") : iso;
}
