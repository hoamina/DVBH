import type { Context } from "hono";
import type { Env } from "../types";
import { ageExpr } from "./ageCalc";
import { fromJsonArray } from "./jsonArray";

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

/** true neu 1 trang thai la "dang mo" (khong thuoc TRANH_CHAP_TRANG_THAI_DONG) - dung de tinh cot
 * cache tranh_chap_tien_trinh.dang_mo (migration 0098) tai 3 diem ghi log (POST /:caseId/tiep-nhan,
 * POST /tien-trinh/:id/log, PATCH /log/:id) + import hang loat. */
export function isTrangThaiDangMo(trangThai: string): boolean {
  return !(TRANH_CHAP_TRANG_THAI_DONG as readonly string[]).includes(trangThai);
}

/** Gia tri UTC "YYYY-MM-DD HH:MM:SS" KHOP DUNG dinh dang SQLite datetime('now') (RAW UTC, khac
 * nowVN() - xem chu thich cot log_created_at_hien_tai trong migration 0098) - dung khi INSERT
 * tranh_chap_log tuong minh (thay vi de DEFAULT tu quyet dinh) de co the ghi CUNG gia tri do vao
 * tranh_chap_tien_trinh.log_created_at_hien_tai trong CUNG 1 batch. */
export function nowUtcSqlite(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

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

/** Trang thai cua log NGAY TRUOC log moi nhat, trong CUNG tien trinh moi nhat cua 1 ca (c.id) - NULL
 * neu tien trinh moi nhat chi co 1 log (vua tao, chua co lich su). Dung de phat hien "GQKN day lai
 * GS" ben duoi (khac phaseOfStatus() - ham do tinh giai doan cua trang thai HIEN TAI, con day can biet
 * trang thai TRUOC do de phan biet 2 nguon cung dan den "Giam sat chua xu ly"). */
export const PREV_LOG_STATUS_OF_LATEST_TIEN_TRINH_EXPR = `(SELECT trang_thai_xu_ly FROM tranh_chap_log WHERE tien_trinh_id = ${LATEST_TIEN_TRINH_ID_OF_CASE} ORDER BY id DESC LIMIT 1 OFFSET 1)`;

/** true (1)/false (0) - 1 ca (c.id) dang o trang thai "Giam sat chua xu ly" DO CSKH vua "Chuyen lai
 * giam sat xu ly" (khac truong hop tien trinh MOI TAO co trang thai dau tien cung la "Giam sat chua xu
 * ly" - phan biet bang: log NGAY TRUOC do phai thuoc giai doan CSKH, tien trinh moi tao thi khong co
 * log truoc do NEN PREV_LOG_STATUS... la NULL, khong khop dieu kien IN (...) - CHOT 2026-08-20, dung
 * cho cot "GQKN day lai GS" trong bao-cao-khu-vuc). Fix 2026-08-20 (phat hien qua ca thuc te TC-000107/
 * case 1287372): "giai doan CSKH" KHONG chi la CSKH_STATUSES (4 gia tri) - "Giam sat chuyen CSKH" (diem
 * ban giao) CUNG duoc phaseOfStatus() tinh la giai doan "cskh", va KSNB/Admin co the "Chuyen lai giam
 * sat" NGAY sau buoc ban giao nay ma CHUA TUNG co 1 log CSKH_STATUSES thuc su nao - phai gom CA "Giam
 * sat chuyen CSKH" vao danh sach so khop, khong chi rieng CSKH_STATUSES. CSKH_STATUSES/"Giam sat chuyen
 * CSKH" la hang so co dinh (khong phai input nguoi dung) nen an toan noi thang gia tri vao chuoi SQL
 * (khong can bind), giong CASE_TRANH_CHAP_STATUS_EXPR o tren da noi san 'Chua xu ly'. */
export const IS_GQKN_DAY_LAI_GS_EXPR = `COALESCE((${CASE_TRANH_CHAP_STATUS_EXPR} = 'Giam sat chua xu ly' AND ${PREV_LOG_STATUS_OF_LATEST_TIEN_TRINH_EXPR} IN ('Giam sat chuyen CSKH', ${CSKH_STATUSES.map((s) => `'${s}'`).join(", ")})), 0)`;

export const TUOI_TIEN_TRINH_EXPR = ageExpr("tt.ngay_tao");

/** Nguoi dung co duoc GHI (tiep nhan tien trinh moi / them log) cho 1 ca thuoc khu_vuc cho truoc
 * hay khong - chot 2026-07-29: KSNB Doi tac (co la_ksnb_doi_tac) + Giam sat DUNG khu vuc do + TBP
 * DVBH/Admin (xem toan bo). Them QC 2026-08-25 (xem toan bo, giong TBP DVBH/Admin - QC da thuoc
 * ROLES_XEM_TOAN_BO nen khong gioi han khu_vuc). Khac scopeTranhChap() (chi gioi han PHAM VI XEM) -
 * day la kiem tra GHI cho 1 ca CU THE. */
export function canWriteTranhChap(c: Context<{ Bindings: Env }>, khuVucCa: string | null): boolean {
  const user = c.get("user");
  if (user.la_ksnb_doi_tac) return true;
  if (user.vai_tro === "TBP DVBH" || user.vai_tro === "Admin" || user.vai_tro === "QC") return true;
  if (user.vai_tro === "Giam sat") return !!khuVucCa && user.khu_vuc_phu_trach.includes(khuVucCa);
  return false;
}

/** Nguoi dung co duoc XAC NHAN "Dung la tranh chap"/"Khong phai tranh chap" cho 1 ca do AI phat hien
 * (nghi_ngo_tranh_chap = 2) hay khong - CHOT 2026-08-20: RONG HON canWriteTranhChap() o tren (them ca
 * vai tro CSKH/TN CSKH dung khu vuc + TBP CSKH xem toan bo, vi buoc xac nhan nay gan voi nghiep vu
 * CSKH hon la xu ly tien trinh tranh chap thuan tuy). */
export function canConfirmAiTranhChap(c: Context<{ Bindings: Env }>, khuVucCa: string | null): boolean {
  if (canWriteTranhChap(c, khuVucCa)) return true;
  const user = c.get("user");
  if (user.vai_tro === "TBP CSKH") return true;
  if (user.vai_tro === "CSKH" || user.vai_tro === "TN CSKH") return !!khuVucCa && user.khu_vuc_phu_trach.includes(khuVucCa);
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

/** Nguoi dung co duoc GHI log khi tien trinh dang o GIAI DOAN CSKH hay khong - HEP HON
 * canWriteTranhChap() (khong gom Giam sat khu vuc): giai doan CSKH la trach nhiem cua KSNB Doi tac/
 * TBP DVBH/Admin sau khi Giam sat da ban giao ("Giam sat chuyen CSKH") - Giam sat van XEM duoc (van
 * trong scope khu_vuc) nhung khong duoc ghi them log trong giai doan nay nua. Them 2026-08-20 sau khi
 * phat hien Giam sat van co the ghi ca trang thai rieng cua CSKH (canWriteTranhChap chi kiem tra
 * khu_vuc, khong kiem tra giai doan). Them QC 2026-08-25 - khop voi canWriteTranhChap() (QC duoc ghi
 * log toan bo, gom ca giai doan CSKH). */
export function canWriteCskhPhase(c: Context<{ Bindings: Env }>): boolean {
  const user = c.get("user");
  return !!user.la_ksnb_doi_tac || user.vai_tro === "TBP DVBH" || user.vai_tro === "Admin" || user.vai_tro === "QC";
}

export interface GiamSatInfo {
  email: string;
  ten: string | null;
}

/** Doc TOAN BO Giam sat da duyet (+ khu_vuc_phu_trach cua ho) 1 LAN, dung xay map tra cuu
 * "khu_vuc -> danh sach Giam sat phu trach" - tranh N+1 query khi gan cho tung dong danh sach tien
 * trinh. Dung boi tinh nang tu dong dien "Giam sat phu trach" khi CSKH "Chuyen lai giam sat xu ly"
 * (chot 2026-08-20: xac dinh theo khu_vuc_phu_trach cua tai khoan Giam sat, khong doan). */
export async function loadGiamSatByKhuVucMap(db: D1Database): Promise<Map<string, GiamSatInfo[]>> {
  const { results } = await db
    .prepare("SELECT email, ten, khu_vuc_phu_trach FROM users WHERE vai_tro = 'Giam sat' AND trang_thai_duyet = 'Da duyet' AND bi_khoa = 0")
    .all<{ email: string; ten: string | null; khu_vuc_phu_trach: string | null }>();
  const map = new Map<string, GiamSatInfo[]>();
  for (const r of results) {
    for (const kv of fromJsonArray(r.khu_vuc_phu_trach)) {
      const list = map.get(kv) ?? [];
      list.push({ email: r.email, ten: r.ten });
      map.set(kv, list);
    }
  }
  return map;
}

/** CHOT 2026-08-20: doc lich su xu ly giai doan Giam sat cua CAC tien trinh tranh chap TRUOC DAY tren
 * CUNG mot ca (case_id) - dung cho tinh nang "tu rao soat log khieu nai" khi 1 tien trinh MOI dang o
 * trang thai dau tien "Giam sat chua xu ly" (chua ai thuc su hanh dong tren CHINH no) nhung ca da
 * TUNG co tranh chap/khieu nai truoc do - goi y "Giam sat nao tung xu ly" dua tren lich su THAT, khong
 * phai khu_vuc_phu_trach (khac loadGiamSatByKhuVucMap() o tren). 1 truy van gom cho CA TRANG (khong
 * N+1) - JOIN vao 2 bang nho (tranh_chap_tien_trinh/tranh_chap_log, co idx_tctt_case_id), khong dung
 * toi case_dvbh nen chi phi doc thap du IN nhieu case_id. Tra ve list PHANG kem tienTrinhId de noi goi
 * tu loai tru chinh tien trinh dang xet (tranh de xuat chinh nguoi vua tao no). */
export async function loadGiamSatHistoryByCaseIds(
  db: D1Database,
  caseIds: string[],
): Promise<{ caseId: string; tienTrinhId: string; email: string; ten: string | null }[]> {
  if (caseIds.length === 0) return [];
  const placeholders = caseIds.map(() => "?").join(", ");
  const statusPlaceholders = GIAM_SAT_STATUSES.map(() => "?").join(", ");
  const { results } = await db
    .prepare(
      `SELECT tt.case_id, tt.id as tien_trinh_id, ll.nguoi_xu_ly as email, u.ten
       FROM tranh_chap_tien_trinh tt
       JOIN tranh_chap_log ll ON ll.tien_trinh_id = tt.id
       LEFT JOIN users u ON u.email = ll.nguoi_xu_ly
       WHERE tt.case_id IN (${placeholders}) AND ll.trang_thai_xu_ly IN (${statusPlaceholders})`,
    )
    .bind(...caseIds, ...GIAM_SAT_STATUSES)
    .all<{ case_id: string; tien_trinh_id: string; email: string; ten: string | null }>();
  return results.map((r) => ({ caseId: r.case_id, tienTrinhId: r.tien_trinh_id, email: r.email, ten: r.ten }));
}
