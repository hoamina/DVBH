export type ThemePresetKey =
  | "ocean"
  | "emerald"
  | "sunset"
  | "violet"
  | "graphite"
  | "rose"
  | "indigo"
  | "amber"
  | "crimson"
  | "teal"
  | "forest"
  | "steel"
  | "plum"
  | "custom";

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

export type FontKey = "inter" | "manrope" | "mono" | "serif" | "system" | "custom";

interface FontOptionDef {
  key: FontKey;
  label: string;
  stack: string;
}

// Chi dung font da nap san (Inter/Manrope/IBM Plex Mono qua @fontsource, xem tokens.css) hoac
// font he thong - khong them webfont moi de tranh phinh bundle.
export const FONT_OPTIONS: FontOptionDef[] = [
  { key: "inter", label: "Mặc định (Inter)", stack: '"Inter", ui-sans-serif, system-ui, sans-serif' },
  { key: "manrope", label: "Manrope (bo tròn)", stack: '"Manrope", ui-sans-serif, system-ui, sans-serif' },
  { key: "mono", label: "Đơn cách (Mono)", stack: '"IBM Plex Mono", ui-monospace, "Courier New", monospace' },
  { key: "serif", label: "Có chân (Serif)", stack: 'Georgia, "Times New Roman", serif' },
  { key: "system", label: "Hệ thống (System UI)", stack: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' },
];
export const DEFAULT_FONT: FontKey = "inter";

export function applyFont(key: FontKey | null | undefined) {
  const opt = FONT_OPTIONS.find((f) => f.key === key) ?? FONT_OPTIONS[0];
  document.documentElement.style.setProperty("--font-body", opt.stack);
}

export interface ThemeConfig {
  preset: ThemePresetKey;
  custom?: ThemeCustomColors;
  font?: FontKey;
}

interface ThemePresetDef {
  key: Exclude<ThemePresetKey, "custom">;
  label: string;
  colors: ThemeCustomColors;
}

// bg/surface/line/ink giu gan nhu co dinh, sang, trung tinh o moi preset (an toan - tranh xung
// dot voi cac mang bg-slate-100 hover-state chua theme duoc); doi manh mau nhan (nut) + top +
// gradient thanh menu ben trai (sidebarFrom/sidebarTo, ~0.22/~0.34 do sang cua accent - xem
// deriveSidebarShades) de moi preset nhin ro khac biet ca o menu, khong chi o nut bam.
// Preset "ocean" = dung nguyen gia tri hien co trong tokens.css, dam bao user chua tung vao cai
// dat khong thay gi doi khac.
export const THEME_PRESETS: ThemePresetDef[] = [
  {
    key: "ocean",
    label: "Đại dương",
    colors: {
      accent: "#1591c9", accentDark: "#1176a6", accentTint: "#ddf1fb", bg: "#f2f6f9", surface: "#ffffff", topbar: "#ffffff", line: "#e1eaf0", ink: "#0f2536",
      sidebarFrom: "#052033", sidebarTo: "#06304a",
    },
  },
  {
    key: "emerald",
    label: "Ngọc lục bảo",
    colors: {
      accent: "#159c6b", accentDark: "#0e7a54", accentTint: "#daf5ea", bg: "#f1f8f4", surface: "#ffffff", topbar: "#ffffff", line: "#dcefe4", ink: "#0f2b22",
      sidebarFrom: "#04241a", sidebarTo: "#0b3d2c",
    },
  },
  {
    key: "sunset",
    label: "Hoàng hôn",
    colors: {
      accent: "#e06b2e", accentDark: "#b8541a", accentTint: "#fbe8d9", bg: "#fbf6f1", surface: "#ffffff", topbar: "#ffffff", line: "#f0e0d3", ink: "#33210f",
      sidebarFrom: "#2b1608", sidebarTo: "#4a2712",
    },
  },
  {
    key: "violet",
    label: "Tím than",
    colors: {
      accent: "#6d5bd0", accentDark: "#5544b0", accentTint: "#e8e4fa", bg: "#f6f4fc", surface: "#ffffff", topbar: "#ffffff", line: "#e4e0f5", ink: "#211b3d",
      sidebarFrom: "#17102e", sidebarTo: "#291f4d",
    },
  },
  {
    key: "graphite",
    label: "Than chì",
    colors: {
      accent: "#475569", accentDark: "#334155", accentTint: "#e2e8f0", bg: "#f8fafc", surface: "#ffffff", topbar: "#ffffff", line: "#e2e8f0", ink: "#1e293b",
      sidebarFrom: "#0f172a", sidebarTo: "#1e293b",
    },
  },
  {
    key: "rose",
    label: "Hồng đào",
    colors: {
      accent: "#d1477e", accentDark: "#a8305f", accentTint: "#fbe3ee", bg: "#fdf3f7", surface: "#ffffff", topbar: "#ffffff", line: "#f5dde6", ink: "#3a0f22",
      sidebarFrom: "#2b0a1a", sidebarTo: "#4a1530",
    },
  },
  {
    key: "indigo",
    label: "Chàm",
    colors: {
      accent: "#4338ca", accentDark: "#332a99", accentTint: "#e2e0fb", bg: "#f4f4fd", surface: "#ffffff", topbar: "#ffffff", line: "#e2e2f5", ink: "#1e1b4b",
      sidebarFrom: "#0e0b2e", sidebarTo: "#1e1a4d",
    },
  },
  {
    key: "amber",
    label: "Hổ phách",
    colors: {
      accent: "#c68a12", accentDark: "#9c6d0d", accentTint: "#faedd0", bg: "#fdf8ee", surface: "#ffffff", topbar: "#ffffff", line: "#f2e4c4", ink: "#3a2a09",
      sidebarFrom: "#2b1d05", sidebarTo: "#4a3208",
    },
  },
  {
    key: "crimson",
    label: "Rượu vang",
    colors: {
      accent: "#a3223e", accentDark: "#7e1a30", accentTint: "#f6dde2", bg: "#fdf4f5", surface: "#ffffff", topbar: "#ffffff", line: "#f0d9dc", ink: "#380d15",
      sidebarFrom: "#250509", sidebarTo: "#3f0d14",
    },
  },
  {
    key: "teal",
    label: "Ngọc lam",
    colors: {
      accent: "#0d9488", accentDark: "#0a7268", accentTint: "#d3f3ef", bg: "#f0faf8", surface: "#ffffff", topbar: "#ffffff", line: "#d7ede9", ink: "#052e2b",
      sidebarFrom: "#042523", sidebarTo: "#0a3f3a",
    },
  },
  {
    key: "forest",
    label: "Rừng sâu",
    colors: {
      accent: "#2f6b3a", accentDark: "#23532c", accentTint: "#ddeee0", bg: "#f3f8f3", surface: "#ffffff", topbar: "#ffffff", line: "#dceadd", ink: "#12291a",
      sidebarFrom: "#0b1f10", sidebarTo: "#163a1e",
    },
  },
  {
    key: "steel",
    label: "Xanh thép",
    colors: {
      accent: "#3b6b88", accentDark: "#2c516a", accentTint: "#dcebf1", bg: "#f2f7f9", surface: "#ffffff", topbar: "#ffffff", line: "#dde9ee", ink: "#16262e",
      sidebarFrom: "#0d1a20", sidebarTo: "#1c333d",
    },
  },
  {
    key: "plum",
    label: "Mận chín",
    colors: {
      accent: "#8a3a9e", accentDark: "#6c2c7c", accentTint: "#f0dcf5", bg: "#faf4fb", surface: "#ffffff", topbar: "#ffffff", line: "#ecdcf0", ink: "#2c0f33",
      sidebarFrom: "#1f0a24", sidebarTo: "#35123d",
    },
  },
];

export const DEFAULT_THEME: ThemeConfig = { preset: "ocean" };

export function resolveThemeColors(config: ThemeConfig | null | undefined): ThemeCustomColors {
  if (!config) return THEME_PRESETS[0].colors;
  if (config.preset === "custom" && config.custom) {
    const c = config.custom;
    // Cau hinh custom da luu truoc khi them sidebarFrom/sidebarTo se thieu 2 truong nay -
    // suy ra tu accent thay vi bat nguoi dung luu lai.
    if (!c.sidebarFrom || !c.sidebarTo) return { ...c, ...deriveSidebarShades(c.accent) };
    return c;
  }
  return THEME_PRESETS.find((p) => p.key === config.preset)?.colors ?? THEME_PRESETS[0].colors;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, n));
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((x) => clamp(Math.round(x)).toString(16).padStart(2, "0")).join("");
}

// Tu mau nhan (accent) nguoi dung chon o che do tuy chinh, tu tinh ra ban dam hon (hover) va ban
// nhat/tint (nen phu) thay vi bat nguoi dung chon them 2 o mau rieng cho 6 vi tri da neu.
export function deriveAccentShades(accentHex: string): { accentDark: string; accentTint: string } {
  const [r, g, b] = hexToRgb(accentHex);
  const accentDark = rgbToHex(r * 0.75, g * 0.75, b * 0.75);
  const accentTint = rgbToHex(r + (255 - r) * 0.85, g + (255 - g) * 0.85, b + (255 - b) * 0.85);
  return { accentDark, accentTint };
}

// Gradient toi cho thanh menu ben trai, suy tu accent (~0.22/0.34 do sang) thay vi bat nguoi
// dung tuy chinh chon them 2 mau rieng - he so nay khop voi cap ocean-950/ocean-900 hien co.
export function deriveSidebarShades(accentHex: string): { sidebarFrom: string; sidebarTo: string } {
  const [r, g, b] = hexToRgb(accentHex);
  const sidebarFrom = rgbToHex(r * 0.22, g * 0.22, b * 0.22);
  const sidebarTo = rgbToHex(r * 0.34, g * 0.34, b * 0.34);
  return { sidebarFrom, sidebarTo };
}

// Mau chu/overlay tren thanh menu ben trai phai doi theo do sang cua sidebarFrom - vi nguoi dung
// co the tu chon mau sidebar rat sang o che do Tuy chinh, luc do chu trang se bien mat neu cu
// gan cung mau trang nhu truoc. Tinh do sang theo cong thuc luminance pho thong (ITU-R BT.601).
export function deriveSidebarInk(sidebarFromHex: string): { sidebarInk: string; sidebarInkMid: string; sidebarInkDim: string; sidebarHighlight: string } {
  const [r, g, b] = hexToRgb(sidebarFromHex);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  if (brightness > 150) {
    return { sidebarInk: "rgba(15,37,54,0.95)", sidebarInkMid: "rgba(15,37,54,0.75)", sidebarInkDim: "rgba(15,37,54,0.55)", sidebarHighlight: "rgba(15,37,54,0.10)" };
  }
  return { sidebarInk: "#ffffff", sidebarInkMid: "rgba(255,255,255,0.8)", sidebarInkDim: "rgba(255,255,255,0.58)", sidebarHighlight: "rgba(255,255,255,0.14)" };
}

export function applyThemeColors(colors: ThemeCustomColors) {
  const root = document.documentElement.style;
  root.setProperty("--ocean-500", colors.accent);
  root.setProperty("--ocean-600", colors.accentDark);
  root.setProperty("--ocean-100", colors.accentTint);
  root.setProperty("--bg", colors.bg);
  root.setProperty("--surface", colors.surface);
  root.setProperty("--topbar-bg", colors.topbar);
  root.setProperty("--line", colors.line);
  root.setProperty("--ink-900", colors.ink);
  root.setProperty("--sidebar-from", colors.sidebarFrom);
  root.setProperty("--sidebar-to", colors.sidebarTo);
  const ink = deriveSidebarInk(colors.sidebarFrom);
  root.setProperty("--sidebar-ink", ink.sidebarInk);
  root.setProperty("--sidebar-ink-mid", ink.sidebarInkMid);
  root.setProperty("--sidebar-ink-dim", ink.sidebarInkDim);
  root.setProperty("--sidebar-highlight", ink.sidebarHighlight);
}
