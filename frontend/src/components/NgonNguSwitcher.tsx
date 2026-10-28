import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { apDungNgonNgu, chuanHoaNgonNgu, danhDauChoDongBo, NGON_NGU, NGON_NGU_LABEL, type NgonNgu } from "../i18n";
import { useToast } from "./ui/Toast";

// Nut chon ngon ngu giao dien VI/EN/ID (2026-10-28). "luuTaiKhoan" = ghi vao users.ngon_ngu (PATCH
// /auth/me, migration 0146) - tat o man dang nhap (chua co phien), luc do chi luu localStorage.
// Doi ngon ngu -> TAI LAI TRANG (tu dien tr() co dinh trong 1 lan tai, xem i18n/tr.ts).
export function NgonNguSwitcher({ className = "", luuTaiKhoan = true }: { className?: string; luuTaiKhoan?: boolean }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const hienTai = chuanHoaNgonNgu(i18n.language);

  async function chon(lng: NgonNgu) {
    if (lng === hienTai) return;
    apDungNgonNgu(lng);
    if (luuTaiKhoan) {
      try {
        await api.patch("/auth/me", { ngon_ngu: lng });
      } catch {
        toast(t("lang.saveError"));
        await new Promise((r) => setTimeout(r, 1500));
      }
    } else danhDauChoDongBo();
    window.location.reload();
  }

  return (
    <div role="radiogroup" aria-label={t("lang.label")} title={t("lang.label")} className={`inline-flex rounded-lg border border-[var(--line)] p-0.5 bg-[var(--surface)] ${className}`}>
      {NGON_NGU.map((lng) => (
        <button
          key={lng}
          role="radio"
          aria-checked={hienTai === lng}
          onClick={() => void chon(lng)}
          className={`focus-ring px-2 py-1 text-xs font-semibold rounded-md transition-colors ${
            hienTai === lng ? "bg-[var(--ocean-500)] text-white" : "text-[var(--ink-600)] hover:bg-slate-100"
          }`}
        >
          {NGON_NGU_LABEL[lng]}
        </button>
      ))}
    </div>
  );
}
