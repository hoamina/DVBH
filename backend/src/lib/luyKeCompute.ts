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
 *   la "so_phut_xu_ly" - xem migration 0102 va YEU_CAU_API_IMPORT_TU_DONG_QUICKSIGHT.md).
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

interface CaseRowForLuyKe {
  id: string;
  khu_vuc: string | null;
  nhom_yeu_cau: string | null;
  nhom_kh: string | null;
  doi_tac: string | null;
  dung_han: string;
  so_gio_xu_ly: number | null;
  hang: string | null;
  nganh: string | null;
  ky_thuat_vien: string | null;
}

function classifyPhanLoai(nhomYeuCau: string | null, nhomKh: string | null, doiTac: string | null): string {
  if (nhomYeuCau === "XLSC kho ĐMX" || (nhomKh ?? "").includes("ĐMX")) return "KHO ĐMX";
  if ((doiTac ?? "").includes("B2B")) return "B2B";
  return "SỰ CỐ";
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

/** Tinh toan pivot 1 thang tu case_dvbh that - khong ghi gi, chi tra ve LuyKeRow[] (giong dinh dang
 * dong Excel import thu cong) de goi noi nao muon (cron hoac endpoint thu cong deu dung chung). */
export async function computeLuyKeMonthFromCases(db: D1Database, thang: string): Promise<LuyKeRow[]> {
  const { results: cases } = await db
    .prepare(
      `SELECT id, khu_vuc, nhom_yeu_cau, nhom_kh, doi_tac, dung_han, so_gio_xu_ly, hang, nganh, ky_thuat_vien
       FROM case_dvbh
       WHERE thoi_gian_hoan_thanh LIKE ? AND dung_han IN ('Đúng hạn', 'Quá hạn')`,
    )
    .bind(`${thang}%`)
    .all<CaseRowForLuyKe>();

  const { results: ktvList } = await db.prepare("SELECT ma_ktv, vai_tro_ktv FROM ktv_lien_he").all<{ ma_ktv: string; vai_tro_ktv: string | null }>();
  const vaiTroByMaKtv = new Map(ktvList.map((r) => [r.ma_ktv, r.vai_tro_ktv]));

  const nam = thang.slice(0, 4);
  const groups = new Map<string, LuyKeRow>();

  for (const c of cases) {
    const khu_vuc = c.khu_vuc ?? "";
    const hang = c.hang ?? "";
    const nganh = c.nganh ?? "";
    const phan_loai = classifyPhanLoai(c.nhom_yeu_cau, c.nhom_kh, c.doi_tac);
    const toc_do = classifyTocDo(c.so_gio_xu_ly);
    const tren_96h = classifyTren96h(c.so_gio_xu_ly);
    const nguon_crm = classifyNguonCrm(c.id);
    const maKtv = extractMaKtv(c.ky_thuat_vien);
    const vaiTro = maKtv ? vaiTroByMaKtv.get(maKtv) : undefined;
    const doi_tuong = vaiTro === "KTV" ? "KTV" : "CTV/Trạm";

    const key = [khu_vuc, phan_loai, c.dung_han, toc_do, tren_96h, hang, doi_tuong, nganh, nguon_crm].join("");
    const existing = groups.get(key);
    if (existing) existing.sl += 1;
    else groups.set(key, { khu_vuc, phan_loai, dung_han: c.dung_han, toc_do, thang, tren_96h, nam, hang, doi_tuong, nganh, nguon_crm, sl: 1 });
  }

  return [...groups.values()];
}

/** Diem goi CHINH cho cron 08:00 VN - chi tinh lai THANG HIEN TAI (dang chay, so lieu con doi hang
 * ngay). Cac thang da qua khong duoc cron dung lai (nguoi dung "chot cuoi" bang import Excel thu
 * cong khi can, xem luyKeChunks.ts). */
export async function computeAndPushLuyKeCurrentMonth(env: Env): Promise<void> {
  const thang = nowVN().slice(0, 7);
  const rows = await computeLuyKeMonthFromCases(env.DB, thang);
  await recomputeLuyKeMonth(env, thang, rows);
}
