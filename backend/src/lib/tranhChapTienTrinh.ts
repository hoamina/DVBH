import type { Context } from "hono";
import type { Env } from "../types";
import { ageExpr } from "./ageCalc";

/** Redesign 2026-07-31: tach 2 giai doan xu ly tranh chap - Giam sat xu ly TRUOC (5 trang thai), neu
 * khong tu xu ly duoc thi chon "Giam sat chuyen CSKH" de ban giao sang CSKH (4 trang thai rieng).
 * Kien truc khong doi: trang thai 1 tien trinh = trang thai cua log MOI NHAT (khong luu cot rieng) -
 * chi mo rong so gia tri hop le cua 1 cot trang_thai_xu_ly duy nhat (xem migration
 * 0038_tranh_chap_trang_thai_v2.sql). */
export const GIAM_SAT_STATUSES = [
  "Giam sat chua xu ly",
  "Giam sat dang xu ly",
  "Giam sat dong hoan thanh",
  "Giam sat dong that bai",
  "Giam sat chuyen CSKH",
] as const;

export const CSKH_STATUSES = ["CSKH chua tiep nhan", "CSKH dang xu ly", "CSKH khong can xu ly", "CSKH xu ly xong"] as const;

export const ALL_TRANG_THAI_LOG = [...GIAM_SAT_STATUSES, ...CSKH_STATUSES] as const;
export type TrangThaiLog = (typeof ALL_TRANG_THAI_LOG)[number];

/** 4 trang thai "dong" - tien trinh/ca coi nhu xong, khong con hien trong badge/danh sach mac dinh. */
export const TRANH_CHAP_TRANG_THAI_DONG = ["Giam sat dong hoan thanh", "Giam sat dong that bai", "CSKH khong can xu ly", "CSKH xu ly xong"] as const;

/** 2 trang thai KSNB (la_ksnb_doi_tac) can theo doi - diem ban giao Giam sat -> CSKH (chot
 * 2026-07-31: KSNB chi quan tam ca dang o dung 2 trang thai nay, dung ca cho badge sidebar lan
 * filter rieng trong TranhChapModule.tsx). */
export const KSNB_WATCH_STATUSES = ["Giam sat chuyen CSKH", "CSKH dang xu ly"] as const;

/** Trang thai log coi la "dong tien trinh voi ket qua thuc su" - CHI 2 trang thai "thanh cong" nay
 * moi bat buoc ket_qua_xu_ly/hai_long_sau_tranh_chap (chot 2026-07-31: 2 trang thai "that bai/khong
 * can" con lai KHONG bat buoc, giong quy tac cu cua "Da huy bo tranh chap"). */
export const TRANG_THAI_CAN_KET_QUA = ["Giam sat dong hoan thanh", "CSKH xu ly xong"] as const;

/** Giai doan hien tai cua 1 tien trinh, tinh tu trang thai log MOI NHAT (null = tien trinh moi chua
 * co log nao) - dung de gioi han dropdown chon trang thai o log TIEP THEO chi trong dung giai doan
 * (chot 2026-07-31: khong cho quay lai giai doan Giam sat sau khi da chuyen CSKH). */
export function phaseOfStatus(status: string | null): "giam-sat" | "cskh" {
  if (status === "Giam sat chuyen CSKH") return "cskh";
  if ((CSKH_STATUSES as readonly string[]).includes(status ?? "")) return "cskh";
  return "giam-sat";
}

export const MUC_DO_VALUES = ["Binh thuong", "Cao", "Rat nghiem trong"] as const;
export type MucDo = (typeof MUC_DO_VALUES)[number];

export const HAI_LONG_VALUES = ["Khong xac dinh", "Khong hai long", "Binh thuong", "Hai long", "Rat hai long"] as const;
export type HaiLong = (typeof HAI_LONG_VALUES)[number];

/** Tien trinh MOI NHAT cua 1 ca (tt.id tang dan theo thu tu tao - xem nextSequentialId, chuoi
 * "TC-000123" zero-pad nen so sanh chuoi = so sanh so). Dung "c.id" lam alias ca trong query goi. */
export const LATEST_TIEN_TRINH_ID_OF_CASE = `(SELECT tt2.id FROM tranh_chap_tien_trinh tt2 WHERE tt2.case_id = c.id ORDER BY tt2.id DESC LIMIT 1)`;

/** Trang thai cua 1 tien trinh = trang thai log MOI NHAT (id lon nhat) cua no. */
export function latestLogStatusOfTienTrinh(tienTrinhIdExpr: string): string {
  return `(SELECT trang_thai_xu_ly FROM tranh_chap_log WHERE tien_trinh_id = ${tienTrinhIdExpr} ORDER BY id DESC LIMIT 1)`;
}

/** Trang thai "chung" cua 1 CA (c.id) - theo tien trinh moi nhat, hoac 'Chua xu ly' (gia tri ao,
 * khong luu DB) neu ca chua tung co tien trinh nao. Dung COALESCE nen luon tra ve 1 chuoi khong
 * NULL - tien loi khi dua vao dieu kien NOT IN (...) o cac truy van dem/loc. */
export const CASE_TRANH_CHAP_STATUS_EXPR = `COALESCE(${latestLogStatusOfTienTrinh(LATEST_TIEN_TRINH_ID_OF_CASE)}, 'Chua xu ly')`;

export const TUOI_TIEN_TRINH_EXPR = ageExpr("tt.ngay_tao");

/** Nguoi dung co duoc GHI (tiep nhan tien trinh moi / them log) cho 1 ca thuoc khu_vuc cho truoc
 * hay khong - chot 2026-07-29: KSNB Doi tac (co la_ksnb_doi_tac) + Giam sat DUNG khu vuc do + TBP
 * DVBH/Admin (xem toan bo). Khac scopeTranhChap() (chi gioi han PHAM VI XEM) - day la kiem tra GHI
 * cho 1 ca CU THE. */
export function canWriteTranhChap(c: Context<{ Bindings: Env }>, khuVucCa: string | null): boolean {
  const user = c.get("user");
  if (user.la_ksnb_doi_tac) return true;
  if (user.vai_tro === "TBP DVBH" || user.vai_tro === "Admin") return true;
  if (user.vai_tro === "Giam sat") return !!khuVucCa && user.khu_vuc_phu_trach.includes(khuVucCa);
  return false;
}

/** Nguoi dung co duoc SUA phan_loai_tranh_chap/muc_do cua 1 tien trinh dang MO hay khong - HEP HON
 * canWriteTranhChap() o tren: CHI KSNB Doi tac + TBP DVBH/Admin, KHONG gom Giam sat (chot 2026-07-29:
 * nguoi dung noi ro "KSNB co the thay doi", phan loai/muc do la quyet dinh cua KSNB luc tiep nhan,
 * khong phai cua Giam sat khu vuc). */
export function canEditTienTrinhMeta(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_ksnb_doi_tac || user.vai_tro === "TBP DVBH" || user.vai_tro === "Admin";
}
