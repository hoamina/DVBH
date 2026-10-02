/**
 * Danh sach ca ton cho DOI TAC keo qua API (GET /api/partner/v1/danh-sach-ton, routes/partnerApi.ts) -
 * yeu cau chu he thong 2026-10-02. 2 danh sach:
 *
 * 1. "canh-bao-ceo" - CHINH XAC danh sach the "Canh bao ton · Cap 2 (CEO)" o module Quan ly ton: doc
 *    snapshot dong bang 08:00 VN (getCanhBaoTonSnapshot, lib/canhBaoTon.ts - cung nguon voi UI + anh
 *    Telegram), KHONG tinh lai song, de doi tac va CEO nhin cung 1 con so trong ngay. 4 nhom (ton20 /
 *    vipSvip7 / locTong5 / tranhChap5); 1 ca co the thuoc nhieu nhom -> tra 1 dong/ca + mang "nhom".
 *    Ca da dong/huy SAU 08:00 van nam trong danh sach (dong bang) - co co "con_ton" de doi tac biet.
 * 2. "nskx-ton-3-ngay" - ca DANG TON (CASE_FILTER_TON) cua doi_tac = 'NSKX' co tuoi ton >= 3 ngay (cung
 *    nghia "Ton tren 3 ngay" = tuoiTu 3 cua bo loc Quan ly ton), tinh SONG tai thoi diem goi. Loc
 *    doi_tac dan dau, dung idx_case_doi_tac (xem bai hoc INDEXED BY o nskxBaoCao.ts). Nhan ca '[NSKX]'
 *    (dang CRM cu con trong du lieu import truoc 07/2026) cho chac.
 *
 * Khong tra cac cot doanh thu (dt_*) - danh sach canh bao khong can, giam du lieu tai chinh ra ngoai.
 */
import { ageExpr } from "./ageCalc";
import { getCanhBaoTonSnapshot, type CanhBaoTonMetricKey } from "./canhBaoTon";
import { CASE_TRANH_CHAP_STATUS_EXPR, LATEST_TIEN_TRINH_ID_OF_CASE, TUOI_TIEN_TRINH_EXPR } from "./tranhChapTienTrinh";
import { nowVN } from "./vnTime";

export const DANH_SACH_TON_LOAI = {
  "canh-bao-ceo": "Cảnh báo tồn cấp 2 (CEO) — chốt 08:00 hằng ngày",
  "nskx-ton-3-ngay": "Ca tồn đối tác NSKX có tuổi tồn ≥ 3 ngày — tính tại thời điểm gọi",
} as const;
export type DanhSachTonLoai = keyof typeof DANH_SACH_TON_LOAI;

// Ma nhom on dinh (hop dong API) <-> key noi bo canhBaoTon.ts + nhan giong UI (BacklogModule
// CANH_BAO_TON_METRICS).
const NHOM_CEO: { key: CanhBaoTonMetricKey; ma: string; ten: string }[] = [
  { key: "ton20", ma: "ton_tren_20_ngay", ten: "Tồn >20 ngày" },
  { key: "vipSvip7", ma: "vip_svip_tu_7_ngay", ten: "VIP/S.VIP tồn ≥7 ngày" },
  { key: "locTong5", ma: "loc_tong_tu_5_ngay", ten: "Lọc tổng tồn ≥5 ngày" },
  { key: "tranhChap5", ma: "tranh_chap_tu_5_ngay", ten: "Tranh chấp/KN ≥5 ngày" },
];

const AGE_C = ageExpr("c.thoi_gian_cskh_tiep_nhan");
const CASE_COLS =
  "c.id, c.khu_vuc, c.tinh, c.quan_huyen, c.ky_thuat_vien, c.khach_hang, c.nhom_kh, c.doi_tac, c.hang, " +
  "c.nhom_san_pham, c.san_pham_bao_hanh, c.seri_san_pham, c.mo_ta_loi, c.nhom_yeu_cau, c.loai_yeu_cau, " +
  "c.tien_do_hoan_thanh, c.thoi_gian_cskh_tiep_nhan, c.thoi_gian_hen_xu_ly, c.thoi_gian_hoan_thanh, " +
  "c.noi_dung_xu_ly, c.link_crm, " +
  `${AGE_C} AS tuoi_ton, ` +
  "CASE WHEN c.thoi_gian_hoan_thanh IS NULL AND c.huy_bo_at IS NULL AND c.archived_at IS NULL THEN 1 ELSE 0 END AS con_ton";

type CaseRowRaw = Record<string, string | number | null> & { id: string; con_ton: number; tuoi_ton: number };
const ID_CHUNK = 90; // D1 gioi han ~100 tham so / cau

async function inChunks<T>(ids: string[], run: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) out.push(...(await run(ids.slice(i, i + ID_CHUNK))));
  return out;
}
const ph = (n: number) => Array(n).fill("?").join(", ");

async function loadCasesByIds(db: D1Database, ids: string[]): Promise<CaseRowRaw[]> {
  return inChunks(ids, async (chunk) =>
    (await db.prepare(`SELECT ${CASE_COLS} FROM case_dvbh c WHERE c.id IN (${ph(chunk.length)})`).bind(...chunk).all<CaseRowRaw>()).results,
  );
}

/** Giai trinh gan nhat + tranh chap (tien trinh moi nhat) cho tap ca - 2 nhom query IN theo chunk. */
async function loadExtras(db: D1Database, ids: string[]) {
  const gt = await inChunks(ids, async (chunk) =>
    (
      await db
        .prepare(
          `SELECT case_id, ly_do_cham, noi_dung, nguoi_giai_trinh, ngay_giai_trinh FROM giai_trinh
           WHERE case_id IN (${ph(chunk.length)}) ORDER BY case_id, ngay_giai_trinh DESC`,
        )
        .bind(...chunk)
        .all<{ case_id: string; ly_do_cham: string; noi_dung: string | null; nguoi_giai_trinh: string | null; ngay_giai_trinh: string }>()
    ).results,
  );
  const gtByCase = new Map<string, (typeof gt)[number]>();
  for (const r of gt) if (!gtByCase.has(r.case_id)) gtByCase.set(r.case_id, r);

  const tc = await inChunks(ids, async (chunk) =>
    (
      await db
        .prepare(
          `SELECT c.id AS case_id, tt.ngay_tao, ${CASE_TRANH_CHAP_STATUS_EXPR} AS trang_thai, ${TUOI_TIEN_TRINH_EXPR} AS tuoi_ngay
           FROM case_dvbh c JOIN tranh_chap_tien_trinh tt ON tt.id = ${LATEST_TIEN_TRINH_ID_OF_CASE}
           WHERE c.id IN (${ph(chunk.length)})`,
        )
        .bind(...chunk)
        .all<{ case_id: string; ngay_tao: string; trang_thai: string; tuoi_ngay: number }>()
    ).results,
  );
  const tcByCase = new Map(tc.map((r) => [r.case_id, r]));
  return { gtByCase, tcByCase };
}

function shapeCase(r: CaseRowRaw, extras: Awaited<ReturnType<typeof loadExtras>>) {
  const gt = extras.gtByCase.get(r.id);
  const tc = extras.tcByCase.get(r.id);
  return {
    ...r,
    con_ton: r.con_ton === 1,
    giai_trinh_gan_nhat: gt
      ? { ly_do_cham: gt.ly_do_cham, noi_dung: gt.noi_dung, nguoi_giai_trinh: gt.nguoi_giai_trinh, ngay_giai_trinh: gt.ngay_giai_trinh }
      : null,
    tranh_chap: tc ? { trang_thai: tc.trang_thai, ngay_tao: tc.ngay_tao, tuoi_ngay: tc.tuoi_ngay } : null,
  };
}

export async function buildDanhSachTon(db: D1Database, loai: DanhSachTonLoai) {
  const thoiDiemLay = nowVN();

  if (loai === "canh-bao-ceo") {
    const snap = await getCanhBaoTonSnapshot(db);
    const nhomByCase = new Map<string, string[]>();
    for (const n of NHOM_CEO) {
      for (const id of snap.buckets[n.key]?.ids ?? []) {
        if (!nhomByCase.has(id)) nhomByCase.set(id, []);
        nhomByCase.get(id)!.push(n.ma);
      }
    }
    const ids = [...nhomByCase.keys()];
    const [rows, extras] = await Promise.all([loadCasesByIds(db, ids), loadExtras(db, ids)]);
    const cases = rows
      .map((r) => ({ ...shapeCase(r, extras), nhom: nhomByCase.get(r.id) ?? [] }))
      .sort((a, b) => b.tuoi_ton - a.tuoi_ton);
    return {
      loai,
      mo_ta: DANH_SACH_TON_LOAI[loai],
      thoi_diem_lay: thoiDiemLay,
      chot_luc: snap.generatedAt,
      tong_hop: NHOM_CEO.map((n) => ({ ma: n.ma, ten: n.ten, so_ca: snap.buckets[n.key]?.count ?? 0 })),
      so_ca: cases.length,
      cases,
    };
  }

  const { results: rows } = await db
    .prepare(
      `SELECT ${CASE_COLS} FROM case_dvbh c
       WHERE c.doi_tac IN ('NSKX', '[NSKX]') AND c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND c.huy_bo_at IS NULL
         AND ${AGE_C} >= 3
       ORDER BY tuoi_ton DESC, c.id`,
    )
    .all<CaseRowRaw>();
  const extras = await loadExtras(db, rows.map((r) => r.id));
  const cases = rows.map((r) => shapeCase(r, extras));
  return {
    loai,
    mo_ta: DANH_SACH_TON_LOAI[loai],
    thoi_diem_lay: thoiDiemLay,
    chot_luc: null,
    tong_hop: [{ ma: "nskx_ton_tu_3_ngay", ten: "NSKX tồn ≥3 ngày", so_ca: cases.length }],
    so_ca: cases.length,
    cases,
  };
}
