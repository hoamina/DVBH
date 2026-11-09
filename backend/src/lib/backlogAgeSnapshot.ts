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
 * (cron chot hoac nut "Lam moi bao cao") se ghi de dung ket qua moi nhat, khong cong don.
 * SUA 2026-11-09: truoc day 8 cau INSERT...SELECT (moi cau quet toan bang ~75k dong, ~1,5s) trong 1 batch -> tu 04/11 loi
 * moi lan chot (bang trong tu 04/11) lam dau "chot xong" khong bao gio duoc ghi va chot bu moi gio ghi de so chot. Gio: 1 cau
 * doc tap ca ton (~1.700 dong) roi gop theo tung dim trong bo nho, ghi gop (cung ket qua voi cac cau GROUP BY cu). */
export async function generateBacklogAgeSnapshot(db: D1Database): Promise<void> {
  const ngay = getVnDateStr();
  const { results } = await db
    .prepare(
      `SELECT ${AGE_0800_EXPR} AS tuoi, c.khu_vuc, c.tinh, c.tinh_moi, c.hang, c.doi_tac, c.nhom_kh, c.ky_thuat_vien
       FROM case_hieu_luc c WHERE ${TON_FILTER_C} AND c.archived_at IS NULL AND c.huy_bo_at IS NULL`,
    )
    .all<{ tuoi: number | null } & Record<string, string | null>>();

  // key "dim\u0000gia_tri" -> [tong_tuoi (null = SUM toan NULL), so_ca]
  const gop = new Map<string, [number | null, number]>();
  const cong = (dim: string, giaTri: string, tuoi: number | null) => {
    const k = `${dim}\u0000${giaTri}`;
    const cu = gop.get(k) ?? [null, 0];
    gop.set(k, [tuoi === null ? cu[0] : (cu[0] ?? 0) + tuoi, cu[1] + 1]);
  };
  let tongTuoi = 0;
  for (const r of results) {
    const tuoi = r.tuoi === null || r.tuoi === undefined ? null : Number(r.tuoi);
    tongTuoi += tuoi ?? 0;
    if ((r.khu_vuc ?? "").toLowerCase().includes("qldvbh")) cong("khu_vuc", "__nhom_qldvbh__", tuoi);
    for (const dim of BACKLOG_AGE_DIMS) {
      if (dim === "tinh") {
        if ((r.tinh ?? "") !== "" || (r.tinh_moi ?? "") !== "") cong(dim, `${r.tinh ?? ""}\u001f${r.tinh_moi ?? ""}`, tuoi);
      } else {
        const v = r[dim];
        if (v !== null && v !== undefined && v !== "") cong(dim, v, tuoi);
      }
    }
  }
  const dong: [string, string, number | null, number][] = [["tong", "tat_ca", tongTuoi, results.length]];
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
