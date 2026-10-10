/**
 * Tinh "Bao cao luy ke" TU DONG tu case_dvbh that (thay vi cho nguoi dung import Excel thu cong
 * hang thang) - chot nghiep vu voi chu he thong 2026-08-28, chay o cron 08:00 VN (DAILY_SNAPSHOT_CRON,
 * xem index.ts) song song voi luong import Excel thu cong hien co (khong thay the - nguoi dung van
 * co the import Excel de "chot cuoi" 1 thang, ghi de ket qua cron vi recomputeLuyKeMonth() luon
 * THAY THE TOAN BO du lieu 1 thang bat ke nguon goi nao).
 *
 * Quy tac phan loai (chot voi chu he thong, khong tu suy dien):
 * - Chi tinh case co dung_han = 'Đúng hạn' hoac 'Quá hạn' - bo qua 'KHÔNG TÍNH' va NULL.
 * - phan_loai: uu tien KHO ĐMX (nhom_yeu_cau = "XLSC kho ĐMX" HOAC nhom_kh chua "ĐMX") > B2B
 *   (doi_tac chua "B2B") > con lai la SỰ CỐ.
 * - toc_do/tren_96h: bucket theo so_gio_xu_ly (CHOT 2026-08-28: cot nay luu GIO thuc su du ten cu
 *   la "so_phut_xu_ly" - xem migration 0102 va YEU_CAU_API_IMPORT_TU_DONG_QUICKSIGHT.md). Khi
 *   so_gio_xu_ly NULL (CRM chua tinh kip, hay gap o thang dang chay), fallback UOC LUONG gio tu
 *   xu_ly_24h_bucket (cot khac, tinh doc lap va thuong co san som hon - xem
 *   estimateHoursFromBucket24h(), CHOT 2026-09-05).
 * - doi_tuong: tra ma_ktv (trich tu case_dvbh.ky_thuat_vien qua extractMaKtv - xem ktvCode.ts) qua
 *   ktv_lien_he.vai_tro_ktv - 'KTV' giu nguyen "KTV", con lai (Tram/CTV/Ve tinh/khong khop) gop
 *   chung "CTV/Trạm" (khop dung 2 gia tri doi_tuong da co san trong du lieu import thu cong that,
 *   xem R2 luy-ke/month/2026-05.json luc kiem chung).
 * - nguon_crm: id case chua ky tu "T" (khong phan biet hoa/thuong) => "CRM 3T", con lai "CRM KRF".
 */
import type { Env } from "../types";
import { extractMaKtv } from "./ktvCode";
import { nowVN } from "./vnTime";
import { recomputeLuyKeMonth, type LuyKeRow } from "./luyKeChunks";
import { khuVucReportExclusionClause } from "./filterParams";

interface CaseRowForLuyKe {
  id: string;
  khu_vuc: string | null;
  nhom_yeu_cau: string | null;
  nhom_kh: string | null;
  doi_tac: string | null;
  dung_han: string;
  so_gio_xu_ly: number | null;
  xu_ly_24h_bucket: string | null;
  hang: string | null;
  nganh: string | null;
  ky_thuat_vien: string | null;
  thoi_gian_cskh_tiep_nhan: string | null;
  thoi_gian_hoan_thanh: string;
}

function classifyPhanLoai(nhomYeuCau: string | null, nhomKh: string | null, doiTac: string | null): string {
  if (nhomYeuCau === "XLSC kho ĐMX" || (nhomKh ?? "").includes("ĐMX")) return "KHO ĐMX";
  if ((doiTac ?? "").includes("B2B")) return "B2B";
  return "SỰ CỐ";
}

// so_gio_xu_ly hay bi tre so voi xu_ly_24h_bucket (cot CRM tinh rieng, DOC LAP - kiem chung that
// 2026-09-05: thang dang chay co luc 2127/2127 dong so_gio_xu_ly NULL toan bo trong khi
// xu_ly_24h_bucket da co du) - CHOT 2026-09-05 (nguoi dung xac nhan sau khi hoi): khi so_gio_xu_ly
// NULL, UOC LUONG gio tu xu_ly_24h_bucket (4 muc) de dua vao CUNG 1 ham bucket 5 muc ben duoi, thay
// vi de rot vao "1. Duoi 24h"/"1. Duoi 96h" mac dinh SAI (bug thuc te: ra 100% "Duoi 24h" trong khi
// thuc te ~81.1%). Chi la UOC LUONG cho 3 muc chi tiet cuoi (khong the biet chinh xac 3-5/5-7/tren 7
// ngay tu 1 flag "Tren 3 ngay" duy nhat) - "0. Duoi 24h"/"1. Tu 1-2 ngay"/"2. Tu 2-3 ngay" thi CHINH
// XAC (nam gon trong 1 muc duy nhat cua thang 5-muc).
function estimateHoursFromBucket24h(bucket: string | null): number | null {
  switch (bucket) {
    case "0. Dưới 24h":
      return 12;
    case "1. Từ 1-2 ngày":
      return 36;
    case "2. Từ 2-3 ngày":
      return 60;
    case "3. Trên 3 ngày":
      return 96; // uoc luong, khong biet chinh xac 3-5/5-7/tren 7 ngay
    default:
      return null;
  }
}

function classifyTocDo(gio: number | null): string {
  const h = gio ?? 0;
  if (h < 24) return "1. Dưới 24h";
  if (h < 72) return "2. Từ 1-3 ngày";
  if (h < 120) return "3. Từ 3-5 ngày";
  if (h < 168) return "4. Từ 5-7 ngày";
  return "5. Trên 7 ngày";
}

function classifyTren96h(gio: number | null): string {
  return (gio ?? 0) >= 96 ? "2. Trên 96h" : "1. Dưới 96h";
}

function classifyNguonCrm(id: string): string {
  return /t/i.test(id) ? "CRM 3T" : "CRM KRF";
}

// "YYYY-MM" -> thang ke tiep, dung cho range scan (thoi_gian_hoan_thanh >= thang AND < nextMonthStr)
// THAY VI "LIKE 'thang%'" - da kiem chung bang EXPLAIN QUERY PLAN: LIKE khien SQLite/D1 SCAN TOAN BO
// case_dvbh (khong dung duoc idx_case_hoan_thanh_not_null migration 0007) du la partial index dung
// dung cot nay, con dang so sanh >=/< thi dung index binh thuong (SEARCH ... USING INDEX) - tren
// case_dvbh 100k+ dong va tang moi ngay, cron chay hang ngay se doc TOAN BO bang thay vi chi vai
// nghin dong cua 1 thang neu khong sua (vi pham nguyen tac D1 read-budget o CLAUDE.md).
function nextMonthStr(thang: string): string {
  const [y, m] = thang.split("-").map(Number);
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  return `${nextY}-${String(nextM).padStart(2, "0")}`;
}

/** Tinh toan pivot 1 thang tu case_dvbh that - khong ghi gi, chi tra ve LuyKeRow[] (giong dinh dang
 * dong Excel import thu cong) de goi noi nao muon (cron hoac endpoint thu cong deu dung chung). */
export async function computeLuyKeMonthFromCases(db: D1Database, thang: string): Promise<LuyKeRow[]> {
  return (await computeLuyKeMonthWithTocDo(db, thang)).rows;
}

// Thang dau tien "Toc do theo mien" (bang luy_ke_toc_do_mien, migration 0131) tu tinh tu case_dvbh -
// CHOT 2026-10-10 voi chu he thong: cac thang truoc do nguoi dung nhap so chot bang tay.
export const TOC_DO_MIEN_AUTO_TU_THANG = "2026-10";

export interface TocDoMienRow {
  rtat_mb_ngay: number;
  rtat_mn_ngay: number;
  so_ca_gio_mb: number;
  so_ca_gio_mn: number;
  cuoi_tuan_sla: number | null;
  cuoi_tuan_24h: number | null;
  cuoi_tuan_so_ca: number;
}

// Mien suy tu ma khu vuc "(qldvbh.mb2) ..." / "(qldvbh.mn1) ..." - khop cach tinh MB/MN o client
// (LuyKeModule.tsx mienOf). Khu vuc khong co ".mb"/".mn" chi tinh vao toan quoc.
function mienOf(khuVuc: string | null): "MB" | "MN" | null {
  const k = (khuVuc ?? "").toLowerCase();
  if (k.includes(".mb")) return "MB";
  if (k.includes(".mn")) return "MN";
  return null;
}

// So gio xu ly dung cho RTAT/24h cuoi tuan = so_gio_xu_ly cua CRM (khop RTAT sheet cu cua chu he thong,
// khac han gio dong ho tiep nhan -> xong vi CRM tru thoi gian cho), NHUNG kiem chung 2026-10-10 cot nay
// bi mat dau thap phan o nhieu dong (vd 5.427 gio luu thanh 5427222222 - he so sai khac nhau tung dong,
// khong chia nguoc lai duoc) o 05-07/2026 va 1 phan 09/2026. Chan: gia tri lon hon gio dong ho + 24h la
// du lieu hong -> tra null (bo khoi ca tong lan mau so, khong lam lech trung binh).
function gioXuLyHopLe(c: CaseRowForLuyKe): number | null {
  if (c.so_gio_xu_ly === null || !c.thoi_gian_cskh_tiep_nhan) return null;
  const ms = Date.parse(`${c.thoi_gian_hoan_thanh.replace(" ", "T")}Z`) - Date.parse(`${c.thoi_gian_cskh_tiep_nhan.replace(" ", "T")}Z`);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return c.so_gio_xu_ly <= ms / 3_600_000 + 24 ? c.so_gio_xu_ly : null;
}

/** RTAT + toc do cuoi tuan cho 1 thang, tren CUNG tap ca cua luy ke (cung bo loc), bo "KHO ĐMX".
 * RTAT = tong gioXuLyHopLe, mau so TB RTAT la so ca co gio hop le. "Cuoi tuan" = ca CSKH tiep nhan Thu
 * 7/Chu nhat; "24h" cuoi tuan dung gioXuLyHopLe, khong co thi uoc luong tu xu_ly_24h_bucket (giong luy ke). */
function summarizeTocDoMien(cases: CaseRowForLuyKe[]): TocDoMienRow {
  const out = { rtatMbGio: 0, rtatMnGio: 0, so_ca_gio_mb: 0, so_ca_gio_mn: 0, ctTong: 0, ctDungHan: 0, ct24h: 0 };
  for (const c of cases) {
    if (classifyPhanLoai(c.nhom_yeu_cau, c.nhom_kh, c.doi_tac) === "KHO ĐMX") continue;
    const mien = mienOf(c.khu_vuc);
    const gio = gioXuLyHopLe(c);
    if (gio !== null && mien === "MB") {
      out.rtatMbGio += gio;
      out.so_ca_gio_mb++;
    } else if (gio !== null && mien === "MN") {
      out.rtatMnGio += gio;
      out.so_ca_gio_mn++;
    }
    const ngay = c.thoi_gian_cskh_tiep_nhan ? new Date(`${c.thoi_gian_cskh_tiep_nhan.slice(0, 10)}T00:00:00Z`).getUTCDay() : -1;
    if (ngay === 0 || ngay === 6) {
      const gioCt = gio ?? estimateHoursFromBucket24h(c.xu_ly_24h_bucket);
      out.ctTong++;
      if (c.dung_han === "Đúng hạn") out.ctDungHan++;
      if (gioCt !== null && gioCt < 24) out.ct24h++;
    }
  }
  return {
    rtat_mb_ngay: out.rtatMbGio / 24,
    rtat_mn_ngay: out.rtatMnGio / 24,
    so_ca_gio_mb: out.so_ca_gio_mb,
    so_ca_gio_mn: out.so_ca_gio_mn,
    cuoi_tuan_sla: out.ctTong ? out.ctDungHan / out.ctTong : null,
    cuoi_tuan_24h: out.ctTong ? out.ct24h / out.ctTong : null,
    cuoi_tuan_so_ca: out.ctTong,
  };
}

export async function computeLuyKeMonthWithTocDo(db: D1Database, thang: string): Promise<{ rows: LuyKeRow[]; tocDo: TocDoMienRow }> {
  // huy_bo_at IS NULL: khop quy uoc da CHOT o dashboardCompute.ts (currentMonthOrOpenSource) cho
  // cung dang truy van "case hoan thanh trong 1 thang" - case da HUY BO van co the con giu nguyen
  // dung_han/thoi_gian_hoan_thanh cu tu truoc luc huy (kiem chung that: 4/22952 dong thang 2026-08),
  // khong loai se dem nham case huy vao SL "da hoan thanh".
  // tinh_vao_kpi = 1: CHOT 2026-08-28 (nguoi dung xac nhan sau khi hoi) - khop quy uoc KPI_ELIGIBLE_CLAUSE
  // cua kpiEligible.ts/dashboardCompute.ts cho cac chi so kieu SLA/dung han (~13% ca da dong tren
  // production co tinh_vao_kpi = 0, khong duoc tinh vao cac bao cao KPI khac). Kiem chung that: thang
  // 2026-05 so that tu Excel = 20.665; khong loc tinh_vao_kpi ra 22.032, co loc ra 21.668 (gan hon).
  // KHU_VUC_AN_KHOI_BAO_CAO (filterParams.ts, CHOT 2026-08-01): "(teamkdbl.krf) Kinh doanh ban le
  // KRF" + 2 don vi khac da bi an khoi MOI he thong bao cao/thong ke tu truoc - luy ke chua co luc do
  // (chua ton tai) nen bi sot, them lai o day cho dung quy uoc chung (CHOT 2026-08-28, nguoi dung yeu
  // cau rieng cho luy ke).
  // (so_gio_xu_ly IS NOT NULL OR xu_ly_24h_bucket IS NOT NULL): CHOT 2026-09-05 (phat hien qua bao
  // cao that, nguoi dung xac nhan huong xu ly sau khi hoi) - truoc day khong loc gi ca, NULL bi
  // classifyTocDo()/classifyTren96h() coi nhu 0 gio (gio ?? 0) nen tu dong roi vao bucket "1. Duoi
  // 24h"/"1. Duoi 96h", lam sai lech ty le khi 1 thang co nhieu ca CHUA duoc CRM tinh xong
  // so_gio_xu_ly (vd thang dang chay do, kiem chung that: thang 2026-09 luc test co 2127/2127 dong
  // so_gio_xu_ly NULL toan bo -> ra dung 100% "duoi 24h" du thuc te chi ~81.1%). Chi loai truong hop
  // CA 2 cot deu NULL (that su khong co du lieu); con lai (co so_gio_xu_ly HOAC co xu_ly_24h_bucket)
  // van tinh duoc qua estimateHoursFromBucket24h() ben duoi.
  const exclusion = khuVucReportExclusionClause();
  const { results: cases } = await db
    .prepare(
      `SELECT id, khu_vuc, nhom_yeu_cau, nhom_kh, doi_tac, dung_han, so_gio_xu_ly, xu_ly_24h_bucket, hang, nganh, ky_thuat_vien, thoi_gian_cskh_tiep_nhan, thoi_gian_hoan_thanh
       FROM case_dvbh
       WHERE thoi_gian_hoan_thanh >= ? AND thoi_gian_hoan_thanh < ? AND dung_han IN ('Đúng hạn', 'Quá hạn')
         AND huy_bo_at IS NULL AND tinh_vao_kpi = 1
         AND (so_gio_xu_ly IS NOT NULL OR xu_ly_24h_bucket IS NOT NULL)${exclusion.sql}`,
    )
    .bind(thang, nextMonthStr(thang), ...exclusion.binds)
    .all<CaseRowForLuyKe>();

  const { results: ktvList } = await db.prepare("SELECT ma_ktv, vai_tro_ktv FROM ktv_lien_he").all<{ ma_ktv: string; vai_tro_ktv: string | null }>();
  const vaiTroByMaKtv = new Map(ktvList.map((r) => [r.ma_ktv, r.vai_tro_ktv]));

  const nam = thang.slice(0, 4);
  const groups = new Map<string, LuyKeRow>();

  for (const c of cases) {
    const gio = c.so_gio_xu_ly ?? estimateHoursFromBucket24h(c.xu_ly_24h_bucket);
    if (gio === null) continue; // ca biet: xu_ly_24h_bucket co gia tri la nhung khong khop 4 muc da biet
    const khu_vuc = c.khu_vuc ?? "";
    const hang = c.hang ?? "";
    const nganh = c.nganh ?? "";
    const phan_loai = classifyPhanLoai(c.nhom_yeu_cau, c.nhom_kh, c.doi_tac);
    const toc_do = classifyTocDo(gio);
    const tren_96h = classifyTren96h(gio);
    const nguon_crm = classifyNguonCrm(c.id);
    const maKtv = extractMaKtv(c.ky_thuat_vien);
    const vaiTro = maKtv ? vaiTroByMaKtv.get(maKtv) : undefined;
    const doi_tuong = vaiTro === "KTV" ? "KTV" : "CTV/Trạm";

    const key = [khu_vuc, phan_loai, c.dung_han, toc_do, tren_96h, hang, doi_tuong, nganh, nguon_crm].join("");
    const existing = groups.get(key);
    if (existing) existing.sl += 1;
    else groups.set(key, { khu_vuc, phan_loai, dung_han: c.dung_han, toc_do, thang, tren_96h, nam, hang, doi_tuong, nganh, nguon_crm, kh_vip: "KH thường", sl: 1 });
  }

  return { rows: [...groups.values()], tocDo: summarizeTocDoMien(cases) };
}

async function saveTocDoMienAuto(db: D1Database, thang: string, t: TocDoMienRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO luy_ke_toc_do_mien (thang, rtat_mb_ngay, rtat_mn_ngay, so_ca_gio_mb, so_ca_gio_mn, cuoi_tuan_sla, cuoi_tuan_24h, cuoi_tuan_so_ca, nguon, nguoi_cap_nhat, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'auto', NULL, ?)
       ON CONFLICT(thang) DO UPDATE SET rtat_mb_ngay = excluded.rtat_mb_ngay, rtat_mn_ngay = excluded.rtat_mn_ngay,
         so_ca_gio_mb = excluded.so_ca_gio_mb, so_ca_gio_mn = excluded.so_ca_gio_mn, cuoi_tuan_sla = excluded.cuoi_tuan_sla,
         cuoi_tuan_24h = excluded.cuoi_tuan_24h, cuoi_tuan_so_ca = excluded.cuoi_tuan_so_ca, nguon = 'auto', nguoi_cap_nhat = NULL,
         updated_at = excluded.updated_at`,
    )
    .bind(thang, t.rtat_mb_ngay, t.rtat_mn_ngay, t.so_ca_gio_mb, t.so_ca_gio_mn, t.cuoi_tuan_sla, t.cuoi_tuan_24h, t.cuoi_tuan_so_ca, nowVN())
    .run();
}

/** Diem goi CHINH cho cron 08:00 VN - chi tinh lai THANG HIEN TAI (dang chay, so lieu con doi hang
 * ngay). Cac thang da qua khong duoc cron dung lai (nguoi dung "chot cuoi" bang import Excel thu
 * cong khi can, xem luyKeChunks.ts). */
export async function computeAndPushLuyKeCurrentMonth(env: Env): Promise<void> {
  const thang = nowVN().slice(0, 7);
  const { rows, tocDo } = await computeLuyKeMonthWithTocDo(env.DB, thang);
  await recomputeLuyKeMonth(env, thang, rows);
  if (thang >= TOC_DO_MIEN_AUTO_TU_THANG) await saveTocDoMienAuto(env.DB, thang, tocDo);
  // Ca hoan thanh cuoi ngay cuoi thang chi duoc thay o lan chay 08:00 ngay 1 thang sau - chot lai
  // RTAT/cuoi tuan thang truoc trong 3 ngay dau thang (chi bang nho nay, khong dung chunk luy ke).
  const prev = prevMonthStr(thang);
  if (Number(nowVN().slice(8, 10)) <= 3 && prev >= TOC_DO_MIEN_AUTO_TU_THANG) {
    const { tocDo: tocDoPrev } = await computeLuyKeMonthWithTocDo(env.DB, prev);
    await saveTocDoMienAuto(env.DB, prev, tocDoPrev);
  }
}

function prevMonthStr(thang: string): string {
  const [y, m] = thang.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
