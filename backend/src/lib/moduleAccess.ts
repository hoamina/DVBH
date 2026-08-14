import type { AppUser, VaiTro } from "../types";

/**
 * CHOT 2026-08-01: quyen xem module (sidebar) gio tuy chinh HOAN TOAN theo TUNG tai khoan
 * (users.modules, migration 0042) - thay the duoc_xem_data_tong (chi 1 co rieng cho 1 module).
 *
 * - user.modules === null: CHUA tuy chinh, dung danh sach MAC DINH theo vai_tro (map duoi day,
 *   PHAI khop dung ROLE_MODULES o frontend/src/layout/navConfig.ts - khong co co che dung chung
 *   giua 2 codebase Workers/Vite nen phai tu dong bo tay khi doi 1 ben).
 * - user.modules la mang: ap dung CHINH XAC danh sach do, khong cong don voi mac dinh theo vai_tro.
 * - vai_tro=Admin: LUON xem duoc moi module (khong phu thuoc user.modules) - tranh truong hop tu
 *   khoa quyen chinh minh qua checklist.
 * - 3 module "He thong" (import/settings/users) KHONG nam trong co che tuy chinh nay - van gan
 *   cung vai_tro=Admin nhu truoc (xem requireRole("Admin") o importRoute.ts/settings.ts/users.ts),
 *   rui ro qua cao de giao qua 1 o tick nham.
 */
export const DEFAULT_MODULES_BY_ROLE: Record<VaiTro, string[]> = {
  Admin: ["dashboard", "revenue", "backlog", "missing-parts", "tranh-chap", "nap-gas", "survey", "ca-lap", "danh-sach-tong", "import", "settings", "users", "giao-dien"],
  Viewer: ["dashboard", "revenue", "backlog", "missing-parts", "tranh-chap", "nap-gas", "survey", "ca-lap", "danh-sach-tong", "giao-dien"],
  QC: ["dashboard", "backlog", "missing-parts", "tranh-chap", "nap-gas", "survey", "ca-lap", "danh-sach-tong", "giao-dien"],
  "Giam sat": ["dashboard", "revenue", "backlog", "missing-parts", "tranh-chap", "nap-gas", "ca-lap", "danh-sach-tong", "giao-dien"],
  "TBP DVBH": ["dashboard", "revenue", "backlog", "missing-parts", "tranh-chap", "nap-gas", "ca-lap", "danh-sach-tong", "giao-dien"],
  CSKH: ["dashboard", "survey", "danh-sach-tong", "giao-dien"],
  "TN CSKH": ["dashboard", "survey", "danh-sach-tong", "giao-dien"],
  "TBP CSKH": ["dashboard", "revenue", "survey", "danh-sach-tong", "giao-dien"],
  "KSNB Doi tac": ["tranh-chap", "giao-dien"],
};

/** JSON.parse an toan cho users.modules ("null" hoac chuoi JSON array) - KHAC fromJsonArray()
 * (lib/jsonArray.ts, dung cho khu_vuc_phu_trach) vi o day PHAI phan biet NULL (chua tuy chinh) voi
 * mang RONG (tuy chinh thanh "khong module nao"), khong duoc gop lam mot. */
export function parseModulesColumn(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Danh sach module THAT SU nguoi dung nay duoc xem - Admin luon full, con lai dung
 * user.modules (da tuy chinh) hoac mac dinh theo vai_tro. Co module dat-mua-lk duoc
 * cap them tu dong khi bat co la_ktv_dvbh / la_ve_tinh / la_kho / la_ke_toan. */
export function effectiveModules(user: AppUser): string[] {
  if (user.vai_tro === "Admin") return DEFAULT_MODULES_BY_ROLE.Admin;
  const base = user.modules !== null ? user.modules : (user.vai_tro ? (DEFAULT_MODULES_BY_ROLE[user.vai_tro] ?? []) : []);
  if (user.la_ktv_dvbh || user.la_ve_tinh || user.la_kho || user.la_ke_toan) {
    return [...new Set([...base, "dat-mua-lk", "tra-hang"])];
  }
  return base;
}

export function hasModule(user: AppUser, moduleKey: string): boolean {
  return effectiveModules(user).includes(moduleKey);
}
