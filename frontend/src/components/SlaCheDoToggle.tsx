// Cong tac "SLA cu (co loai tru) / SLA moi (khong loai tru)" dung chung cho cac bao cao co ty le SLA (2026-11-20, chu he thong).
// SLA cu  = dung_han / so_gio_xu_ly (pipeline: QuickSight tra ma tran, Odoo theo co "Trễ SLA khi đóng ca", loai tru KH hen lai).
// SLA moi = COALESCE(dung_han_klt, dung_han): gio tu luc tiep nhan -> dong ca so voi moc "SLA (giờ)" Odoo (18/30/42/90h,
//           < moc = Dung han); ca khong co moc dung luon ket qua SLA cu. Gio moi = COALESCE(so_gio_xu_ly_klt, so_gio_xu_ly).
// Bao cao SLA moi chi tinh tu thang 11/2026 -> ky truoc do cong tac bi khoa o "SLA cũ".
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { tr } from "../i18n/tr";

export type SlaCheDo = "cu" | "moi";

/** Ky bat dau SLA moi (thang dong ca / tiep nhan, YYYY-MM). */
export const SLA_MOI_TU_THANG = "2026-11";

/** Ky xem (YYYY-MM, YYYY-MM-DD, hoac "CURRENT"/rong = thang hien tai) co tinh duoc SLA moi khong. */
export function slaMoiApDung(ky: string | undefined | null): boolean {
  if (!ky || !/^\d{4}-\d{2}/.test(ky)) return true; // thang hien tai (luon sau 11/2026)
  return ky.slice(0, 7) >= SLA_MOI_TU_THANG;
}

/** Trang thai cong tac (nho trong localStorage, dung chung moi bao cao) + che do THUC SU ap dung cho ky dang xem. */
export function useSlaCheDo(ky: string | undefined | null): { cheDo: SlaCheDo; apDung: SlaCheDo; setCheDo: (v: SlaCheDo) => void; khoa: boolean } {
  const [cheDo, setCheDo] = useLocalStorageState<SlaCheDo>("filters:sla-che-do", "cu");
  const khoa = !slaMoiApDung(ky);
  return { cheDo, apDung: khoa ? "cu" : cheDo, setCheDo, khoa };
}

export function SlaCheDoToggle({ value, onChange, khoa }: { value: SlaCheDo; onChange: (v: SlaCheDo) => void; khoa?: boolean }) {
  return (
    <div
      className="inline-flex rounded-lg border border-[var(--line)] overflow-hidden text-xs"
      role="group"
      aria-label={tr("Cách tính SLA")}
      title={khoa ? tr("SLA mới (không loại trừ) chỉ tính từ tháng 11/2026") : undefined}
    >
      {(["cu", "moi"] as const).map((k) => {
        const chon = (khoa ? "cu" : value) === k;
        return (
          <button
            key={k}
            type="button"
            disabled={khoa && k === "moi"}
            onClick={() => onChange(k)}
            title={
              k === "cu"
                ? tr("SLA cũ: có loại trừ yếu tố khách quan (KH hẹn lại lịch, Odoo tính lại hạn)")
                : tr("SLA mới: giờ từ lúc tiếp nhận đến đóng ca so với mốc SLA Odoo (18/30/42/90h); ca không có mốc dùng SLA cũ")
            }
            className={`px-2.5 py-1 disabled:opacity-40 ${chon ? "bg-[var(--teal-500)] text-white font-semibold" : "bg-white text-[var(--ink-600)] hover:bg-[var(--surface-100)]"}`}
          >
            {k === "cu" ? tr("SLA cũ (có loại trừ)") : tr("SLA mới (không loại trừ)")}
          </button>
        );
      })}
    </div>
  );
}
