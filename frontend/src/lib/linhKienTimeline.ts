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
  // 2026-11-26 (linh-kien-app v1.568): ma trang thai phieu xuat kho chua don - xem linhKienTrangThaiLabel.
  trang_thai_pxk?: string | null;
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

// Log "chi ghi du lieu" cua phieu xuat kho (linh-kien-app migration 0028: ghi chung bang phieu_xuat_kho_log nhung KHONG phai buoc
// quy trinh) - partnerTimeline ben do tra nguyen `pxk_<trang_thai>`. Tien trinh chung xep vao LOG PHU (an mac dinh).
const LOG_PHU_LABELS: Record<string, string> = {
  "pxk_Da luu ma don hang": tr("Lưu mã đơn hàng"),
  "pxk_Da luu ma MISA": tr("Lưu mã MISA"),
  "pxk_Da tai anh bien ban": tr("Tải ảnh biên bản"),
  "pxk_Da them don vao phieu": tr("Thêm đơn vào phiếu"),
  "pxk_Da yeu cau KTV chuyen tien": tr("Yêu cầu KTV chuyển tiền"),
  "pxk_Da dinh bang chung chuyen tien": tr("KTV đính bằng chứng chuyển tiền"),
  "pxk_Ke toan da duyet bang chung chuyen tien": tr("Kế toán duyệt chuyển tiền"),
};

export function linhKienEventLabel(event: string): string {
  return EVENT_LABELS[event] ?? LOG_PHU_LABELS[event] ?? event;
}

/** Su kien PXK khong nam trong enum buoc quy trinh = log chi ghi du lieu (luu ma, tai anh, them don vao phieu...). */
export function linhKienEventLaLogPhu(event: string): boolean {
  return event.startsWith("pxk_") && !EVENT_LABELS[event];
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
// Trang thai phieu xuat kho chua don (ma tu linh-kien-app TRANG_THAI_PXK_DON_SQL) - BAN SAO cua backend lib/donLkGanNhat.ts
// TRANG_THAI_PXK + nhanTrangThai (cot "ID đặt hàng gần nhất"): doi 1 ben phai doi ben kia.
const TRANG_THAI_PXK_LABELS: Record<string, string> = {
  cho_tao_phieu: tr("Chờ tạo phiếu"),
  cho_ktv_chuyen_tien: tr("Chờ KTV chuyển tiền"),
  cho_xac_nhan_chuyen_tien: tr("Chờ xác nhận chuyển tiền"),
  cho_gui_ke_toan: tr("Chờ TN gửi kế toán"),
  cho_ke_toan_chot: tr("Chờ kế toán chốt"),
  cho_kho_gui_hang: tr("Chờ kho gửi hàng"),
  cho_kho_nhan_hang_tra: tr("Chờ kho nhận hàng trả"),
  cho_ktv_xac_nhan: tr("Đã gửi, chờ KTV xác nhận"),
  ktv_da_nhan: tr("KTV đã nhận"),
  hang_tru_kho: tr("Hàng trừ kho"),
  kho_da_ket_thuc: tr("Kho đã kết thúc"),
  kho_da_nhan_hang_tra: tr("Kho đã nhận hàng trả"),
  phieu_da_huy: tr("Phiếu đã hủy"),
};
// Don con o buoc truoc phieu (chua duyet xong / cho hang / cho thanh toan) -> hien trang thai don.
const DON_TRUOC_PXK = new Set(["Cho Tram duyet", "Cho TBP xac nhan", "Cho GS duyet", "Cho thanh toan", "Cho TN duyet", "Cho hang"]);

/** Trang thai MOI NHAT cua don (2026-11-26, chu he thong): don da duyet va co trang thai phieu xuat kho -> hien theo phieu
 *  (vd "TN đã duyệt" -> "Chờ KTV chuyển tiền"); don con cho duyet / cho hang / bi tu choi -> trang thai don. */
export function linhKienTrangThaiLabel(raw: string | null, pxk?: string | null): string {
  if (pxk && !(raw && DON_TRUOC_PXK.has(raw)) && TRANG_THAI_PXK_LABELS[pxk]) return TRANG_THAI_PXK_LABELS[pxk];
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

// linh-kien-app chi luu so_luong_thuc_xuat khi TN/Kho DOI so luong khac de xuat - NULL = "bang SL de xuat"
// (ben do moi noi doc deu COALESCE(so_luong_thuc_xuat, so_luong_de_xuat)). Truoc 2026-10-29 DVBH hien
// thang NULL -> "—" cho moi don da duyet/da xuat kho. Gio: don con cho duyet/da tu choi/huy (chua co
// khai niem thuc xuat) moi hien "—"; con lai (hoac da co phieu xuat kho) hien SL thuc xuat ?? SL de xuat.
const CHUA_XUAT_TRANG_THAI = new Set([
  "Cho Tram duyet", "Cho TBP xac nhan", "Cho TN duyet", "Cho hang", "TN tu choi", "Tu choi", "Da huy",
  "Cho ke toan duyet mem", "Cho kho xac nhan",
]);
export function linhKienSlThucXuat(o: {
  trang_thai_hien_tai: string | null;
  so_luong_de_xuat?: number | null;
  so_luong_thuc_xuat?: number | null;
  phieu_xuat_kho?: unknown[];
}): number | null {
  if (o.so_luong_thuc_xuat != null) return o.so_luong_thuc_xuat;
  const coPxk = (o.phieu_xuat_kho?.length ?? 0) > 0;
  if (!coPxk && (!o.trang_thai_hien_tai || CHUA_XUAT_TRANG_THAI.has(o.trang_thai_hien_tai))) return null;
  return o.so_luong_de_xuat ?? null;
}
