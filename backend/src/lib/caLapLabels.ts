import { CA_LAP_LOAI_KEYS, HINH_THUC_XU_LY_KEYS, type CaLapLoai, type HinhThucXuLy } from "../types";

// Nhan hien thi (co dau) cua 2 danh muc Ca lap - PHAI khop CA_LAP_META / HINH_THUC_XU_LY_META o
// frontend/src/types.ts (khong co nguon chung, dong bo tay). Dung cho file mau import + chuan hoa gia tri
// nguoi dung go trong Excel ve ma noi bo khong dau luu DB.
export const CA_LAP_LABELS: Record<CaLapLoai, string> = {
  "Bo qua": "Bỏ qua",
  "Lap do nghiep vu KTV": "Lặp do nghiệp vụ kỹ thuật viên",
  "Lap do tay nghe KTV": "Lặp do tay nghề kỹ thuật viên",
  "Lap do chat luong linh kien": "Lặp do chất lượng linh kiện",
  "Lap do sai bao cao": "Lặp do sai báo cáo",
  "Lap do trung su vu": "Lặp do trùng sự vụ",
};

export const HINH_THUC_XU_LY_LABELS: Record<HinhThucXuLy, string> = {
  "Khong tinh lap khong tinh luong": "KHÔNG TÍNH LẶP, KHÔNG TÍNH LƯƠNG",
  "Tinh lap khong tinh luong": "TÍNH LẶP, KHÔNG TÍNH LƯƠNG",
  "Tinh luong": "TÍNH LƯƠNG",
  "Tinh luong loi bao cao": "TÍNH LƯƠNG, LỖI BÁO CÁO",
  "Khong tinh luong loi bao cao": "KHÔNG TÍNH LƯƠNG, LỖI BÁO CÁO",
  "Tinh luong kiem tra loi bao cao": "TÍNH LƯƠNG KIỂM TRA, LỖI BÁO CÁO",
};

// So khop khong phan biet dau / hoa thuong / khoang trang / dau cau - nguoi dien file hay go lech
// ("lap do tay nghe ktv", "TINH LUONG, LOI BAO CAO"...). Ca nhan hien thi lan ma noi bo deu nhan.
function khoaSoKhop(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u0111\u0110]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function taoBangTra<K extends string>(keys: readonly K[], labels: Record<K, string>): Map<string, K> {
  const m = new Map<string, K>();
  for (const k of keys) {
    m.set(khoaSoKhop(k), k);
    m.set(khoaSoKhop(labels[k]), k);
  }
  return m;
}

const CA_LAP_TRA = taoBangTra(CA_LAP_LOAI_KEYS, CA_LAP_LABELS);
const HINH_THUC_TRA = taoBangTra(HINH_THUC_XU_LY_KEYS, HINH_THUC_XU_LY_LABELS);

/** Tra ve ma noi bo, hoac null neu khong khop gia tri nao. */
export function chuanHoaCaLapLoai(raw: string): CaLapLoai | null {
  return CA_LAP_TRA.get(khoaSoKhop(raw)) ?? null;
}
export function chuanHoaHinhThuc(raw: string): HinhThucXuLy | null {
  return HINH_THUC_TRA.get(khoaSoKhop(raw)) ?? null;
}
