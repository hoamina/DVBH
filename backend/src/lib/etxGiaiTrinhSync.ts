import type { Env } from "../types";
import { findExistingCaseIds, loadActiveLyDoNames, runBatched } from "./backfillImportProcessor";
import { bumpVersions } from "./dataVersions";
import { nowVN } from "./vnTime";

// Dong bo "Giai trinh ton B2B" tu API doi tac ETX (xem "API_B2B_giaitrinh v2.md" - khoa PHAM VI
// TOAN BO, doc duoc moi doi tac). Da xac minh bang du lieu san xuat 2026-09-14: id_truy_xuat (API)
// = case_dvbh.id (vd "T23804" khop dung khach "Chi Huyen", KTV "Tran Hoai Nam", doi tac
// "B2B-SANAKY") - nhieu doi tac trong "/v1/doi-tac" (vd A041 Mishio Kachi) KHONG thuoc luong DVBH
// (khong co case_dvbh nao khop) - cac dong do tu bi bo qua boi findExistingCaseIds(), khong loi.
const ETX_API_BASE = "https://api-doitac-b3u3aav3ja-as.a.run.app";
const ETX_ACTOR_EMAIL = "giaitrinh_autolada@gmail.com";
const ETX_FALLBACK_LY_DO = "Đối tác B2B (ETX) tự động";
// Cua so 3 ngay (thay vi chi "hom nay") de tu heal neu ca 3 lan cron (17h15/17h20/17h25) trong 1
// ngay deu that bai - lan chay hom sau se tu vet lai, khong mat du lieu (dedup UNIQUE lo het phan
// da ghi duoc, xem giai_trinh UNIQUE constraint migration 0022).
const LOOKBACK_DAYS = 3;
const SO_DONG_PER_PAGE = 1000;

interface EtxDoiTac {
  ma: string;
  ten: string;
  so_dong: number;
}

interface EtxDong {
  order_id: string;
  id_truy_xuat: string;
  ly_do: string;
  ma_ly_do: string;
  ghi_chu: string;
  thoi_diem: string; // "YYYY-MM-DDTHH:MM:SS+07:00"
  du_kien_xong: string; // "YYYY-MM-DD" hoac rong
  id_dat_linh_kien: string;
}

interface EtxGiaiTrinhTonResponse {
  tong_so_dong: number;
  so_dong: number;
  tiep: string | null;
  dong: EtxDong[];
}

interface EtxErrorBody {
  loi?: { ma?: string; thong_diep?: string };
}

function vnDateStr(offsetDays = 0): string {
  const ms = Date.now() + 7 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

// "2026-08-17T10:16:40+07:00" -> "2026-08-17 10:16:40" (gio VN da co san trong chuoi API, khong
// can quy doi - chi cat bo "T" va offset, dung quy uoc gio-VN-local cua toan he thong, xem vnTime.ts).
// Dong nhap tu bang tinh nam 2025 co the chi co "YYYY-MM-DD" (khong gio) - giu nguyen, dedup vi
// giai_trinh.ngay_giai_trinh van la TEXT tu do, khong bat buoc co gio.
function toVnLocalTimestamp(thoiDiem: string): string {
  return thoiDiem.replace("T", " ").replace(/\+07:00$/, "");
}

async function fetchJson<T>(url: string, apiKey: string): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const res = await fetch(url, { headers: { "X-Api-Key": apiKey } });
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "5");
    await new Promise((r) => setTimeout(r, (Number.isFinite(retryAfter) ? retryAfter : 5) * 1000 + 500));
    return fetchJson<T>(url, apiKey);
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as EtxErrorBody;
      if (body.loi?.thong_diep) message = `${body.loi.ma ?? res.status}: ${body.loi.thong_diep}`;
    } catch {
      // giu message mac dinh
    }
    return { ok: false, status: res.status, error: message };
  }
  return { ok: true, data: (await res.json()) as T };
}

async function fetchDoiTacList(apiKey: string) {
  return fetchJson<{ doi_tac: EtxDoiTac[] }>(`${ETX_API_BASE}/v1/doi-tac`, apiKey);
}

async function fetchAllDongForDoiTac(apiKey: string, maDoiTac: string, tu: string, den: string): Promise<{ ok: true; dong: EtxDong[] } | { ok: false; status: number; error: string }> {
  const dong: EtxDong[] = [];
  let tiep: string | null = null;
  for (;;) {
    const params = new URLSearchParams({ doi_tac: maDoiTac, tu, den, so_dong: String(SO_DONG_PER_PAGE) });
    if (tiep) params.set("tiep", tiep);
    const res = await fetchJson<EtxGiaiTrinhTonResponse>(`${ETX_API_BASE}/v1/giai-trinh-ton?${params}`, apiKey);
    if (!res.ok) {
      // 409 (du lieu vua doi giua 2 trang) - lam lai TU DAU cho dung doi tac nay (bo tiep, reset dong).
      if (res.status === 409) {
        dong.length = 0;
        tiep = null;
        continue;
      }
      return res;
    }
    dong.push(...res.data.dong);
    tiep = res.data.tiep;
    if (!tiep) break;
  }
  return { ok: true, dong };
}

/** Kiem tra da co dong TONG KET (doi_tac_ma IS NULL) voi ok=1 trong ngay hom nay chua - dung cho 2
 * dot cron retry sau (17h20/17h25) tu bo qua neu dot truoc da chay xong, khong goi lai API ETX. */
export async function hasSucceededToday(db: D1Database): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 FROM etx_giai_trinh_sync_log
       WHERE doi_tac_ma IS NULL AND ok = 1 AND substr(created_at, 1, 10) = ?
       LIMIT 1`,
    )
    .bind(vnDateStr())
    .first();
  return row != null;
}

async function logAttempt(db: D1Database, maDoiTac: string | null, ok: boolean, soDongMoi: number | null, httpStatus: number | null, error: string | null): Promise<void> {
  try {
    await db
      .prepare(`INSERT INTO etx_giai_trinh_sync_log (doi_tac_ma, ok, so_dong_moi, http_status, error) VALUES (?, ?, ?, ?, ?)`)
      .bind(maDoiTac, ok ? 1 : 0, soDongMoi, httpStatus, error)
      .run();
  } catch (err) {
    console.error("[etxGiaiTrinhSync] ghi etx_giai_trinh_sync_log that bai:", err);
  }
}

async function cleanupOldLogs(db: D1Database): Promise<void> {
  await db.prepare(`DELETE FROM etx_giai_trinh_sync_log WHERE created_at < datetime('now', '+7 hours', '-30 days')`).run();
}

export type EtxSyncResult = { ok: true; soDongMoi: number } | { ok: false; reason: "MISSING_API_KEY" } | { ok: false; reason: "DOI_TAC_LIST_FAILED"; message: string };

/** Dong bo 1 luot: lay danh sach doi tac, keo nhat ky tung doi tac (bo qua so_dong=0), ghi vao
 * giai_trinh cho dong nao id_truy_xuat khop case_dvbh.id. Goi tu cron (index.ts) hoac route thu
 * cong (Admin, settings.ts POST /etx-giai-trinh-sync-log/chay-ngay). */
export async function syncGiaiTrinhTonB2B(env: Env): Promise<EtxSyncResult> {
  const db = env.DB;
  const apiKey = env.ETX_GIAI_TRINH_API_KEY;
  if (!apiKey) return { ok: false, reason: "MISSING_API_KEY" };

  const tu = vnDateStr(-LOOKBACK_DAYS + 1);
  const den = vnDateStr();

  const doiTacRes = await fetchDoiTacList(apiKey);
  if (!doiTacRes.ok) {
    await logAttempt(db, null, false, null, doiTacRes.status, `Lay danh sach doi tac that bai: ${doiTacRes.error}`);
    await cleanupOldLogs(db);
    return { ok: false, reason: "DOI_TAC_LIST_FAILED", message: doiTacRes.error };
  }

  const activeLyDo = await loadActiveLyDoNames(db);
  let tongSoDongMoi = 0;
  let coLoi = false;

  for (const doiTac of doiTacRes.data.doi_tac) {
    if (!doiTac.so_dong) continue; // doi tac chua co dong nao - bo qua, tiet kiem 1 luot goi API

    const dongRes = await fetchAllDongForDoiTac(apiKey, doiTac.ma, tu, den);
    if (!dongRes.ok) {
      coLoi = true;
      await logAttempt(db, doiTac.ma, false, null, dongRes.status, dongRes.error);
      continue; // 1 doi tac loi khong chan cac doi tac con lai (giong runSheetSync trong index.ts)
    }

    if (dongRes.dong.length === 0) {
      await logAttempt(db, doiTac.ma, true, 0, null, null);
      continue;
    }

    const caseIds = dongRes.dong.map((d) => d.id_truy_xuat).filter(Boolean);
    const existingCaseIds = await findExistingCaseIds(db, caseIds);

    const statements = dongRes.dong
      .filter((d) => d.id_truy_xuat && existingCaseIds.has(d.id_truy_xuat))
      .map((d) => {
        const lyDoGoc = d.ly_do?.trim() || "";
        const lyDoCham = lyDoGoc && activeLyDo.has(lyDoGoc) ? lyDoGoc : ETX_FALLBACK_LY_DO;
        const ghiChu = d.ghi_chu?.trim();
        const noiDungParts = [`[ETX tự động] ${lyDoGoc || "(không rõ lý do)"}`];
        if (ghiChu) noiDungParts.push(ghiChu);

        return db
          .prepare(
            `INSERT INTO giai_trinh (id, case_id, ly_do_cham, noi_dung, linh_kien_thieu, ngay_du_kien_hoan_thanh,
               ngay_yeu_cau_co_hang, ma_xuat_hang_lien_quan, nguoi_giai_trinh, ngay_giai_trinh)
             VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?)
             ON CONFLICT(case_id, ly_do_cham, nguoi_giai_trinh, ngay_giai_trinh, noi_dung, linh_kien_thieu,
               ngay_du_kien_hoan_thanh, ngay_yeu_cau_co_hang, ma_xuat_hang_lien_quan) DO NOTHING`,
          )
          .bind(
            crypto.randomUUID(),
            d.id_truy_xuat,
            lyDoCham,
            noiDungParts.join(" - "),
            d.du_kien_xong || null,
            d.id_dat_linh_kien || null,
            ETX_ACTOR_EMAIL,
            toVnLocalTimestamp(d.thoi_diem),
          );
      });

    if (statements.length > 0) await runBatched(db, statements);
    tongSoDongMoi += statements.length;
    await logAttempt(db, doiTac.ma, true, statements.length, null, null);
  }

  if (tongSoDongMoi > 0) await bumpVersions(db, ["giai_trinh"]);
  await logAttempt(db, null, !coLoi, tongSoDongMoi, null, coLoi ? "Co it nhat 1 doi tac loi - xem chi tiet cac dong cung dot chay" : null);
  await cleanupOldLogs(db);

  return { ok: true, soDongMoi: tongSoDongMoi };
}
