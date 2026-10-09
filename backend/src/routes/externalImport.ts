import { Hono } from "hono";
import type { Env } from "../types";
import { processImport } from "../lib/importProcessor";
import { nowVN } from "../lib/vnTime";
import { scheduleCaLapRefreshIfChanged } from "./importRoute";
import { warmDefaultReports } from "../lib/reportWarmup";
import { bumpVersions } from "../lib/dataVersions";

/**
 * Import tu dong cho pipeline QuickSight (Python, chay nen - xem
 * YEU_CAU_API_IMPORT_TU_DONG_QUICKSIGHT.md). KHONG dung verifySessionMiddleware/OAuth (pipeline
 * khong co nguoi ngoi truoc may de dang nhap) - xac thuc bang 1 API key tinh rieng
 * (EXTERNAL_IMPORT_API_KEY, dat qua `wrangler secret put`, KHONG trung secret nao khac).
 *
 * Mount o 1 prefix TACH BIET HOAN TOAN voi "/api/import" (xem index.ts) - tranh moi nhap nhang ve
 * viec middleware ".use('*', verifySessionMiddleware...)" cua importRoute.ts co the ap dung nham
 * len route nay neu mount chung 1 prefix voi importRoutes.
 */
const externalImport = new Hono<{ Bindings: Env }>();

// User he thong dung lam "nguoi_import" (import_history.nguoi_import co FK REFERENCES users(email)
// - xem migration 0033_system_user_for_cron.sql) - khong co session that de lay user dang goi API.
const SYSTEM_USER_EMAIL = "he-thong-tu-dong@dvbh.internal";

externalImport.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  const key = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  if (!key || key !== c.env.EXTERNAL_IMPORT_API_KEY) {
    return c.json({ error: "UNAUTHORIZED" }, 401);
  }
  await next();
});

// POST /api/external-import/commit - than giong het POST /api/import/commit (dung chung
// processImport + scheduleCaLapRefreshIfChanged), chi khac nguon xac thuc va "nguoi_import"/"loai"
// ghi vao import_history.
externalImport.post("/commit", async (c) => {
  const body = await c.req.json<{ filename: string; rows: unknown[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);

  const summary = await processImport(c.env.DB, body.rows, true);

  const inserted = await c.env.DB.prepare(
    `INSERT INTO import_history (ten_file, nguoi_import, ghi_moi, ghi_de, bo_qua, loi, thoi_gian, loai)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'quicksight_auto')`,
  )
    .bind(body.filename, SYSTEM_USER_EMAIL, summary.GHI_MOI, summary.GHI_DE, summary.BO_QUA, summary.LOI, nowVN())
    .run();

  // warmReports:false - pipeline nay ban nhieu file lien tiep trong 1 dot chay, moi file tu spawn 1
  // chuoi nen doc lap; bat warm o day gay dua tranh ghi de cache bao cao (xem giai thich chi tiet o
  // comment cua scheduleCaLapRefreshIfChanged trong importRoute.ts). Van bumpVersions binh thuong -
  // cache cu van het han dung, chi khong chu dong tinh lai truoc nua.
  scheduleCaLapRefreshIfChanged(c, summary, inserted.meta.last_row_id, { warmReports: false });
  return c.json({ filename: body.filename, ...summary });
});

// POST /api/external-import/refresh-reports - tin hieu "da day xong 1 dot" tu pipeline, goi DUNG 1
// LAN sau khi da thu day het cac file trong dot (bat ke tung file thanh cong hay loi - luon goi o
// buoc cuoi cung, khong dieu kien). Tinh lai dong bo toan bo cache bao cao dashboard mac dinh NGAY,
// thay vi de moi file rieng le tu warm (gay dua tranh ghi de - xem warmReports:false o /commit
// phia tren). Khong can bumpVersions lai o day - moi file da tu bump dung khi GHI_MOI/GHI_DE > 0;
// endpoint nay chi lam nhiem vu tinh sang. An toan goi lai nhieu lan (idempotent, khong tac dung phu
// len du lieu nghiep vu) - pipeline goi trung hoac retry do timeout khong sao ca.
externalImport.post("/refresh-reports", async (c) => {
  await warmDefaultReports(c.env.DB);
  return c.json({ ok: true });
});

// POST /api/external-import/don-bao-hanh-odoo - "Danh sach don bao hanh tu Odoo" (model
// technical.service.warranty), pipeline auto qs gui cac don co "Cap nhat lan cuoi" trong cua so
// -3/+1 ngay. UPSERT theo odoo_id; dong co ngay_cap_nhat_odoo KHONG doi -> bo qua (khong ghi).
// Body: { rows: [{ odoo_id, ma_don, case_id, ma_linh_kien, ten_linh_kien, so_luong, don_gia,
// thanh_tien, trang_thai, tinh_trang_loi, ghi_chu, ngay_tao, ngay_hoan_thanh, nguoi_tao,
// ngay_cap_nhat_odoo, con_hieu_luc, ma_import_odoo }] } - gio deu la gio VN "YYYY-MM-DD HH:MM:SS".
// ma_import_odoo (migration 0129) = External ID de import nguoc Odoo; doi gia tri cung tinh la "doi".
const DON_BH_FIELDS = [
  "ma_don", "case_id", "ma_linh_kien", "ten_linh_kien", "so_luong", "don_gia", "thanh_tien", "trang_thai",
  "tinh_trang_loi", "ghi_chu", "ngay_tao", "ngay_hoan_thanh", "nguoi_tao", "ngay_cap_nhat_odoo", "con_hieu_luc",
  "ma_import_odoo",
] as const;

externalImport.post("/don-bao-hanh-odoo", async (c) => {
  const body = await c.req.json<{ rows: Record<string, unknown>[] }>();
  if (!Array.isArray(body.rows)) return c.json({ error: "INVALID_BODY" }, 400);

  const errors: string[] = [];
  const byId = new Map<number, Record<string, unknown>>();
  for (const [i, r] of body.rows.entries()) {
    const id = Number(r?.odoo_id);
    if (!Number.isInteger(id) || id <= 0) {
      errors.push(`Dong ${i + 1}: thieu/sai odoo_id`);
      continue;
    }
    byId.set(id, r);
  }

  const ids = [...byId.keys()];
  const existing = new Map<number, { key: string; maImport: string | null }>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { results } = await c.env.DB.prepare(
      `SELECT odoo_id, ngay_cap_nhat_odoo, con_hieu_luc, ma_import_odoo FROM don_bao_hanh_odoo WHERE odoo_id IN (${chunk.map(() => "?").join(", ")})`,
    )
      .bind(...chunk)
      .all<{ odoo_id: number; ngay_cap_nhat_odoo: string | null; con_hieu_luc: number; ma_import_odoo: string | null }>();
    for (const r of results) {
      existing.set(r.odoo_id, { key: `${r.ngay_cap_nhat_odoo}|${r.con_hieu_luc}|${r.ma_import_odoo}`, maImport: r.ma_import_odoo });
    }
  }

  const now = nowVN();
  const val = (r: Record<string, unknown>, f: string) => {
    if (f === "con_hieu_luc") return r[f] === false || r[f] === 0 || r[f] === "0" ? 0 : 1;
    const v = r[f];
    return v === undefined || v === "" ? null : v;
  };
  const cols = ["odoo_id", ...DON_BH_FIELDS, "ngay_dong_bo"];
  const sql =
    `INSERT INTO don_bao_hanh_odoo (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})
     ON CONFLICT(odoo_id) DO UPDATE SET ${[...DON_BH_FIELDS, "ngay_dong_bo"].map((f) => `${f} = excluded.${f}`).join(", ")}`;
  const statements: D1PreparedStatement[] = [];
  let ghiMoi = 0;
  let capNhat = 0;
  for (const [id, r] of byId) {
    const old = existing.get(id);
    // Pipeline cu chua gui ma_import_odoo (undefined) -> giu gia tri dang luu, khong coi la "doi"
    const maImport = r.ma_import_odoo === undefined ? (old?.maImport ?? null) : (val(r, "ma_import_odoo") as string | null);
    if (old !== undefined && old.key === `${val(r, "ngay_cap_nhat_odoo")}|${val(r, "con_hieu_luc")}|${maImport}`) continue;
    if (old === undefined) ghiMoi++;
    else capNhat++;
    statements.push(
      c.env.DB.prepare(sql).bind(id, ...DON_BH_FIELDS.map((f) => (f === "ma_import_odoo" ? maImport : val(r, f))), now),
    );
  }
  for (let i = 0; i < statements.length; i += 500) await c.env.DB.batch(statements.slice(i, i + 500));
  if (statements.length > 0) await bumpVersions(c.env.DB, ["don_bao_hanh_odoo"]);

  return c.json({ ghi_moi: ghiMoi, cap_nhat: capNhat, bo_qua: byId.size - statements.length, loi: errors.length, errors });
});

export default externalImport;
