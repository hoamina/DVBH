import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import vi from "./locales/vi.json";
import en from "./locales/en.json";
import id from "./locales/id.json";

// Ngon ngu giao dien (VI/EN/ID) - CHI dich chu cua giao dien. Du lieu nghiep vu (ten khu vuc, trang
// thai CRM/Odoo, ly do, ten KTV, ghi chu...), file Excel xuat ra, anh Telegram va thong bao loi tu
// server GIU NGUYEN tieng Viet (chot voi chu he thong 2026-10-28).
// Luu theo tai khoan (users.ngon_ngu, migration 0146); localStorage chi de man dang nhap/khoi dong
// hien dung ngon ngu truoc khi /api/auth/me tra ve.
export const NGON_NGU = ["vi", "en", "id"] as const;
export type NgonNgu = (typeof NGON_NGU)[number];
export const NGON_NGU_LABEL: Record<NgonNgu, string> = { vi: "VI", en: "EN", id: "ID" };
const LS_KEY = "dvbh_ngon_ngu";
// Danh dau ngon ngu chon o man dang nhap (chua co phien) -> sau khi dang nhap se ghi vao tai khoan
// thay vi bi ngon ngu cu cua tai khoan de len (xem AuthContext).
const LS_CHO_DONG_BO = "dvbh_ngon_ngu_cho_dong_bo";

export function danhDauChoDongBo() {
  try {
    localStorage.setItem(LS_CHO_DONG_BO, "1");
  } catch {
    /* bo qua */
  }
}

/** Tra ve ngon ngu chon o man dang nhap neu con cho ghi vao tai khoan (va xoa co), nguoc lai null. */
export function layNgonNguChoDongBo(): NgonNgu | null {
  try {
    if (localStorage.getItem(LS_CHO_DONG_BO) !== "1") return null;
    localStorage.removeItem(LS_CHO_DONG_BO);
    return docLocal();
  } catch {
    return null;
  }
}

export function chuanHoaNgonNgu(v: unknown): NgonNgu {
  return v === "en" || v === "id" ? v : "vi";
}

function docLocal(): NgonNgu {
  try {
    return chuanHoaNgonNgu(localStorage.getItem(LS_KEY));
  } catch {
    return "vi";
  }
}

export function apDungNgonNgu(lng: NgonNgu) {
  try {
    localStorage.setItem(LS_KEY, lng);
  } catch {
    /* bo qua */
  }
  document.documentElement.lang = lng;
  if (i18n.language !== lng) void i18n.changeLanguage(lng);
}

const batDau = docLocal();
void i18n.use(initReactI18next).init({
  resources: { vi: { translation: vi }, en: { translation: en }, id: { translation: id } },
  lng: batDau,
  fallbackLng: "vi",
  interpolation: { escapeValue: false },
  returnNull: false,
});
document.documentElement.lang = batDau;

export default i18n;
