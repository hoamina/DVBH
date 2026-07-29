import type { Context, Next } from "hono";
import type { AppUser, Env, VaiTro } from "../types";
import { fromJsonArray } from "../lib/jsonArray";
import { parseThemeConfig } from "../lib/theme";

interface UserRow {
  email: string;
  ten: string | null;
  ten_goi: string | null;
  gioi_tinh: "nam" | "nu" | null;
  vai_tro: VaiTro | null;
  khu_vuc_phu_trach: string | null;
  trang_thai_duyet: "Cho duyet" | "Da duyet" | "Tu choi";
  theme_config: string | null;
  la_ksnb_doi_tac: number;
}

const USER_COLUMNS = "email, ten, ten_goi, gioi_tinh, vai_tro, khu_vuc_phu_trach, trang_thai_duyet, theme_config, la_ksnb_doi_tac";

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
    theme_config: parseThemeConfig(row.theme_config),
    la_ksnb_doi_tac: !!row.la_ksnb_doi_tac,
  };
  c.set("user", user);
  await next();
}
