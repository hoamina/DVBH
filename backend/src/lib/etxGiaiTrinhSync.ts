import type { Env } from "../types";
import { CHUNK_SIZE_BATCH, findExistingCaseIds, loadActiveLyDoNames } from "./backfillImportProcessor";
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
  // Thong tin don Lada (dung cho case_lada, migration 0153) - API tra them, co the rong.
  trang_thai_don?: string;
  loai_lead?: string;
  ktv?: string;
  tinh_thanh?: string;
  ten_khach?: string;
  ngay_khoi_tao?: string;
  ngay_hen?: string;
  lan?: number;
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

// CHOT 2026-10-23: API ETX/Lada KHONG co truong ma linh kien rieng - nhan vien Lada go tay ma vao ghi_chu, 2 kieu da
// gap: "[3004030378 - Vi mạch DK-S18]" va "... DK-S86-V1 [3004030209]". Tach chuoi trong ngoac vuong (truoc " - " hoac
// "]"), CHI nhan neu dung la ma co trong danh muc linh_kien (FK giai_trinh.linh_kien_thieu + click xem Hồ sơ linh kiện)
// -> ghi vao cot linh_kien_thieu giong giai trinh nhap tren DVBH (tai ve theo cot "LK thiếu", vao "Ca thiếu linh kiện").
const MA_LK_TRONG_NGOAC = /\[\s*([A-Za-z0-9._]{5,})\s*(?:[-–]|\])/g;

function maLinhKienUngVien(text: string | null | undefined): string[] {
  if (!text) return [];
  return Array.from(text.matchAll(MA_LK_TRONG_NGOAC), (m) => m[1]);
}

/** Ma ung vien nao THAT SU ton tai trong danh muc linh_kien (1 truy van, json_each - khong gioi han 100 tham so). */
async function maLinhKienHopLe(db: D1Database, ungVien: string[]): Promise<Set<string>> {
  const uniq = [...new Set(ungVien)];
  if (!uniq.length) return new Set();
  const { results } = await db
    .prepare("SELECT ma_linh_kien FROM linh_kien WHERE ma_linh_kien IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(uniq))
    .all<{ ma_linh_kien: string }>();
  return new Set(results.map((r) => r.ma_linh_kien));
}

function chonMaLinhKien(text: string | null | undefined, hopLe: Set<string>): string {
  return maLinhKienUngVien(text).find((m) => hopLe.has(m)) ?? "";
}

/** Dien bu linh_kien_thieu cho cac dong ETX da ghi TRUOC khi co tinh nang tach ma (hoac truoc khi ma duoc them vao
 * danh muc). PHAI chay truoc buoc INSERT moi lan dong bo: khoa chong trung (UNIQUE gom ca linh_kien_thieu) chi khop
 * neu dong cu va dong tinh lai co CUNG gia tri - neu khong, cua so LOOKBACK_DAYS se ghi trung 1 dong nua. */
async function dienBuMaLinhKienEtx(db: D1Database): Promise<number> {
  const { results } = await db
    .prepare(
      `SELECT id, noi_dung FROM giai_trinh
       WHERE nguoi_giai_trinh = ? AND COALESCE(linh_kien_thieu, '') = '' AND noi_dung LIKE '%[%'`,
    )
    .bind(ETX_ACTOR_EMAIL)
    .all<{ id: string; noi_dung: string | null }>();
  if (!results.length) return 0;
  const hopLe = await maLinhKienHopLe(db, results.flatMap((r) => maLinhKienUngVien(r.noi_dung)));
  const stmts = results
    .map((r) => ({ id: r.id, ma: chonMaLinhKien(r.noi_dung, hopLe) }))
    .filter((r) => r.ma)
    .map((r) => db.prepare("UPDATE giai_trinh SET linh_kien_thieu = ? WHERE id = ?").bind(r.ma, r.id));
  for (let i = 0; i < stmts.length; i += CHUNK_SIZE_BATCH) await db.batch(stmts.slice(i, i + CHUNK_SIZE_BATCH));
  return stmts.length;
}

// ---------- Lien ket ca <-> ID Lada (case_lada, migration 0153) ----------
// Moi order_id lay dong API MOI NHAT (thoi_diem lon nhat) lam "anh chup" don Lada. Upsert chi ghi khi co cot doi
// (WHERE ... IS NOT ...) va khong de dong cu hon ghi de dong moi hon -> dong bo lai trong cua so LOOKBACK_DAYS khong ghi
// lap: changes = 0, chi ton 1 PK seek/don. Tra ve so don THAT SU them moi/cap nhat (de bump domain "lada").
const LADA_COT = ["case_id", "ma_doi_tac", "ten_doi_tac", "trang_thai_don", "loai_lead", "ktv", "tinh_thanh", "ten_khach", "ngay_khoi_tao", "ngay_hen", "so_lan_giai_trinh", "giai_trinh_cuoi_luc"] as const;
const LADA_UPSERT_SQL = `INSERT INTO case_lada (order_id, ${LADA_COT.join(", ")}, created_at, updated_at)
  VALUES (?, ${LADA_COT.map(() => "?").join(", ")}, ?, ?)
  ON CONFLICT(order_id) DO UPDATE SET ${LADA_COT.map((k) => `${k} = excluded.${k}`).join(", ")}, updated_at = excluded.updated_at
  WHERE excluded.giai_trinh_cuoi_luc >= COALESCE(case_lada.giai_trinh_cuoi_luc, '')
    AND (${LADA_COT.map((k) => `case_lada.${k} IS NOT excluded.${k}`).join(" OR ")})`;

async function ghiLienKetLada(db: D1Database, doiTac: EtxDoiTac, dong: EtxDong[]): Promise<number> {
  const moiNhat = new Map<string, EtxDong>();
  for (const d of dong) {
    if (!d.order_id || !d.id_truy_xuat) continue;
    const cu = moiNhat.get(d.order_id);
    if (!cu || d.thoi_diem > cu.thoi_diem) moiNhat.set(d.order_id, d);
  }
  if (!moiNhat.size) return 0;
  const now = nowVN();
  const txt = (v: string | undefined) => (v ?? "").trim() || null;
  const stmts = [...moiNhat.values()].map((d) =>
    db.prepare(LADA_UPSERT_SQL).bind(
      d.order_id,
      d.id_truy_xuat,
      doiTac.ma,
      txt(doiTac.ten),
      txt(d.trang_thai_don),
      txt(d.loai_lead),
      txt(d.ktv),
      txt(d.tinh_thanh),
      txt(d.ten_khach),
      txt(d.ngay_khoi_tao),
      txt(d.ngay_hen),
      typeof d.lan === "number" ? d.lan : null,
      toVnLocalTimestamp(d.thoi_diem),
      now,
      now,
    ),
  );
  let soDoi = 0;
  for (let i = 0; i < stmts.length; i += CHUNK_SIZE_BATCH) {
    const kq = await db.batch(stmts.slice(i, i + CHUNK_SIZE_BATCH));
    for (const r of kq) if ((r.meta?.changes ?? 0) > 0) soDoi++;
  }
  return soDoi;
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
  | {
      ok: true;
      soCaseCapNhat: number;
      soLichSuMoi: number;
      soLichSuTrung: number;
      // Chay theo DOT (nut "Chay ngay"): done=false -> goi tiep voi tuDoiTac = nextDoiTac (xem EtxSyncOpts).
      done: boolean;
      nextDoiTac: number;
      tongDoiTac: number;
      // So don Lada (case_lada) them moi/cap nhat - tich luy qua cac dot.
      soLienKetLada: number;
      // Loi tung doi tac tich luy (chi khi chua xong - giao dien gui lai qua tich_luy).
      loi?: string[];
    }
  | { ok: false; reason: "MISSING_API_KEY" }
  | { ok: false; reason: "DOI_TAC_LIST_FAILED"; message: string };

/** Dong bo 1 luot: lay danh sach doi tac, keo nhat ky tung doi tac (bo qua so_dong=0), ghi vao
 * giai_trinh cho dong nao id_truy_xuat khop case_dvbh.id. Ghi DUY NHAT 1 dong log tong ket cho ca
 * luot chay (chot voi chu he thong 2026-09-14 - truoc do 1 dong/doi tac qua chi tiet, kho doc).
 * Goi tu cron (index.ts) hoac route thu cong (Admin, settings.ts POST
 * /etx-giai-trinh-sync-log/chay-ngay). */
/** SUA 2026-10-26: 1 luot day du mat 2-3,5 phut (log cron 17:15 ghi luc 17:17-17:18 - goi API ETX tung doi tac, co luc
 * bi 429 bat cho) -> nut "Chay ngay" tren web bi Cloudflare cat o 100s, Worker dung giua chung, KHONG ghi log tong ket.
 * Gio nut chay theo DOT: moi request xu ly doi tac tu chi so "tuDoiTac" toi khi het "hanMs" (~50s) roi tra ve
 * done=false + nextDoiTac, giao dien tu goi tiep; "tichLuy" = tong cac dot truoc (de dot cuoi ghi 1 dong log tong ket
 * dung). Buoc dien bu ma linh kien chi chay o dot dau. Cron goi khong opts = chay 1 luot day du nhu cu. */
export interface EtxSyncOpts {
  tuDoiTac?: number;
  hanMs?: number;
  tichLuy?: { soCaseCapNhat: number; soLichSuMoi: number; soLichSuTrung: number; loi: string[]; soLienKetLada?: number };
  // 2026-11-03: nut "Lấy ID Lada 60 ngày" (Admin) - CHI ghi case_lada cho toan bo 60 ngay (han luu ETX), KHONG ghi
  // giai_trinh, KHONG dien bu ma LK, KHONG ghi etx_giai_trinh_sync_log (dong ok=1 se lam 2 dot cron retry tuong da chay).
  chiLienKetLada?: boolean;
}

export async function syncGiaiTrinhTonB2B(env: Env, opts: EtxSyncOpts = {}): Promise<EtxSyncResult> {
  const batDau = Date.now();
  const tuDoiTac = Math.max(0, opts.tuDoiTac ?? 0);
  const db = env.DB;
  const apiKey = env.ETX_GIAI_TRINH_API_KEY;
  if (!apiKey) return { ok: false, reason: "MISSING_API_KEY" };

  const chiLada = !!opts.chiLienKetLada;
  const tu = chiLada ? vnDateStr(-59) : vnDateStr(-LOOKBACK_DAYS + 1);
  const den = vnDateStr();

  const doiTacRes = await fetchDoiTacList(apiKey);
  if (!doiTacRes.ok) {
    if (chiLada) return { ok: false, reason: "DOI_TAC_LIST_FAILED", message: doiTacRes.error };
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
  const soDongDienBuLk = tuDoiTac === 0 && !chiLada ? await dienBuMaLinhKienEtx(db) : 0;
  const caseIdsCapNhat = new Set<string>();
  let soLichSuMoi = 0;
  let soLichSuTrung = 0;
  let soLienKetLadaDoi = 0;
  const loiTungDoiTac: string[] = [];
  const dsDoiTac = doiTacRes.data.doi_tac;
  let nextDoiTac = dsDoiTac.length;

  for (let iDt = tuDoiTac; iDt < dsDoiTac.length; iDt++) {
    // Het thoi gian cua dot (chi khi chay theo dot) -> dung TRUOC doi tac nay, tra ve de giao dien goi tiep.
    if (opts.hanMs && iDt > tuDoiTac && Date.now() - batDau > opts.hanMs) {
      nextDoiTac = iDt;
      break;
    }
    const doiTac = dsDoiTac[iDt];
    if (!doiTac.so_dong) continue; // doi tac chua co dong nao - bo qua, tiet kiem 1 luot goi API

    const dongRes = await fetchAllDongForDoiTac(apiKey, doiTac.ma, tu, den);
    if (!dongRes.ok) {
      loiTungDoiTac.push(`${doiTac.ma}: ${dongRes.error}`);
      continue; // 1 doi tac loi khong chan cac doi tac con lai
    }
    if (dongRes.dong.length === 0) continue;

    const caseIds = dongRes.dong.map((d) => d.id_truy_xuat).filter(Boolean);
    const existingCaseIds = await findExistingCaseIds(db, caseIds);
    const maLkHopLe = await maLinhKienHopLe(db, dongRes.dong.flatMap((d) => maLinhKienUngVien(d.ghi_chu)));
    soLienKetLadaDoi += await ghiLienKetLada(db, doiTac, dongRes.dong.filter((d) => existingCaseIds.has(d.id_truy_xuat)));
    if (chiLada) continue;

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
             VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?)
             ON CONFLICT(case_id, ly_do_cham, nguoi_giai_trinh, ngay_giai_trinh, noi_dung, linh_kien_thieu,
               ngay_du_kien_hoan_thanh, ngay_yeu_cau_co_hang, ma_xuat_hang_lien_quan) DO NOTHING`,
          )
          .bind(
            crypto.randomUUID(),
            d.id_truy_xuat,
            lyDoCham,
            noiDungParts.join(" - "),
            chonMaLinhKien(ghiChu, maLkHopLe),
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

  const domains: ("giai_trinh" | "lada")[] = [];
  if (soLichSuMoi > 0 || soDongDienBuLk > 0) domains.push("giai_trinh");
  if (soLienKetLadaDoi > 0) domains.push("lada");
  await bumpVersions(db, domains);

  const tl = opts.tichLuy ?? { soCaseCapNhat: 0, soLichSuMoi: 0, soLichSuTrung: 0, loi: [] };
  const tong = {
    soCaseCapNhat: tl.soCaseCapNhat + caseIdsCapNhat.size,
    soLichSuMoi: tl.soLichSuMoi + soLichSuMoi,
    soLichSuTrung: tl.soLichSuTrung + soLichSuTrung,
    soLienKetLada: (tl.soLienKetLada ?? 0) + soLienKetLadaDoi,
  };
  const done = nextDoiTac >= dsDoiTac.length;
  if (done && chiLada) return { ok: true, ...tong, done, nextDoiTac, tongDoiTac: dsDoiTac.length, loi: [...tl.loi, ...loiTungDoiTac] };
  if (done) {
    const loi = [...tl.loi, ...loiTungDoiTac];
    const ok = loi.length === 0;
    await writeSummaryLog(db, { ok, ...tong, error: ok ? null : loi.join("; ").slice(0, MAX_ERROR_LEN) });
    await cleanupOldLogs(db);
    return { ok: true, ...tong, done, nextDoiTac, tongDoiTac: dsDoiTac.length };
  }
  // Chua xong: tra loi cua dot nay qua soLichSu... (tich luy) - loi tung doi tac gui kem qua tichLuy o route.
  return { ok: true, ...tong, done, nextDoiTac, tongDoiTac: dsDoiTac.length, loi: [...tl.loi, ...loiTungDoiTac] };
}

/** Popup "ID Lada" trong Chi tiet ca (GET /api/cases/:id/lada/:orderId): goi API ETX loc theo order_id, 60 ngay gan nhat
 * (han luu cua ETX - "tu" vuot san thi API tu keo ve san). Theo yeu cau, KHONG luu D1. Tra cac dong nhat ky Lada, moi nhat truoc. */
export async function fetchLadaDon(
  env: Env,
  maDoiTac: string,
  orderId: string,
): Promise<{ ok: true; dong: Record<string, unknown>[] } | { ok: false; status: number; error: string }> {
  const apiKey = env.ETX_GIAI_TRINH_API_KEY;
  if (!apiKey) return { ok: false, status: 400, error: "MISSING_API_KEY" };
  const params = new URLSearchParams({ doi_tac: maDoiTac, order_id: orderId, tu: vnDateStr(-59), den: vnDateStr(), so_dong: "200" });
  const res = await fetchJson<EtxGiaiTrinhTonResponse>(`${ETX_API_BASE}/v1/giai-trinh-ton?${params}`, apiKey);
  if (!res.ok) return res;
  // Chi tra truong UI can - bo email nhan vien Lada (nguoi_giai_trinh.email), id_dong... khong dua ra trinh duyet.
  const dong = res.data.dong
    .filter((d) => d.order_id === orderId)
    .sort((a, b) => (a.thoi_diem < b.thoi_diem ? 1 : -1))
    .map((d) => {
      const ngt = (d as EtxDong & { nguoi_giai_trinh?: { ho_ten?: string } | null }).nguoi_giai_trinh;
      const coAnh = (d as EtxDong & { co_anh?: boolean }).co_anh;
      return {
        order_id: d.order_id,
        thoi_diem: d.thoi_diem,
        lan: d.lan,
        ly_do: d.ly_do,
        ghi_chu: d.ghi_chu,
        du_kien_xong: d.du_kien_xong,
        trang_thai_don: d.trang_thai_don,
        co_anh: coAnh,
        id_dat_linh_kien: d.id_dat_linh_kien,
        nguoi_giai_trinh: ngt?.ho_ten ? { ho_ten: ngt.ho_ten } : null,
      };
    });
  return { ok: true, dong };
}
