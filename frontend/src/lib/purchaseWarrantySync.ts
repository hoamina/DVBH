// Dong bo "âm thầm" du lieu mua hang/bao hanh/xu ly thieu hang tu 5 Google Sheet da "Xuat ban len
// web" (pub?output=tsv, cong khai, khong can dang nhap) - CHOT 2026-08-02: khong luu ve D1, chi tai
// ve va cache TRONG TRINH DUYET (IndexedDB, tai dung co che o lib/closedDataCache.ts), tu doi chieu
// voi ID ca dang xem o CaseDetail.tsx (xem lib/purchaseWarrantyMatch.ts). TTL 2 gio - qua han thi
// hook usePurchaseWarrantyData.ts tu dong tai lai o lan mount tiep theo; nut "Dong bo lai" bo qua
// TTL, luon tai moi.
import { parseTsv } from "./tsvParser";
import { getCachedEntry, setCachedEntry } from "./closedDataCache";

export type PurchaseWarrantyDataset = "mua-hang" | "bao-hanh" | "thieu-hang";

// "_region": "MB"/"MN" hoac "" (danh sach khong tach mien, vd "thieu-hang") - dung "" thay vi null
// de khop voi index signature Record<string, string> cua SheetRow (moi field deu la string).
export type SheetRow = Record<string, string>;

const CACHE_PREFIX = "google-sheet:";
export const SYNC_TTL_MS = 2 * 60 * 60 * 1000;

interface SourceSheet {
  url: string;
  region: "MB" | "MN" | "";
}

const SOURCES: Record<PurchaseWarrantyDataset, SourceSheet[]> = {
  "mua-hang": [
    { url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ02aMyUHGYZC59csU07jfbzDX0M3vRPipKCN1ZAwhGU6p6JWElulY1GFn5aAAJuAJ3VegHivyEKsfN/pub?gid=925169848&single=true&output=tsv", region: "MB" },
    { url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vT7CgwA2tuwtoGq9MzKkWFjK-5n41r-grhvSzZAPf2JVJL8XTyBELDNGnrUfl3XieRBlo4bv_HgZPzC/pub?gid=935630667&single=true&output=tsv", region: "MN" },
  ],
  "bao-hanh": [
    { url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR8PEyHRH8FoyFh_wYsCOM01qvj09DiQ1Fc2eillVV-8b04wpxvWm6YGr7HxmBqyaYZoZis8KXF06H3/pub?gid=165964439&single=true&output=tsv", region: "MB" },
    { url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTr13_z0YA9ZQyCz59iapFqQtYVxoZY-NX-j87dPUDGA6oD5rXlqFg1v9Z7P2s3QYyLH3-usnJPCQwY/pub?gid=0&single=true&output=tsv", region: "MN" },
  ],
  "thieu-hang": [
    { url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ02aMyUHGYZC59csU07jfbzDX0M3vRPipKCN1ZAwhGU6p6JWElulY1GFn5aAAJuAJ3VegHivyEKsfN/pub?gid=658175112&single=true&output=tsv", region: "" },
  ],
};

// Moi truong hang - moi field co the co nhieu ten cot khac nhau giua sheet MB/MN (khac ca chu hoa
// lan tu ngu, vd "SỐ LƯỢNG ĐỀ XUẤT" o MB vs "Số lượng" o MN) - tra theo TEN, khong theo VI TRI cot.
const FIELD_ALIASES: Record<PurchaseWarrantyDataset, Record<string, string[]>> = {
  "mua-hang": {
    id: ["ID"],
    idXuat: ["ID XUẤT"],
    linhKien: ["LINH KIỆN"],
    maLinhKien: ["MÃ LINH KIỆN"],
    loaiDeXuat: ["LOẠI ĐỀ XUẤT"],
    soLuongDeXuat: ["SỐ LƯỢNG ĐỀ XUẤT", "Số lượng"],
    ngayTao: ["NGÀY TẠO"],
    trangThaiDuyet: ["TRẠNG THÁI DUYỆT"],
    soLuongThucXuat: ["SỐ LƯỢNG THỰC XUẤT"],
    lyDoTuChoi: ["LÝ DO TỪ CHỐI"],
    trangThaiGuiHang: ["TRẠNG THÁI GỬI HÀNG"],
    ngayKtvNhanHang: ["NGÀY KTV NHẬN HÀNG"],
    giaDeXuat: ["GIÁ ĐỀ XUẤT"],
    maSuCoLienQuan: ["MÃ YÊU CẦU CỦA SỰ CỐ LIÊN QUAN"],
  },
  "bao-hanh": {
    id: ["ID"],
    nguonTao: ["NGUỒN TẠO"],
    tinhTrangBaoHanh: ["TÌNH TRẠNG BẢO HÀNH"],
    trangThai: ["TRẠNG THÁI"],
    maYeuCau: ["MÃ YÊU CẦU"],
    maYeuCauNhapTay: ["MÃ YÊU CẦU NHẬP TAY"],
    modelSanPham: ["MODEL SẢN PHẨM"],
    hang: ["HÃNG"],
    serial: ["SERIAL"],
    linhKienSua: ["LINH KIỆN SỬA"],
    tinhTrangHuHong: ["TÌNH TRẠNG HƯ HỎNG"],
    phuongAnXuLy: ["PHƯƠNG ÁN XỬ LÝ"],
    cachThucXuLy: ["CÁCH THỨC XỬ LÝ"],
    nguyenNhanCham: ["NGUYÊN NHÂN CHẬM"],
    ngayGui: ["NGÀY GỬI"],
    ngayGioTraXong: ["NGÀY GIỜ TRẢ XONG"],
    danhGiaKetQua: ["ĐÁNH GIÁ KẾT QUẢ SAU SỬA CHỮA"],
    nguoiSua: ["NGƯỜI SỬA"],
    ghiChu: ["GHI CHÚ"],
  },
  "thieu-hang": {
    id: ["ID"],
    idLienKet: ["ID liên kết"],
    nguon: ["Nguồn"],
    lyDoLuaChon: ["Lý do lựa chọn"],
    giaiThichLyDo: ["Giải thích lý do thiếu hàng"],
    ngayDuKienCoHang: ["Ngày dự kiến có hàng"],
    ghiChu: ["Ghi chú"],
    trangThaiXuLy: ["Trạng thái xử lý"],
    ngayKhoXacNhan: ["Ngày kho xác nhận hàng về"],
    thayDoiNgayDuKien: ["Thay đổi ngày dự kiến hàng về"],
  },
};

function pickByAlias(row: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const v = row[alias];
    if (v) return v;
  }
  return "";
}

function projectRow(dataset: PurchaseWarrantyDataset, raw: Record<string, string>, region: "MB" | "MN" | ""): SheetRow {
  const aliases = FIELD_ALIASES[dataset];
  const out: SheetRow = { _region: region };
  for (const [field, names] of Object.entries(aliases)) {
    out[field] = pickByAlias(raw, names);
  }
  return out;
}

async function fetchSheet(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch that bai (${res.status})`);
  const text = await res.text();
  return parseTsv(text).rows;
}

async function fetchAndMergeDataset(dataset: PurchaseWarrantyDataset): Promise<SheetRow[]> {
  const sources = SOURCES[dataset];
  const perSource = await Promise.all(
    sources.map(async (s) => {
      const rows = await fetchSheet(s.url);
      return rows.map((r) => projectRow(dataset, r, s.region));
    }),
  );
  return perSource.flat();
}

function cacheKey(dataset: PurchaseWarrantyDataset): string {
  return `${CACHE_PREFIX}${dataset}`;
}

export function isStale(cachedAt: string | undefined): boolean {
  if (!cachedAt) return true;
  return Date.now() - new Date(cachedAt).getTime() > SYNC_TTL_MS;
}

/** Cache-first: tra ve du lieu da luu neu con trong TTL 2 gio, neu khong (hoac force) thi tai moi tu
 * Google roi ghi de cache. Loi mang van tra ve cache cu (neu co) thay vi nem loi, de UI khong bi vo -
 * chi that su bao loi khi CHUA TUNG co cache VA fetch that bai. */
export async function getDataset(dataset: PurchaseWarrantyDataset, opts?: { force?: boolean }): Promise<{ rows: SheetRow[]; cachedAt: string }> {
  const key = cacheKey(dataset);
  const cached = await getCachedEntry<SheetRow[]>(key);
  if (!opts?.force && cached && !isStale(cached.cachedAt)) {
    return { rows: cached.data, cachedAt: cached.cachedAt };
  }
  try {
    const rows = await fetchAndMergeDataset(dataset);
    const entry = await setCachedEntry(key, rows);
    return { rows, cachedAt: entry.cachedAt };
  } catch (err) {
    if (cached) return { rows: cached.data, cachedAt: cached.cachedAt };
    throw err;
  }
}
