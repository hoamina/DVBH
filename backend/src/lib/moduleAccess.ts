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
// CHOT 2026-08-21 (yeu cau chu he thong): tam an 2 module nay khoi sidebar cho TOAN BO user, ke ca
// Admin va ke ca cac role-flag truoc day tu dong cap (la_ktv_dvbh/la_ve_tinh/la_kho/la_ke_toan/
// la_tac_nghiep/la_tp_dvbh, xem effectiveModules() ben duoi) - KHONG dong data/route/code, chi loc
// khoi danh sach hien thi. Bat lai: XOA mang nay (va doi chieu 2 dong featureDisabled() tuong ung
// trong routes/datMuaLinhKien.ts + routes/traHang.ts).
const TAM_TAT_MODULES = ["dat-mua-lk", "tra-hang"];

// "luy-ke" (Bao cao luy ke, them 2026-08-28) - cap cho DUNG nhung vai tro dang co "revenue" (bao
// cao cap quan ly, xem HANDOFF.md) - giu 2 danh sach nay khop nhau moi khi doi 1 trong 2.
export const DEFAULT_MODULES_BY_ROLE: Record<VaiTro, string[]> = {
  Admin: ["dashboard", "revenue", "luy-ke", "backlog", "missing-parts", "tranh-chap", "nap-gas", "survey", "ca-lap", "danh-sach-tong", "danh-muc-lk", "import", "settings", "users", "giao-dien"],
  Viewer: ["dashboard", "revenue", "luy-ke", "backlog", "missing-parts", "tranh-chap", "nap-gas", "survey", "ca-lap", "danh-sach-tong", "giao-dien"],
  QC: ["dashboard", "backlog", "missing-parts", "tranh-chap", "nap-gas", "survey", "ca-lap", "danh-sach-tong", "giao-dien"],
  "Giam sat": ["dashboard", "revenue", "luy-ke", "backlog", "missing-parts", "tranh-chap", "nap-gas", "ca-lap", "danh-sach-tong", "giao-dien"],
  "TBP DVBH": ["dashboard", "revenue", "luy-ke", "backlog", "missing-parts", "tranh-chap", "nap-gas", "ca-lap", "danh-sach-tong", "giao-dien"],
  CSKH: ["dashboard", "survey", "danh-sach-tong", "giao-dien"],
  "TN CSKH": ["dashboard", "survey", "danh-sach-tong", "giao-dien"],
  "TBP CSKH": ["dashboard", "revenue", "luy-ke", "survey", "danh-sach-tong", "giao-dien"],
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
 * cap them tu dong khi bat co la_ktv_dvbh / la_ve_tinh / la_kho / la_ke_toan / la_tac_nghiep /
 * la_tp_dvbh. Module "danh-muc-lk" (CHOT 2026-08-17, migration 0082) cap them tu dong khi bat
 * xem_danh_muc_lk (quyen XEM, mac dinh true tru CSKH/TN CSKH/TBP CSKH - migration 0084) HOAC
 * quan_ly_danh_muc_lk (quyen SUA ke thua duoc xem, phong truong hop Admin cap sua ma quen cap xem). */
export function effectiveModules(user: AppUser): string[] {
  if (user.vai_tro === "Admin") return DEFAULT_MODULES_BY_ROLE.Admin.filter((m) => !TAM_TAT_MODULES.includes(m));
  let mods = user.modules !== null ? user.modules : (user.vai_tro ? (DEFAULT_MODULES_BY_ROLE[user.vai_tro] ?? []) : []);
  if (user.la_ktv_dvbh || user.la_ve_tinh || user.la_kho || user.la_ke_toan || user.la_tac_nghiep || user.la_tp_dvbh) {
    mods = [...new Set([...mods, "dat-mua-lk", "tra-hang"])];
  }
  if (user.xem_danh_muc_lk || user.quan_ly_danh_muc_lk) {
    mods = [...new Set([...mods, "danh-muc-lk"])];
  }
  return mods.filter((m) => !TAM_TAT_MODULES.includes(m));
}

export function hasModule(user: AppUser, moduleKey: string): boolean {
  return effectiveModules(user).includes(moduleKey);
}

/**
 * RA SOAT BAO MAT 2026-08-18 (phan hoi Codex): 3 router "Dat mua linh kien"/"Phieu xuat kho"/"Don tra
 * hang" truoc day chi yeu cau verifySessionMiddleware+loadUser (dang nhap + da duyet) - KHONG kiem tra
 * hasModule() o dau ca, nghia la 1 tai khoan CSKH/Viewer/TN CSKH... hop le van goi duoc moi API cua 3
 * module nay qua URL/DevTools du sidebar khong hien. Ham nay dung LAM CONG UNION cua: (a) hasModule()
 * that su ("dat-mua-lk"/"tra-hang", ke ca khi Admin da tuy chinh rieng user.modules), CONG (b) toan bo
 * co role-flag/vai_tro ma cac router nay dang tu kiem tra rai rac o tung endpoint (la_ktv_dvbh/
 * la_ve_tinh/la_kho/la_ke_toan/la_tac_nghiep/la_tp_dvbh/QC/Giam sat/Admin) - PHAI hop ca 2 vi
 * DEFAULT_MODULES_BY_ROLE co chu y KHONG liet ke "dat-mua-lk"/"tra-hang" cho vai_tro=QC/"Giam sat"
 * (2 vai tro nay chi duoc cap qua role-flag rieng hoac Admin tuy chinh tay user.modules) - neu chi
 * dung hasModule() se chan nham ca nhung tai khoan QC/GS dang hoat dong dung qua cac ham canQC()/
 * scopeDatMuaNguoiTao() da co san trong tung route file.
 */
export function canAccessDatMuaLkArea(user: AppUser): boolean {
  return (
    user.vai_tro === "Admin" ||
    user.vai_tro === "QC" ||
    user.vai_tro === "Giam sat" ||
    user.la_ktv_dvbh ||
    user.la_ve_tinh ||
    user.la_kho ||
    user.la_ke_toan ||
    user.la_tac_nghiep ||
    user.la_tp_dvbh ||
    hasModule(user, "dat-mua-lk") ||
    hasModule(user, "tra-hang")
  );
}
