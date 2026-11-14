/**
 * Hạn bảo hành tự động (2026-11-14, chủ hệ thống): hạn = ngày mua + 24 tháng / ngày sản xuất + 36 tháng, mốc nào ĐẾN TRƯỚC thì lấy
 * mốc đó. Ngày CSKH tiếp nhận ca > hạn -> "Hết bảo hành", ngược lại "Còn bảo hành". Chỉ tính cho ca tiếp nhận từ 01/11/2026
 * (HAN_BH_TU_NGAY). GS sửa tay được (case_hd_bh.con_bao_hanh) - giá trị tay luôn thắng.
 * BẢN SAO của backend/src/lib/hanBaoHanh.ts - sửa quy tắc thì sửa cả 2.
 */
export const HAN_BH_TU_NGAY = "2026-11-01";
export const THANG_THEO_NGAY_MUA = 24;
export const THANG_THEO_NGAY_SX = 36;

export type TrangThaiBh = "con" | "het" | "khong_ro" | "khong_ap_dung";

/** 'YYYY-MM-DD[ hh:mm...]' | 'YYYY-MM-DDThh..' | 'DD/MM/YYYY' -> 'YYYY-MM-DD' hoặc null. */
export function ngayIso(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Cộng n tháng, ngày vượt cuối tháng thì lùi về ngày cuối tháng (31/01 + 1T = 28|29/02). */
export function congThang(iso: string, n: number): string {
  const [y, mo, d] = iso.split("-").map(Number);
  const tong = y * 12 + (mo - 1) + n;
  const ny = Math.floor(tong / 12);
  const nm = (tong % 12) + 1;
  const cuoiThang = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, cuoiThang)).padStart(2, "0")}`;
}

export interface KetQuaHanBh {
  han: string | null; // YYYY-MM-DD
  theo: "ngay_mua" | "ngay_san_xuat" | null;
  tu_dong: TrangThaiBh;
}

export function tinhHanBaoHanh(ngayMua: string | null | undefined, ngaySanXuat: string | null | undefined, tiepNhan: string | null | undefined): KetQuaHanBh {
  const tn = ngayIso(tiepNhan);
  const mua = ngayIso(ngayMua);
  const sx = ngayIso(ngaySanXuat);
  const hanMua = mua ? congThang(mua, THANG_THEO_NGAY_MUA) : null;
  const hanSx = sx ? congThang(sx, THANG_THEO_NGAY_SX) : null;
  let han: string | null = null;
  let theo: KetQuaHanBh["theo"] = null;
  if (hanMua && (!hanSx || hanMua <= hanSx)) {
    han = hanMua;
    theo = "ngay_mua";
  } else if (hanSx) {
    han = hanSx;
    theo = "ngay_san_xuat";
  }
  if (!tn || tn < HAN_BH_TU_NGAY) return { han, theo, tu_dong: "khong_ap_dung" };
  if (!han) return { han, theo, tu_dong: "khong_ro" };
  return { han, theo, tu_dong: tn > han ? "het" : "con" };
}

/** Giá trị cuối cùng: tay (1/0) thắng, không có thì theo tự động. */
export function trangThaiBhCuoi(tay: number | null | undefined, tuDong: TrangThaiBh): TrangThaiBh {
  if (tay === 1) return "con";
  if (tay === 0) return "het";
  return tuDong;
}

export const NHAN_BH: Record<TrangThaiBh, string> = {
  con: "Còn bảo hành",
  het: "Hết bảo hành",
  khong_ro: "Chưa đủ dữ liệu",
  khong_ap_dung: "Không tính (trước 11/2026)",
};
