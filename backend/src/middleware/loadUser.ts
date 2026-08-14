import type { Context, Next } from "hono";
import type { AppUser, Env, VaiTro } from "../types";
import { fromJsonArray } from "../lib/jsonArray";
import { parseModulesColumn } from "../lib/moduleAccess";

interface UserRow {
  email: string;
  ten: string | null;
  ten_goi: string | null;
  gioi_tinh: "nam" | "nu" | null;
  vai_tro: VaiTro | null;
  khu_vuc_phu_trach: string | null;
  trang_thai_duyet: "Cho duyet" | "Da duyet" | "Tu choi";
  la_ksnb_doi_tac: number;
  modules: string | null;
  bi_khoa: number;
  co_the_import_tranh_chap: number;
  la_ktv_dvbh: number;
  la_ve_tinh: number;
  la_kho: number;
  la_ke_toan: number;
  tram_cha: string | null;
  giam_sat_quan_ly: string | null;
}

// Chot 2026-08-13: bo "theme_config" khoi danh sach cot doc - giao dien da chuyen han sang
// localStorage phia client (xem frontend/src/theme/localThemeConfig.ts), khong con dung server.
const USER_COLUMNS = "email, ten, ten_goi, gioi_tinh, vai_tro, khu_vuc_phu_trach, trang_thai_duyet, la_ksnb_doi_tac, modules, bi_khoa, co_the_import_tranh_chap, la_ktv_dvbh, la_ve_tinh, la_kho, la_ke_toan, tram_cha, giam_sat_quan_ly";

export async function loadUser(c: Context<{ Bindings: Env }>, next: Next) {
  const email = c.get("email");
  await c.env.DB.prepare("PRAGMA foreign_keys = ON").run();

  let row = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`).bind(email).first<UserRow>();

  if (!row) {
    const isBootstrapAdmin = email === c.env.BOOTSTRAP_ADMIN_EMAIL;
    row = await c.env.DB.prepare(
      `INSERT INTO users (email, vai_tro, trang_thai_duyet)
       VALUES (?, ?, ?)
       RETURNING ${USER_COLUMNS}`,
    )
      .bind(email, isBootstrapAdmin ? "Admin" : null, isBootstrapAdmin ? "Da duyet" : "Cho duyet")
      .first<UserRow>();
  }

  if (!row) return c.json({ error: "USER_LOAD_FAILED" }, 500);

  if (row.bi_khoa) {
    return c.json({ error: "DISABLED" }, 403);
  }
  if (row.trang_thai_duyet === "Cho duyet") {
    return c.json({ error: "PENDING_APPROVAL" }, 403);
  }
  if (row.trang_thai_duyet === "Tu choi") {
    return c.json({ error: "REJECTED" }, 403);
  }

  const user: AppUser = {
    email: row.email,
    ten: row.ten,
    ten_goi: row.ten_goi,
    gioi_tinh: row.gioi_tinh,
    vai_tro: row.vai_tro,
    khu_vuc_phu_trach: fromJsonArray(row.khu_vuc_phu_trach),
    trang_thai_duyet: row.trang_thai_duyet,
    la_ksnb_doi_tac: !!row.la_ksnb_doi_tac,
    modules: parseModulesColumn(row.modules),
    bi_khoa: !!row.bi_khoa,
    co_the_import_tranh_chap: !!row.co_the_import_tranh_chap,
    la_ktv_dvbh: !!row.la_ktv_dvbh,
    la_ve_tinh: !!row.la_ve_tinh,
    la_kho: !!row.la_kho,
    la_ke_toan: !!row.la_ke_toan,
    tram_cha: row.tram_cha ?? null,
    giam_sat_quan_ly: row.giam_sat_quan_ly ?? null,
  };
  c.set("user", user);
  await next();
}
