/**
 * Ton kho linh kien keo tu linh-kien-app (2026-10-08, migration 0125). Nguon = file MISA "ton kho cong no" Ke toan
 * import hang ngay ben linh-kien-app, doc qua API doi tac GET /api/partner/v1/ton-kho(/meta) (Service Binding
 * LINHKIEN_APP + LINHKIEN_APP_API_KEY, cung co che lib/linhKienTimeline.ts).
 *
 * Lich (chot chu he thong): hoi moi gio 8h-18h gio VN, thu 2 - thu 7; DA keo duoc phien ban CUA HOM NAY thi thoi
 * hoi toi het ngay (Ke toan import lai lan 2 trong ngay -> dung nut "Đồng bộ ngay"). Chi giu 1 phien ban: co phien
 * ban moi -> XOA + GHI DE toan bo ton_kho_lk trong 1 batch (giao dich D1, khong bao gio con du lieu nua voi).
 * Phien ban khong doi -> chi 1 request meta + 1 UPDATE kiem_tra_luc, khong ghi lai ~8.700 dong.
 */
import type { Env } from "../types";
import { nowVN } from "./vnTime";
import { bumpVersions } from "./dataVersions";

const TIMEOUT_MS = 15000;
const PAGE_LIMIT = 3000;
// So dong moi cau INSERT ... SELECT FROM json_each(?) - 1 tham so JSON ~200 byte/dong, xa duoi gioi han 2MB/gia tri.
const INSERT_CHUNK = 1000;

export interface TonKhoLkMeta {
  phien_ban: string | null;
  ky_tu_ngay: string | null;
  ky_den_ngay: string | null;
  so_dong: number | null;
  dong_bo_luc: string | null;
  dong_bo_boi: string | null;
  kiem_tra_luc: string | null;
  loi: string | null;
}

interface RemoteMeta {
  phien_ban: string | null;
  ky_tu_ngay?: string | null;
  ky_den_ngay?: string | null;
  so_dong?: number | null;
}

interface RemoteRow {
  id: number;
  ma_kho: string;
  ten_kho: string | null;
  ma_ktv: string | null;
  ten_ktv: string | null;
  khu_vuc_ma: string | null;
  ma_hang: string;
  ten_hang: string | null;
  dvt: string | null;
  cuoi_ky: number | null;
}

export type SyncTonKhoResult =
  | { ok: true; changed: false; phien_ban: string | null }
  | { ok: true; changed: true; phien_ban: string; so_dong: number }
  | { ok: false; error: string };

export async function callLinhKienPartner<T>(env: Env, path: string): Promise<T> {
  if (!env.LINHKIEN_APP_URL || !env.LINHKIEN_APP_API_KEY) throw new Error("CHUA_CAU_HINH_LINHKIEN_APP");
  const url = `${env.LINHKIEN_APP_URL}/api/partner${path}`;
  const init: RequestInit = { headers: { "X-API-Key": env.LINHKIEN_APP_API_KEY }, signal: AbortSignal.timeout(TIMEOUT_MS) };
  // Service Binding tren production (fetch() thang workers.dev cung tai khoan bi loi 1042), local dung URL.
  const res = env.LINHKIEN_APP ? await env.LINHKIEN_APP.fetch(url, init) : await fetch(url, init);
  if (!res.ok) throw new Error(`LINHKIEN_APP_HTTP_${res.status}`);
  return (await res.json()) as T;
}

export async function getTonKhoLkMeta(db: D1Database): Promise<TonKhoLkMeta | null> {
  return db.prepare("SELECT phien_ban, ky_tu_ngay, ky_den_ngay, so_dong, dong_bo_luc, dong_bo_boi, kiem_tra_luc, loi FROM ton_kho_lk_meta WHERE id = 1").first<TonKhoLkMeta>();
}

async function ghiKiemTra(db: D1Database, loi: string | null): Promise<void> {
  await db
    .prepare("INSERT INTO ton_kho_lk_meta (id, kiem_tra_luc, loi) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET kiem_tra_luc = excluded.kiem_tra_luc, loi = excluded.loi")
    .bind(nowVN(), loi)
    .run();
}

async function keoNguon(env: Env, nguon: "kho" | "ktv", phienBan: string): Promise<RemoteRow[]> {
  const rows: RemoteRow[] = [];
  let afterId = 0;
  for (;;) {
    const page = await callLinhKienPartner<{ phien_ban: string | null; rows: RemoteRow[]; next_after_id: number | null }>(
      env,
      `/v1/ton-kho?nguon=${nguon}&after_id=${afterId}&limit=${PAGE_LIMIT}`,
    );
    // Ke toan import lai giua chung -> bo dot nay (khong tron 2 phien ban), lan hoi sau keo lai tu dau.
    if (page.phien_ban !== phienBan) throw new Error("PHIEN_BAN_DOI_GIUA_CHUNG");
    rows.push(...page.rows);
    if (page.next_after_id === null) return rows;
    afterId = page.next_after_id;
  }
}

/** Hoi phien ban ben linh-kien-app; khac phien ban dang luu (hoac force) thi keo toan bo + ghi de. Khong nem loi
 * ra ngoai - loi ghi vao ton_kho_lk_meta.loi de UI hien, tra { ok:false }. */
export async function syncTonKhoLk(env: Env, opts: { force?: boolean; actor: string }): Promise<SyncTonKhoResult> {
  const db = env.DB;
  try {
    const remote = await callLinhKienPartner<RemoteMeta>(env, "/v1/ton-kho/meta");
    const local = await getTonKhoLkMeta(db);
    if (!remote.phien_ban) {
      await ghiKiemTra(db, null);
      return { ok: true, changed: false, phien_ban: null };
    }
    if (!opts.force && local?.phien_ban === remote.phien_ban) {
      await ghiKiemTra(db, null);
      return { ok: true, changed: false, phien_ban: remote.phien_ban };
    }

    const [kho, ktv] = await Promise.all([keoNguon(env, "kho", remote.phien_ban), keoNguon(env, "ktv", remote.phien_ban)]);
    const all = [
      ...kho.map((r) => ({ ...r, nguon: "kho" as const })),
      ...ktv.map((r) => ({ ...r, nguon: "ktv" as const })),
    ].filter((r) => r.ma_kho && r.ma_hang);

    const now = nowVN();
    const stmts: D1PreparedStatement[] = [db.prepare("DELETE FROM ton_kho_lk")];
    for (let i = 0; i < all.length; i += INSERT_CHUNK) {
      const chunk = all.slice(i, i + INSERT_CHUNK).map((r) => [r.nguon, r.ma_kho, r.ten_kho, r.ma_ktv, r.ten_ktv, r.khu_vuc_ma, r.ma_hang, r.ten_hang, r.dvt, r.cuoi_ky]);
      stmts.push(
        db
          .prepare(
            `INSERT INTO ton_kho_lk (nguon, ma_kho, ten_kho, ma_ktv, ten_ktv, khu_vuc_ma, ma_hang, ten_hang, dvt, cuoi_ky)
             SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'),
                    json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]'), json_extract(value, '$[7]'),
                    json_extract(value, '$[8]'), json_extract(value, '$[9]')
             FROM json_each(?)`,
          )
          .bind(JSON.stringify(chunk)),
      );
    }
    stmts.push(
      db
        .prepare(
          `INSERT INTO ton_kho_lk_meta (id, phien_ban, ky_tu_ngay, ky_den_ngay, so_dong, dong_bo_luc, dong_bo_boi, kiem_tra_luc, loi)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET phien_ban = excluded.phien_ban, ky_tu_ngay = excluded.ky_tu_ngay, ky_den_ngay = excluded.ky_den_ngay,
             so_dong = excluded.so_dong, dong_bo_luc = excluded.dong_bo_luc, dong_bo_boi = excluded.dong_bo_boi,
             kiem_tra_luc = excluded.kiem_tra_luc, loi = NULL`,
        )
        .bind(remote.phien_ban, remote.ky_tu_ngay ?? null, remote.ky_den_ngay ?? null, all.length, now, opts.actor, now),
    );
    await db.batch(stmts);
    await bumpVersions(db, ["ton_kho"]);
    return { ok: true, changed: true, phien_ban: remote.phien_ban, so_dong: all.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await ghiKiemTra(db, msg);
    } catch {
      // bo qua - loi ghi meta khong duoc che loi goc
    }
    return { ok: false, error: msg };
  }
}

/** Goi tu cron moi gio (DAILY_SNAPSHOT_CRON "0 1-11 * * *" = 8h-18h VN). Bo qua Chu nhat (theo gio VN) va bo qua
 * khi phien ban dang luu da la cua HOM NAY (da keo duoc ban moi trong ngay -> dung hoi). */
export async function autoSyncTonKhoLk(env: Env, scheduledTime: number): Promise<void> {
  const vn = new Date(scheduledTime + 7 * 60 * 60 * 1000);
  if (vn.getUTCDay() === 0) return;
  const hour = vn.getUTCHours();
  if (hour < 8 || hour > 18) return;
  const today = vn.toISOString().slice(0, 10);
  const local = await getTonKhoLkMeta(env.DB);
  if (local?.phien_ban?.startsWith(today)) return;
  const result = await syncTonKhoLk(env, { actor: "cron" });
  if (!result.ok) console.error(`[cron-ton-kho-lk] loi: ${result.error}`);
}
