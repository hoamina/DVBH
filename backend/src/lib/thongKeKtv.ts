import { cachedReport } from "./reportCache";
import { nowVN } from "./vnTime";

/**
 * So lieu cong viec theo KTV cho 1 thang - nguon cua GET /api/partner/thong-ke-ktv (PARTNER_API_GUIDE.md muc 14),
 * he "Giai trinh vi pham" (vipham) keo ve hien tab "Bao cao nhanh" cho KTV.
 *
 * Dinh nghia KPI GIONG HET dashboard (dashboardCompute.ts computeDashboardKpis/computeDashboardPivot) de so 2 he
 * khop nhau: thang KPI tinh theo thoi_gian_hoan_thanh, chi ca tinh_vao_kpi = 1, SLA = dung_han 'Đúng hạn' tren
 * dung_han NOT NULL, 24h = '0. Dưới 24h' tren bucket NOT NULL, nghi ngo = tong 4 co loi_*. Rieng
 * tong_ca_tiep_nhan/ca_tiep_nhan_con_ton tinh theo thoi_gian_cskh_tiep_nhan (khoi luong NHAN trong thang).
 *
 * KTV = ma trong tien to "(ma) Ten" cua ky_thuat_vien - cung cach khop voi ma_ktv o khao_sat_loai_tru
 * (surveyConditions.ts) va la cot DVBH gui sang vipham khi bao nghi ngo (viPhamBenNgoai.ts), nen vi pham va so
 * lieu cong viec cua 1 KTV gan cung 1 nguoi. Ca khong co tien to "(ma)" bi bo qua.
 *
 * Tinh 1 lan cho TAT CA KTV cua thang, cache qua cachedReport domain "cases" (chi bump khi import CRM thuc su
 * doi du lieu) - KHONG khai bao "vi_pham" du so vi_pham_xac_nhan doc bang vi_pham: domain do bump moi lan
 * khao sat/chot, se tinh lai ca thang hang chuc lan/ngay. So xac nhan vi the co the cham toi luot import ke
 * tiep (~4-5 lan/ngay) hoac sang ngay moi - chap nhan duoc cho bao cao thang.
 */

const KTV_MA_EXPR = `CASE WHEN substr(c.ky_thuat_vien, 1, 1) = '(' AND instr(c.ky_thuat_vien, ')') > 2
  THEN substr(c.ky_thuat_vien, 2, instr(c.ky_thuat_vien, ')') - 2) END`;

// so_gio_xu_ly = GIO (migration 0102). Bo gia tri ngoai [0, 1 nam): du lieu import cu co dong luu sai don vi (kiem
// chung tren D1 local 2026-10-26: hang ty "gio"), 1 dong nhu vay du lam trung binh ca thang vo nghia. NULL cung bo qua.
const GIO_HOP_LE = "c.so_gio_xu_ly >= 0 AND c.so_gio_xu_ly < 8760";

const KHOANG_HOAN_THANH = "c.thoi_gian_hoan_thanh >= ? || '-01' AND c.thoi_gian_hoan_thanh < date(? || '-01', '+1 month')";
const KHOANG_TIEP_NHAN = "c.thoi_gian_cskh_tiep_nhan >= ? || '-01' AND c.thoi_gian_cskh_tiep_nhan < date(? || '-01', '+1 month')";

export interface ThongKeKtvRow {
  ma_ktv: string;
  ten_ktv: string | null;
  tong_ca_tiep_nhan: number;
  ca_tiep_nhan_con_ton: number;
  ca_dong: number;
  ca_hoan_thanh: number;
  ca_khong_hoan_thanh: number;
  ca_dung_han: number;
  ca_tinh_sla: number;
  ca_duoi_24h: number;
  ca_tinh_24h: number;
  phan_bo_24h: Record<string, number>;
  thoi_gian_xu_ly_tb_gio: number | null;
  nghi_ngo: { loi_120p: number; hen_qua_24h: number; lo_ke_hoach: number; kh_hen_lai: number; tong: number };
  vi_pham_da_khao_sat: number;
  vi_pham_xac_nhan: number;
}

export interface ThongKeKtvPayload {
  thang: string;
  tinh_luc: string;
  rows: ThongKeKtvRow[];
}

function rowRong(ma: string): ThongKeKtvRow {
  return {
    ma_ktv: ma,
    ten_ktv: null,
    tong_ca_tiep_nhan: 0,
    ca_tiep_nhan_con_ton: 0,
    ca_dong: 0,
    ca_hoan_thanh: 0,
    ca_khong_hoan_thanh: 0,
    ca_dung_han: 0,
    ca_tinh_sla: 0,
    ca_duoi_24h: 0,
    ca_tinh_24h: 0,
    phan_bo_24h: {},
    thoi_gian_xu_ly_tb_gio: null,
    nghi_ngo: { loi_120p: 0, hen_qua_24h: 0, lo_ke_hoach: 0, kh_hen_lai: 0, tong: 0 },
    vi_pham_da_khao_sat: 0,
    vi_pham_xac_nhan: 0,
  };
}

async function computeThongKeKtv(db: D1Database, thang: string): Promise<ThongKeKtvPayload> {
  // INDEXED BY tren case_dvbh (khong dung duoc tren view case_hieu_luc) -> loc huy_bo_at IS NULL bang tay.
  const [dong, tiepNhan, bucket, viPham] = await db.batch([
    db
      .prepare(
        `SELECT ${KTV_MA_EXPR} as ma, MAX(c.ky_thuat_vien) as ten,
           SUM(CASE WHEN c.tien_do_hoan_thanh IN ('Hoàn thành XLSC', 'Không hoàn thành XLSC') THEN 1 ELSE 0 END) as ca_dong,
           SUM(CASE WHEN c.tinh_vao_kpi = 1 AND c.tien_do_hoan_thanh = 'Hoàn thành XLSC' THEN 1 ELSE 0 END) as ca_hoan_thanh,
           SUM(CASE WHEN c.tien_do_hoan_thanh = 'Không hoàn thành XLSC' THEN 1 ELSE 0 END) as ca_khong_hoan_thanh,
           SUM(CASE WHEN c.tinh_vao_kpi = 1 AND c.dung_han = 'Đúng hạn' THEN 1 ELSE 0 END) as ca_dung_han,
           SUM(CASE WHEN c.tinh_vao_kpi = 1 AND c.dung_han IS NOT NULL THEN 1 ELSE 0 END) as ca_tinh_sla,
           SUM(CASE WHEN c.tinh_vao_kpi = 1 AND c.xu_ly_24h_bucket = '0. Dưới 24h' THEN 1 ELSE 0 END) as ca_duoi_24h,
           SUM(CASE WHEN c.tinh_vao_kpi = 1 AND c.xu_ly_24h_bucket IS NOT NULL THEN 1 ELSE 0 END) as ca_tinh_24h,
           SUM(CASE WHEN c.tinh_vao_kpi = 1 AND ${GIO_HOP_LE} THEN c.so_gio_xu_ly ELSE 0 END) as tong_gio,
           SUM(CASE WHEN c.tinh_vao_kpi = 1 AND ${GIO_HOP_LE} THEN 1 ELSE 0 END) as ca_co_gio,
           SUM(c.loi_120p) as loi_120p, SUM(c.loi_qua_han_24h) as hen_qua_24h,
           SUM(c.loi_lo_ke_hoach) as lo_ke_hoach, SUM(c.loi_kh_hen_lai) as kh_hen_lai
         FROM case_dvbh c INDEXED BY idx_case_hoan_thanh_not_null
         WHERE ${KHOANG_HOAN_THANH} AND c.huy_bo_at IS NULL
         GROUP BY ma`,
      )
      .bind(thang, thang),
    db
      .prepare(
        `SELECT ${KTV_MA_EXPR} as ma, MAX(c.ky_thuat_vien) as ten, COUNT(*) as tong,
           SUM(CASE WHEN c.thoi_gian_hoan_thanh IS NULL THEN 1 ELSE 0 END) as con_ton
         FROM case_dvbh c INDEXED BY idx_case_thoi_gian_tiep_nhan
         WHERE ${KHOANG_TIEP_NHAN} AND c.huy_bo_at IS NULL
         GROUP BY ma`,
      )
      .bind(thang, thang),
    db
      .prepare(
        `SELECT ${KTV_MA_EXPR} as ma, c.xu_ly_24h_bucket as nhom, COUNT(*) as sl
         FROM case_dvbh c INDEXED BY idx_case_hoan_thanh_not_null
         WHERE ${KHOANG_HOAN_THANH} AND c.huy_bo_at IS NULL AND c.tinh_vao_kpi = 1 AND c.xu_ly_24h_bucket IS NOT NULL
         GROUP BY ma, nhom`,
      )
      .bind(thang, thang),
    // Cung dinh nghia "xacNhan"/"daKhaoSat" cua computeDashboardKpis.
    db
      .prepare(
        `SELECT ${KTV_MA_EXPR} as ma, COUNT(*) as da_khao_sat,
           SUM(CASE WHEN COALESCE(v.chot_bo_cap_2, CASE WHEN v.ket_qua_cap_1 != 'Khong loi' THEN 1 ELSE 0 END) = 1 THEN 1 ELSE 0 END) as xac_nhan
         FROM case_dvbh c INDEXED BY idx_case_hoan_thanh_not_null
         INNER JOIN vi_pham v ON v.case_id = c.id
         WHERE ${KHOANG_HOAN_THANH} AND c.huy_bo_at IS NULL
         GROUP BY ma`,
      )
      .bind(thang, thang),
  ]);

  const map = new Map<string, ThongKeKtvRow>();
  const lay = (ma: string | null): ThongKeKtvRow | null => {
    if (!ma) return null;
    let r = map.get(ma);
    if (!r) {
      r = rowRong(ma);
      map.set(ma, r);
    }
    return r;
  };

  for (const d of dong.results as Record<string, number | string | null>[]) {
    const r = lay(d.ma as string | null);
    if (!r) continue;
    r.ten_ktv = (d.ten as string | null) ?? r.ten_ktv;
    r.ca_dong = Number(d.ca_dong) || 0;
    r.ca_hoan_thanh = Number(d.ca_hoan_thanh) || 0;
    r.ca_khong_hoan_thanh = Number(d.ca_khong_hoan_thanh) || 0;
    r.ca_dung_han = Number(d.ca_dung_han) || 0;
    r.ca_tinh_sla = Number(d.ca_tinh_sla) || 0;
    r.ca_duoi_24h = Number(d.ca_duoi_24h) || 0;
    r.ca_tinh_24h = Number(d.ca_tinh_24h) || 0;
    const caCoGio = Number(d.ca_co_gio) || 0;
    r.thoi_gian_xu_ly_tb_gio = caCoGio > 0 ? Math.round(((Number(d.tong_gio) || 0) / caCoGio) * 10) / 10 : null;
    const nn = {
      loi_120p: Number(d.loi_120p) || 0,
      hen_qua_24h: Number(d.hen_qua_24h) || 0,
      lo_ke_hoach: Number(d.lo_ke_hoach) || 0,
      kh_hen_lai: Number(d.kh_hen_lai) || 0,
    };
    r.nghi_ngo = { ...nn, tong: nn.loi_120p + nn.hen_qua_24h + nn.lo_ke_hoach + nn.kh_hen_lai };
  }
  for (const t of tiepNhan.results as Record<string, number | string | null>[]) {
    const r = lay(t.ma as string | null);
    if (!r) continue;
    r.ten_ktv = r.ten_ktv ?? (t.ten as string | null);
    r.tong_ca_tiep_nhan = Number(t.tong) || 0;
    r.ca_tiep_nhan_con_ton = Number(t.con_ton) || 0;
  }
  for (const b of bucket.results as Record<string, number | string | null>[]) {
    const r = lay(b.ma as string | null);
    if (!r || !b.nhom) continue;
    r.phan_bo_24h[b.nhom as string] = Number(b.sl) || 0;
  }
  for (const v of viPham.results as Record<string, number | string | null>[]) {
    const r = lay(v.ma as string | null);
    if (!r) continue;
    r.vi_pham_da_khao_sat = Number(v.da_khao_sat) || 0;
    r.vi_pham_xac_nhan = Number(v.xac_nhan) || 0;
  }

  return {
    thang,
    tinh_luc: nowVN(),
    rows: [...map.values()].sort((a, b) => a.ma_ktv.localeCompare(b.ma_ktv)),
  };
}

export function getThongKeKtv(db: D1Database, thang: string): Promise<ThongKeKtvPayload> {
  return cachedReport(db, `partner/thong-ke-ktv/${thang}`, ["cases"], () => computeThongKeKtv(db, thang));
}
