/**
 * Port truc tiep tu import.js (thiet ke goc Node.js/pg) sang D1.
 * Nguyen tac ratchet 1 chieu cho 4 cot nghi ngo vi pham:
 *   DB dang true  -> giu true, bo qua gia tri import
 *   DB dang false, import true -> cap nhat thanh true
 *   con lai -> false
 * NaN/rong trong file import coi nhu false.
 */

export const BUSINESS_FIELDS = [
  "khach_hang", "link_crm", "seri_san_pham", "cach_thuc_xu_ly", "tinh",
  "quan_huyen", "thoi_gian_cskh_tiep_nhan", "mo_ta_loi", "thoi_gian_hen_xu_ly",
  "nhom_yeu_cau", "loai_yeu_cau", "hang", "san_pham_bao_hanh",
  "hinh_thuc_bao_hanh", "ky_thuat_vien", "tien_do_hoan_thanh",
  "thoi_gian_hoan_thanh", "luu_y_loi_linh_kien", "ly_do_huy",
  "noi_dung_xu_ly", "ly_do_qua_han", "dt_san_pham", "dt_linh_kien",
  "dt_dich_vu", "khu_vuc", "thoi_gian_goc_dong_ca", "so_phut_xu_ly",
  "dung_han", "xu_ly_24h_bucket", "doi_tac", "ngay_mua", "nhom_kh",
  "nganh", "loai_nganh", "nhom_san_pham", "tinh_vao_kpi", "thoi_gian_tai_du_lieu_crm",
  "link_hinh_anh",
] as const;

export const VIOLATION_FIELDS = [
  "loi_120p", "loi_qua_han_24h", "loi_lo_ke_hoach", "loi_kh_hen_lai", "nghi_ngo_nap_gas", "nghi_ngo_tranh_chap",
] as const;

// Ten cot Excel (tieng Viet co dau) -> ten cot chuan hoa trong DB
export const COLUMN_MAP: Record<string, string> = {
  "ID": "id",
  "Khách hàng": "khach_hang",
  "Link CRM": "link_crm",
  "Seri sản phẩm": "seri_san_pham",
  "Cách thức xử lý": "cach_thuc_xu_ly",
  "Tỉnh": "tinh",
  "Quận/ huyện": "quan_huyen",
  "Thời gian CSKH tiếp nhận": "thoi_gian_cskh_tiep_nhan",
  "Mô tả tình trạng lỗi của sản phẩm": "mo_ta_loi",
  "Thời gian hẹn xử lý": "thoi_gian_hen_xu_ly",
  "Nhóm yêu cầu": "nhom_yeu_cau",
  "Loại yêu cầu": "loai_yeu_cau",
  "Hãng theo model": "hang",
  "Sản phẩm bảo hành": "san_pham_bao_hanh",
  "Hình thức bảo hành": "hinh_thuc_bao_hanh",
  "Kỹ thuật viên": "ky_thuat_vien",
  "Tiến độ hoàn thành": "tien_do_hoan_thanh",
  "Thời gian hoàn thành": "thoi_gian_hoan_thanh",
  "Lưu ý thông tin lỗi linh kiện": "luu_y_loi_linh_kien",
  "Lý do hủy": "ly_do_huy",
  "Nội dung xử lý chi tiết": "noi_dung_xu_ly",
  "XLSC Lý do quá hạn": "ly_do_qua_han",
  "DT sản phẩm đúng": "dt_san_pham",
  "DT linh kiện đúng": "dt_linh_kien",
  "DT dịch vụ đúng": "dt_dich_vu",
  "TBP": "khu_vuc",
  "Link hình ảnh": "link_hinh_anh",
  "Thời gian gốc theo ca đóng hoàn thành lỗi": "thoi_gian_goc_dong_ca",
  "THỜI GIAN XỬ LÝ": "so_phut_xu_ly",
  "ĐÚNG HẠN": "dung_han",
  "XỬ LÝ 24h": "xu_ly_24h_bucket",
  "Đối tác": "doi_tac",
  "Ngày mua": "ngay_mua",
  "Nhóm KH": "nhom_kh",
  "Ngành": "nganh",
  "Loại ngành": "loai_nganh",
  "Nhóm sản phẩm": "nhom_san_pham",
  "Tính vào KPIs": "tinh_vao_kpi",
  "Thời gian tải dữ liệu": "thoi_gian_tai_du_lieu_crm",
  "Lỗi 120 phút": "loi_120p",
  "Lỗi quá hẹn 24h": "loi_qua_han_24h",
  "Lỗi lỡ kế hoạch": "loi_lo_ke_hoach",
  "Lỗi KH hẹn lại": "loi_kh_hen_lai",
  "Nghi ngờ nạp gas": "nghi_ngo_nap_gas",
  "Nghi ngờ tranh chấp": "nghi_ngo_tranh_chap",
};

export function normalizeViolationFlag(rawValue: unknown): boolean {
  if (rawValue === true || rawValue === 1 || rawValue === "1") return true;
  return false; // false/0/rong/NaN/undefined/null -> false
}

export function ratchetFlag(currentDbValue: boolean, importValue: boolean): boolean {
  if (currentDbValue === true) return true; // da true thi giu nguyen
  return importValue === true;
}

// "Tinh vao KPIs" - cot moi thay logic cu "KHONG TINH" (xem migration 0011). Mac dinh CO tinh
// (true) khi thieu/rong - khac VIOLATION_FIELDS (mac dinh false khi rong) - vi day la co che
// "loai tru khi duoc noi ro", khong phai "co nghi ngo khi duoc noi ro".
export function normalizeTinhVaoKpi(rawValue: unknown): boolean {
  if (rawValue === undefined || rawValue === null || rawValue === "") return true;
  if (rawValue === false || rawValue === 0) return false;
  const str = String(rawValue).trim().toUpperCase();
  if (str === "FALSE" || str === "0") return false;
  return true;
}

// "Link hinh anh" - cot moi sau "TBP" trong file import: nhieu URL anh bao cao cong viec cach nhau
// boi dau phay, domain rut gon "key.com/" can doi thanh domain S3 that truoc khi luu DB (khong doi
// nguyen gia tri tho cho client - client chi nhan ket qua da xu ly xong qua API). Gioi han 30 anh/ca.
const LINK_HINH_ANH_SHORT_DOMAIN = "key.com/";
const LINK_HINH_ANH_S3_BASE = "https://srt-iotp-prod-storage.s3.ap-southeast-1.amazonaws.com/";
const LINK_HINH_ANH_MAX = 30;

export function parseLinkHinhAnh(rawValue: unknown): string | null {
  if (rawValue === undefined || rawValue === null || rawValue === "") return null;
  const urls = String(rawValue)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, LINK_HINH_ANH_MAX)
    .map((s) => s.replaceAll(LINK_HINH_ANH_SHORT_DOMAIN, LINK_HINH_ANH_S3_BASE));
  return urls.length > 0 ? JSON.stringify(urls) : null;
}

// Gia tri se ghi vao DB cho 1 cot BUSINESS_FIELDS - hau het chi truyen thang, rieng tinh_vao_kpi
// can chuan hoa ve 1/0 (chap nhan TRUE/FALSE dang chu, dang bool, dang so tu Excel/Sheet), va
// link_hinh_anh can tach + doi domain (xem parseLinkHinhAnh o tren). Cac cot gio (thoi_gian_*) duoc
// GIU NGUYEN gia tri nhap - toan bo he thong quy uoc luu gio VN dia phuong (khong phai UTC), xem
// ageCalc.ts AGE_ANCHOR va frontend/src/types.ts fmtDateTime.
export function businessFieldValue(field: string, incoming: Record<string, unknown>): unknown {
  if (field === "tinh_vao_kpi") return normalizeTinhVaoKpi(incoming[field]) ? 1 : 0;
  if (field === "link_hinh_anh") return parseLinkHinhAnh(incoming[field]);
  return incoming[field] ?? null;
}

// Cac cot so thuc - chuan hoa qua Number() truoc khi hash de "100000" (DB) vs "100000.0" (Excel)
// khong bi coi la khac nhau du cung gia tri, tranh GHI_DE thua khong can thiet moi lan import.
const NUMERIC_BUSINESS_FIELDS = new Set(["dt_san_pham", "dt_linh_kien", "dt_dich_vu", "so_phut_xu_ly"]);

function canonicalizeForHash(field: string, rawValue: unknown): string {
  if (rawValue === null || rawValue === undefined || rawValue === "") return "";
  if (NUMERIC_BUSINESS_FIELDS.has(field)) {
    const n = Number(rawValue);
    if (Number.isFinite(n)) return String(n);
  }
  return String(rawValue);
}

/**
 * Hash SHA-256 cua toan bo BUSINESS_FIELDS, tinh tu gia tri DA qua businessFieldValue() (dung y het
 * phep chuan hoa se ghi vao DB - tinh_vao_kpi/link_hinh_anh...) roi ghep chuoi theo THU TU CO DINH
 * (BUSINESS_FIELDS) truoc khi hash, dam bao 2 lan goi cung du lieu luon ra cung hash bat ke thu tu
 * key trong object dau vao. Thay the hasBusinessDataChanged() (so sanh tung cot, can doc full row) -
 * dung khi CHI doc crm_hash cu tu DB (xem importProcessor.ts fetchExistingRows, KHONG con SELECT *)
 * roi so voi hash tinh tu dong nhap moi. Cot ky thuat (updated_at, ngay_import,
 * ngay_cap_nhat_gan_nhat) va VIOLATION_FIELDS KHONG nam trong hash nay - vi pham so sanh rieng qua
 * ratchetFlag(), khong duoc lam "che mat" thay doi du lieu nghiep vu that su.
 */
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeCrmHash(incoming: Record<string, unknown>): Promise<string> {
  const parts = BUSINESS_FIELDS.map((f) => `${f}=${canonicalizeForHash(f, businessFieldValue(f, incoming))}`);
  return sha256Hex(parts.join("|"));
}

/**
 * Bien the cua computeCrmHash() dung cho BACKFILL: gia tri dau vao la 1 dong DA CO san trong DB (da
 * qua businessFieldValue() tu lan ghi truoc), KHONG duoc goi lai businessFieldValue()/parseLinkHinhAnh()
 * len no lan 2 - vd link_hinh_anh trong DB da la JSON array string ("[\"url1\",\"url2\"]"), goi
 * parseLinkHinhAnh() (tach theo dau phay) len chuoi nay se cat nham thanh nhieu "URL" rac. Dung
 * canonicalizeForHash() truc tiep tren gia tri DB - phai cho ra hash GIONG HET computeCrmHash() cho
 * cung 1 du lieu nghiep vu, de dong duoc backfill roi khong bi coi la "doi" o lan import that tiep
 * theo (xem routes/importRoute.ts POST /backfill-crm-hash).
 */
export async function computeCrmHashFromDbRow(dbRow: Record<string, unknown>): Promise<string> {
  const parts = BUSINESS_FIELDS.map((f) => `${f}=${canonicalizeForHash(f, dbRow[f])}`);
  return sha256Hex(parts.join("|"));
}
