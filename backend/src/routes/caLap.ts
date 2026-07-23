import { Hono } from "hono";
import type { Env } from "../types";
import { CA_LAP_LOAI_KEYS, HINH_THUC_XU_LY_KEYS } from "../types";
import { verifySessionMiddleware } from "../middleware/session";
import { loadUser } from "../middleware/loadUser";
import { requireRole } from "../middleware/requireRole";
import { scopeByKhuVuc, khuVucWhereClause } from "../middleware/scopeByKhuVuc";
import { khuVucAdHocClause } from "../lib/filterParams";
import { nextSequentialId } from "../lib/idCounter";
import { runBatched } from "../lib/backfillImportProcessor";
import { eligibleClause } from "../lib/caLapEligible";
import { refreshCaLapPrecompute, CA_LAP_SNAPSHOT_HASH_KEY } from "../lib/caLapRefresh";

const caLap = new Hono<{ Bindings: Env }>();
caLap.use("*", verifySessionMiddleware, loadUser);

// Export de notifications.ts dung lai cho badge sidebar (dem "can danh gia"/"cho QC" cua Ca lap).
export const NGUONG_NGAY_LAP = 45;

// GET /api/ca-lap/version - hash cua danh sach "ca lap" da tinh san (KHONG gom trang thai giai
// trinh, xem comment lib/caLapRefresh.ts) - client dung de quyet dinh co can tai lai bao cao
// khong (giong co che da co san cho settings_ly_do/linh_kien, xem contentHash.ts). Neu chua co
// hash nao (truoc lan refresh dau tien) thi tinh luon 1 lan o day de khong tra rong.
caLap.get("/version", async (c) => {
  const existing = await c.env.DB.prepare("SELECT hash FROM content_versions WHERE ten_bang = ?")
    .bind(CA_LAP_SNAPSHOT_HASH_KEY)
    .first<{ hash: string }>();
  if (existing) return c.json({ hash: existing.hash });

  const { hash } = await refreshCaLapPrecompute(c.env.DB);
  return c.json({ hash });
});

/** "2026-06" -> { start: "2026-06-01", end: "2026-07-01" } - copy y het monthBounds() cua cases.ts
 * (khong gio o ca 2 dau, xem comment goc o do ve bug so sanh chuoi ngay-thuan-vs-co-gio). */
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

/**
 * Phat hien "ca lap" (cung serial voi ca hoan thanh gan nhat truoc do). TRUOC DAY tinh truc tiep
 * bang LAG() window function quet TOAN BO lich su case_dvbh (~15.6 nghin dong) MOI LAN goi - qua
 * ton kem vi duoc goi lai o nhieu noi (badge thong bao poll moi 5 phut, banner Dashboard, module
 * Ca lap) va lam rows-read D1 vuot han muc free tier (xem phan tich chi phi D1 2026-07-22).
 *
 * GIO DAY: ket qua LAG() duoc TINH SAN dinh ky qua Cron Trigger (lib/caLapRefresh.ts, xem
 * backend/src/index.ts scheduled()), luu vao 2 cot case_dvbh.ca_lap_prior_id/ca_lap_prior_ht. Doc
 * "lap" chi con la 1 truy van WHERE don gian tren index rieng (idx_case_ca_lap_prior_ht,
 * migrations/0017) - chi cham ~816 dong (so ca THAT SU co "lap") thay vi quet ~15.6 nghin dong moi
 * lan, giam ~19 lan chi phi. Danh doi: du lieu co the cham hon toi da 1 chu ky refresh (vd 20 phut)
 * so voi thoi diem import/cap nhat that - chap nhan duoc cho 1 bao cao noi bo.
 */
// Than CTE (khong co tu khoa "WITH" dau) - dung khi can ghep vao GIUA 1 khoi WITH khac (khuVucQuery/
// ktvQuery ben duoi co WITH rieng cua chung, khong the long them 1 "WITH" thu 2 o giua danh sach CTE).
const CA_LAP_CTE_BODY = `
  lap AS (
    SELECT *, ca_lap_prior_id AS prior_id, ca_lap_prior_ht AS prior_ht,
      (julianday(thoi_gian_hoan_thanh) - julianday(ca_lap_prior_ht)) AS gap_days
    FROM case_dvbh
    WHERE ca_lap_prior_ht IS NOT NULL
  )
`;
// Ban standalone (co "WITH" dau) - dung khi day la khoi WITH duy nhat cua cau truy van. Export de
// notifications.ts dung lai cho badge sidebar.
export const CA_LAP_CTE = `WITH ${CA_LAP_CTE_BODY}`;

const GT_LAP_COLUMNS = `
  gl.id as gt_id, gl.chot_danh_gia_lap, gl.chot_hinh_thuc_xu_ly, gl.dien_giai_lap,
  gl.nguoi_giai_trinh, gl.ngay_giai_trinh, gl.qc_chot, gl.qc_ghi_chu, gl.nguoi_qc, gl.ngay_qc
`;

// GET /api/ca-lap/danh-sach?khu_vuc=&thang=&trang_thai=&page=&pageSize=&export=
caLap.get("/danh-sach", async (c) => {
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "lap.khu_vuc");
  const khuVucClause = khuVucAdHocClause("lap.khu_vuc", c.req.query("khu_vuc"));
  const thang = c.req.query("thang") || new Date().toISOString().slice(0, 7);
  const { start, end } = monthBounds(thang);
  const trangThai = c.req.query("trang_thai");
  const isExport = c.req.query("export") === "true";

  let trangThaiClause = "";
  if (trangThai === "qua-han-lap") trangThaiClause = ` AND lap.gap_days > ${NGUONG_NGAY_LAP}`;
  else if (trangThai === "can-danh-gia") trangThaiClause = ` AND lap.gap_days <= ${NGUONG_NGAY_LAP} AND gl.chot_danh_gia_lap IS NULL`;
  else if (trangThai === "cho-qc") trangThaiClause = ` AND lap.gap_days <= ${NGUONG_NGAY_LAP} AND gl.chot_danh_gia_lap IS NOT NULL AND gl.qc_chot IS NULL`;
  else if (trangThai === "da-chot") trangThaiClause = ` AND lap.gap_days <= ${NGUONG_NGAY_LAP} AND gl.qc_chot IS NOT NULL`;

  const whereSql = `WHERE lap.thoi_gian_hoan_thanh >= ? AND lap.thoi_gian_hoan_thanh < ?${scopeClause.sql}${khuVucClause.sql}${trangThaiClause}`;
  const binds: unknown[] = [start, end, ...scopeClause.binds, ...khuVucClause.binds];

  const kpiQuery = `${CA_LAP_CTE}
    SELECT
      SUM(CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} THEN 1 ELSE 0 END) as tong_lap,
      SUM(CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} AND gl.qc_chot IS NOT NULL THEN 1 ELSE 0 END) as da_chot,
      SUM(CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} AND gl.chot_danh_gia_lap IS NOT NULL AND gl.qc_chot IS NULL THEN 1 ELSE 0 END) as cho_qc,
      SUM(CASE WHEN lap.gap_days > ${NGUONG_NGAY_LAP} THEN 1 ELSE 0 END) as qua_han_lap
    FROM lap LEFT JOIN giai_trinh_lap gl ON gl.case_id = lap.id
    WHERE lap.thoi_gian_hoan_thanh >= ? AND lap.thoi_gian_hoan_thanh < ?${scopeClause.sql}${khuVucClause.sql}`;

  const countQuery = `${CA_LAP_CTE}
    SELECT COUNT(*) as total FROM lap LEFT JOIN giai_trinh_lap gl ON gl.case_id = lap.id ${whereSql}`;

  const rowsQueryBase = `${CA_LAP_CTE}
    SELECT lap.*, ${GT_LAP_COLUMNS}
    FROM lap LEFT JOIN giai_trinh_lap gl ON gl.case_id = lap.id
    ${whereSql}
    ORDER BY lap.thoi_gian_hoan_thanh DESC`;

  if (isExport) {
    const { results } = await c.env.DB.prepare(`${rowsQueryBase} LIMIT 5000`).bind(...binds).all();
    return c.json({ rows: results, thang });
  }

  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  const [kpiRow, countRow, rowsResult] = await Promise.all([
    c.env.DB.prepare(kpiQuery).bind(start, end, ...scopeClause.binds, ...khuVucClause.binds).first<Record<string, number>>(),
    c.env.DB.prepare(countQuery).bind(...binds).first<{ total: number }>(),
    c.env.DB.prepare(`${rowsQueryBase} LIMIT ? OFFSET ?`).bind(...binds, pageSize, offset).all(),
  ]);

  return c.json({
    rows: rowsResult.results,
    page,
    pageSize,
    total: countRow?.total ?? 0,
    thang,
    kpi: {
      tongLap: kpiRow?.tong_lap ?? 0,
      daChot: kpiRow?.da_chot ?? 0,
      choQc: kpiRow?.cho_qc ?? 0,
      quaHanLap: kpiRow?.qua_han_lap ?? 0,
    },
  });
});

// GET /api/ca-lap/danh-sach/list?khu_vuc=&thang= - phan ON DINH cua danh sach (cot case_dvbh +
// prior_id/prior_ht/gap_days), KHONG gom trang thai xu ly (giai_trinh_lap) - dung cho FE cache
// theo hash cua /version (xem frontend/src/lib/staticListCache.ts), chi doi khi import kich hoat
// refreshCaLapPrecompute() (hoac cron an toan hang gio), KHONG doi khi ai do chi giai trinh/chot QC.
// Tra ve TOAN BO (khong phan trang) vi tong so ca lap con nho (~vai tram), loc trang thai + phan
// trang se lam o FE sau khi gop voi /status.
caLap.get("/danh-sach/list", async (c) => {
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "lap.khu_vuc");
  const khuVucClause = khuVucAdHocClause("lap.khu_vuc", c.req.query("khu_vuc"));
  const thang = c.req.query("thang") || new Date().toISOString().slice(0, 7);
  const { start, end } = monthBounds(thang);

  const { results } = await c.env.DB.prepare(
    `${CA_LAP_CTE}
     SELECT lap.* FROM lap
     WHERE lap.thoi_gian_hoan_thanh >= ? AND lap.thoi_gian_hoan_thanh < ?${scopeClause.sql}${khuVucClause.sql}
     ORDER BY lap.thoi_gian_hoan_thanh DESC`,
  )
    .bind(start, end, ...scopeClause.binds, ...khuVucClause.binds)
    .all();

  return c.json({ rows: results, thang });
});

// GET /api/ca-lap/danh-sach/status?khu_vuc=&thang= - phan DONG (giai_trinh_lap) cua danh sach -
// LUON tai moi (khong cache), nhung re vi giai_trinh_lap chi co dong voi ca THAT SU da duoc
// GS/QC dong gia/chot (nho hon nhieu so voi tong so ca lap). FE gop voi ket qua /list theo case_id.
caLap.get("/danh-sach/status", async (c) => {
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "c.khu_vuc");
  const khuVucClause = khuVucAdHocClause("c.khu_vuc", c.req.query("khu_vuc"));
  const thang = c.req.query("thang") || new Date().toISOString().slice(0, 7);
  const { start, end } = monthBounds(thang);

  const { results } = await c.env.DB.prepare(
    `SELECT gl.*
     FROM giai_trinh_lap gl
     JOIN case_dvbh c ON c.id = gl.case_id
     WHERE c.ca_lap_prior_ht IS NOT NULL
       AND c.thoi_gian_hoan_thanh >= ? AND c.thoi_gian_hoan_thanh < ?${scopeClause.sql}${khuVucClause.sql}`,
  )
    .bind(start, end, ...scopeClause.binds, ...khuVucClause.binds)
    .all();

  return c.json({ rows: results });
});

const LOI_LAP_LOAI = ["Lap do nghiep vu KTV", "Lap do tay nghe KTV"];

// GET /api/ca-lap/tong-quan?khu_vuc=&thang= - KPI + bao cao theo khu vuc/KTV + du lieu bieu do,
// tuong duong tab "Bao cao tong quan" cua cong cu Radar Lap cu. "Loai chot hieu luc" luon uu tien
// QC (COALESCE(qc_chot, chot_danh_gia_lap)) dung y het logic goc "c._loai = qc || giamsat || null".
caLap.get("/tong-quan", async (c) => {
  const scope = scopeByKhuVuc(c);
  const scopeClause = khuVucWhereClause(scope, "khu_vuc");
  const scopeClauseLap = khuVucWhereClause(scope, "lap.khu_vuc");
  const khuVucFilter = c.req.query("khu_vuc");
  const khuVucClause = khuVucAdHocClause("khu_vuc", khuVucFilter);
  const khuVucClauseLap = khuVucAdHocClause("lap.khu_vuc", khuVucFilter);
  const thang = c.req.query("thang") || new Date().toISOString().slice(0, 7);
  const { start, end } = monthBounds(thang);

  const raSoatQuery = `SELECT COUNT(*) as n FROM case_dvbh WHERE thoi_gian_hoan_thanh >= ? AND thoi_gian_hoan_thanh < ?${eligibleClause("")}${scopeClause.sql}${khuVucClause.sql}`;
  const validQuery = `SELECT COUNT(*) as n FROM case_dvbh
    WHERE thoi_gian_hoan_thanh >= ? AND thoi_gian_hoan_thanh < ?
      AND seri_san_pham IS NOT NULL AND length(seri_san_pham) > 4
      AND NOT EXISTS (SELECT 1 FROM blacklist_serial b WHERE b.seri_san_pham = UPPER(TRIM(case_dvbh.seri_san_pham)) AND b.bat_tat = 1)
      ${eligibleClause("")}${scopeClause.sql}${khuVucClause.sql}`;

  const lapKpiQuery = `${CA_LAP_CTE}
    SELECT
      SUM(CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} THEN 1 ELSE 0 END) as tong_lap,
      COUNT(DISTINCT CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} THEN lap.seri_san_pham END) as serial_lap,
      SUM(CASE WHEN lap.gap_days > ${NGUONG_NGAY_LAP} THEN 1 ELSE 0 END) as qua_han_lap,
      SUM(CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} AND gl.chot_danh_gia_lap IS NOT NULL THEN 1 ELSE 0 END) as da_giai_trinh,
      COUNT(DISTINCT CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} THEN lap.ky_thuat_vien END) as ktv_lien_quan,
      SUM(CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} AND COALESCE(gl.qc_chot, gl.chot_danh_gia_lap) IN ('${LOI_LAP_LOAI[0]}','${LOI_LAP_LOAI[1]}') THEN 1 ELSE 0 END) as loi_lap_da_chot,
      SUM(CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} AND gl.chot_danh_gia_lap IS NULL THEN 1 ELSE 0 END) as gs_chua,
      SUM(CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} AND gl.qc_chot IS NULL THEN 1 ELSE 0 END) as qc_chua
    FROM lap LEFT JOIN giai_trinh_lap gl ON gl.case_id = lap.id
    WHERE lap.thoi_gian_hoan_thanh >= ? AND lap.thoi_gian_hoan_thanh < ?${scopeClauseLap.sql}${khuVucClauseLap.sql}`;

  const khuVucQuery = `
    WITH raSoatByKv AS (
      SELECT khu_vuc, COUNT(*) as raSoat
      FROM case_dvbh
      WHERE thoi_gian_hoan_thanh >= ? AND thoi_gian_hoan_thanh < ?${eligibleClause("")}${scopeClause.sql}${khuVucClause.sql}
      GROUP BY khu_vuc
    ),
    validByKv AS (
      SELECT khu_vuc, COUNT(*) as validSerial
      FROM case_dvbh
      WHERE thoi_gian_hoan_thanh >= ? AND thoi_gian_hoan_thanh < ?
        AND seri_san_pham IS NOT NULL AND length(seri_san_pham) > 4
        AND NOT EXISTS (SELECT 1 FROM blacklist_serial b WHERE b.seri_san_pham = UPPER(TRIM(case_dvbh.seri_san_pham)) AND b.bat_tat = 1)
        ${eligibleClause("")}${scopeClause.sql}${khuVucClause.sql}
      GROUP BY khu_vuc
    ),
    ${CA_LAP_CTE_BODY},
    lapByKv AS (
      SELECT lap.khu_vuc,
        SUM(CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} THEN 1 ELSE 0 END) as lap_n,
        COUNT(DISTINCT CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} THEN lap.seri_san_pham END) as serial_lap,
        SUM(CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} AND gl.chot_danh_gia_lap IS NOT NULL THEN 1 ELSE 0 END) as da_giai_trinh,
        SUM(CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} AND COALESCE(gl.qc_chot, gl.chot_danh_gia_lap) IN ('${LOI_LAP_LOAI[0]}','${LOI_LAP_LOAI[1]}') THEN 1 ELSE 0 END) as loi_chot,
        SUM(CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} AND gl.chot_danh_gia_lap IS NULL THEN 1 ELSE 0 END) as gs_chua,
        SUM(CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} AND gl.qc_chot IS NULL THEN 1 ELSE 0 END) as qc_chua
      FROM lap LEFT JOIN giai_trinh_lap gl ON gl.case_id = lap.id
      WHERE lap.thoi_gian_hoan_thanh >= ? AND lap.thoi_gian_hoan_thanh < ?${scopeClauseLap.sql}${khuVucClauseLap.sql}
      GROUP BY lap.khu_vuc
    )
    SELECT r.khu_vuc as nhom, r.raSoat,
      COALESCE(v.validSerial,0) as valid_serial,
      (r.raSoat - COALESCE(v.validSerial,0)) as serial_sai,
      ROUND(CASE WHEN r.raSoat > 0 THEN CAST((r.raSoat - COALESCE(v.validSerial,0)) AS REAL) * 100 / r.raSoat ELSE 0 END, 1) as ty_le_serial_sai,
      COALESCE(l.lap_n,0) as lap_n,
      COALESCE(l.serial_lap,0) as serial_lap,
      (COALESCE(l.lap_n,0) - COALESCE(l.da_giai_trinh,0)) as con_dong,
      COALESCE(l.da_giai_trinh,0) as da_giai_trinh,
      COALESCE(l.loi_chot,0) as loi_chot,
      COALESCE(l.gs_chua,0) as gs_chua,
      COALESCE(l.qc_chua,0) as qc_chua
    FROM raSoatByKv r
    LEFT JOIN validByKv v ON v.khu_vuc = r.khu_vuc
    LEFT JOIN lapByKv l ON l.khu_vuc = r.khu_vuc
    ORDER BY con_dong DESC, lap_n DESC`;

  const ktvQuery = `
    WITH raSoatByKtv AS (
      SELECT ky_thuat_vien, COUNT(*) as raSoat
      FROM case_dvbh
      WHERE thoi_gian_hoan_thanh >= ? AND thoi_gian_hoan_thanh < ?${eligibleClause("")}${scopeClause.sql}${khuVucClause.sql}
      GROUP BY ky_thuat_vien
    ),
    ${CA_LAP_CTE_BODY},
    lapByKtv AS (
      SELECT lap.ky_thuat_vien,
        SUM(CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} THEN 1 ELSE 0 END) as lap_n,
        SUM(CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} AND gl.chot_danh_gia_lap IS NOT NULL THEN 1 ELSE 0 END) as da_giai_trinh,
        SUM(CASE WHEN lap.gap_days <= ${NGUONG_NGAY_LAP} AND COALESCE(gl.qc_chot, gl.chot_danh_gia_lap) IN ('${LOI_LAP_LOAI[0]}','${LOI_LAP_LOAI[1]}') THEN 1 ELSE 0 END) as loi_chot
      FROM lap LEFT JOIN giai_trinh_lap gl ON gl.case_id = lap.id
      WHERE lap.thoi_gian_hoan_thanh >= ? AND lap.thoi_gian_hoan_thanh < ?${scopeClauseLap.sql}${khuVucClauseLap.sql}
      GROUP BY lap.ky_thuat_vien
    )
    SELECT l.ky_thuat_vien as nhom, COALESCE(r.raSoat,0) as raSoat, l.lap_n, l.da_giai_trinh, l.loi_chot
    FROM lapByKtv l LEFT JOIN raSoatByKtv r ON r.ky_thuat_vien = l.ky_thuat_vien
    WHERE l.ky_thuat_vien IS NOT NULL AND l.lap_n > 0
    ORDER BY l.lap_n DESC LIMIT 15`;

  const trendQuery = `${CA_LAP_CTE}
    SELECT date(lap.thoi_gian_hoan_thanh) as ngay, COUNT(*) as so_ca
    FROM lap
    WHERE lap.gap_days <= ${NGUONG_NGAY_LAP} AND lap.thoi_gian_hoan_thanh >= ? AND lap.thoi_gian_hoan_thanh < ?${scopeClauseLap.sql}${khuVucClauseLap.sql}
    GROUP BY ngay ORDER BY ngay ASC`;

  const trangThaiQuery = `${CA_LAP_CTE}
    SELECT
      CASE WHEN gl.qc_chot IS NOT NULL THEN 'da-chot' WHEN gl.chot_danh_gia_lap IS NOT NULL THEN 'cho-qc' ELSE 'can-danh-gia' END as trang_thai,
      COUNT(*) as so_ca
    FROM lap LEFT JOIN giai_trinh_lap gl ON gl.case_id = lap.id
    WHERE lap.gap_days <= ${NGUONG_NGAY_LAP} AND lap.thoi_gian_hoan_thanh >= ? AND lap.thoi_gian_hoan_thanh < ?${scopeClauseLap.sql}${khuVucClauseLap.sql}
    GROUP BY trang_thai`;

  const topKtvQuery = `${CA_LAP_CTE}
    SELECT lap.ky_thuat_vien as nhom, COUNT(*) as so_ca
    FROM lap
    WHERE lap.gap_days <= ${NGUONG_NGAY_LAP} AND lap.ky_thuat_vien IS NOT NULL AND lap.thoi_gian_hoan_thanh >= ? AND lap.thoi_gian_hoan_thanh < ?${scopeClauseLap.sql}${khuVucClauseLap.sql}
    GROUP BY lap.ky_thuat_vien ORDER BY so_ca DESC LIMIT 8`;

  const loaiChotQuery = `${CA_LAP_CTE}
    SELECT COALESCE(gl.qc_chot, gl.chot_danh_gia_lap) as loai, COUNT(*) as so_ca
    FROM lap LEFT JOIN giai_trinh_lap gl ON gl.case_id = lap.id
    WHERE lap.gap_days <= ${NGUONG_NGAY_LAP} AND COALESCE(gl.qc_chot, gl.chot_danh_gia_lap) IS NOT NULL
      AND lap.thoi_gian_hoan_thanh >= ? AND lap.thoi_gian_hoan_thanh < ?${scopeClauseLap.sql}${khuVucClauseLap.sql}
    GROUP BY loai ORDER BY so_ca DESC`;

  const topTinhQuery = `${CA_LAP_CTE}
    SELECT lap.tinh as nhom, COUNT(*) as so_ca
    FROM lap
    WHERE lap.gap_days <= ${NGUONG_NGAY_LAP} AND lap.tinh IS NOT NULL AND lap.thoi_gian_hoan_thanh >= ? AND lap.thoi_gian_hoan_thanh < ?${scopeClauseLap.sql}${khuVucClauseLap.sql}
    GROUP BY lap.tinh ORDER BY so_ca DESC LIMIT 8`;

  const rasoatBinds = [start, end, ...scopeClause.binds, ...khuVucClause.binds];
  const lapBinds = [start, end, ...scopeClauseLap.binds, ...khuVucClauseLap.binds];

  const [raSoatRow, validRow, lapKpiRow, khuVucRes, ktvRes, trendRes, trangThaiRes, topKtvRes, loaiChotRes, topTinhRes] = await Promise.all([
    c.env.DB.prepare(raSoatQuery).bind(...rasoatBinds).first<{ n: number }>(),
    c.env.DB.prepare(validQuery).bind(...rasoatBinds).first<{ n: number }>(),
    c.env.DB.prepare(lapKpiQuery).bind(...lapBinds).first<Record<string, number>>(),
    c.env.DB.prepare(khuVucQuery).bind(...rasoatBinds, ...rasoatBinds, ...lapBinds).all(),
    c.env.DB.prepare(ktvQuery).bind(...rasoatBinds, ...lapBinds).all(),
    c.env.DB.prepare(trendQuery).bind(...lapBinds).all(),
    c.env.DB.prepare(trangThaiQuery).bind(...lapBinds).all(),
    c.env.DB.prepare(topKtvQuery).bind(...lapBinds).all(),
    c.env.DB.prepare(loaiChotQuery).bind(...lapBinds).all(),
    c.env.DB.prepare(topTinhQuery).bind(...lapBinds).all(),
  ]);

  const tongCanRaSoat = raSoatRow?.n ?? 0;
  const tongSerialChuan = validRow?.n ?? 0;
  const tongLap = lapKpiRow?.tong_lap ?? 0;
  const daGiaiTrinh = lapKpiRow?.da_giai_trinh ?? 0;
  const gsChua = lapKpiRow?.gs_chua ?? 0;
  const qcChua = lapKpiRow?.qc_chua ?? 0;
  const loiLapDaChot = lapKpiRow?.loi_lap_da_chot ?? 0;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

  return c.json({
    thang,
    kpi: {
      tongCanRaSoat,
      tongSerialChuan,
      // "Serial sai" = rong + do dai <=4 + dang bi blacklist (bat_tat=1) - phan bu chinh xac cua
      // tongSerialChuan trong cung tap "can ra soat", dung lai 2 con so da tinh o tren thay vi
      // viet them 1 truy van rieng.
      tySerialSai: pct(tongCanRaSoat - tongSerialChuan, tongCanRaSoat),
      tongLap,
      serialLapCount: lapKpiRow?.serial_lap ?? 0,
      quaHanLap: lapKpiRow?.qua_han_lap ?? 0,
      daGiaiTrinh,
      chuaGiaiTrinh: tongLap - daGiaiTrinh,
      ktvLienQuan: lapKpiRow?.ktv_lien_quan ?? 0,
      loiLapDaChot,
      tyLeLoiLap: pct(loiLapDaChot, tongCanRaSoat),
      gsRate: pct(tongLap - gsChua, tongLap),
      qcRate: pct(tongLap - qcChua, tongLap),
    },
    khuVuc: khuVucRes.results,
    ktvTable: ktvRes.results,
    charts: {
      trend: trendRes.results,
      trangThai: trangThaiRes.results,
      topKtv: topKtvRes.results,
      loaiChot: loaiChotRes.results,
      topTinh: topTinhRes.results,
    },
  });
});

/**
 * Dung boi GET /api/cases/:id (cases.ts) de gan them thong tin phat hien lap vao Chi tiet ca -
 * scope thang WHERE c.seri_san_pham = ? (1 partition, re) nen van dung dung CTE tren, chi khac dau
 * vao rat nho so voi quet toan bang.
 */
export async function getCaLapDetection(db: D1Database, caseId: string) {
  const caseRow = await db.prepare("SELECT seri_san_pham FROM case_dvbh WHERE id = ?").bind(caseId).first<{ seri_san_pham: string | null }>();
  const seri = caseRow?.seri_san_pham;
  if (!seri) return { detection: null, giaiTrinhLap: null, lichSu: [], serialBlacklisted: false };

  const [detectionRow, giaiTrinhLapRow, lichSu, blacklistRow] = await Promise.all([
    db
      .prepare(`${CA_LAP_CTE} SELECT lap.id, lap.gap_days, lap.prior_id, lap.prior_ht FROM lap WHERE lap.id = ?`)
      .bind(caseId)
      .first<{ id: string; gap_days: number; prior_id: string; prior_ht: string }>(),
    db.prepare("SELECT * FROM giai_trinh_lap WHERE case_id = ?").bind(caseId).first(),
    db
      .prepare(
        "SELECT id, thoi_gian_hoan_thanh, ky_thuat_vien, tien_do_hoan_thanh, link_crm FROM case_dvbh WHERE seri_san_pham = ? ORDER BY thoi_gian_hoan_thanh DESC",
      )
      .bind(seri)
      .all(),
    // Dung de CaseDetail hien badge "da blacklist" thay vi nut them (tranh nham lan/them trung) -
    // xem eligibleClause() o tren, dinh nghia serial "sai" trong /tong-quan cung dua vao dieu kien nay.
    db.prepare("SELECT 1 FROM blacklist_serial WHERE seri_san_pham = UPPER(TRIM(?)) AND bat_tat = 1").bind(seri).first(),
  ]);

  return {
    detection: detectionRow ? { gapDays: detectionRow.gap_days, priorId: detectionRow.prior_id, priorHt: detectionRow.prior_ht } : null,
    giaiTrinhLap: giaiTrinhLapRow ?? null,
    lichSu: lichSu.results,
    serialBlacklisted: !!blacklistRow,
  };
}

// POST /api/ca-lap/:caseId/gs - Giam sat "Chot lap": ghi nhan Chot danh gia lap (cap 1) CUNG LUC
// voi Hinh thuc xu ly (chot_hinh_thuc_xu_ly optional - frontend luon gui kem vi da gop UI thanh
// 1 nut duy nhat "Chot lap", khong con endpoint /hinh-thuc rieng nua).
caLap.post("/:caseId/gs", requireRole("Giam sat", "Admin"), async (c) => {
  const caseId = c.req.param("caseId");
  const body = await c.req.json<{ chot_danh_gia_lap: string; dien_giai_lap?: string; chot_hinh_thuc_xu_ly?: string }>();
  if (!CA_LAP_LOAI_KEYS.includes(body.chot_danh_gia_lap as (typeof CA_LAP_LOAI_KEYS)[number])) {
    return c.json({ error: "INVALID_CHOT_DANH_GIA_LAP" }, 400);
  }
  if (body.chot_hinh_thuc_xu_ly !== undefined && !HINH_THUC_XU_LY_KEYS.includes(body.chot_hinh_thuc_xu_ly as (typeof HINH_THUC_XU_LY_KEYS)[number])) {
    return c.json({ error: "INVALID_HINH_THUC_XU_LY" }, 400);
  }
  const user = c.get("user");
  const id = await nextSequentialId(c.env.DB, "giai_trinh_lap", "CL", 6);
  const row = await c.env.DB.prepare(
    `INSERT INTO giai_trinh_lap (id, case_id, chot_danh_gia_lap, dien_giai_lap, chot_hinh_thuc_xu_ly, nguoi_giai_trinh, ngay_giai_trinh)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(case_id) DO UPDATE SET
       chot_danh_gia_lap = excluded.chot_danh_gia_lap,
       dien_giai_lap = excluded.dien_giai_lap,
       chot_hinh_thuc_xu_ly = COALESCE(excluded.chot_hinh_thuc_xu_ly, giai_trinh_lap.chot_hinh_thuc_xu_ly),
       nguoi_giai_trinh = excluded.nguoi_giai_trinh,
       ngay_giai_trinh = excluded.ngay_giai_trinh
     RETURNING *`,
  )
    .bind(id, caseId, body.chot_danh_gia_lap, body.dien_giai_lap ?? null, body.chot_hinh_thuc_xu_ly ?? null, user.email)
    .first();
  return c.json(row);
});

// POST /api/ca-lap/:caseId/qc - QC chot cap 2. Dung y het ban goc Radar Lap (Code.gs saveGiaiTrinhQC):
// QC va Giam sat la 2 nguoi danh gia DOC LAP, KHONG bat buoc phai co "Chot danh gia lap" cua Giam
// sat truoc - QC co the tu tao moi dong giai_trinh_lap tu dau (upsert giong het pattern /gs, /hinh-thuc).
caLap.post("/:caseId/qc", requireRole("QC", "Admin"), async (c) => {
  const caseId = c.req.param("caseId");
  const body = await c.req.json<{ qc_chot: string; qc_ghi_chu?: string }>();
  if (!CA_LAP_LOAI_KEYS.includes(body.qc_chot as (typeof CA_LAP_LOAI_KEYS)[number])) {
    return c.json({ error: "INVALID_QC_CHOT" }, 400);
  }
  const user = c.get("user");
  const id = await nextSequentialId(c.env.DB, "giai_trinh_lap", "CL", 6);
  const row = await c.env.DB.prepare(
    `INSERT INTO giai_trinh_lap (id, case_id, qc_chot, qc_ghi_chu, nguoi_qc, ngay_qc)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(case_id) DO UPDATE SET
       qc_chot = excluded.qc_chot,
       qc_ghi_chu = excluded.qc_ghi_chu,
       nguoi_qc = excluded.nguoi_qc,
       ngay_qc = excluded.ngay_qc
     RETURNING *`,
  )
    .bind(id, caseId, body.qc_chot, body.qc_ghi_chu ?? null, user.email)
    .first();
  return c.json(row);
});

// ---------- Blacklist serial ----------

// GET /api/ca-lap/blacklist - mo cho moi user da duyet (kiem tra trang thai tren nut them nhanh o CaseDetail)
caLap.get("/blacklist", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM blacklist_serial ORDER BY ngay_them DESC").all();
  return c.json({ rows: results });
});

caLap.post("/blacklist", requireRole("Giam sat", "QC", "Admin"), async (c) => {
  const body = await c.req.json<{ seri_san_pham: string }>();
  const seri = String(body.seri_san_pham ?? "").trim().toUpperCase();
  if (!seri) return c.json({ error: "MISSING_SERI" }, 400);

  const user = c.get("user");
  const row = await c.env.DB.prepare(
    `INSERT INTO blacklist_serial (seri_san_pham, nguoi_them) VALUES (?, ?)
     ON CONFLICT(seri_san_pham) DO UPDATE SET bat_tat = 1
     RETURNING *`,
  )
    .bind(seri, user.email)
    .first();
  // Blacklist la 1 dieu kien loc NGAY TRONG WHERE cua precompute (xem caLapRefresh.ts) - serial vua
  // bi tat/bat se doi ca danh sach "ca lap" that su (khong chi 1 truong trang thai), nen phai tinh
  // lai ngay giong luc import, khong the doi den cron an toan hang gio. LUON FULL recompute (KHONG
  // truyen serial de incremental): blacklist luu serial da CHUAN HOA (trim + toUpperCase) trong khi
  // case_dvbh.seri_san_pham la gia tri THO - so khop IN (...) theo gia tri tho se BO SOT cac case co
  // serial viet thuong/thua khoang trang (dieu kien NOT EXISTS trong CTE so sanh qua UPPER(TRIM(...)),
  // khong the liet ke het bien the tho trong mot menh de IN). Thao tac blacklist hiem nen chi phi
  // full recompute chap nhan duoc.
  c.executionCtx.waitUntil(refreshCaLapPrecompute(c.env.DB));
  return c.json(row, 201);
});

caLap.patch("/blacklist/:id", requireRole("Giam sat", "QC", "Admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ bat_tat: boolean }>();
  await c.env.DB.prepare("UPDATE blacklist_serial SET bat_tat = ? WHERE id = ?")
    .bind(body.bat_tat ? 1 : 0, id)
    .run();
  // Full recompute - khong incremental duoc voi serial blacklist da chuan hoa, xem POST /blacklist tren.
  c.executionCtx.waitUntil(refreshCaLapPrecompute(c.env.DB));
  return c.json({ ok: true });
});

// DELETE /api/ca-lap/blacklist/:id - xoa han 1 dong khoi bang (khac voi PATCH bat_tat=0 chi tam
// tat: dung khi them nham hoac khong can giu lai lich su serial nay nua).
caLap.delete("/blacklist/:id", requireRole("Giam sat", "QC", "Admin"), async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM blacklist_serial WHERE id = ?").bind(id).run();
  // Full recompute - khong incremental duoc voi serial blacklist da chuan hoa, xem POST /blacklist tren.
  c.executionCtx.waitUntil(refreshCaLapPrecompute(c.env.DB));
  return c.json({ ok: true });
});

// ---------- Import hang loat blacklist serial (tai dung component ImportUploader dung chung) ----------

const BLACKLIST_TEMPLATE_CSV = "seri_san_pham\nSN00012345\n";

// GET /api/ca-lap/blacklist/template
caLap.get("/blacklist/template", (c) =>
  c.body(BLACKLIST_TEMPLATE_CSV, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": "attachment; filename=mau_import_blacklist_serial.csv",
  }),
);

interface BlacklistImportRow {
  seri_san_pham?: string | number;
}

async function processBlacklistRows(db: D1Database, rows: BlacklistImportRow[], nguoiThem: string, commit: boolean) {
  const summary = { thanhCong: 0, boQua: 0, errors: [] as string[] };
  const serials: string[] = [];

  // Chuan hoa + loc trung ngay trong file (Map giu dong CUOI cung neu 1 serial xuat hien nhieu lan,
  // khop hanh vi "ghi de" cua ON CONFLICT DO UPDATE khi commit that).
  const bySeri = new Map<string, number>(); // seri chuan hoa -> so thu tu dong (1-based) de bao loi ro rang
  rows.forEach((row, i) => {
    const seri = String(row.seri_san_pham ?? "").trim().toUpperCase();
    if (!seri) {
      summary.boQua++;
      summary.errors.push(`Dong ${i + 1}: bo trong, da bo qua`);
      return;
    }
    bySeri.set(seri, i + 1);
  });

  summary.thanhCong = bySeri.size;
  serials.push(...bySeri.keys());

  if (commit && bySeri.size > 0) {
    const statements = serials.map((seri) =>
      db
        .prepare(`INSERT INTO blacklist_serial (seri_san_pham, nguoi_them) VALUES (?, ?)
                  ON CONFLICT(seri_san_pham) DO UPDATE SET bat_tat = 1`)
        .bind(seri, nguoiThem),
    );
    await runBatched(db, statements);
  }

  return { summary, serials };
}

// POST /api/ca-lap/blacklist/preview
caLap.post("/blacklist/preview", requireRole("Giam sat", "QC", "Admin"), async (c) => {
  const body = await c.req.json<{ rows: BlacklistImportRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const user = c.get("user");
  const { summary } = await processBlacklistRows(c.env.DB, body.rows, user.email, false);
  return c.json(summary);
});

// POST /api/ca-lap/blacklist/commit
caLap.post("/blacklist/commit", requireRole("Giam sat", "QC", "Admin"), async (c) => {
  const body = await c.req.json<{ rows: BlacklistImportRow[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);
  const user = c.get("user");
  const { summary } = await processBlacklistRows(c.env.DB, body.rows, user.email, true);
  // Full recompute - khong incremental duoc voi serial blacklist da chuan hoa, xem POST /blacklist tren.
  if (summary.thanhCong > 0) c.executionCtx.waitUntil(refreshCaLapPrecompute(c.env.DB));
  return c.json(summary);
});

export default caLap;
