import * as XLSX from "xlsx";
import { parseHinhAnhUrls } from "./hinhAnhUrls";

/**
 * Dung file .xlsx tra ve cho API doi tac (xem PARTNER_API_GUIDE.md muc 3 - dung 1 cot header, moi ca
 * su co 1 dong). XLSX.write({type:"array"}) tra ve Uint8Array, khong dung nodejs fs (writeFile) - an
 * toan trong Workers runtime.
 */

// Bo cot dong bo voi CASE_LOOKUP_COLUMNS (partnerApi.ts) tu 2026-09-20 - xem comment o CASE_COLUMNS
// ben do. dt_san_pham/dt_linh_kien/dt_dich_vu la REAL (number), phan con lai TEXT.
export interface PartnerCaseRow {
  id: string;
  ky_thuat_vien: string | null;
  khach_hang: string | null;
  seri_san_pham: string | null;
  khu_vuc: string | null;
  tinh: string | null;
  quan_huyen: string | null;
  hang: string | null;
  san_pham_bao_hanh: string | null;
  tien_do_hoan_thanh: string | null;
  mo_ta_loi: string | null;
  nhom_san_pham: string | null;
  nhom_yeu_cau: string | null;
  loai_yeu_cau: string | null;
  hinh_thuc_bao_hanh: string | null;
  ngay_mua: string | null;
  thoi_gian_cskh_tiep_nhan: string | null;
  thoi_gian_hen_xu_ly: string | null;
  thoi_gian_hoan_thanh: string | null;
  doi_tac: string | null;
  link_crm: string | null;
  noi_dung_xu_ly: string | null;
  luu_y_loi_linh_kien: string | null;
  cach_thuc_xu_ly: string | null;
  nganh: string | null;
  loai_nganh: string | null;
  nhom_kh: string | null;
  dt_san_pham: number | null;
  dt_linh_kien: number | null;
  dt_dich_vu: number | null;
  ly_do_qua_han: string | null;
  ngay_import: string | null;
  ngay_cap_nhat_gan_nhat: string | null;
  dung_han: string | null;
  xu_ly_24h_bucket: string | null;
  ly_do_huy: string | null;
  link_hinh_anh: string | null;
}

export interface GiaiTrinhHistoryRow {
  case_id: string;
  ly_do_cham: string;
  noi_dung: string | null;
  ngay_giai_trinh: string;
  // Optional: chỉ /case-lookup (partnerApi.ts) select thêm field này để đối tác hiển thị "người
  // giải trình" trên timeline riêng của họ - export hàng loạt /cases không cần nên để optional.
  nguoi_giai_trinh?: string;
}

// Khao sat + vi pham theo case (them 2026-10-12) - dung chung /cases (Excel) va /case-lookup (JSON).
export interface KhaoSatHistoryRow {
  case_id: string;
  loai_khao_sat: string | null;
  ket_qua_cuoc_goi: string | null;
  dien_giai: string | null;
  ngay_gio_thuc_hien: string;
}
export interface ViPhamHistoryRow {
  id: string;
  case_id: string;
  loai_loi: string;
  ket_qua_cap_1: string | null;
  chot_bo_cap_2: number | null;
  ngay_ghi_nhan: string;
}
export interface ViPhamGiaiTrinhHistoryRow {
  vi_pham_id: string;
  noi_dung_giai_trinh: string | null;
  ngay_giai_trinh: string;
}

/** loai_khao_sat luu chuoi JSON mang (vd '["Hen qua 24h"]') -> mang; gia tri cu khong phai JSON -> [chuoi]. */
export function parseLoaiKhaoSat(v: string | number | null): string[] {
  if (typeof v !== "string" || !v) return [];
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p.map(String) : [v];
  } catch {
    return [v];
  }
}

/** "Chua danh gia cap 1" (ket_qua_cap_1 NULL) / "Cho QC" / "Xac nhan loi" / "Bo loi" (chot_bo_cap_2 = 1 / 0 -
 * cung nghia XAC_NHAN_EXPR o routes/viPham.ts). */
export function viPhamTrangThai(r: { ket_qua_cap_1: string | number | null; chot_bo_cap_2: string | number | null }): string {
  if (r.chot_bo_cap_2 === 1) return "Xac nhan loi";
  if (r.chot_bo_cap_2 === 0) return "Bo loi";
  return r.ket_qua_cap_1 == null ? "Chua danh gia cap 1" : "Cho QC";
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

const HEADERS = [
  "ID",
  "KTV",
  "Khách hàng",
  "Serial sản phẩm",
  "Khu vực",
  "Tỉnh",
  "Quận/Huyện",
  "Hãng",
  "Sản phẩm bảo hành",
  "Tiến độ",
  "Mô tả lỗi",
  "Nhóm sản phẩm",
  "Nhóm yêu cầu",
  "Loại yêu cầu",
  "Hình thức bảo hành",
  "Ngày mua",
  "Thời gian tiếp nhận",
  "Thời gian hẹn xử lý",
  "Thời gian hoàn thành",
  "Đối tác",
  "Link CRM",
  "Nội dung xử lý",
  "Lưu ý lỗi linh kiện",
  "Cách thức xử lý",
  "Ngành",
  "Loại ngành",
  "Nhóm KH",
  "DT sản phẩm",
  "DT linh kiện",
  "DT dịch vụ",
  "Lý do quá hạn",
  "Ngày import",
  "Ngày cập nhật gần nhất",
  "Đúng hạn",
  "Nhóm xử lý 24h",
  "Lý do huỷ",
  "Link hình ảnh",
  "Số lần giải trình",
  "Lịch sử giải trình",
  // Them 2026-10-12 - noi vao CUOI de khong lech vi tri cac cot cu doi tac dang doc.
  "Số lần khảo sát",
  "Lịch sử khảo sát",
  "Số vi phạm",
  "Lịch sử vi phạm",
];

// "YYYY-MM-DD HH:MM:SS" (gio VN dia phuong, khong quy doi - xem vnTime.ts) -> "dd/mm/yyyy HH:mm".
function fmtVN(dt: string | null): string {
  if (!dt) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(dt);
  if (!m) return dt;
  const [, y, mo, d, h, mi] = m;
  return `${d}/${mo}/${y} ${h}:${mi}`;
}

export function buildPartnerExcel(
  cases: PartnerCaseRow[],
  history: GiaiTrinhHistoryRow[],
  khaoSat: KhaoSatHistoryRow[] = [],
  viPham: ViPhamHistoryRow[] = [],
  viPhamGiaiTrinh: ViPhamGiaiTrinhHistoryRow[] = [],
): Uint8Array {
  const ksByCase = groupBy(khaoSat, (r) => r.case_id);
  const vpByCase = groupBy(viPham, (r) => r.case_id);
  const vpGtByViPham = groupBy(viPhamGiaiTrinh, (r) => r.vi_pham_id);
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
    const ksRows = ksByCase.get(c.id) ?? [];
    const lichSuKhaoSat = ksRows
      .map((r) => `${fmtVN(r.ngay_gio_thuc_hien)} - ${parseLoaiKhaoSat(r.loai_khao_sat).join(", ")} - ${r.ket_qua_cuoc_goi ?? ""}${r.dien_giai ? ` - ${r.dien_giai}` : ""}`)
      .join("\n");
    const vpRows = vpByCase.get(c.id) ?? [];
    const lichSuViPham = vpRows
      .map((r) => {
        const gt = (vpGtByViPham.get(r.id) ?? []).map((g) => `  + Giải trình ${fmtVN(g.ngay_giai_trinh)}: ${g.noi_dung_giai_trinh ?? ""}`);
        return [`${fmtVN(r.ngay_ghi_nhan)} - ${r.loai_loi} - ${r.ket_qua_cap_1 ?? ""} - ${viPhamTrangThai(r)}`, ...gt].join("\n");
      })
      .join("\n");
    aoa.push([
      c.id,
      c.ky_thuat_vien,
      c.khach_hang,
      c.seri_san_pham,
      c.khu_vuc,
      c.tinh,
      c.quan_huyen,
      c.hang,
      c.san_pham_bao_hanh,
      c.tien_do_hoan_thanh,
      c.mo_ta_loi,
      c.nhom_san_pham,
      c.nhom_yeu_cau,
      c.loai_yeu_cau,
      c.hinh_thuc_bao_hanh,
      c.ngay_mua,
      fmtVN(c.thoi_gian_cskh_tiep_nhan),
      fmtVN(c.thoi_gian_hen_xu_ly),
      fmtVN(c.thoi_gian_hoan_thanh),
      c.doi_tac,
      c.link_crm,
      c.noi_dung_xu_ly,
      c.luu_y_loi_linh_kien,
      c.cach_thuc_xu_ly,
      c.nganh,
      c.loai_nganh,
      c.nhom_kh,
      c.dt_san_pham,
      c.dt_linh_kien,
      c.dt_dich_vu,
      c.ly_do_qua_han,
      fmtVN(c.ngay_import),
      fmtVN(c.ngay_cap_nhat_gan_nhat),
      c.dung_han,
      c.xu_ly_24h_bucket,
      c.ly_do_huy,
      parseHinhAnhUrls(c.link_hinh_anh).join("\n"),
      rows.length,
      lichSuGiaiTrinh,
      ksRows.length,
      lichSuKhaoSat,
      vpRows.length,
      lichSuViPham,
    ]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as Uint8Array;
}
