/**
 * Ca VIP/S.VIP ton >=24h (bucket backlogVip24h, NEED_VIP_CHUA_GT_24H) - 2 viec dinh ky (chu he thong yeu cau 2026-11-27):
 *
 * 1) 12:00 VN - guiKetQuaVip24hTelegram(): gui 1 TIN NHAN (text) "ket qua giai trinh" rieng nhom VIP/S.VIP >=24h vao nhom
 *    Telegram cua nuoc: so chot sang (baseline) / da giai trinh (co dong giai_trinh sau moc chot, cung tieu chi moi so khac) /
 *    con lai, theo khu vuc, kem danh sach ca chua giai trinh. Chi pham vi 1 nuoc co cau hinh nhom (nhomTelegramCuaPhamVi).
 *
 * 2) 13:30 VN - boSungVip1330(): "bo dem phu". Ca VIP/S.VIP mo HOM QUA truoc 12:00 nhung luc chot 07:30 chua du 24h thuc
 *    (vd mo 10:00 26/11 -> 07:30 27/11 moi 21,5h) se khong co trong danh sach chot sang. 13:30 hom nay neu ca VAN TON
 *    (chua hoan thanh / huy / archive) va chua tung giai trinh truoc moc chot -> BO SUNG vao bucket backlogVip24h VA
 *    tonCanGiaiTrinh (+ByKhuVuc) cua MOI snapshot hom nay (giong cach bo sung ca CEO cap 2, lib/canhBaoCap2GiaiTrinh.ts) -
 *    nen the "VIP/SVIP >=24h", "Tong can giai trinh", danh sach chi tiet, log 17h30 + anh Telegram 17h30 deu cong theo.
 *    Giu nguyen generated_at (moc "since") - giai trinh sau moc chot (ke ca truoc 13:30) tinh la "da giai trinh".
 *    Ghi dau "bo_sung_vip_1330|all" (payload = danh sach id da them) de khong chay lai + tra cuu.
 */
import { envPhamVi, hauToPhamVi } from "./phamVi";
import { getVnDateStr } from "./reportCache";
import { nowVN } from "./vnTime";
import { KHU_VUC_AN_KHOI_BAO_CAO } from "./filterParams";
import { bumpVersions } from "./dataVersions";
import { khuVucCuaScopeKey } from "./canhBaoCap2GiaiTrinh";
import { layCaDaGiaiTrinhSau, phamViCuaNhom, tatCaNhom } from "./chotTon";
import { buildSnapshotScopeKey } from "./dailySnapshot";
import { nhomTelegramCuaPhamVi, sendTelegramMessage, TELEGRAM_BOT_ID } from "./telegram";
import { QUOC_GIA_MAC_DINH } from "./quocGia";
import type { Env } from "../types";

export const SCOPE_BO_SUNG_VIP_1330 = "bo_sung_vip_1330|all";

interface Bucket {
  ids: string[];
  count: number;
}
interface PayloadVip {
  tonCanGiaiTrinh?: Bucket;
  tonCanGiaiTrinhByKhuVuc?: Record<string, Bucket>;
  backlogVip24h?: Bucket;
}

/** Ca ung vien bo sung 13:30 cua 1 pham vi: VIP/S.VIP, CSKH tiep nhan trong [hom qua 00:00, hom qua 12:00), dang ton.
 * gt_dau = lan giai trinh dau tien (null = chua tung) - loai ca da giai trinh TRUOC moc chot cua tung snapshot. */
async function layUngVien(db: D1Database, ngay: string): Promise<{ id: string; khu_vuc: string; gt_dau: string | null }[]> {
  const { results } = await db
    .prepare(
      `SELECT CAST(c.id AS TEXT) AS id, c.khu_vuc AS khu_vuc,
              (SELECT MIN(g.ngay_giai_trinh) FROM giai_trinh g WHERE g.case_id = c.id) AS gt_dau
       FROM case_hieu_luc c
       WHERE c.thoi_gian_hoan_thanh IS NULL AND c.archived_at IS NULL AND c.huy_bo_at IS NULL
         AND c.nhom_kh LIKE '%VIP%' AND c.khu_vuc IS NOT NULL
         AND c.thoi_gian_cskh_tiep_nhan >= date(?1, '-1 day')
         AND c.thoi_gian_cskh_tiep_nhan < date(?1, '-1 day') || ' 12:00:00'`,
    )
    .bind(ngay)
    .all<{ id: string; khu_vuc: string; gt_dau: string | null }>();
  return results.filter((r) => !KHU_VUC_AN_KHOI_BAO_CAO.includes(r.khu_vuc));
}

/** Bo sung 13:30 cho 1 pham vi (DB da boc pham vi). Tra so ca (khac nhau) da them. Idempotent nho dau SCOPE_BO_SUNG_VIP_1330. */
export async function boSungVip1330(db: D1Database): Promise<number> {
  const ngay = getVnDateStr();
  const daChay = await db.prepare("SELECT 1 AS c FROM daily_snapshot WHERE ngay = ? AND scope_key = ?").bind(ngay, SCOPE_BO_SUNG_VIP_1330).first();
  if (daChay) return 0;
  const { results: snaps } = await db
    .prepare("SELECT scope_key, generated_at, payload FROM daily_snapshot WHERE ngay = ? AND scope_key NOT LIKE 'canh_bao_ton%'")
    .bind(ngay)
    .all<{ scope_key: string; generated_at: string; payload: string }>();
  // Chua co so chot sang (cron 07:30 loi, chot bu chua kip) -> khong danh dau, lan sau (14:00) thu lai.
  if (!snaps.some((s) => s.scope_key === buildSnapshotScopeKey("khac", []))) return 0;

  const ungVien = await layUngVien(db, ngay);
  const daThem = new Set<string>();
  const stmts: D1PreparedStatement[] = [];
  for (const s of snaps) {
    const khuVucList = khuVucCuaScopeKey(s.scope_key);
    if (khuVucList === undefined) continue;
    const p = JSON.parse(s.payload) as PayloadVip;
    if (!p.backlogVip24h || !p.tonCanGiaiTrinh || !p.tonCanGiaiTrinhByKhuVuc) continue;
    const coVip = new Set(p.backlogVip24h.ids.map(String));
    const coTong = new Set(p.tonCanGiaiTrinh.ids.map(String));
    let them = 0;
    for (const r of ungVien) {
      if (khuVucList !== null && !khuVucList.includes(r.khu_vuc)) continue;
      if (coVip.has(r.id)) continue; // da du 24h luc chot sang
      if (r.gt_dau !== null && r.gt_dau <= s.generated_at) continue; // da giai trinh truoc moc chot - giong NEED_VIP (chua GT)
      p.backlogVip24h.ids.push(r.id);
      coVip.add(r.id);
      if (!coTong.has(r.id)) {
        p.tonCanGiaiTrinh.ids.push(r.id);
        coTong.add(r.id);
        const kv = (p.tonCanGiaiTrinhByKhuVuc[r.khu_vuc] ??= { ids: [], count: 0 });
        kv.ids.push(r.id);
        kv.count = kv.ids.length;
      }
      daThem.add(r.id);
      them++;
    }
    if (them === 0) continue;
    p.backlogVip24h.count = p.backlogVip24h.ids.length;
    p.tonCanGiaiTrinh.count = p.tonCanGiaiTrinh.ids.length;
    stmts.push(db.prepare("UPDATE daily_snapshot SET payload = ? WHERE ngay = ? AND scope_key = ?").bind(JSON.stringify(p), ngay, s.scope_key));
  }
  const ids = [...daThem];
  stmts.push(
    db
      .prepare(
        `INSERT INTO daily_snapshot (ngay, scope_key, generated_at, generated_by, payload) VALUES (?, ?, ?, 'auto', ?)
         ON CONFLICT(ngay, scope_key) DO NOTHING`,
      )
      .bind(ngay, SCOPE_BO_SUNG_VIP_1330, nowVN(), JSON.stringify({ ids, count: ids.length })),
  );
  for (let i = 0; i < stmts.length; i += 20) await db.batch(stmts.slice(i, i + 20));
  // Badge menu + bao cao Quan ly ton cache theo domain "giai_trinh" - bump de doc lai baseline moi.
  if (ids.length > 0) await bumpVersions(db, ["giai_trinh"]);
  return ids.length;
}

/** Moi pham vi cua moi nhom nuoc (giong chot 17:30). */
export async function chayBoSungVip1330(env: Env): Promise<void> {
  for (const nhom of await tatCaNhom(env)) {
    for (const s of phamViCuaNhom(nhom)) {
      try {
        const n = await boSungVip1330(envPhamVi(env, s).DB);
        if (n > 0) console.log(`[vip-1330] ${hauToPhamVi(s) || "tat-ca"}: bo sung ${n} ca`);
      } catch (err) {
        console.error(`[vip-1330] ${hauToPhamVi(s) || "tat-ca"} loi:`, err instanceof Error ? err.message : String(err));
      }
    }
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const DS_TOI_DA = 40;

/** Noi dung tin 12:00 cho 1 pham vi (null = chua co so chot sang). Dung chung cho cron va xem truoc. */
export async function soanTinVip24h(db: D1Database): Promise<string | null> {
  const ngay = getVnDateStr();
  const row = await db
    .prepare("SELECT generated_at, payload FROM daily_snapshot WHERE ngay = ? AND scope_key = ?")
    .bind(ngay, buildSnapshotScopeKey("khac", []))
    .first<{ generated_at: string; payload: string }>();
  if (!row) return null;
  const p = JSON.parse(row.payload) as PayloadVip;
  const ids = [...new Set((p.backlogVip24h?.ids ?? []).map(String))];
  const [d, m, y] = [ngay.slice(8, 10), ngay.slice(5, 7), ngay.slice(0, 4)];
  const tieuDe = `⭐ <b>GIẢI TRÌNH CA VIP/S.VIP TỒN ≥24H</b> — 12:00 ${d}/${m}/${y}`;
  if (ids.length === 0) return `${tieuDe}\nSố chốt sáng (${row.generated_at.slice(11, 16)}): không có ca nào cần giải trình.`;

  const daGt = await layCaDaGiaiTrinhSau(db, row.generated_at);
  const { results } = await db
    .prepare(
      `SELECT CAST(c.id AS TEXT) AS id, COALESCE(c.khu_vuc, '(Không khu vực)') AS khu_vuc, c.nhom_kh AS nhom_kh,
              CAST((julianday(datetime('now','+7 hours')) - julianday(c.thoi_gian_cskh_tiep_nhan)) * 24 AS INTEGER) AS gio
       FROM case_hieu_luc c WHERE c.id IN (SELECT value FROM json_each(?))`,
    )
    .bind(JSON.stringify(ids))
    .all<{ id: string; khu_vuc: string; nhom_kh: string | null; gio: number | null }>();
  const theoId = new Map(results.map((r) => [r.id, r]));

  const kv = new Map<string, { can: number; da: number }>();
  const chuaGt: { id: string; khu_vuc: string; nhom_kh: string | null; gio: number | null }[] = [];
  for (const id of ids) {
    const r = theoId.get(id) ?? { id, khu_vuc: "(Không khu vực)", nhom_kh: null, gio: null };
    const e = kv.get(r.khu_vuc) ?? { can: 0, da: 0 };
    e.can++;
    if (daGt.has(id)) e.da++;
    else chuaGt.push(r);
    kv.set(r.khu_vuc, e);
  }
  const tongDa = ids.length - chuaGt.length;
  const tyLe = Math.round((tongDa / ids.length) * 100);
  const dong: string[] = [
    tieuDe,
    `Cần giải trình (chốt ${row.generated_at.slice(11, 16)}): <b>${ids.length}</b> · Đã giải trình: <b>${tongDa}</b> · Còn lại: <b>${chuaGt.length}</b> (${tyLe}%)`,
    "",
    "<b>Theo khu vực</b> (đã GT / cần GT):",
    ...[...kv.entries()]
      .sort((a, b) => b[1].can - b[1].da - (a[1].can - a[1].da) || a[0].localeCompare(b[0]))
      .map(([k, e]) => `${e.da === e.can ? "✅" : "🔴"} ${esc(k)}: ${e.da}/${e.can}${e.da < e.can ? ` — còn ${e.can - e.da}` : ""}`),
  ];
  if (chuaGt.length > 0) {
    chuaGt.sort((a, b) => (b.gio ?? 0) - (a.gio ?? 0));
    dong.push("", "<b>Ca chưa giải trình:</b>");
    for (const r of chuaGt.slice(0, DS_TOI_DA)) {
      dong.push(`• ${esc(r.id)} — ${esc(r.khu_vuc)}${r.nhom_kh ? ` — ${esc(r.nhom_kh)}` : ""}${r.gio !== null ? ` — ${r.gio}h` : ""}`);
    }
    if (chuaGt.length > DS_TOI_DA) dong.push(`… và ${chuaGt.length - DS_TOI_DA} ca khác`);
  }
  return dong.join("\n");
}

/** 12:00 VN - gui tin vao nhom Telegram cua tung nuoc (pham vi "tat_ca" 1 nuoc co cau hinh nhom). */
export async function guiKetQuaVip24hTelegram(env: Env): Promise<void> {
  for (const nhom of await tatCaNhom(env)) {
    for (const s of phamViCuaNhom(nhom)) {
      try {
        const db = envPhamVi(env, s).DB;
        const nhomTg = await nhomTelegramCuaPhamVi(db);
        if (!nhomTg) continue;
        const tin = await soanTinVip24h(db);
        if (!tin) {
          console.error(`[vip-12h] ${hauToPhamVi(s)}: chua co so chot sang - bo qua`);
          continue;
        }
        await sendTelegramMessage(TELEGRAM_BOT_ID, nhomTg.chatId, nhomTg.qg === QUOC_GIA_MAC_DINH ? tin : `[${nhomTg.qg}] ${tin}`);
      } catch (err) {
        console.error(`[vip-12h] ${hauToPhamVi(s) || "tat-ca"} loi:`, err instanceof Error ? err.message : String(err));
      }
    }
  }
}
