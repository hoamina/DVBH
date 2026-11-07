import { tr } from "../i18n/tr";
import type { BadgeTone } from "../components/ui/Badge";

/**
 * 7 nhom thong tin bo sung tu Odoo (case_dvbh, migration 0155, 2026-11-07) - moi cot 1 chuoi JSON object,
 * chi ca Odoo co, QuickSight NULL. Pipeline auto qs ocrm/extras.py. Hien thi trong CaseDetail (khong them
 * tab moi - gop vao vung lien quan, xem renderCaseFieldsGrid) + the "Khảo sát CSKH (Odoo)" o tab Khảo sát.
 */

export interface HienTuongOdoo {
  kh_bao?: string[];
  ktv_xac_dinh?: string[];
}
export interface SlaOdoo {
  khu_vuc_sla?: string;
  sla_gio?: number;
  bat_dau?: string;
  han?: string;
  qua_sla_luc?: string;
  tre_khi_dong?: boolean;
  so_gio_tre?: number;
  khu_vuc?: string;
  so_ngay_xu_ly?: number;
}
export interface BaoHanhNhaMay {
  trang_thai?: string; // active | expired | not_activated
  trang_thai_goc?: string;
  ma?: string;
  ngay_kich_hoat?: string;
  ngay_het_han?: string;
  so_thang?: number;
  ngay_xuat_kho?: string;
}
export interface PhiOdoo {
  mat_phi?: boolean;
  ly_do_khong_thu_phi?: string;
  da_thu?: number;
  da_nhap_thu_tien?: boolean;
}
export interface KhaoSatOdoo {
  cuoc_goi?: string;
  hai_long?: string;
  ly_do?: string;
  ghi_chu?: string;
}
export interface ThongSoNuoc {
  nguon_nuoc?: string;
  tds_vao?: number;
  tds_ra?: number;
  tds_tai_voi?: number;
  tds_nuoc_thai?: number;
  ph?: number;
}
export interface CheckinOdoo {
  thoi_diem: string | null;
  ktv: string | null;
  lech_m: number;
  lech_tren_200m: boolean;
  so_anh: number;
}
export interface KtvOdoo {
  da_nhan_viec?: boolean;
  ly_do_tra_viec?: string;
  checkin?: CheckinOdoo[];
}

export function parseJsonObject<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length > 0 ? (v as T) : null;
  } catch {
    return null;
  }
}

// Ma danh muc Happiphone/Hub (Odoo khong co bang nhan - help cua truong ghi "Mã danh mục của Hub, giữ
// nguyen"). Ma bi Odoo cat o 40 ky tu (vd "..._hau_mai_t") -> khoa giu dung ban cat. Ma moi chua co ->
// nhanFallback() (bo "_", viet hoa chu dau) + title = ma goc.
const CUOC_GOI: Record<string, string> = {
  thanh_cong: tr("Gọi thành công"),
  knm_tat_may_chan_qc: tr("Không nghe máy / tắt máy / chặn"),
  kh_ban_tu_choi_tra_loi: tr("KH bận, từ chối trả lời"),
  khong_goi_duoc: tr("Không gọi được"),
};
const HAI_LONG: Record<string, { nhan: string; tone: BadgeTone }> = {
  rat_hai_long: { nhan: tr("Rất hài lòng"), tone: "teal" },
  hai_long: { nhan: tr("Hài lòng"), tone: "teal" },
  binh_thuong: { nhan: tr("Bình thường"), tone: "gray" },
  khong_hai_long: { nhan: tr("Không hài lòng"), tone: "coral" },
  rat_khong_hai_long: { nhan: tr("Rất không hài lòng"), tone: "coral" },
  kh_khong_danh_gia: { nhan: tr("KH không đánh giá"), tone: "gray" },
  kh_khong_lam_viec_truc_tiep: { nhan: tr("KH không làm việc trực tiếp"), tone: "gray" },
};
const LY_DO: Record<string, string> = {
  hai_long_do_thai_do_ky_nang_ktv: tr("Hài lòng: thái độ, kỹ năng KTV"),
  hai_long_do_thai_do_ky_nang_nv_cskh: tr("Hài lòng: thái độ, kỹ năng NV CSKH"),
  hai_long_do_chinh_sach_bao_hanh_hau_mai_t: tr("Hài lòng: chính sách bảo hành, hậu mãi"),
  hai_long_do_chat_luong_san_pham_tot: tr("Hài lòng: chất lượng sản phẩm tốt"),
  hai_long_do_trai_nghiem_tong_the_tich_cuc: tr("Hài lòng: trải nghiệm tổng thể tích cực"),
  hai_long_do_xu_ly_nhanh_nhiet_tinh: tr("Hài lòng: xử lý nhanh, nhiệt tình"),
  hai_long_do_gia_ca_hop_ly: tr("Hài lòng: giá cả hợp lý"),
  hai_long_do_ly_do_khac: tr("Hài lòng: lý do khác"),
  khong_hai_long_do_chat_luong_san_pham: tr("Không hài lòng: chất lượng sản phẩm"),
  khong_hai_long_do_gia_ca_chi_phi: tr("Không hài lòng: giá cả, chi phí"),
  khong_hai_long_do_nv_cskh: tr("Không hài lòng: NV CSKH"),
  khong_hai_long_do_nguyen_nhan_khac: tr("Không hài lòng: nguyên nhân khác"),
  khong_hai_long_do_giao_tiep_thai_do_phuc: tr("Không hài lòng: giao tiếp, thái độ phục vụ"),
  khong_hai_long_do_kien_thuc_ky_nang_tay_n: tr("Không hài lòng: kiến thức, kỹ năng tay nghề"),
  khong_hai_long_do_chinh_sach_bao_hanh: tr("Không hài lòng: chính sách bảo hành"),
  khong_hai_long_do_tre_hen_thoi_gian_cho_d: tr("Không hài lòng: trễ hẹn, thời gian chờ đợi"),
};

function nhanFallback(ma: string): string {
  const s = ma.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function nhanCuocGoi(ma?: string): string | null {
  return ma ? CUOC_GOI[ma] ?? nhanFallback(ma) : null;
}
export function nhanLyDoDanhGia(ma?: string): string | null {
  return ma ? LY_DO[ma] ?? nhanFallback(ma) : null;
}
export function hienHaiLong(ma?: string): { nhan: string; tone: BadgeTone } | null {
  if (!ma) return null;
  return HAI_LONG[ma] ?? { nhan: nhanFallback(ma), tone: ma.startsWith("khong") || ma.startsWith("rat_khong") ? "coral" : "gray" };
}
export function laKhongHaiLong(k: KhaoSatOdoo | null): boolean {
  return !!k?.hai_long && (k.hai_long === "khong_hai_long" || k.hai_long === "rat_khong_hai_long");
}

export function hienBaoHanhNhaMay(trangThai?: string): { nhan: string; tone: BadgeTone } | null {
  if (!trangThai) return null;
  if (trangThai === "active") return { nhan: tr("Còn hạn"), tone: "teal" };
  if (trangThai === "expired") return { nhan: tr("Hết hạn"), tone: "amber" };
  if (trangThai === "not_activated") return { nhan: tr("Chưa kích hoạt"), tone: "gray" };
  return { nhan: nhanFallback(trangThai), tone: "gray" };
}

// "Khu vực" DVBH (case_dvbh.khu_vuc = TBP, vd "(qldvbh.mn1) Quản lý khu vực MN1" -> shortKhuVuc "MN1") va "Khu vực"
// Odoo (ts_zone_id, vd "MN1") cung 1 khai niem -> bao lech khi khac nhau. (Khu vực SLA cua Odoo - Nội thành/Đồng
// bằng... - DVBH khong luu nen chi hien thi, khong so sanh.)
export function cungKhuVuc(khuVucDvbhNgan: string | null | undefined, khuVucOdoo: string | undefined): boolean {
  if (!khuVucDvbhNgan || khuVucDvbhNgan === "—" || !khuVucOdoo) return true;
  const n = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, "");
  return n(khuVucDvbhNgan) === n(khuVucOdoo);
}

// Hien tuong chi xuat hien o 1 phia (KH bao ma KTV khong xac dinh, hoac nguoc lai) -> to dam de thay ngay su khac.
export function hienTuongChiMotPhia(ds: string[] | undefined, phiaKia: string[] | undefined): Set<string> {
  const kia = new Set(phiaKia ?? []);
  return new Set((ds ?? []).filter((x) => !kia.has(x)));
}
