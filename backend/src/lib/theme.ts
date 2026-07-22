export const THEME_PRESETS = [
  "ocean",
  "emerald",
  "sunset",
  "violet",
  "graphite",
  "rose",
  "indigo",
  "amber",
  "crimson",
  "teal",
  "forest",
  "steel",
  "plum",
  "custom",
] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

export const FONT_KEYS = [
  "inter",
  "manrope",
  "mono",
  "serif",
  "system",
  "arial",
  "times",
  "verdana",
  "tahoma",
  "trebuchet",
  "segoe",
  "calibri",
  "cambria",
  "garamond",
  "palatino",
  "century-gothic",
  "impact",
  "comic-sans",
  "consolas",
  "custom",
] as const;
export type FontKey = (typeof FONT_KEYS)[number];

export interface ThemeCustomColors {
  accent: string;
  accentDark: string;
  accentTint: string;
  bg: string;
  surface: string;
  topbar: string;
  line: string;
  ink: string;
  sidebarFrom: string;
  sidebarTo: string;
}

export interface ThemeConfig {
  preset: ThemePreset;
  custom?: ThemeCustomColors;
  font?: FontKey;
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const CUSTOM_KEYS: (keyof ThemeCustomColors)[] = ["accent", "accentDark", "accentTint", "bg", "surface", "topbar", "line", "ink", "sidebarFrom", "sidebarTo"];

// Validate cau truc ThemeConfig tu du lieu chua tin cay (body JSON nguoi dung gui len).
// Tra null neu khong hop le - de route tu quyet dinh tra 400, khong throw o day.
export function sanitizeThemeConfig(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const preset = obj.preset;
  if (typeof preset !== "string" || !(THEME_PRESETS as readonly string[]).includes(preset)) return null;

  let font: FontKey | undefined;
  if (obj.font !== undefined) {
    if (typeof obj.font !== "string" || !(FONT_KEYS as readonly string[]).includes(obj.font)) return null;
    font = obj.font as FontKey;
  }

  if (preset !== "custom") {
    return JSON.stringify({ preset, ...(font ? { font } : {}) });
  }

  const custom = obj.custom;
  if (!custom || typeof custom !== "object") return null;
  const customObj = custom as Record<string, unknown>;
  const validated: Partial<ThemeCustomColors> = {};
  for (const key of CUSTOM_KEYS) {
    const value = customObj[key];
    if (typeof value !== "string" || !HEX_RE.test(value)) return null;
    validated[key] = value;
  }
  return JSON.stringify({ preset: "custom", custom: validated, ...(font ? { font } : {}) });
}

export function parseThemeConfig(raw: string | null | undefined): ThemeConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.preset !== "string") return null;
    return parsed as ThemeConfig;
  } catch {
    return null;
  }
}
