import type { ThemeConfig } from "./presets";

/**
 * Giao dien (gam mau + phong chu) tu 2026-08-13 la tuy chinh RIENG THIET BI - CHI luu localStorage
 * may nay, KHONG con doc/ghi ve server (giam ghi/doc D1 khong can thiet - xem CLAUDE.md "D1
 * read-budget discipline"). Dang nhap o may/trinh duyet khac se thay lai gia tri mac dinh (ngau
 * nhien), khong dong bo qua thiet bi - cung co che voi font tuy chinh da co san (lib/customFont.ts).
 * Rieng "Thong tin ca nhan" (ten_goi, gioi_tinh) VAN luu server nhu cu (xem routes/auth.ts) - chi
 * phan Giao dien nay chuyen sang local.
 */
const STORAGE_KEY = "theme-config";

// Mac dinh: ca gam mau va phong chu deu o CHE DO NGAU NHIEN cho den khi nguoi dung tu chon 1 gia
// tri co dinh (xem resolveEffectiveThemeConfig trong presets.ts).
export const DEFAULT_LOCAL_THEME_CONFIG: ThemeConfig = { preset: "random", font: "random" };

export function loadLocalThemeConfig(): ThemeConfig {
  if (typeof window === "undefined") return DEFAULT_LOCAL_THEME_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LOCAL_THEME_CONFIG;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.preset !== "string") return DEFAULT_LOCAL_THEME_CONFIG;
    return parsed as ThemeConfig;
  } catch {
    return DEFAULT_LOCAL_THEME_CONFIG;
  }
}

export function saveLocalThemeConfig(config: ThemeConfig) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // localStorage day/bi chan (che do an danh, quota...) - bo qua, khong chan doi giao dien tren
    // man hinh hien tai, chi la lan sau mo lai se khong nho lua chon.
  }
}
