import type { Env } from "../types";
import { bocPhamVi, dbGoc, phamViTheoNuoc } from "./phamVi";
import { dsQuocGiaKichHoat } from "./quocGia";
import { getVnDateStr } from "./reportCache";

/**
 * Thu gon so chot 08:00 (daily_snapshot) cu - chot chu he thong 2026-11-20 (v1.647): giu DAY DU 35 ngay gan nhat; dong cu hon chi
 * con cac so ma man hinh con doc toi (bieu do "Số ca tồn theo mốc thời gian", GET /api/cases/ton-trend): backlogTongTon.count,
 * backlogTren3/5/7/14, khuVucReportRows. Bo het mang id ca (backlogTongTon 18 KB, canKhaoSat 12 KB, caLap 7 KB...) + pivot/revenue
 * cu -> ~23 KB/dong con ~3 KB. Ngoai bieu do do, moi noi doc daily_snapshot chi doc HOM NAY (Cảnh báo tồn: them ngay truoc, la
 * dong canh_bao_ton|all - khong thu gon).
 *
 * Mat di: khong tra lai duoc "ngay X > 35 ngay truoc dung nhung ca nao" (chua man nao lam viec nay). Dong da thu gon co "thuGon": 1.
 * Chay o cron 03:00 VN (index.ts VI_PHAM_SHEET_SYNC_CRON), tung lo 100 dong, TUAN TU tung bang pham vi (khong fan-out D1).
 */
export const SO_NGAY_GIU_DAY_DU = 35;
const LO = 100;
const TOI_DA_LO_MOI_BANG = 60;

const PAYLOAD_GON = `json_object(
  'thuGon', 1,
  'backlogTongTon', json_object('count', json_extract(payload, '$.backlogTongTon.count')),
  'backlogTren3', json_extract(payload, '$.backlogTren3'),
  'backlogTren5', json_extract(payload, '$.backlogTren5'),
  'backlogTren7', json_extract(payload, '$.backlogTren7'),
  'backlogTren14', json_extract(payload, '$.backlogTren14'),
  'khuVucReportRows', json(COALESCE(json_extract(payload, '$.khuVucReportRows'), '{}'))
)`;

export async function thuGonSnapshotCu(env: Env): Promise<number> {
  const goc = dbGoc(env.DB);
  const moc = new Date(`${getVnDateStr()}T00:00:00Z`);
  moc.setUTCDate(moc.getUTCDate() - SO_NGAY_GIU_DAY_DU);
  const ngayMoc = moc.toISOString().slice(0, 10);
  // Bang goc (chi con dong he thong, cung thu gon cho dong bo) + moi bang theo nuoc. Pham vi NSKX khong gan nuoc da thoi chot (v1.646).
  const dsDb = [goc, ...phamViTheoNuoc(await dsQuocGiaKichHoat(goc)).filter((s) => s.qg !== null).map((s) => bocPhamVi(goc, s))];
  let tong = 0;
  for (const db of dsDb) {
    for (let i = 0; i < TOI_DA_LO_MOI_BANG; i++) {
      const r = await db
        .prepare(
          `UPDATE daily_snapshot SET payload = ${PAYLOAD_GON}
           WHERE rowid IN (
             SELECT rowid FROM daily_snapshot
             WHERE ngay < ? AND scope_key NOT IN ('canh_bao_ton|all', 'chot_xong|all')
               AND json_extract(payload, '$.thuGon') IS NULL
             LIMIT ${LO})`,
        )
        .bind(ngayMoc)
        .run();
      const n = r.meta.changes ?? 0;
      tong += n;
      if (n < LO) break;
    }
  }
  return tong;
}
