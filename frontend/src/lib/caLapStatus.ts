import type { BadgeTone } from "../components/ui/Badge";

/** Trang thai danh gia lap (dung chung cho danh sach CaLapModule va tab Ca lap trong CaseDetail)
 * de badge/label luon nhat quan giua 2 noi hien thi cung 1 du lieu. */
export function trangThaiLapOf(r: { gap_days: number; chot_danh_gia_lap: string | null; qc_chot: string | null }): { label: string; tone: BadgeTone } {
  if (r.gap_days > 45) return { label: "Quá hạn lặp", tone: "gray" };
  if (r.qc_chot) return { label: "Đã chốt", tone: "teal" };
  if (r.chot_danh_gia_lap) return { label: "Chờ QC", tone: "amber" };
  return { label: "Cần đánh giá", tone: "coral" };
}
