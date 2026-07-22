/**
 * LUONG IMPORT DU LIEU HANG NGAY - HE THONG QUAN LY GIAI TRINH TON DVBH
 *
 * Nguyen tac (da chot voi user):
 * 1. So khop theo cot ID
 *    - ID chua co          -> ghi moi, ngay_import = ngay_cap_nhat_gan_nhat = now()
 *    - ID da co, du lieu
 *      nghiep vu KHONG doi:
 *        + case da co thoi_gian_hoan_thanh -> BO QUA HOAN TOAN, khong cap nhat gi
 *        + case chua co thoi_gian_hoan_thanh (ca ton) -> chi cap nhat
 *          ngay_cap_nhat_gan_nhat = now(), giu nguyen noi dung
 *    - ID da co, du lieu nghiep vu CO doi -> ghi de toan bo, cap nhat
 *      ngay_cap_nhat_gan_nhat = now()
 * 2. 4 cot nghi ngo vi pham (loi_120p, loi_qua_han_24h, loi_lo_ke_hoach,
 *    loi_kh_hen_lai) KHONG ghi de truc tiep - luon di qua ham ratchet():
 *      - DB dang true  -> giu true, bo qua gia tri import
 *      - DB dang false, import true -> cap nhat thanh true
 *      - con lai        -> false
 *    Ratchet CHI ap dung khi case chua co thoi_gian_hoan_thanh (truong hop
 *    da bo qua hoan toan o buoc 1 thi khong dung toi ratchet nua).
 * 3. Gia tri nguon co the la True/False (boolean), 1.0/0.0 (so), hoac
 *    rong/NaN - tat ca duoc chuan hoa ve boolean, rong/NaN = false.
 * 4. Xu ly TUAN TU (khong Promise.all song song) de tranh 2 dong cung doc/
 *    ghi de len 1 case gay sai lech du lieu.
 */

const XLSX = require('xlsx');
const { Pool } = require('pg');

const pool = new Pool(); // cau hinh qua bien moi truong PG*

// Cac cot nghiep vu dung de so sanh "co thay doi hay khong".
// KHONG bao gom: id, 4 cot vi pham (xu ly rieng qua ratchet),
// va cac cot he thong (ngay_import, ngay_cap_nhat_gan_nhat, created_at, updated_at).
const BUSINESS_FIELDS = [
  'khach_hang', 'link_crm', 'seri_san_pham', 'cach_thuc_xu_ly', 'tinh',
  'quan_huyen', 'thoi_gian_cskh_tiep_nhan', 'mo_ta_loi', 'thoi_gian_hen_xu_ly',
  'nhom_yeu_cau', 'loai_yeu_cau', 'hang', 'san_pham_bao_hanh',
  'hinh_thuc_bao_hanh', 'ky_thuat_vien', 'tien_do_hoan_thanh',
  'thoi_gian_hoan_thanh', 'luu_y_loi_linh_kien', 'ly_do_huy',
  'noi_dung_xu_ly', 'ly_do_qua_han', 'dt_san_pham', 'dt_linh_kien',
  'dt_dich_vu', 'khu_vuc', 'thoi_gian_goc_dong_ca', 'so_phut_xu_ly',
  'dung_han', 'xu_ly_24h_bucket', 'doi_tac', 'ngay_mua', 'nhom_kh',
  'nganh', 'loai_nganh', 'nhom_san_pham', 'thoi_gian_tai_du_lieu_crm',
];

const VIOLATION_FIELDS = [
  'loi_120p', 'loi_qua_han_24h', 'loi_lo_ke_hoach', 'loi_kh_hen_lai',
];

// Map ten cot Excel (tieng Viet co dau) -> ten cot chuan hoa trong DB
const COLUMN_MAP = {
  'ID': 'id',
  'Khách hàng': 'khach_hang',
  'Link CRM': 'link_crm',
  'Seri sản phẩm': 'seri_san_pham',
  'Cách thức xử lý': 'cach_thuc_xu_ly',
  'Tỉnh': 'tinh',
  'Quận/ huyện': 'quan_huyen',
  'Thời gian CSKH tiếp nhận': 'thoi_gian_cskh_tiep_nhan',
  'Mô tả tình trạng lỗi của sản phẩm': 'mo_ta_loi',
  'Thời gian hẹn xử lý': 'thoi_gian_hen_xu_ly',
  'Nhóm yêu cầu': 'nhom_yeu_cau',
  'Loại yêu cầu': 'loai_yeu_cau',
  'Hãng theo model': 'hang',
  'Sản phẩm bảo hành': 'san_pham_bao_hanh',
  'Hình thức bảo hành': 'hinh_thuc_bao_hanh',
  'Kỹ thuật viên': 'ky_thuat_vien',
  'Tiến độ hoàn thành': 'tien_do_hoan_thanh',
  'Thời gian hoàn thành': 'thoi_gian_hoan_thanh',
  'Lưu ý thông tin lỗi linh kiện': 'luu_y_loi_linh_kien',
  'Lý do hủy': 'ly_do_huy',
  'Nội dung xử lý chi tiết': 'noi_dung_xu_ly',
  'XLSC Lý do quá hạn': 'ly_do_qua_han',
  'DT sản phẩm đúng': 'dt_san_pham',
  'DT linh kiện đúng': 'dt_linh_kien',
  'DT dịch vụ đúng': 'dt_dich_vu',
  'TBP': 'khu_vuc', // xac nhan: cot "TBP" thuc chat la Khu vuc
  'Thời gian gốc theo ca đóng hoàn thành lỗi': 'thoi_gian_goc_dong_ca',
  'THỜI GIAN XỬ LÝ': 'so_phut_xu_ly',
  'ĐÚNG HẠN': 'dung_han',
  'XỬ LÝ 24h': 'xu_ly_24h_bucket',
  'Đối tác': 'doi_tac',
  'Ngày mua': 'ngay_mua',
  'Nhóm KH': 'nhom_kh',
  'Ngành': 'nganh',
  'Loại ngành': 'loai_nganh',
  'Nhóm sản phẩm': 'nhom_san_pham',
  'Thời gian tải dữ liệu': 'thoi_gian_tai_du_lieu_crm',
  'Lỗi 120 phút': 'loi_120p',
  'Lỗi quá hẹn 24h': 'loi_qua_han_24h',
  'Lỗi lỡ kế hoạch': 'loi_lo_ke_hoach',
  'Lỗi KH hẹn lại': 'loi_kh_hen_lai',
};

/**
 * Chuan hoa gia tri 4 cot nghi ngo vi pham ve boolean that.
 * True/False, 1/0, 1.0/0.0, rong/NaN/undefined -> boolean.
 */
function normalizeViolationFlag(rawValue) {
  if (rawValue === true || rawValue === 1 || rawValue === '1') return true;
  if (rawValue === false || rawValue === 0 || rawValue === '0') return true === false; // luon false
  // rong, NaN, undefined, null -> false theo quyet dinh cua user
  return false;
}

/**
 * Ap quy tac ratchet 1 chieu cho 1 cot vi pham.
 */
function ratchetFlag(currentDbValue, importValue) {
  if (currentDbValue === true) return true; // da true thi giu nguyen, khong bao gio bi rut lai
  return importValue === true;
}

/**
 * So sanh cac truong nghiep vu (khong tinh 4 cot vi pham va truong he thong).
 * Tra ve true neu co it nhat 1 truong khac nhau.
 */
function hasBusinessDataChanged(existingRow, incomingRow) {
  for (const field of BUSINESS_FIELDS) {
    const oldVal = existingRow[field] ?? null;
    const newVal = incomingRow[field] ?? null;
    if (String(oldVal) !== String(newVal)) return true;
  }
  return false;
}

/**
 * Doc file Excel, tra ve mang cac dong da map sang ten cot chuan hoa.
 */
function readImportFile(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets['DATA'];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  return rawRows.map((rawRow) => {
    const row = {};
    for (const [excelCol, dbCol] of Object.entries(COLUMN_MAP)) {
      row[dbCol] = rawRow[excelCol] ?? null;
    }
    return row;
  });
}

/**
 * Xu ly 1 dong du lieu: quyet dinh ghi moi / bo qua / cap nhat mot phan /
 * ghi de toan bo, ap dung ratchet cho 4 cot vi pham.
 */
async function processRow(client, incomingRow) {
  const { rows } = await client.query(
    'SELECT * FROM case_dvbh WHERE id = $1 FOR UPDATE',
    [incomingRow.id],
  );
  const existingRow = rows[0];
  const now = new Date();

  const normalizedFlags = {};
  for (const field of VIOLATION_FIELDS) {
    normalizedFlags[field] = normalizeViolationFlag(incomingRow[field]);
  }

  // Truong hop 1: ID chua co -> ghi moi
  if (!existingRow) {
    const insertFields = [...BUSINESS_FIELDS, ...VIOLATION_FIELDS, 'id', 'ngay_import', 'ngay_cap_nhat_gan_nhat'];
    const insertValues = {
      ...Object.fromEntries(BUSINESS_FIELDS.map((f) => [f, incomingRow[f]])),
      ...normalizedFlags,
      id: incomingRow.id,
      ngay_import: now,
      ngay_cap_nhat_gan_nhat: now,
    };
    await insertCase(client, insertValues);
    return { id: incomingRow.id, action: 'GHI_MOI' };
  }

  // Truong hop 2: ID da co, case da hoan thanh -> kiem tra co thay doi khong
  const dataChanged = hasBusinessDataChanged(existingRow, incomingRow);

  if (existingRow.thoi_gian_hoan_thanh && !dataChanged) {
    // Da hoan thanh, khong doi gi -> bo qua hoan toan, khong dung toi ratchet
    return { id: incomingRow.id, action: 'BO_QUA' };
  }

  // Ap ratchet cho 4 cot vi pham (dung cho ca 2 truong hop con lai)
  const finalFlags = {};
  for (const field of VIOLATION_FIELDS) {
    finalFlags[field] = ratchetFlag(existingRow[field], normalizedFlags[field]);
  }

  if (!dataChanged) {
    // Truong hop 3: ca ton, du lieu khong doi -> chi cap nhat ngay_cap_nhat_gan_nhat + ratchet
    await client.query(
      `UPDATE case_dvbh SET ngay_cap_nhat_gan_nhat = $1, updated_at = $1,
         loi_120p = $2, loi_qua_han_24h = $3, loi_lo_ke_hoach = $4, loi_kh_hen_lai = $5
       WHERE id = $6`,
      [now, finalFlags.loi_120p, finalFlags.loi_qua_han_24h,
       finalFlags.loi_lo_ke_hoach, finalFlags.loi_kh_hen_lai, incomingRow.id],
    );
    return { id: incomingRow.id, action: 'CAP_NHAT_MOC_THOI_GIAN' };
  }

  // Truong hop 4: du lieu co thay doi -> ghi de toan bo (tru 4 cot vi pham dung ratchet)
  await updateCaseFull(client, incomingRow.id, incomingRow, finalFlags, now);
  return { id: incomingRow.id, action: 'GHI_DE' };
}

async function insertCase(client, values) {
  const fields = Object.keys(values);
  const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
  await client.query(
    `INSERT INTO case_dvbh (${fields.join(', ')}) VALUES (${placeholders})`,
    Object.values(values),
  );
}

async function updateCaseFull(client, id, incomingRow, finalFlags, now) {
  const setClauses = [];
  const values = [];
  let i = 1;

  for (const field of BUSINESS_FIELDS) {
    setClauses.push(`${field} = $${i++}`);
    values.push(incomingRow[field]);
  }
  for (const field of VIOLATION_FIELDS) {
    setClauses.push(`${field} = $${i++}`);
    values.push(finalFlags[field]);
  }
  setClauses.push(`ngay_cap_nhat_gan_nhat = $${i++}`);
  values.push(now);
  setClauses.push(`updated_at = $${i++}`);
  values.push(now);

  values.push(id);
  await client.query(
    `UPDATE case_dvbh SET ${setClauses.join(', ')} WHERE id = $${i}`,
    values,
  );
}

/**
 * Ham chinh: doc file va xu ly TUAN TU tung dong trong 1 transaction.
 */
async function runImport(filePath) {
  const rows = readImportFile(filePath);
  const client = await pool.connect();
  const summary = { GHI_MOI: 0, BO_QUA: 0, CAP_NHAT_MOC_THOI_GIAN: 0, GHI_DE: 0 };

  try {
    await client.query('BEGIN');
    for (const row of rows) {
      const result = await processRow(client, row);
      summary[result.action]++;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return summary;
}

module.exports = {
  runImport,
  normalizeViolationFlag,
  ratchetFlag,
  hasBusinessDataChanged,
};
