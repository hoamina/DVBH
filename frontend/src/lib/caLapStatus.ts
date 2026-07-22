import type { BadgeTone } from "../components/ui/Badge";

// Phai khop CHINH XAC voi NGUONG_NGAY_LAP (backend/src/routes/caLap.ts) - dung lai o FE de tinh
// KPI/loc trang thai tren du lieu da gop tu /danh-sach/list + /danh-sach/status (xem CaLapModule.tsx),
// tranh phai goi lai server chi de biet 1 ca thuoc nhom trang thai nao.
const NGUONG_NGAY_LAP = 45;

type CaLapStatusRow = { gap_days: number; chot_danh_gia_lap: string | null; qc_chot: string | null };

/** Key trang thai dung cho tab loc (TRANG_THAI_TABS) + KPI - xem trangThaiLapOf() ben duoi cho ban hien thi (label/tone). */
export function trangThaiKeyOf(r: CaLapStatusRow): "qua-han-lap" | "da-chot" | "cho-qc" | "can-danh-gia" {
  if (r.gap_days > NGUONG_NGAY_LAP) return "qua-han-lap";
  if (r.qc_chot) return "da-chot";
  if (r.chot_danh_gia_lap) return "cho-qc";
  return "can-danh-gia";
}

/** Trang thai danh gia lap (dung chung cho danh sach CaLapModule va tab Ca lap trong CaseDetail)
 * de badge/label luon nhat quan giua 2 noi hien thi cung 1 du lieu. */
export function trangThaiLapOf(r: CaLapStatusRow): { label: string; tone: BadgeTone } {
  const key = trangThaiKeyOf(r);
  if (key === "qua-han-lap") return { label: "Quá hạn lặp", tone: "gray" };
  if (key === "da-chot") return { label: "Đã chốt", tone: "teal" };
  if (key === "cho-qc") return { label: "Chờ QC", tone: "amber" };
  return { label: "Cần đánh giá", tone: "coral" };
}
