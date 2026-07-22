import type { BadgeTone } from "../components/ui/Badge";
import { parseDbDateTime, type CaseRow, type GiaiTrinhRow, type ViPhamRow, type LyDoRow, type LoaiLoi, type CaLapDetection } from "../types";
import { trangThaiLapOf } from "./caLapStatus";

export interface CaseTicker {
  label: string;
  tone: BadgeTone;
}

const NEED_SURVEY_FLAGS: [keyof CaseRow, LoaiLoi][] = [
  ["loi_120p", "Loi 120 phut"],
  ["loi_qua_han_24h", "Hen qua 24h"],
  ["loi_lo_ke_hoach", "Loi lo ke hoach"],
  ["loi_kh_hen_lai", "KH hen lai"],
];

/**
 * Tinh toan bo "nhom van de" 1 ca dang thuoc ve, de hien thanh ticker sau ma ca (giup nguoi dung
 * nhin luot biet ngay ca nay dang can chu y gi) - dung lai TOAN BO du lieu DA CO SAN trong response
 * GET /cases/:id (case + giaiTrinh + viPham + caLap, cong activeLyDo component da fetch san cho form
 * giai trinh), khong goi them API nao. Cac dieu kien mirror dung logic da dung o backend
 * (dailyReport.ts, cases.ts TAB_FILTERS, survey.ts NEED_SURVEY_CONDITION) de nhat quan so lieu -
 * chi khac la tinh phia client tren 1 ca don le thay vi COUNT(*) hang loat phia server.
 */
export function computeCaseTickers(
  c: CaseRow,
  giaiTrinhList: GiaiTrinhRow[],
  viPhamList: ViPhamRow[],
  activeLyDo: LyDoRow[],
  caLap: CaLapDetection | undefined,
): CaseTicker[] {
  const tickers: CaseTicker[] = [];
  const isOpen = !c.thoi_gian_hoan_thanh;

  if (isOpen && giaiTrinhList.length === 0) {
    tickers.push({ label: "Tồn chưa giải trình", tone: "coral" });
  }
  if (isOpen && c.thoi_gian_hen_xu_ly && parseDbDateTime(c.thoi_gian_hen_xu_ly).getTime() < Date.now()) {
    tickers.push({ label: "Lỡ kế hoạch", tone: "amber" });
  }
  if (isOpen && giaiTrinhList.length > 0) {
    const daysSinceLast = (Date.now() - parseDbDateTime(giaiTrinhList[0].ngay_giai_trinh).getTime()) / 86400000;
    if (daysSinceLast >= 3) tickers.push({ label: "Quá hạn chu kỳ giải trình", tone: "coral" });

    const latestLyDo = activeLyDo.find((l) => l.ten_ly_do === giaiTrinhList[0].ly_do_cham);
    if (latestLyDo?.thuoc_thieu_linh_kien === 1) tickers.push({ label: "Thiếu linh kiện", tone: "amber" });
  }

  if (caLap?.detection && caLap.detection.gapDays <= 45) {
    const status = trangThaiLapOf({
      gap_days: caLap.detection.gapDays,
      chot_danh_gia_lap: caLap.giaiTrinhLap?.chot_danh_gia_lap ?? null,
      qc_chot: caLap.giaiTrinhLap?.qc_chot ?? null,
    });
    if (status.label === "Cần đánh giá" || status.label === "Chờ QC") {
      tickers.push({ label: `Ca lặp: ${status.label}`, tone: status.tone });
    }
  }

  // Mirror RECENT_OR_OPEN_CONDITION (survey.ts): dang mo HOAC da dong nhung khong qua 3 ngay.
  const recentOrOpen = isOpen || (!!c.thoi_gian_hoan_thanh && (Date.now() - parseDbDateTime(c.thoi_gian_hoan_thanh).getTime()) / 86400000 <= 3);
  if (recentOrOpen) {
    const needSurvey = NEED_SURVEY_FLAGS.some(([field, loai]) => c[field] === 1 && !viPhamList.some((v) => v.loai_loi === loai));
    if (needSurvey) tickers.push({ label: "Vi phạm chờ khảo sát", tone: "coral" });
  }

  if (viPhamList.some((v) => v.ket_qua_cap_1 !== null && v.chot_bo_cap_2 === null)) {
    tickers.push({ label: "Vi phạm chờ QC", tone: "amber" });
  }

  return tickers;
}
