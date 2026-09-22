// Tab "Bao cao vi pham" (module rieng, tach khoi tab "Bao cao" cua Quan ly khao sat - yeu cau chu he
// thong 2026-09-20). 3 bao cao doc lap, dung CHUNG 1 bo loc (thang/khu_vuc/ky_thuat_vien/nhom_kh/
// nguon_crm) qua buildViPhamBaoCaoFilter() ben duoi:
//   - computeViPhamBaoCaoTongQuan: 6 chi so dem nhanh (yeu cau #1)
//   - computeViPhamBaoCaoDaChieu: bang nhom theo 1 chieu tuy chon (yeu cau #2)
//   - computeViPhamDiemThe: bang xep hang diem the theo KTV (yeu cau #3)
//
// QUY UOC MOC THOI GIAN (CHOT voi chu he thong khi phan tich yeu cau, xem tin nhan dai ngay
// 2026-09-20): Tab Tong quan/Da chieu neo theo "ngay_ghi_nhan" (vi pham PHAT SINH trong thang X, xem
// tinh trang xu ly HIEN TAI cua no) - CA 6 chi so deu dung CHUNG 1 moc de tranh nham lan nhu vu "16 vs
// 18" da xay ra truoc do. RIENG Bang diem the neo theo "ngay_chot" (khi QC XAC NHAN vi pham, vi day la
// thoi diem "tinh diem" that su xay ra - 1 vi pham ghi nhan cuoi thang truoc, QC chot dau thang sau,
// hop ly hon la tinh diem cho thang ghi nhan) - day la 2 moc thoi gian KHAC NHAU CO CHU DICH, khong
// phai loi khong nhat quan.
import { khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { khuVucAdHocClause, khuVucReportExclusionClause, multiValueAdHocClause, nguonCrmClause } from "./filterParams";

// KHONG them gio "00:00:00" vao bound - xem giai thich chi tiet o monthBounds() trong cases.ts (ban
// sao cuc bo, cung 1 ham nho da duoc lap lai o vi pham.ts/cases.ts theo dung tien le co san).
function monthBounds(thang: string): { start: string; end: string } {
  const m = thang.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const [y, mo] = m ? [Number(m[1]), Number(m[2])] : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const start = `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-01`;
  const nextMo = mo === 12 ? 1 : mo + 1;
  const nextY = mo === 12 ? y + 1 : y;
  const end = `${String(nextY).padStart(4, "0")}-${String(nextMo).padStart(2, "0")}-01`;
  return { start, end };
}

export interface ViPhamBaoCaoParams {
  thang?: string;
  khu_vuc?: string;
  ky_thuat_vien?: string;
  nhom_kh?: string;
  nguon_crm?: string;
  ket_qua_cap_1?: string;
  // Rieng cho computeViPhamDanhSach - xem TRANG_THAI_CLAUSES.
  trang_thai?: string;
  export?: string;
  // Index signature bat buoc de truyen truc tiep vao buildReportKey() (Record<string, string |
  // undefined>) - xem lib/reportCache.ts.
  [key: string]: string | undefined;
}

// Bo loc dung chung tren case_dvbh (alias BAT BUOC la "c" - nguonCrmClause() hardcode "c.id" ben
// trong, xem filterParams.ts) cho ca 3 bao cao - giong het cach buildRevenueFilterClause() lam voi
// Doanh thu, chi khac khong gioi han theo archived_at/huy_bo_at (vi pham van can hien du ca da dong/
// da huy, khac voi doanh thu chi tinh ca con hoat dong).
function buildCaseFilter(params: ViPhamBaoCaoParams, scope: string[] | null): { sql: string; binds: unknown[] } {
  const scopeClauseBase = khuVucWhereClause(scope, "c.khu_vuc");
  const exclusion = khuVucReportExclusionClause("c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", params.khu_vuc);
  const nhomKhClause = multiValueAdHocClause("c.nhom_kh", params.nhom_kh);
  const nguonCrm = nguonCrmClause(params.nguon_crm);
  const ktvSql = params.ky_thuat_vien ? " AND c.ky_thuat_vien = ?" : "";
  const ktvBinds = params.ky_thuat_vien ? [params.ky_thuat_vien] : [];
  return {
    sql: scopeClauseBase.sql + exclusion.sql + khuVucClause.sql + nhomKhClause.sql + nguonCrm.sql + ktvSql,
    binds: [...scopeClauseBase.binds, ...exclusion.binds, ...khuVucClause.binds, ...nhomKhClause.binds, ...nguonCrm.binds, ...ktvBinds],
  };
}

// Drill-down theo 1 loai loi cu the (click tu 1 dong bang da chieu) - ap dung THEM cho ca Tong quan
// lan Da chieu, khong bat buoc. "alias" (them 2026-09-22) de dung lai duoc cho nhanh vi_pham_ktv
// ("vk") trong computeViPhamDanhSach, mac dinh "v" (vi_pham) cho 2 noi goi cu.
function ketQuaCap1Filter(params: ViPhamBaoCaoParams, alias = "v"): { sql: string; binds: unknown[] } {
  if (!params.ket_qua_cap_1) return { sql: "", binds: [] };
  return { sql: ` AND ${alias}.ket_qua_cap_1 = ?`, binds: [params.ket_qua_cap_1] };
}

// Diem the cua 1 dong vi_pham - tra ve diem_the tu danh muc settings_loai_vi_pham theo dung ten_loi
// (= v.ket_qua_cap_1, xem migration 0065 pattern "gia tri that luu truc tiep, khong qua FK id"). Vi
// pham CU truoc migration 0112 (ket_qua_cap_1 dang ASCII khong dau nhu "Loi khac"/"Loi khong lien he")
// khong khop duoc voi danh muc - CHOT voi chu he thong 2026-09-20: tinh nhu "Lỗi khác" hien tai
// (0.25 diem, gia tri THAP NHAT trong danh muc) thay vi bo sot hoan toan, dung 1 hang so co dinh (KHONG
// tra cuu lai theo ten "Lỗi khác" - tranh phu thuoc ten co the bi Admin doi trong Settings).
export const DIEM_THE_FALLBACK = 0.25;
// Tach thanh ham nhan alias (them 2026-09-22) - can dung lai cho ca alias "v" (vi_pham) LAN "vk"
// (vi_pham_ktv, migration 0115) trong cac UNION ALL diem-the/danh-sach ben duoi.
function diemTheExpr(alias: string): string {
  return `COALESCE((SELECT s.diem_the FROM settings_loai_vi_pham s WHERE s.ten_loi = ${alias}.ket_qua_cap_1), ${DIEM_THE_FALLBACK})`;
}
const DIEM_THE_EXPR = diemTheExpr("v");

// Bo loc tren vi_pham_ktv (migration 0115, vi pham import KHONG gan case) - alias BAT BUOC "vk".
// "nhom_kh"/"nguon_crm" KHONG the ap dung (vi_pham_ktv khong co case_dvbh de doc 2 dim nay) - dang co
// 1 trong 2 dieu kien nay ACTIVE thi loai HET nhanh vi_pham_ktv khoi UNION (tra "1=0"), tranh tra ve
// nham dong khong thoa dieu kien loc nguoi dung dang chon.
function buildKtvFilter(params: ViPhamBaoCaoParams, scope: string[] | null): { sql: string; binds: unknown[] } {
  if (params.nhom_kh || params.nguon_crm) return { sql: " AND 1=0", binds: [] };
  const scopeClauseBase = khuVucWhereClause(scope, "vk.khu_vuc");
  const exclusion = khuVucReportExclusionClause("vk.khu_vuc");
  const khuVucClause = khuVucAdHocClause("vk.khu_vuc", params.khu_vuc);
  const ktvSql = params.ky_thuat_vien ? " AND vk.ky_thuat_vien = ?" : "";
  const ktvBinds = params.ky_thuat_vien ? [params.ky_thuat_vien] : [];
  return {
    sql: scopeClauseBase.sql + exclusion.sql + khuVucClause.sql + ktvSql,
    binds: [...scopeClauseBase.binds, ...exclusion.binds, ...khuVucClause.binds, ...ktvBinds],
  };
}

export interface ViPhamBaoCaoTongQuanPayload {
  slGhiNhan: number;
  slKtvGiaiTrinh: number;
  slGsGiaiTrinh: number;
  slChoKtvGiaiTrinh: number;
  slChoQcChot: number;
  slQcDaChot: number;
  slQcDaBo: number;
}

// GET /bao-cao-vi-pham/tong-quan - 6 chi so dem theo dung 1 moc "ngay_ghi_nhan" (xem chu thich dau
// file). "SL ghi nhan" dem THEO DONG vi_pham (khong phai theo case - CHOT ro voi chu he thong de
// tranh lap lai nham lan "16 vs 18" da tung xay ra voi Phau xu ly vi pham).
//
// CHOT voi chu he thong 2026-09-20 (sau khi phat hien "SL ghi nhan" = 10863, qua cao so voi thuc
// te): "vi pham ghi nhan" = lo bi CSKH CHOT LA CO LOI o cap 1 (v.ket_qua_cap_1 IS NOT NULL AND !=
// 'Khong loi'), KHONG phai moi dong vi_pham auto-flag (rat nhieu dong chi la ung vien SLA cho CSKH
// khao sat, phan lon ket luan "Khong loi" - vd thang 9/2026 co 10393/10863 dong la "Khong loi",
// chi 470 dong CSKH thuc su chot co loi). Dieu kien nay dung HET nguyen ban tu funnel dashboard
// (xem routes/viPham.ts dong ~225 "nghiNgo"/buoc "co loi" cua funnel) - ap dung LAM DIEU KIEN GOC
// cho CA 6 chi so duoi day, vi moi chi so deu la 1 trang thai trong vong doi cua 1 "vi pham ghi
// nhan" (cho QC/da giai trinh/da chot/da bo) - khong co chi so nao hop ly khi tinh tren tap "Khong
// loi" hoac "chua CSKH ket luan".
export async function computeViPhamBaoCaoTongQuan(db: D1Database, params: ViPhamBaoCaoParams, scope: string[] | null): Promise<ViPhamBaoCaoTongQuanPayload> {
  const { start, end } = monthBounds(params.thang || new Date().toISOString().slice(0, 7));
  const caseFilter = buildCaseFilter(params, scope);
  const cap1Filter = ketQuaCap1Filter(params);
  const baseBinds = [start, end, ...caseFilter.binds, ...cap1Filter.binds];
  const baseWhere = `v.ngay_ghi_nhan >= ? AND v.ngay_ghi_nhan < ? AND v.ket_qua_cap_1 IS NOT NULL AND v.ket_qua_cap_1 != 'Khong loi'${caseFilter.sql}${cap1Filter.sql}`;

  // CHOT voi chu he thong 2026-09-20 (lan 2): tach "cho QC chot" (chot_bo_cap_2 IS NULL) thanh 2
  // buoc - "cho KTV/GS giai trinh" (CHUA co dong nao trong vi_pham_giai_trinh, bat ke nguon) va
  // "cho QC chot" thuc su (DA co giai trinh tu KTV hoac GS, dang doi QC xem xet chot cap 2) - 2 buoc
  // nay cong lai DUNG BANG tong "chot_bo_cap_2 IS NULL" truoc day (khong lam thay doi tong, chi chia
  // nho de phan biet "dang cho nguoi lien quan giai trinh" voi "da giai trinh xong, cho QC xu ly").
  const daGiaiTrinhExists = "EXISTS (SELECT 1 FROM vi_pham_giai_trinh gt WHERE gt.vi_pham_id = v.id)";

  const [slGhiNhan, slKtvGiaiTrinh, slGsGiaiTrinh, slChoKtvGiaiTrinh, slChoQcChot, slQcDaChot, slQcDaBo] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) as n FROM vi_pham v CROSS JOIN case_dvbh c ON c.id = v.case_id WHERE ${baseWhere}`)
      .bind(...baseBinds)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(DISTINCT v.id) as n FROM vi_pham v CROSS JOIN case_dvbh c ON c.id = v.case_id
         JOIN vi_pham_giai_trinh gt ON gt.vi_pham_id = v.id AND gt.nguon = 'ktv_qua_api'
         WHERE ${baseWhere}`,
      )
      .bind(...baseBinds)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(DISTINCT v.id) as n FROM vi_pham v CROSS JOIN case_dvbh c ON c.id = v.case_id
         JOIN vi_pham_giai_trinh gt ON gt.vi_pham_id = v.id AND gt.nguon = 'giam_sat_nhap_tay'
         WHERE ${baseWhere}`,
      )
      .bind(...baseBinds)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as n FROM vi_pham v CROSS JOIN case_dvbh c ON c.id = v.case_id
         WHERE v.chot_bo_cap_2 IS NULL AND NOT ${daGiaiTrinhExists} AND ${baseWhere}`,
      )
      .bind(...baseBinds)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) as n FROM vi_pham v CROSS JOIN case_dvbh c ON c.id = v.case_id
         WHERE v.chot_bo_cap_2 IS NULL AND ${daGiaiTrinhExists} AND ${baseWhere}`,
      )
      .bind(...baseBinds)
      .first<{ n: number }>(),
    db
      .prepare(`SELECT COUNT(*) as n FROM vi_pham v CROSS JOIN case_dvbh c ON c.id = v.case_id WHERE v.chot_bo_cap_2 = 1 AND ${baseWhere}`)
      .bind(...baseBinds)
      .first<{ n: number }>(),
    db
      .prepare(`SELECT COUNT(*) as n FROM vi_pham v CROSS JOIN case_dvbh c ON c.id = v.case_id WHERE v.chot_bo_cap_2 = 0 AND ${baseWhere}`)
      .bind(...baseBinds)
      .first<{ n: number }>(),
  ]);

  return {
    slGhiNhan: slGhiNhan?.n ?? 0,
    slKtvGiaiTrinh: slKtvGiaiTrinh?.n ?? 0,
    slGsGiaiTrinh: slGsGiaiTrinh?.n ?? 0,
    slChoKtvGiaiTrinh: slChoKtvGiaiTrinh?.n ?? 0,
    slChoQcChot: slChoQcChot?.n ?? 0,
    slQcDaChot: slQcDaChot?.n ?? 0,
    slQcDaBo: slQcDaBo?.n ?? 0,
  };
}

export interface ViPhamBaoCaoDaChieuRow {
  nhom: string;
  soGhiNhan: number;
  soDaChot: number;
  soDaBo: number;
  tyLeDaChot: number;
  tongDiemThe: number;
}

// Cac chieu nhom hop le cho GET /bao-cao-vi-pham/da-chieu?nhom=... - whitelist chong SQL injection
// ten cot (khong bind duoc ten cot). "nguon_crm" la bieu thuc dan xuat (SUBSTR id), khong phai cot
// that - xu ly rieng trong computeViPhamBaoCaoDaChieu ben duoi.
const DA_CHIEU_DIMS: Record<string, string> = {
  khu_vuc: "c.khu_vuc",
  ky_thuat_vien: "c.ky_thuat_vien",
  ket_qua_cap_1: "v.ket_qua_cap_1",
  nhom_kh: "c.nhom_kh",
};
const NGUON_CRM_EXPR = "CASE WHEN SUBSTR(c.id, 1, 1) = 'T' THEN 'CRM 3T' ELSE 'CRM KRF' END";

// GET /bao-cao-vi-pham/da-chieu?nhom=khu_vuc|ky_thuat_vien|ket_qua_cap_1|nhom_kh|nguon_crm - nhom
// theo 1 chieu tuy chon, cung neo "ngay_ghi_nhan" nhu Tong quan (xem chu thich dau file) - CA dong
// diem the trong bang nay cung tinh tren tap vi_pham PHAT SINH trong thang dang xem (khong phai tap
// QC chot trong thang), giu nhat quan 1 moc duy nhat cho toan bang.
export async function computeViPhamBaoCaoDaChieu(
  db: D1Database,
  params: ViPhamBaoCaoParams & { nhom?: string },
  scope: string[] | null,
): Promise<{ rows: ViPhamBaoCaoDaChieuRow[] }> {
  const dimExpr = params.nhom === "nguon_crm" ? NGUON_CRM_EXPR : (DA_CHIEU_DIMS[params.nhom ?? "khu_vuc"] ?? DA_CHIEU_DIMS.khu_vuc);
  const { start, end } = monthBounds(params.thang || new Date().toISOString().slice(0, 7));
  const caseFilter = buildCaseFilter(params, scope);
  const cap1Filter = ketQuaCap1Filter(params);
  const binds = [start, end, ...caseFilter.binds, ...cap1Filter.binds];
  // Cung dieu kien "CSKH chot co loi" nhu computeViPhamBaoCaoTongQuan o tren - xem chu thich CHOT
  // 2026-09-20 tai do. Tac dung phu: nhom theo "ket_qua_cap_1" gio KHONG con hien dong "Khong loi"
  // trong bang (dung y nghia hon cho 1 bao cao "phan tich vi pham").
  const where = `v.ngay_ghi_nhan >= ? AND v.ngay_ghi_nhan < ? AND v.ket_qua_cap_1 IS NOT NULL AND v.ket_qua_cap_1 != 'Khong loi'${caseFilter.sql}${cap1Filter.sql}`;

  const { results } = await db
    .prepare(
      `SELECT ${dimExpr} as nhom,
         COUNT(*) as so_ghi_nhan,
         SUM(CASE WHEN v.chot_bo_cap_2 = 1 THEN 1 ELSE 0 END) as so_da_chot,
         SUM(CASE WHEN v.chot_bo_cap_2 = 0 THEN 1 ELSE 0 END) as so_da_bo,
         SUM(CASE WHEN v.chot_bo_cap_2 = 1 THEN ${DIEM_THE_EXPR} ELSE 0 END) as tong_diem_the
       FROM vi_pham v CROSS JOIN case_dvbh c ON c.id = v.case_id
       WHERE ${dimExpr} IS NOT NULL AND ${where}
       GROUP BY ${dimExpr}
       ORDER BY so_ghi_nhan DESC`,
    )
    .bind(...binds)
    .all<{ nhom: string; so_ghi_nhan: number; so_da_chot: number; so_da_bo: number; tong_diem_the: number }>();

  return {
    rows: results.map((r) => ({
      nhom: r.nhom,
      soGhiNhan: r.so_ghi_nhan,
      soDaChot: r.so_da_chot,
      soDaBo: r.so_da_bo,
      tyLeDaChot: r.so_ghi_nhan ? Math.round((r.so_da_chot / r.so_ghi_nhan) * 1000) / 10 : 0,
      tongDiemThe: Math.round(r.tong_diem_the * 100) / 100,
    })),
  };
}

export interface ViPhamDiemTheRow {
  kyThuatVien: string;
  khuVuc: string | null;
  soViPham: number;
  tongDiem: number;
}

// GET /bao-cao-vi-pham/diem-the - xep hang diem the theo KTV, CHI tinh tren vi_pham DA CHOT
// (chot_bo_cap_2 = 1 - QC bo thi khong tinh diem, hop ly vi khong con la vi pham chinh thuc), neo
// theo "ngay_chot" (thoi diem QC XAC NHAN - khac Tong quan/Da chieu neo "ngay_ghi_nhan", xem chu
// thich CHU DICH dau file). "khu_vuc" cua 1 KTV lay XAP XI qua MAX() (KTV thuc te gan nhu luon co
// dinh 1 khu vuc - ma KTV da nhung san khu vuc trong ten, vd "(truongnx.ctv24h)" - sai lech neu co
// chi xay ra trong truong hop hiem KTV chuyen khu vuc giua thang, chap nhan duoc cho ban v1).
//
// UNION ALL voi vi_pham_ktv (them 2026-09-22, migration 0115, xem chu thich buildKtvFilter) - vi
// pham import KHONG gan case ("gan truc tiep ID KTV theo ngay") PHAI cong vao diem the thang, day
// chinh la muc dich duoc yeu cau khi them tinh nang import. GROUP BY 2 lan (inner GOM theo tung
// nhanh, outer GOM lai theo ky_thuat_vien) vi 1 KTV co the vua co diem tu vi_pham (co case) vua co
// diem tu vi_pham_ktv (khong case) trong cung 1 thang.
export async function computeViPhamDiemThe(db: D1Database, params: ViPhamBaoCaoParams, scope: string[] | null): Promise<{ rows: ViPhamDiemTheRow[] }> {
  const { start, end } = monthBounds(params.thang || new Date().toISOString().slice(0, 7));
  const caseFilter = buildCaseFilter(params, scope);
  const ktvFilter = buildKtvFilter(params, scope);
  const binds = [start, end, ...caseFilter.binds, start, end, ...ktvFilter.binds];

  const { results } = await db
    .prepare(
      `SELECT ky_thuat_vien, MAX(khu_vuc) as khu_vuc, SUM(cnt) as so_vi_pham, SUM(diem) as tong_diem FROM (
         SELECT c.ky_thuat_vien as ky_thuat_vien, c.khu_vuc as khu_vuc, 1 as cnt, ${DIEM_THE_EXPR} as diem
         FROM vi_pham v CROSS JOIN case_dvbh c ON c.id = v.case_id
         WHERE v.chot_bo_cap_2 = 1 AND c.ky_thuat_vien IS NOT NULL
           AND v.ngay_chot >= ? AND v.ngay_chot < ?${caseFilter.sql}
         UNION ALL
         SELECT vk.ky_thuat_vien as ky_thuat_vien, vk.khu_vuc as khu_vuc, 1 as cnt, ${diemTheExpr("vk")} as diem
         FROM vi_pham_ktv vk
         WHERE vk.chot_bo_cap_2 = 1 AND vk.ngay_chot >= ? AND vk.ngay_chot < ?${ktvFilter.sql}
       )
       GROUP BY ky_thuat_vien
       ORDER BY tong_diem DESC`,
    )
    .bind(...binds)
    .all<{ ky_thuat_vien: string; khu_vuc: string | null; so_vi_pham: number; tong_diem: number }>();

  return {
    rows: results.map((r) => ({
      kyThuatVien: r.ky_thuat_vien,
      khuVuc: r.khu_vuc,
      soViPham: r.so_vi_pham,
      tongDiem: Math.round(r.tong_diem * 100) / 100,
    })),
  };
}

export interface ViPhamDanhSachRow {
  id: string;
  source: "case" | "ktv";
  caseId: string | null;
  khuVuc: string | null;
  kyThuatVien: string | null;
  khachHang: string | null;
  loaiLoi: string;
  ketQuaCap1: string | null;
  trangThai: string;
  // Dang tho (them 2026-09-22) de FE tu quyet dinh hien nut chot/bo (isQC && chotBoCap2 === null)
  // thay vi phai so sanh chuoi trangThai (nhan hien thi co the doi, khong nen dung lam dieu kien).
  chotBoCap2: number | null;
  ghiChu: string | null;
  diemThe: number;
  nguoiGhiNhan: string;
  ngayGhiNhan: string;
  nguoiChot: string | null;
  ngayChot: string | null;
}

// Nhan hien thi trang thai (tieng Viet) tu 2 cot tho ket_qua_cap_1/chot_bo_cap_2 - dung CHUNG giua
// SQL (loc theo "trang_thai") va JS (gan nhan cho tung dong tra ve), tranh 2 noi ra 2 dinh nghia
// lech nhau. KHONG con "khong_loi" trong danh sach nay (CHOT voi chu he thong 2026-09-22 lan 2 -
// xem chu thich computeViPhamDanhSach): vi pham CSKH ket luan "Khong loi" KHONG duoc tinh la vi
// pham, loai het khoi ca danh sach (khong chi 1 lua chon loc). "vi_pham_ktv" (nhanh "ktv") KHONG co
// khai niem "cho giai trinh" (khong qua CSKH cap 1, khong co vi_pham_giai_trinh) - dieu kien nay tra
// "1=0" (loai het nhanh do) thay vi 1 dieu kien luon dung.
const TRANG_THAI_CLAUSES: Record<string, string> = {
  cho_giai_trinh: "v.chot_bo_cap_2 IS NULL AND NOT EXISTS (SELECT 1 FROM vi_pham_giai_trinh gt WHERE gt.vi_pham_id = v.id)",
  cho_qc_chot: "v.chot_bo_cap_2 IS NULL AND EXISTS (SELECT 1 FROM vi_pham_giai_trinh gt WHERE gt.vi_pham_id = v.id)",
  da_chot: "v.chot_bo_cap_2 = 1",
  da_bo: "v.chot_bo_cap_2 = 0",
};
const TRANG_THAI_CLAUSES_KTV: Record<string, string> = {
  cho_giai_trinh: "1=0",
  cho_qc_chot: "vk.chot_bo_cap_2 IS NULL",
  da_chot: "vk.chot_bo_cap_2 = 1",
  da_bo: "vk.chot_bo_cap_2 = 0",
};

function trangThaiLabel(chotBoCap2: number | null): string {
  if (chotBoCap2 === 1) return "QC đã chốt";
  if (chotBoCap2 === 0) return "QC đã bỏ";
  return "Chờ QC chốt";
}

// GET /bao-cao-vi-pham/danh-sach - tab "Tat ca vi pham" (them 2026-09-22, yeu cau chu he thong):
// danh sach TUNG DONG vi_pham (khong gom nhom) de tai ve Excel.
//
// CHOT voi chu he thong 2026-09-22 (lan 2, sau khi giao dien ban dau lo ca "Khong loi" vao danh
// sach): "danh sach vi pham" CHI gom (a) vi pham CSKH DA CHOT CAP 1 la co loi (v.ket_qua_cap_1 IS
// NOT NULL AND != 'Khong loi' - dung HET dieu kien "co loi" cua Tong quan/Da chieu, xem chu thich
// CHOT o computeViPhamBaoCaoTongQuan) VA (b) vi pham import/dong bo tu ben ngoai (KSNB Sheet, Excel
// import, vi_pham_ktv) - CA 2 nhom nay deu KHONG BAO GIO co ket_qua_cap_1 = 'Khong loi' theo thiet
// ke (KSNB sync luon dien 1 loai loi that tu Sheet; Excel import CHAN cung "Khong loi" tai
// routes/importViPham.ts), nen CHI 1 dieu kien "co loi" tren nhanh "case" la du, khong can xu ly
// rieng cho tung nguon. "Khong loi" KHONG con la 1 lua chon loc duoc nua (xem TRANG_THAI_CLAUSES) -
// day la thay doi PHAM VI, khong phai 1 filter tuy chon.
//
// Cung neo "ngay_ghi_nhan" nhu Tong quan/Da chieu. LIMIT 5000 (dung lai nguyen ven pattern
// "export=true" cua routes/survey.ts GET / - xem chu thich o do).
//
// UNION ALL voi vi_pham_ktv (them 2026-09-22, migration 0115) - day la tab DUY NHAT hien vi pham
// "gan truc tiep KTV" (khong qua case) de GS/QC xem va chot/bo (xem "source" tren tung dong, FE
// dung de biet goi PATCH /api/vi-pham/:id/cap2 hay /api/vi-pham-ktv/:id/cap2).
export async function computeViPhamDanhSach(db: D1Database, params: ViPhamBaoCaoParams, scope: string[] | null): Promise<{ rows: ViPhamDanhSachRow[] }> {
  const { start, end } = monthBounds(params.thang || new Date().toISOString().slice(0, 7));
  const caseFilter = buildCaseFilter(params, scope);
  const cap1Filter = ketQuaCap1Filter(params, "v");
  const ktvFilter = buildKtvFilter(params, scope);
  const cap1FilterKtv = ketQuaCap1Filter(params, "vk");
  const trangThaiSql = params.trang_thai && TRANG_THAI_CLAUSES[params.trang_thai] ? ` AND ${TRANG_THAI_CLAUSES[params.trang_thai]}` : "";
  const trangThaiSqlKtv = params.trang_thai && TRANG_THAI_CLAUSES_KTV[params.trang_thai] ? ` AND ${TRANG_THAI_CLAUSES_KTV[params.trang_thai]}` : "";
  const limit = params.export === "true" ? 5000 : 500;
  const binds = [start, end, ...caseFilter.binds, ...cap1Filter.binds, start, end, ...ktvFilter.binds, ...cap1FilterKtv.binds, limit];

  const { results } = await db
    .prepare(
      `SELECT * FROM (
         SELECT 'case' as source, v.id as id, v.case_id as case_id, c.khu_vuc as khu_vuc, c.ky_thuat_vien as ky_thuat_vien, c.khach_hang as khach_hang,
           v.loai_loi as loai_loi, v.ket_qua_cap_1 as ket_qua_cap_1, v.chot_bo_cap_2 as chot_bo_cap_2, ${DIEM_THE_EXPR} as diem_the,
           v.ghi_chu as ghi_chu, v.nguoi_ghi_nhan as nguoi_ghi_nhan, v.ngay_ghi_nhan as ngay_ghi_nhan, v.nguoi_chot as nguoi_chot, v.ngay_chot as ngay_chot
         FROM vi_pham v CROSS JOIN case_dvbh c ON c.id = v.case_id
         WHERE v.ngay_ghi_nhan >= ? AND v.ngay_ghi_nhan < ? AND v.ket_qua_cap_1 IS NOT NULL AND v.ket_qua_cap_1 != 'Khong loi'${caseFilter.sql}${cap1Filter.sql}${trangThaiSql}
         UNION ALL
         SELECT 'ktv' as source, vk.id as id, NULL as case_id, vk.khu_vuc as khu_vuc, vk.ky_thuat_vien as ky_thuat_vien, NULL as khach_hang,
           vk.loai_loi as loai_loi, vk.ket_qua_cap_1 as ket_qua_cap_1, vk.chot_bo_cap_2 as chot_bo_cap_2, ${diemTheExpr("vk")} as diem_the,
           vk.ghi_chu as ghi_chu, vk.nguoi_ghi_nhan as nguoi_ghi_nhan, vk.ngay_ghi_nhan as ngay_ghi_nhan, vk.nguoi_chot as nguoi_chot, vk.ngay_chot as ngay_chot
         FROM vi_pham_ktv vk
         WHERE vk.ngay_ghi_nhan >= ? AND vk.ngay_ghi_nhan < ?${ktvFilter.sql}${cap1FilterKtv.sql}${trangThaiSqlKtv}
       )
       ORDER BY ngay_ghi_nhan DESC
       LIMIT ?`,
    )
    .bind(...binds)
    .all<{
      source: "case" | "ktv";
      id: string;
      case_id: string | null;
      khu_vuc: string | null;
      ky_thuat_vien: string | null;
      khach_hang: string | null;
      loai_loi: string;
      ket_qua_cap_1: string | null;
      chot_bo_cap_2: number | null;
      diem_the: number;
      ghi_chu: string | null;
      nguoi_ghi_nhan: string;
      ngay_ghi_nhan: string;
      nguoi_chot: string | null;
      ngay_chot: string | null;
    }>();

  return {
    rows: results.map((r) => ({
      id: r.id,
      source: r.source,
      caseId: r.case_id,
      khuVuc: r.khu_vuc,
      kyThuatVien: r.ky_thuat_vien,
      khachHang: r.khach_hang,
      loaiLoi: r.loai_loi,
      ketQuaCap1: r.ket_qua_cap_1,
      trangThai: trangThaiLabel(r.chot_bo_cap_2),
      chotBoCap2: r.chot_bo_cap_2,
      ghiChu: r.ghi_chu,
      diemThe: Math.round(r.diem_the * 100) / 100,
      nguoiGhiNhan: r.nguoi_ghi_nhan,
      ngayGhiNhan: r.ngay_ghi_nhan,
      nguoiChot: r.nguoi_chot,
      ngayChot: r.ngay_chot,
    })),
  };
}
