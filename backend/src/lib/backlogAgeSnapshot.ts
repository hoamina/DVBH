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
 * (cron 08:00 hoac nut "Lam moi bao cao") se ghi de dung ket qua moi nhat, khong cong don. */
export async function generateBacklogAgeSnapshot(db: D1Database): Promise<void> {
  const ngay = getVnDateStr();
  const baseWhere = `WHERE ${TON_FILTER_C} AND c.archived_at IS NULL AND c.huy_bo_at IS NULL`;

  await db.prepare("DELETE FROM backlog_age_daily WHERE ngay = ?").bind(ngay).run();

  const statements = [
    // Tong toan he thong - dong "Tat ca" dung chung cho moi dimension o client.
    db.prepare(
      `INSERT INTO backlog_age_daily (ngay, dim, gia_tri, tong_tuoi, so_ca)
       SELECT ?, 'tong', 'tat_ca', COALESCE(SUM(${AGE_0800_EXPR}), 0), COUNT(*)
       FROM case_dvbh c ${baseWhere}`,
    ).bind(ngay),
    // Nhom khu vuc QLDVBH - giong dung nhom loc "QLDVBH" da co san o Quan ly ton (khu_vuc LIKE '%qldvbh%').
    db.prepare(
      `INSERT INTO backlog_age_daily (ngay, dim, gia_tri, tong_tuoi, so_ca)
       SELECT ?, 'khu_vuc', '__nhom_qldvbh__', COALESCE(SUM(${AGE_0800_EXPR}), 0), COUNT(*)
       FROM case_dvbh c ${baseWhere} AND c.khu_vuc LIKE '%qldvbh%'
       HAVING COUNT(*) > 0`,
    ).bind(ngay),
    ...BACKLOG_AGE_DIMS.map((dim) =>
      db.prepare(
        `INSERT INTO backlog_age_daily (ngay, dim, gia_tri, tong_tuoi, so_ca)
         SELECT ?, ?, c.${dim}, SUM(${AGE_0800_EXPR}), COUNT(*)
         FROM case_dvbh c ${baseWhere} AND c.${dim} IS NOT NULL AND c.${dim} != ''
         GROUP BY c.${dim}`,
      ).bind(ngay, dim),
    ),
  ];
  await db.batch(statements);

  await updateMonthManifest(db, ngay.slice(0, 7));
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
