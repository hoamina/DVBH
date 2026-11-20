/**
 * Bao cao "Tuoi ton trung binh" (Quan ly ton) - chot 08:00 sang gio VN moi ngay, xem migration 0101.
 * Cach tinh (chot voi chu he thong 2026-08-28): tong tuoi ton cua TOAN BO ca dang ton TAI THOI DIEM
 * 08:00 / tong so ca do, theo tung dimension (khu_vuc/tinh/hang/doi_tac/nhom_kh/ky_thuat_vien).
 * "Dang ton tai 08:00" dung DUNG dinh nghia caseFilterTonAt0800() (needGiaiTrinh.ts) da co san cho
 * "Bao cao ngay 08:00" khac trong he thong - ca dang mo NGAY BAY GIO HOAC da hoan thanh nhung SAU
 * moc 08:00 hom do van duoc tinh. Tuoi ton cung tinh TOI DUNG moc 08:00 (khong phai 00:00 nhu
 * AGE_EXPR chuan o noi khac) de nhat quan voi khai niem "chot luc 08:00" cua bao cao nay.
 *
 * Luu 1 dong tong hop san (tong_tuoi, so_ca) cho tung (ngay, dim, gia_tri) - KHONG luu tung ca rieng
 * le, de client tinh trung binh = tong_tuoi/so_ca va gop nhieu ngay lai khi tinh "trung binh luy ke
 * theo thang" ma khong can goi lai server (xem routes/backlogAgeReport.ts).
 */
import { ageExprAtAnchor } from "./ageCalc";
import { caseFilterTonAt0800, TON_ANCHOR_0800 } from "./needGiaiTrinh";
import { getVnDateStr } from "./reportCache";
import { bocPhamVi, dbGoc, phamViTheoNuoc } from "./phamVi";
import { dsQuocGiaKichHoat } from "./quocGia";

/** Dim "nganh_hang" (2026-11-20, bao cao dung han tuan/thang theo nganh): so ca TON luc 08:00 theo cap (Ngành, HÃNG viet hoa) -
 * gia_tri = nganh + "\u001f" + UPPER(TRIM(hang)) (rong = ""). Chi dung so_ca (tong_tuoi van ghi cho day du). Man Tuoi ton TB loc
 * theo dim nen bo qua dim nay. */
export const DIM_NGANH_HANG = "nganh_hang";
export const giaTriNganhHang = (nganh: string | null | undefined, hang: string | null | undefined) =>
  `${(nganh ?? "").trim()}\u001f${(hang ?? "").trim().toUpperCase()}`;

const AGE_0800_EXPR = ageExprAtAnchor(TON_ANCHOR_0800, "c.thoi_gian_cskh_tiep_nhan");
const TON_FILTER_C = caseFilterTonAt0800("c");

// Dung cot goc tren case_dvbh, KHONG dung lai REPORT_DIMS (filterParams.ts) vi danh sach dim o day
// khac (co ky_thuat_vien, khong co nganh/nhom_san_pham) - whitelist rieng cho dung nhu chu he thong
// yeu cau ("Khu vuc, Nhom KH, KTV, Hang, Tinh, Doi tac").
export const BACKLOG_AGE_DIMS = ["khu_vuc", "tinh", "hang", "doi_tac", "nhom_kh", "ky_thuat_vien"] as const;
export type BacklogAgeDim = (typeof BACKLOG_AGE_DIMS)[number];

export interface BacklogAgeRow {
  ngay: string;
  dim: string;
  gia_tri: string;
  tong_tuoi: number;
  so_ca: number;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Tinh + ghi de snapshot cua "hom nay" (gio VN) - idempotent, goi lai nhieu lan trong cung 1 ngay
 * (cron chot hoac nut "Lam moi bao cao") se ghi de dung ket qua moi nhat, khong cong don.
 * SUA 2026-11-09: truoc day 8 cau INSERT...SELECT (moi cau quet toan bang ~75k dong, ~1,5s) trong 1 batch -> tu 04/11 loi
 * moi lan chot (bang trong tu 04/11) lam dau "chot xong" khong bao gio duoc ghi va chot bu moi gio ghi de so chot. Gio: 1 cau
 * doc tap ca ton (~1.700 dong) roi gop theo tung dim trong bo nho, ghi gop (cung ket qua voi cac cau GROUP BY cu). */
export async function generateBacklogAgeSnapshot(db: D1Database): Promise<void> {
  const ngay = getVnDateStr();
  const { results } = await db
    .prepare(
      `SELECT ${AGE_0800_EXPR} AS tuoi, c.khu_vuc, c.tinh, c.tinh_moi, c.hang, c.doi_tac, c.nhom_kh, c.ky_thuat_vien, c.nganh
       FROM case_hieu_luc c WHERE ${TON_FILTER_C} AND c.archived_at IS NULL AND c.huy_bo_at IS NULL`,
    )
    .all<{ tuoi: number | null } & Record<string, string | null>>();

  // key "dim\u0000gia_tri" -> [tong_tuoi, so_ca]. Tuoi NULL (thoi_gian_cskh_tiep_nhan sai dinh dang) tinh 0: cot tong_tuoi NOT NULL -
  // ban cu SUM() ra NULL cho nhom chi co ca loi -> ca batch hong (dong rac id "ID" = dong tieu de Excel nhap 04/11 lam hong tu do).
  const gop = new Map<string, [number, number]>();
  const cong = (dim: string, giaTri: string, tuoi: number | null) => {
    const k = `${dim}\u0000${giaTri}`;
    const cu = gop.get(k) ?? [0, 0];
    gop.set(k, [cu[0] + (tuoi ?? 0), cu[1] + 1]);
  };
  let tongTuoi = 0;
  for (const r of results) {
    const tuoi = r.tuoi === null || r.tuoi === undefined ? null : Number(r.tuoi);
    tongTuoi += tuoi ?? 0;
    if ((r.khu_vuc ?? "").toLowerCase().includes("qldvbh")) cong("khu_vuc", "__nhom_qldvbh__", tuoi);
    cong(DIM_NGANH_HANG, giaTriNganhHang(r.nganh, r.hang), tuoi);
    for (const dim of BACKLOG_AGE_DIMS) {
      if (dim === "tinh") {
        if ((r.tinh ?? "") !== "" || (r.tinh_moi ?? "") !== "") cong(dim, `${r.tinh ?? ""}\u001f${r.tinh_moi ?? ""}`, tuoi);
      } else {
        const v = r[dim];
        if (v !== null && v !== undefined && v !== "") cong(dim, v, tuoi);
      }
    }
  }
  const dong: [string, string, number, number][] = [["tong", "tat_ca", tongTuoi, results.length]];
  for (const [k, [t, n]] of gop) {
    const i = k.indexOf("\u0000");
    dong.push([k.slice(0, i), k.slice(i + 1), t, n]);
  }

  // DELETE + INSERT nhieu dong / cau (5 bind/dong, D1 toi da 100 bind/cau) trong 1 batch (1 giao dich).
  const statements = [db.prepare("DELETE FROM backlog_age_daily WHERE ngay = ?").bind(ngay)];
  for (let i = 0; i < dong.length; i += 20) {
    const lo = dong.slice(i, i + 20);
    statements.push(
      db
        .prepare(`INSERT INTO backlog_age_daily (ngay, dim, gia_tri, tong_tuoi, so_ca) VALUES ${lo.map(() => "(?, ?, ?, ?, ?)").join(", ")}`)
        .bind(...lo.flatMap((d) => [ngay, ...d])),
    );
  }
  await db.batch(statements);

  await updateMonthManifest(db, ngay.slice(0, 7));
}

/**
 * Ghi BU dim "nganh_hang" cho cac ngay [tuNgay, denNgay] (YYYY-MM-DD, gio VN) - chu he thong 2026-11-20: "thang 11 tinh lai tu dau
 * thang (so tam tinh dua vao thoi gian tiep nhan va thoi gian dong ca) => day vao so chot". Ca ton luc 08:00 ngay D = tiep nhan
 * truoc D 08:00 va (chua dong HOAC dong tu D 08:00), bo ca huy. 1 lan doc cho ca khoang (ca dang mo + ca dong tu ngay dau, 2 index)
 * roi dem tung ngay trong bo nho. Chi xoa / ghi dong dim "nganh_hang" cua cac ngay do (khong dung dim khac). Chay cho 1 DB (da boc
 * pham vi hoac goc).
 */
export async function buTonNganhHang(db: D1Database, tuNgay: string, denNgay: string): Promise<number> {
  const moc = (d: string) => `${d} 08:00:00`;
  const { results } = await db
    .prepare(
      `SELECT c.nganh, c.hang, c.thoi_gian_cskh_tiep_nhan AS tn, c.thoi_gian_hoan_thanh AS ht
       FROM case_dvbh c INDEXED BY idx_case_ton WHERE c.thoi_gian_hoan_thanh IS NULL AND c.huy_bo_at IS NULL AND c.archived_at IS NULL
       UNION ALL
       SELECT c.nganh, c.hang, c.thoi_gian_cskh_tiep_nhan AS tn, c.thoi_gian_hoan_thanh AS ht
       FROM case_dvbh c INDEXED BY idx_case_hoan_thanh_not_null WHERE c.thoi_gian_hoan_thanh >= ? AND c.huy_bo_at IS NULL`,
    )
    .bind(moc(tuNgay))
    .all<{ nganh: string | null; hang: string | null; tn: string | null; ht: string | null }>();
  const ngays: string[] = [];
  for (let t = Date.parse(`${tuNgay}T00:00:00Z`); t <= Date.parse(`${denNgay}T00:00:00Z`); t += 86400000) ngays.push(new Date(t).toISOString().slice(0, 10));
  const statements: D1PreparedStatement[] = [];
  for (const ngay of ngays) {
    const m = moc(ngay);
    const dem = new Map<string, number>();
    for (const r of results) {
      if (!r.tn || r.tn >= m || (r.ht !== null && r.ht < m)) continue;
      const k = giaTriNganhHang(r.nganh, r.hang);
      dem.set(k, (dem.get(k) ?? 0) + 1);
    }
    statements.push(db.prepare("DELETE FROM backlog_age_daily WHERE ngay = ? AND dim = ?").bind(ngay, DIM_NGANH_HANG));
    const dong = [...dem];
    for (let i = 0; i < dong.length; i += 20) {
      const lo = dong.slice(i, i + 20);
      statements.push(
        db
          .prepare(`INSERT INTO backlog_age_daily (ngay, dim, gia_tri, tong_tuoi, so_ca) VALUES ${lo.map(() => "(?, ?, ?, 0, ?)").join(", ")}`)
          .bind(...lo.flatMap(([k, n]) => [ngay, DIM_NGANH_HANG, k, n])),
      );
    }
  }
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
  for (const thang of new Set(ngays.map((d) => d.slice(0, 7)))) await updateMonthManifest(db, thang);
  return results.length;
}

/** Ghi bu "nganh_hang" cho MOI pham vi co so chot rieng (goc + NSKX/Khong NSKX + tung nuoc) - cung danh sach cron chot dung. */
export async function buTonNganhHangMoiPhamVi(db: D1Database, tuNgay: string, denNgay: string): Promise<Record<string, number>> {
  const goc = dbGoc(db);
  const out: Record<string, number> = { goc: await buTonNganhHang(goc, tuNgay, denNgay) };
  for (const s of phamViTheoNuoc(await dsQuocGiaKichHoat(goc))) {
    out[`${s.qg ?? ""}_${s.pv}`] = await buTonNganhHang(bocPhamVi(goc, s), tuNgay, denNgay);
  }
  return out;
}

async function updateMonthManifest(db: D1Database, thang: string): Promise<void> {
  const { results } = await db
    .prepare("SELECT ngay, dim, gia_tri, tong_tuoi, so_ca FROM backlog_age_daily WHERE ngay LIKE ? ORDER BY ngay, dim, gia_tri")
    .bind(`${thang}%`)
    .all<BacklogAgeRow>();
  const hash = await sha256Hex(JSON.stringify(results));
  await db
    .prepare(
      `INSERT INTO backlog_age_month_manifest (thang, hash, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(thang) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at`,
    )
    .bind(thang, hash)
    .run();
}

export async function getBacklogAgeManifest(db: D1Database): Promise<Record<string, string>> {
  const { results } = await db.prepare("SELECT thang, hash FROM backlog_age_month_manifest ORDER BY thang DESC").all<{
    thang: string;
    hash: string;
  }>();
  const map: Record<string, string> = {};
  for (const r of results) map[r.thang] = r.hash;
  return map;
}

export async function getBacklogAgeMonthRows(db: D1Database, thang: string): Promise<BacklogAgeRow[]> {
  const { results } = await db
    .prepare("SELECT ngay, dim, gia_tri, tong_tuoi, so_ca FROM backlog_age_daily WHERE ngay LIKE ? ORDER BY ngay, dim, gia_tri")
    .bind(`${thang}%`)
    .all<BacklogAgeRow>();
  return results;
}
