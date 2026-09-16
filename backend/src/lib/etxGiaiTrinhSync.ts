import type { Env } from "../types";
import { CHUNK_SIZE_BATCH, findExistingCaseIds, loadActiveLyDoNames } from "./backfillImportProcessor";
import { bumpVersions } from "./dataVersions";

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
// Gioi han do dai loi gop tu nhieu doi tac (chi mang tinh tra cuu, tranh 1 dot chay loi tram toan bo
// doi tac lam cot error phinh qua kho doc/luu).
const MAX_ERROR_LEN = 2000;

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

/** Kiem tra da co 1 lan chay thanh cong trong ngay hom nay chua - dung cho 2 dot cron retry sau
 * (17h20/17h25) tu bo qua neu dot truoc da chay xong, khong goi lai API ETX. */
export async function hasSucceededToday(db: D1Database): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 FROM etx_giai_trinh_sync_log WHERE ok = 1 AND substr(created_at, 1, 10) = ? LIMIT 1`)
    .bind(vnDateStr())
    .first();
  return row != null;
}

async function writeSummaryLog(
  db: D1Database,
  params: { ok: boolean; soCaseCapNhat: number; soLichSuMoi: number; soLichSuTrung: number; error: string | null },
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO etx_giai_trinh_sync_log (ok, so_case_cap_nhat, so_lich_su_moi, so_lich_su_trung, error)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(params.ok ? 1 : 0, params.soCaseCapNhat, params.soLichSuMoi, params.soLichSuTrung, params.error)
      .run();
  } catch (err) {
    console.error("[etxGiaiTrinhSync] ghi etx_giai_trinh_sync_log that bai:", err);
  }
}

async function cleanupOldLogs(db: D1Database): Promise<void> {
  await db.prepare(`DELETE FROM etx_giai_trinh_sync_log WHERE created_at < datetime('now', '+7 hours', '-30 days')`).run();
}

export type EtxSyncResult =
  | { ok: true; soCaseCapNhat: number; soLichSuMoi: number; soLichSuTrung: number }
  | { ok: false; reason: "MISSING_API_KEY" }
  | { ok: false; reason: "DOI_TAC_LIST_FAILED"; message: string };

/** Dong bo 1 luot: lay danh sach doi tac, keo nhat ky tung doi tac (bo qua so_dong=0), ghi vao
 * giai_trinh cho dong nao id_truy_xuat khop case_dvbh.id. Ghi DUY NHAT 1 dong log tong ket cho ca
 * luot chay (chot voi chu he thong 2026-09-14 - truoc do 1 dong/doi tac qua chi tiet, kho doc).
 * Goi tu cron (index.ts) hoac route thu cong (Admin, settings.ts POST
 * /etx-giai-trinh-sync-log/chay-ngay). */
export async function syncGiaiTrinhTonB2B(env: Env): Promise<EtxSyncResult> {
  const db = env.DB;
  const apiKey = env.ETX_GIAI_TRINH_API_KEY;
  if (!apiKey) return { ok: false, reason: "MISSING_API_KEY" };

  const tu = vnDateStr(-LOOKBACK_DAYS + 1);
  const den = vnDateStr();

  const doiTacRes = await fetchDoiTacList(apiKey);
  if (!doiTacRes.ok) {
    await writeSummaryLog(db, {
      ok: false,
      soCaseCapNhat: 0,
      soLichSuMoi: 0,
      soLichSuTrung: 0,
      error: `Lay danh sach doi tac that bai: ${doiTacRes.error}`,
    });
    await cleanupOldLogs(db);
    return { ok: false, reason: "DOI_TAC_LIST_FAILED", message: doiTacRes.error };
  }

  const activeLyDo = await loadActiveLyDoNames(db);
  const caseIdsCapNhat = new Set<string>();
  let soLichSuMoi = 0;
  let soLichSuTrung = 0;
  const loiTungDoiTac: string[] = [];

  for (const doiTac of doiTacRes.data.doi_tac) {
    if (!doiTac.so_dong) continue; // doi tac chua co dong nao - bo qua, tiet kiem 1 luot goi API

    const dongRes = await fetchAllDongForDoiTac(apiKey, doiTac.ma, tu, den);
    if (!dongRes.ok) {
      loiTungDoiTac.push(`${doiTac.ma}: ${dongRes.error}`);
      continue; // 1 doi tac loi khong chan cac doi tac con lai
    }
    if (dongRes.dong.length === 0) continue;

    const caseIds = dongRes.dong.map((d) => d.id_truy_xuat).filter(Boolean);
    const existingCaseIds = await findExistingCaseIds(db, caseIds);

    const entries = dongRes.dong
      .filter((d) => d.id_truy_xuat && existingCaseIds.has(d.id_truy_xuat))
      .map((d) => {
        const lyDoGoc = d.ly_do?.trim() || "";
        const lyDoCham = lyDoGoc && activeLyDo.has(lyDoGoc) ? lyDoGoc : ETX_FALLBACK_LY_DO;
        const ghiChu = d.ghi_chu?.trim();
        const noiDungParts = [`[ETX tự động] ${lyDoGoc || "(không rõ lý do)"}`];
        if (ghiChu) noiDungParts.push(ghiChu);

        // Dung chuoi rong '' (khong phai NULL that) cho 3 cot optional nay - UNIQUE constraint cua
        // SQLite coi 2 gia tri NULL la "khac nhau moi lan" (xem canh bao ngay trong migration 0022),
        // nen neu de NULL, ON CONFLICT DO NOTHING se khong bao gio bat duoc trung khi dong bo lai
        // cung 1 dong ETX (nam trong cua so LOOKBACK_DAYS=3 ngay) - da xac nhan gay 164/358 dong
        // trung lap that tren production truoc khi sua (2026-09-16).
        const stmt = db
          .prepare(
            `INSERT INTO giai_trinh (id, case_id, ly_do_cham, noi_dung, linh_kien_thieu, ngay_du_kien_hoan_thanh,
               ngay_yeu_cau_co_hang, ma_xuat_hang_lien_quan, nguoi_giai_trinh, ngay_giai_trinh)
             VALUES (?, ?, ?, ?, '', ?, '', ?, ?, ?)
             ON CONFLICT(case_id, ly_do_cham, nguoi_giai_trinh, ngay_giai_trinh, noi_dung, linh_kien_thieu,
               ngay_du_kien_hoan_thanh, ngay_yeu_cau_co_hang, ma_xuat_hang_lien_quan) DO NOTHING`,
          )
          .bind(
            crypto.randomUUID(),
            d.id_truy_xuat,
            lyDoCham,
            noiDungParts.join(" - "),
            d.du_kien_xong || "",
            d.id_dat_linh_kien || "",
            ETX_ACTOR_EMAIL,
            toVnLocalTimestamp(d.thoi_diem),
          );
        return { stmt, caseId: d.id_truy_xuat };
      });

    // Chay tung batch va doc meta.changes cua TUNG statement de biet dong nao THAT SU insert duoc
    // (changes=1) hay bi ON CONFLICT DO NOTHING bo qua vi da ton tai san (changes=0) - day la cach
    // duy nhat phan biet "moi" voi "trung" khi dung 1 cau INSERT ... ON CONFLICT DO NOTHING chung.
    for (let i = 0; i < entries.length; i += CHUNK_SIZE_BATCH) {
      const chunk = entries.slice(i, i + CHUNK_SIZE_BATCH);
      if (chunk.length === 0) continue;
      const results = await db.batch(chunk.map((e) => e.stmt));
      results.forEach((r, idx) => {
        if ((r.meta?.changes ?? 0) > 0) {
          soLichSuMoi++;
          caseIdsCapNhat.add(chunk[idx].caseId);
        } else {
          soLichSuTrung++;
        }
      });
    }
  }

  if (soLichSuMoi > 0) await bumpVersions(db, ["giai_trinh"]);

  const ok = loiTungDoiTac.length === 0;
  await writeSummaryLog(db, {
    ok,
    soCaseCapNhat: caseIdsCapNhat.size,
    soLichSuMoi,
    soLichSuTrung,
    error: ok ? null : loiTungDoiTac.join("; ").slice(0, MAX_ERROR_LEN),
  });
  await cleanupOldLogs(db);

  return { ok: true, soCaseCapNhat: caseIdsCapNhat.size, soLichSuMoi, soLichSuTrung };
}
