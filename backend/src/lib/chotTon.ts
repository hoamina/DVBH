/**
 * CHOT SO "Quan ly ton / Bao cao ngay 08:00" - 1 LAN DOC cho moi nhom quoc gia (2026-11-08).
 *
 * Truoc day moi lan chot tinh rieng tung scope bang SQL (khac/qc/12 giam sat x ~38 cau + 16 khu vuc x ~19 cau, nhan 7 pham vi
 * ~ 6.000 truy van, moi scope Promise.all ~60 cau cung luc) -> tu lam D1 "overloaded" (han muc 10 giay), loi bi nuot -> tu
 * 04/11 gan nhu khong chot duoc ban nao (do lai 08/11: 4 cau song song da hong, tuan tu thi 12s/0 loi).
 *
 * Gio: doc 1 LAN tap ca ton tai moc 08:00 (~1.700 ca) KEM CO cua tung chi tieu - co tinh NGAY TRONG SQL bang dung cac dieu kien
 * NEED_* cua needGiaiTrinh.ts (1 nguon dinh nghia, JS chi loc theo co) - + 4 cau nho cho banner (thieu linh kien, ca lap, can
 * khao sat, doanh thu thang) + danh sach khu vuc. Moi scope (vai tro, giam sat, tung khu vuc, NSKX / Khong NSKX) = loc trong bo
 * nho tren tap do. Ghi gop bang db.batch. KPI / pivot / doanh thu thang KHONG con nam trong so chot (khong phai so "ton", khong can
 * dong bang 08:00) - route /kpis /pivot /revenue tu tinh qua cachedReport khi payload khong co.
 *
 * Moi NHOM quoc gia chot rieng, khung gio rieng (index.ts): VN :30, cac nuoc khac + pham vi "Tất cả quốc gia" (Admin) :40.
 */
import type { Env } from "../types";
import { CA_LAP_CTE, NGUONG_NGAY_LAP } from "../routes/caLap";
import { RECENT_OR_OPEN_CONDITION } from "../routes/survey";
import {
  latestGiaiTrinhJoin,
  CASE_FILTER_TON,
  caseFilterTonAt0800,
  NEED_TONG,
  NEED_LO_KE_HOACH,
  NEED_TAI_GIAI_TRINH,
  NEED_DMX_CHUA_GT_3_NGAY,
  NEED_CHUA_GT_5_NGAY,
  NEED_DIEU_HOA_1_NGAY,
  NEED_B2B_1_NGAY,
  NEED_NSKX_2_NGAY,
  NEED_LOC_TONG_BCN_1_NGAY,
  NEED_LO_KE_HOACH_DMX_5_NGAY,
  NEED_LO_KE_HOACH_14_NGAY,
  NEED_TAI_GIAI_TRINH_DMX_5_NGAY,
  NEED_TAI_GIAI_TRINH_14_NGAY,
  NEED_VIP_CHUA_GT_24H,
} from "./needGiaiTrinh";
import { ageExpr } from "./ageCalc";
import { kpiEligibleClause } from "./kpiEligible";
import { missingPartsJoin, REVENUE_EXPR_C, currentMonthBoundsVN } from "./dailyReport";
import { KHU_VUC_AN_KHOI_BAO_CAO } from "./filterParams";
import { layCap2, hopCap2VaoBuckets } from "./canhBaoCap2GiaiTrinh";
import { getVnDateStr } from "./reportCache";
import { nowVN, duocLuuSoTuTinh, GIO_BAT_DAU_LUU_SO_CHOT } from "./vnTime";
import { fromJsonArray } from "./jsonArray";
import { withD1Retry } from "./d1Retry";
import { envPhamVi, hauToPhamVi, QUOC_GIA_CO_NSKX, type PhamVi, type PhamViDb } from "./phamVi";
import { dsQuocGiaKichHoat } from "./quocGia";
import { damBaoBangQuocGia } from "./quocGiaKichHoat";
import { generateCanhBaoTonSnapshot } from "./canhBaoTon";
import { generateBacklogAgeSnapshot } from "./backlogAgeSnapshot";
import { generateTonKtvSnapshot } from "./tonKtvSnapshot";
import type { BacklogBuckets, DailySnapshotPayload, KhuVucReportRow, RoleVariant, SnapshotBucket } from "./dailySnapshot";

/** scope_key danh dau "pham vi nay da chot xong hom nay" - luoi an toan moi gio chi chot bu pham vi thieu dau nay. */
export const SCOPE_CHOT_XONG = "chot_xong|all";

const NSKX_VALUES = ["NSKX", "[NSKX]"];

interface DongTon {
  id: string;
  khu_vuc: string | null;
  doi_tac: string | null;
  tuoi: number | null;
  f_tong: number | null;
  f_lkh: number | null;
  f_tgt: number | null;
  f_dmx3: number | null;
  f_c5: number | null;
  f_dh: number | null;
  f_lkh_dmx5: number | null;
  f_lkh14: number | null;
  f_tgt_dmx5: number | null;
  f_tgt14: number | null;
  f_b2b: number | null;
  f_nskx: number | null;
  f_loc: number | null;
  f_vip: number | null;
  da_gt: number | null;
  thieu_lk: number | null;
}
interface DongCa {
  id: string;
  khu_vuc: string | null;
  doi_tac: string | null;
}
interface DongCaLap extends DongCa {
  gs_null: number;
  qc_null: number;
}
interface DongDoanhThu {
  khu_vuc: string | null;
  doi_tac: string | null;
  tong: number | null;
}

/** Toan bo du lieu nguon cua 1 lan chot (1 pham vi DB). */
export interface DuLieuChot {
  ton: DongTon[];
  thieuLinhKien: DongCa[];
  caLap: DongCaLap[];
  canKhaoSat: DongCa[];
  doanhThu: DongDoanhThu[];
  dsKhuVuc: string[];
}

/** 6 cau doc TUAN TU (khong Promise.all - tranh tu lam qua tai D1). */
export async function docDuLieuChot(db: D1Database): Promise<DuLieuChot> {
  const tonAnchorC = caseFilterTonAt0800("c");
  const joinScope = latestGiaiTrinhJoin(caseFilterTonAt0800());
  const co = (ten: string, expr: string) => `(${expr}) AS ${ten}`;
  const ton = await db
    .prepare(
      `SELECT c.id AS id, c.khu_vuc AS khu_vuc, c.doi_tac AS doi_tac,
         ${ageExpr("c.thoi_gian_cskh_tiep_nhan")} AS tuoi,
         ${co("f_tong", NEED_TONG)}, ${co("f_lkh", NEED_LO_KE_HOACH)}, ${co("f_tgt", NEED_TAI_GIAI_TRINH)},
         ${co("f_dmx3", NEED_DMX_CHUA_GT_3_NGAY)}, ${co("f_c5", NEED_CHUA_GT_5_NGAY)}, ${co("f_dh", NEED_DIEU_HOA_1_NGAY)},
         ${co("f_lkh_dmx5", NEED_LO_KE_HOACH_DMX_5_NGAY)}, ${co("f_lkh14", NEED_LO_KE_HOACH_14_NGAY)},
         ${co("f_tgt_dmx5", NEED_TAI_GIAI_TRINH_DMX_5_NGAY)}, ${co("f_tgt14", NEED_TAI_GIAI_TRINH_14_NGAY)},
         ${co("f_b2b", NEED_B2B_1_NGAY)}, ${co("f_nskx", NEED_NSKX_2_NGAY)}, ${co("f_loc", NEED_LOC_TONG_BCN_1_NGAY)},
         ${co("f_vip", NEED_VIP_CHUA_GT_24H)},
         (lg.case_id IS NOT NULL) AS da_gt,
         EXISTS (SELECT 1 FROM settings_ly_do sld WHERE sld.ten_ly_do = lg.ly_do_cham AND sld.thuoc_thieu_linh_kien = 1) AS thieu_lk
       FROM case_hieu_luc c
       ${joinScope}
       WHERE ${tonAnchorC} AND c.archived_at IS NULL AND c.huy_bo_at IS NULL`,
    )
    .all<DongTon>();
  const thieuLinhKien = await db
    .prepare(
      `SELECT c.id AS id, c.khu_vuc AS khu_vuc, c.doi_tac AS doi_tac FROM case_hieu_luc c
       ${missingPartsJoin(CASE_FILTER_TON)}
       WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND c.huy_bo_at IS NULL`,
    )
    .all<DongCa>();
  const { start, end } = currentMonthBoundsVN();
  const caLap = await db
    .prepare(
      `${CA_LAP_CTE} SELECT lap.id AS id, lap.khu_vuc AS khu_vuc, lap.doi_tac AS doi_tac,
         (gl.chot_danh_gia_lap IS NULL) AS gs_null, (gl.qc_chot IS NULL) AS qc_null
       FROM lap LEFT JOIN giai_trinh_lap gl ON gl.case_id = lap.id
       WHERE lap.thoi_gian_hoan_thanh >= ? AND lap.thoi_gian_hoan_thanh < ? AND lap.gap_days <= ${NGUONG_NGAY_LAP}`,
    )
    .bind(start, end)
    .all<DongCaLap>();
  const canKhaoSat = await db
    .prepare(
      `SELECT c.id AS id, c.khu_vuc AS khu_vuc, c.doi_tac AS doi_tac FROM case_hieu_luc c
       WHERE c.archived_at IS NULL AND c.huy_bo_at IS NULL AND ${RECENT_OR_OPEN_CONDITION} AND c.can_khao_sat = 1`,
    )
    .all<DongCa>();
  const doanhThu = await db
    .prepare(
      `SELECT c.khu_vuc AS khu_vuc, c.doi_tac AS doi_tac, SUM(${REVENUE_EXPR_C}) AS tong FROM case_hieu_luc c
       WHERE c.thoi_gian_hoan_thanh >= ? AND c.thoi_gian_hoan_thanh < ? AND ${kpiEligibleClause("c.", true)}
       GROUP BY c.khu_vuc, c.doi_tac`,
    )
    .bind(start, end)
    .all<DongDoanhThu>();
  const kv = await db.prepare("SELECT DISTINCT khu_vuc FROM case_hieu_luc WHERE khu_vuc IS NOT NULL").all<{ khu_vuc: string }>();
  return {
    ton: ton.results,
    thieuLinhKien: thieuLinhKien.results,
    caLap: caLap.results,
    canKhaoSat: canKhaoSat.results,
    doanhThu: doanhThu.results,
    dsKhuVuc: kv.results.map((r) => r.khu_vuc),
  };
}

/** Loc du lieu theo pham vi NSKX (cung dieu kien view case_hieu_luc_<pv>, lib/phamVi.ts DK_NSKX). */
export function locTheoPhamVi(d: DuLieuChot, pv: PhamVi): DuLieuChot {
  if (pv === "tat_ca") return d;
  const giu = (doiTac: string | null) => (pv === "nskx" ? NSKX_VALUES.includes(doiTac ?? "") : !NSKX_VALUES.includes(doiTac ?? ""));
  return {
    ton: d.ton.filter((r) => giu(r.doi_tac)),
    thieuLinhKien: d.thieuLinhKien.filter((r) => giu(r.doi_tac)),
    caLap: d.caLap.filter((r) => giu(r.doi_tac)),
    canKhaoSat: d.canKhaoSat.filter((r) => giu(r.doi_tac)),
    doanhThu: d.doanhThu.filter((r) => giu(r.doi_tac)),
    dsKhuVuc: d.dsKhuVuc,
  };
}

/** Dieu kien khu vuc giong SQL cu: "khu_vuc NOT IN (an khoi bao cao)" (NULL bi loai, dung ngu nghia SQL) [+ IN danh sach]. */
function locKhuVuc(khuVucList: string[] | null): (kv: string | null) => boolean {
  return (kv) => kv !== null && !KHU_VUC_AN_KHOI_BAO_CAO.includes(kv) && (khuVucList === null || khuVucList.includes(kv));
}

const bucket = (ids: string[]): SnapshotBucket => ({ ids, count: ids.length });

/** BacklogBuckets cho 1 scope (khuVucList null = toan pham vi). cap2 = ca Canh bao ton cap 2 hom nay cua pham vi (layCap2). */
export function tinhBacklogBuckets(d: DuLieuChot, khuVucList: string[] | null, cap2: { id: string; khu_vuc: string }[]): BacklogBuckets {
  const hop = locKhuVuc(khuVucList);
  const rows = d.ton.filter((r) => hop(r.khu_vuc));
  const ids = (f: (r: DongTon) => unknown) => rows.filter((r) => !!f(r)).map((r) => r.id);
  const tren = (n: number) => rows.filter((r) => r.tuoi !== null && r.tuoi >= n).length;

  const tonCanGiaiTrinhByKhuVuc: Record<string, SnapshotBucket> = {};
  const khuVucReportRows: Record<string, KhuVucReportRow> = {};
  for (const r of rows) {
    const kv = r.khu_vuc as string;
    if (r.f_tong) (tonCanGiaiTrinhByKhuVuc[kv] ??= { ids: [], count: 0 }).ids.push(r.id);
    const k = (khuVucReportRows[kv] ??= {
      tong_ton: 0, tren_3: 0, tren_5: 0, tren_7: 0, tren_14: 0, da_giai_trinh: 0, lo_ke_hoach: 0, cho_giai_trinh_lai: 0,
      dmx_chua_gt_3_ngay: 0, chua_gt_5_ngay: 0, dieu_hoa_1_ngay: 0, b2b_1_ngay: 0, nskx_2_ngay: 0, thieu_linh_kien: 0,
    });
    const t = r.tuoi;
    k.tong_ton++;
    if (t !== null && t >= 3) k.tren_3++;
    if (t !== null && t >= 5) k.tren_5++;
    if (t !== null && t >= 7) k.tren_7++;
    if (t !== null && t >= 14) k.tren_14++;
    if (r.da_gt) k.da_giai_trinh++;
    if (r.f_lkh) k.lo_ke_hoach++;
    if (r.f_tgt) k.cho_giai_trinh_lai++;
    if (r.f_dmx3) k.dmx_chua_gt_3_ngay++;
    if (r.f_c5) k.chua_gt_5_ngay++;
    if (r.f_dh) k.dieu_hoa_1_ngay++;
    if (r.f_b2b) k.b2b_1_ngay++;
    if (r.f_nskx) k.nskx_2_ngay++;
    if (r.thieu_lk) k.thieu_linh_kien++;
  }
  for (const b of Object.values(tonCanGiaiTrinhByKhuVuc)) b.count = b.ids.length;

  const tonCanGiaiTrinh = bucket(ids((r) => r.f_tong));
  const canhBaoCap2: SnapshotBucket = { ids: [], count: 0 };
  hopCap2VaoBuckets({ tonCanGiaiTrinh, tonCanGiaiTrinhByKhuVuc, canhBaoCap2 }, cap2, khuVucList);

  return {
    tonCanGiaiTrinh,
    tonCanGiaiTrinhByKhuVuc,
    canhBaoCap2,
    backlogTongTon: bucket(rows.map((r) => r.id)),
    backlogTren3: tren(3),
    backlogTren5: tren(5),
    backlogTren7: tren(7),
    backlogTren14: tren(14),
    backlogLoKeHoach: bucket(ids((r) => r.f_lkh)),
    backlogTaiGiaiTrinh: bucket(ids((r) => r.f_tgt)),
    backlogChuaGt3NgayDmx: bucket(ids((r) => r.f_dmx3)),
    backlogChuaGt5Ngay: bucket(ids((r) => r.f_c5)),
    backlogDieuHoa1Ngay: bucket(ids((r) => r.f_dh)),
    backlogLoKeHoachDmx5: bucket(ids((r) => r.f_lkh_dmx5)),
    backlogLoKeHoach14: bucket(ids((r) => r.f_lkh14)),
    backlogTaiGiaiTrinhDmx5: bucket(ids((r) => r.f_tgt_dmx5)),
    backlogTaiGiaiTrinh14: bucket(ids((r) => r.f_tgt14)),
    backlogB2b: bucket(ids((r) => r.f_b2b)),
    backlogNskx: bucket(ids((r) => r.f_nskx)),
    backlogLocTongBcn: bucket(ids((r) => r.f_loc)),
    backlogVip24h: bucket(ids((r) => r.f_vip)),
    khuVucReportRows,
  };
}

/** Payload "Bao cao ngay 08:00" theo vai tro (khong con kpis/pivot/revenue - route tu tinh qua cachedReport). */
export function tinhPayloadVaiTro(d: DuLieuChot, roleVariant: RoleVariant, khuVucList: string[], cap2: { id: string; khu_vuc: string }[]): DailySnapshotPayload {
  const list = roleVariant === "giam_sat" ? khuVucList : null;
  const hop = locKhuVuc(list);
  const caLapHop = (r: DongCaLap) =>
    roleVariant === "giam_sat" ? !!r.gs_null : roleVariant === "qc" ? !r.gs_null && !!r.qc_null : !!r.gs_null || !!r.qc_null;
  return {
    ...tinhBacklogBuckets(d, list, cap2),
    thieuLinhKien: bucket(d.thieuLinhKien.filter((r) => hop(r.khu_vuc)).map((r) => r.id)),
    caLap: bucket(d.caLap.filter((r) => hop(r.khu_vuc) && caLapHop(r)).map((r) => r.id)),
    canKhaoSat: bucket(d.canKhaoSat.filter((r) => hop(r.khu_vuc)).map((r) => r.id)),
    doanhThuThang: d.doanhThu.filter((r) => hop(r.khu_vuc)).reduce((s, r) => s + (r.tong ?? 0), 0),
  };
}

export function scopeKeyVaiTro(roleVariant: RoleVariant, khuVucList: string[]): string {
  return roleVariant === "giam_sat" ? `giam_sat|${[...khuVucList].sort().join(",")}` : `${roleVariant}|all`;
}
export function scopeKeyKhuVuc(khuVuc: string): string {
  return `khu-vuc-loc|${khuVuc}`;
}

export { duocLuuSoTuTinh };

/** Tinh payload cho DUNG 1 scope (doc 1 lan tren DB pham vi) - dung cho tu tinh khi doc (thay computeSnapshotPayload cu). */
export async function tinhPayloadMotScope(db: D1Database, roleVariant: RoleVariant, khuVucList: string[]): Promise<DailySnapshotPayload> {
  const d = await docDuLieuChot(db);
  return tinhPayloadVaiTro(d, roleVariant, khuVucList, await layCap2(db, getVnDateStr()));
}
export async function tinhBacklogMotKhuVuc(db: D1Database, khuVuc: string): Promise<BacklogBuckets> {
  const d = await docDuLieuChot(db);
  return tinhBacklogBuckets(d, [khuVuc], await layCap2(db, getVnDateStr()));
}

/** Tap case_id co dong giai_trinh SAU moc "since" (1 cau qua idx_giai_trinh_ngay) - thay cho dem tung lo 98 id moi bucket. */
export async function layCaDaGiaiTrinhSau(db: D1Database, since: string): Promise<Set<string>> {
  const { results } = await db
    .prepare("SELECT DISTINCT CAST(case_id AS TEXT) AS id FROM giai_trinh WHERE ngay_giai_trinh > ?")
    .bind(since)
    .all<{ id: string }>();
  return new Set(results.map((r) => r.id));
}
/** = COUNT(DISTINCT case_id) cua countResolved cu tren bang giai_trinh. */
export function demDaGiaiTrinh(daGt: Set<string>, ids: string[]): number {
  let n = 0;
  for (const id of new Set(ids.map(String))) if (daGt.has(id)) n++;
  return n;
}

/** Gioi han so truy van D1 dong thoi cua 1 DB (chot chay nen: Promise.all ben trong cac ham cu khong con ban ~10-20 cau 1 luc).
 * Proxy giu nguyen moi thuoc tinh khac (ke ca symbol pham vi cua lib/phamVi.ts -> quocGiaCua/dbGoc/Telegram van dung). */
export function gioiHanDongThoi(db: D1Database, toiDa = 2): D1Database {
  let dang = 0;
  const hang: (() => void)[] = [];
  const chay = async <T>(fn: () => Promise<T>): Promise<T> => {
    while (dang >= toiDa) await new Promise<void>((r) => hang.push(r));
    dang++;
    try {
      return await fn();
    } finally {
      dang--;
      hang.shift()?.();
    }
  };
  const goc = new WeakMap<object, D1PreparedStatement>();
  const boc = (s: D1PreparedStatement): D1PreparedStatement => {
    const p = new Proxy(s, {
      get(t, k) {
        if (k === "bind") return (...a: unknown[]) => boc(t.bind(...a));
        if (k === "all" || k === "first" || k === "run" || k === "raw") {
          return (...a: unknown[]) => chay(() => (t[k] as (...x: unknown[]) => Promise<unknown>).apply(t, a));
        }
        const v = Reflect.get(t, k);
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    goc.set(p, s);
    return p;
  };
  return new Proxy(db, {
    get(t, k) {
      if (k === "prepare") return (sql: string) => boc(t.prepare(sql));
      if (k === "batch") return (ss: D1PreparedStatement[]) => chay(() => t.batch(ss.map((x) => goc.get(x) ?? x)));
      const v = Reflect.get(t, k);
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
}

/** Cac pham vi cua 1 nhom chot: "VN" -> VN + VN x NSKX/Khong NSKX; nuoc khac -> 1 pham vi; null -> "Tất cả quốc gia" + 2 NSKX. */
export function phamViCuaNhom(nhom: string | null): PhamViDb[] {
  if (nhom === null || nhom === QUOC_GIA_CO_NSKX) {
    return (["tat_ca", "nskx", "khong_nskx"] as PhamVi[]).map((pv) => ({ qg: nhom, pv }));
  }
  return [{ qg: nhom, pv: "tat_ca" }];
}

async function buoc(ten: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    console.error(`[chot] ${ten} loi:`, err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** Chot 1 nhom quoc gia (nhom = ma nuoc, null = "Tất cả quốc gia"). canhBaoTon=false: nut "Làm mới báo cáo" (khong chot Canh bao
 * ton). Moi buoc idempotent (upsert) + withD1Retry; pham vi nao xong het moi ghi dau SCOPE_CHOT_XONG. */
/** opts.giuSoDaChot (cron 07:30/07:40 + chot bu moi gio): KHONG ghi de so chot hom nay da co (so chot, tuoi ton, ton KTV) - chi lap
 * cho con thieu. Sua 2026-11-09: truoc day chot bu moi gio ghi de lai toan bo snapshot -> gio chot nhay 08:00, 09:00... 14:00 va "da
 * giai trinh trong ngay" chi dem giai trinh SAU gio chot moi (ca CEO giai trinh 09:30 van hien "can giai trinh"). Chi nut "Làm mới
 * báo cáo" (Admin chu dong) moi ghi de. */
export async function chotNhom(
  env: Env,
  nhom: string | null,
  generatedBy: string,
  opts: { canhBaoTon: boolean; giuSoDaChot?: boolean },
): Promise<void> {
  const giu = opts.giuSoDaChot === true;
  if (nhom !== null) await buoc(`${nhom} tao bang quoc gia`, () => damBaoBangQuocGia(env.DB, [nhom]));
  const dsPv = phamViCuaNhom(nhom);
  const envCua = (s: PhamViDb) => {
    const e = envPhamVi(env, s);
    return { ...e, DB: gioiHanDongThoi(e.DB) };
  };

  // 1) Canh bao ton truoc (bucket CEO cap 2 cua so chot doc tu day) - gui anh Telegram (chi pham vi nuoc co nhom).
  // Chot bu (lan chay lai trong ngay): pham vi da co ban Canh bao ton chot tu GIO_BAT_DAU_LUU_SO_CHOT thi KHONG chot lai (tranh gui
  // trung anh Telegram moi gio khi chi 1 buoc khac loi).
  if (opts.canhBaoTon) {
    const ngayCb = getVnDateStr();
    for (const s of dsPv) {
      const e = envCua(s);
      const daCo = await e.DB.prepare("SELECT generated_at FROM daily_snapshot WHERE ngay = ? AND scope_key = 'canh_bao_ton|all'")
        .bind(ngayCb)
        .first<{ generated_at: string }>()
        .catch(() => null);
      if (daCo && daCo.generated_at.slice(11, 16) >= GIO_BAT_DAU_LUU_SO_CHOT) continue;
      await buoc(`${hauToPhamVi(s)} canhBaoTon`, () => withD1Retry(() => generateCanhBaoTonSnapshot(e, generatedBy), 6));
    }
  }

  // 2) 1 lan doc cho ca nhom.
  let duLieu: DuLieuChot;
  try {
    duLieu = await withD1Retry(() => docDuLieuChot(envCua(dsPv[0]).DB), 6);
  } catch (err) {
    console.error(`[chot] ${nhom ?? "tat-ca"} doc du lieu loi:`, err instanceof Error ? err.message : String(err));
    return;
  }
  let giamSat: string[][] = [];
  await buoc("doc giam sat", async () => {
    const { results } = await env.DB.prepare("SELECT khu_vuc_phu_trach FROM users WHERE vai_tro = 'Giam sat'").all<{ khu_vuc_phu_trach: string | null }>();
    const seen = new Set<string>();
    giamSat = results.map((u) => fromJsonArray(u.khu_vuc_phu_trach)).filter((l) => {
      const k = [...l].sort().join(",");
      if (l.length === 0 || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  });

  // 3) Moi pham vi: tinh moi scope trong bo nho, ghi gop.
  const ngay = getVnDateStr();
  for (const s of dsPv) {
    const e = envCua(s);
    const d = locTheoPhamVi(duLieu, s.pv);
    const ok = await buoc(`${hauToPhamVi(s)} so chot`, async () => {
      const cap2 = await withD1Retry(() => layCap2(e.DB, ngay), 6);
      const generatedAt = nowVN();
      const dong: [string, unknown][] = [
        [scopeKeyVaiTro("khac", []), tinhPayloadVaiTro(d, "khac", [], cap2)],
        [scopeKeyVaiTro("qc", []), tinhPayloadVaiTro(d, "qc", [], cap2)],
        ...giamSat.map((l) => [scopeKeyVaiTro("giam_sat", l), tinhPayloadVaiTro(d, "giam_sat", l, cap2)] as [string, unknown]),
        ...d.dsKhuVuc.map((kv) => [scopeKeyKhuVuc(kv), tinhBacklogBuckets(d, [kv], cap2)] as [string, unknown]),
      ];
      const stmts = dong.map(([k, p]) =>
        e.DB.prepare(
          `INSERT INTO daily_snapshot (ngay, scope_key, generated_at, generated_by, payload) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(ngay, scope_key) DO ${giu ? "NOTHING" : "UPDATE SET generated_at = excluded.generated_at, generated_by = excluded.generated_by, payload = excluded.payload"}`,
        ).bind(ngay, k, generatedAt, generatedBy, JSON.stringify(p)),
      );
      for (let i = 0; i < stmts.length; i += 10) {
        const lo = stmts.slice(i, i + 10);
        await withD1Retry(() => e.DB.batch(lo), 6);
      }
    });
    const daCo = async (sql: string) => giu && !!(await e.DB.prepare(sql).bind(ngay).first().catch(() => null));
    const okAge = await buoc(`${hauToPhamVi(s)} tuoi ton`, async () => {
      if (await daCo("SELECT 1 AS c FROM backlog_age_daily WHERE ngay = ? LIMIT 1")) return;
      await withD1Retry(() => generateBacklogAgeSnapshot(e.DB), 6);
    });
    const okKtv = await buoc(`${hauToPhamVi(s)} ton KTV`, async () => {
      if (await daCo("SELECT 1 AS c FROM ton_ktv_daily WHERE ngay = ?")) return;
      await withD1Retry(() => generateTonKtvSnapshot(e.DB), 6);
    });
    if (ok && okAge && okKtv && opts.canhBaoTon) {
      await buoc(`${hauToPhamVi(s)} dau chot xong`, () =>
        withD1Retry(
          () =>
            e.DB.prepare(
              `INSERT INTO daily_snapshot (ngay, scope_key, generated_at, generated_by, payload) VALUES (?, ?, ?, ?, '{}')
               ON CONFLICT(ngay, scope_key) DO UPDATE SET generated_at = excluded.generated_at`,
            )
              .bind(ngay, SCOPE_CHOT_XONG, nowVN(), generatedBy)
              .run(),
          6,
        ),
      );
    }
  }
}

/** Cac nhom chot theo khung gio (index.ts): phut 30 -> VN; phut 40 -> nuoc khac dang bat + "Tất cả quốc gia" (null). */
export async function nhomTheoPhut(env: Env, phut: number): Promise<(string | null)[]> {
  if (phut < 40) return [QUOC_GIA_CO_NSKX];
  let dsNuoc: string[] = [];
  try {
    dsNuoc = await dsQuocGiaKichHoat(env.DB);
  } catch (err) {
    console.error("[chot] doc danh sach nuoc loi:", err instanceof Error ? err.message : String(err));
  }
  return [...dsNuoc.filter((q) => q !== QUOC_GIA_CO_NSKX), null];
}

/** Moi nhom (nut "Làm mới báo cáo"). */
export async function tatCaNhom(env: Env): Promise<(string | null)[]> {
  return [QUOC_GIA_CO_NSKX, ...(await nhomTheoPhut(env, 40))];
}

/** Luoi an toan moi gio (8h-18h): nhom nao con pham vi chua co dau SCOPE_CHOT_XONG hom nay -> chot bu ca nhom. */
export async function chotBuNeuThieu(env: Env): Promise<void> {
  const ngay = getVnDateStr();
  for (const nhom of await tatCaNhom(env)) {
    let thieu = false;
    for (const s of phamViCuaNhom(nhom)) {
      const co = await envPhamVi(env, s)
        .DB.prepare("SELECT 1 AS c FROM daily_snapshot WHERE ngay = ? AND scope_key = ?")
        .bind(ngay, SCOPE_CHOT_XONG)
        .first()
        .catch(() => null);
      if (!co) thieu = true;
    }
    if (thieu) {
      console.error(`[chot-bu] nhom ${nhom ?? "tat-ca"} chua chot xong hom nay - chot bu`);
      await chotNhom(env, nhom, "auto", { canhBaoTon: true, giuSoDaChot: true });
    }
  }
}
