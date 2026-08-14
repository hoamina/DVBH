import * as XLSX from "xlsx";

/**
 * Dung file .xlsx tra ve cho API doi tac (xem PARTNER_API_GUIDE.md muc 3 - dung 1 cot header, moi ca
 * su co 1 dong). XLSX.write({type:"array"}) tra ve Uint8Array, khong dung nodejs fs (writeFile) - an
 * toan trong Workers runtime.
 */

export interface PartnerCaseRow {
  id: string;
  khach_hang: string | null;
  khu_vuc: string | null;
  tinh: string | null;
  doi_tac: string | null;
  hang: string | null;
  nhom_san_pham: string | null;
  seri_san_pham: string | null;
  mo_ta_loi: string | null;
  thoi_gian_cskh_tiep_nhan: string | null;
  thoi_gian_hen_xu_ly: string | null;
  thoi_gian_hoan_thanh: string | null;
  tien_do_hoan_thanh: string | null;
}

export interface GiaiTrinhHistoryRow {
  case_id: string;
  ly_do_cham: string;
  noi_dung: string | null;
  ngay_giai_trinh: string;
}

const HEADERS = [
  "ID",
  "Khách hàng",
  "Khu vực",
  "Tỉnh",
  "Đối tác",
  "Hãng",
  "Nhóm sản phẩm",
  "Serial sản phẩm",
  "Mô tả lỗi",
  "Thời gian tiếp nhận",
  "Thời gian hẹn xử lý",
  "Thời gian hoàn thành",
  "Tiến độ",
  "Số lần giải trình",
  "Lịch sử giải trình",
];

// "YYYY-MM-DD HH:MM:SS" (gio VN dia phuong, khong quy doi - xem vnTime.ts) -> "dd/mm/yyyy HH:mm".
function fmtVN(dt: string | null): string {
  if (!dt) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(dt);
  if (!m) return dt;
  const [, y, mo, d, h, mi] = m;
  return `${d}/${mo}/${y} ${h}:${mi}`;
}

export function buildPartnerExcel(cases: PartnerCaseRow[], history: GiaiTrinhHistoryRow[]): Uint8Array {
  const byCaseId = new Map<string, GiaiTrinhHistoryRow[]>();
  for (const row of history) {
    const list = byCaseId.get(row.case_id);
    if (list) list.push(row);
    else byCaseId.set(row.case_id, [row]);
  }

  const aoa: unknown[][] = [HEADERS];
  for (const c of cases) {
    const rows = byCaseId.get(c.id) ?? [];
    const lichSuGiaiTrinh = rows
      .map((r) => `${fmtVN(r.ngay_giai_trinh)} - ${r.ly_do_cham} - ${r.noi_dung ?? ""}`)
      .join("\n");
    aoa.push([
      c.id,
      c.khach_hang,
      c.khu_vuc,
      c.tinh,
      c.doi_tac,
      c.hang,
      c.nhom_san_pham,
      c.seri_san_pham,
      c.mo_ta_loi,
      fmtVN(c.thoi_gian_cskh_tiep_nhan),
      fmtVN(c.thoi_gian_hen_xu_ly),
      fmtVN(c.thoi_gian_hoan_thanh),
      c.tien_do_hoan_thanh,
      rows.length,
      lichSuGiaiTrinh,
    ]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as Uint8Array;
}
