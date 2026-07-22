import { getCachedEntry, setCachedEntry } from "./closedDataCache";

/**
 * Font tuy chinh nguoi dung tu tai tu may (.ttf/.otf/.woff/.woff2) - CHI luu cache noi bo tren
 * trinh duyet (IndexedDB, dung chung store voi closedDataCache.ts), KHONG gui file len server
 * (theme_config.font o DB chi luu marker "custom", xem ThemeProvider.tsx). Vi vay font tuy chinh
 * KHONG dong bo qua thiet bi/trinh duyet khac - mo lai o may khac se tu dong fallback ve font
 * mac dinh (dung y logic voi truong hop file cache bi hong/mat).
 */

const CUSTOM_FONT_CACHE_KEY = "custom-font";
export const CUSTOM_FONT_FAMILY = "UserCustomFont";
const MAX_FONT_BYTES = 8 * 1024 * 1024; // 8MB - du cho hau het webfont ca nhan

interface CustomFontData {
  fileName: string;
  data: ArrayBuffer;
}

export function isSupportedFontFile(file: File): boolean {
  return /\.(ttf|otf|woff2?|ttc)$/i.test(file.name);
}

export async function saveCustomFont(file: File): Promise<void> {
  if (file.size > MAX_FONT_BYTES) throw new Error("File font quá lớn (tối đa 8MB).");
  const data = await file.arrayBuffer();
  // Thu load truoc khi luu cache - phat hien som file hong/sai dinh dang thay vi luu rac vao cache.
  const face = new FontFace(CUSTOM_FONT_FAMILY, data);
  await face.load();
  await setCachedEntry<CustomFontData>(CUSTOM_FONT_CACHE_KEY, { fileName: file.name, data });
}

export async function getCustomFontFileName(): Promise<string | null> {
  const entry = await getCachedEntry<CustomFontData>(CUSTOM_FONT_CACHE_KEY);
  return entry?.data?.fileName ?? null;
}

export async function clearCustomFont(): Promise<void> {
  await setCachedEntry<CustomFontData | null>(CUSTOM_FONT_CACHE_KEY, null);
}

/** Nap font tuy chinh tu cache va dang ky voi trinh duyet. Tra ve false o BAT KY buoc nao that
 * bai (khong co cache, du lieu hong, may nay chua tung tai file) - noi goi phai tu fallback ve
 * font mac dinh khi nhan false. */
export async function applyCustomFontFromCache(): Promise<boolean> {
  try {
    const entry = await getCachedEntry<CustomFontData>(CUSTOM_FONT_CACHE_KEY);
    if (!entry?.data?.data) return false;
    const face = new FontFace(CUSTOM_FONT_FAMILY, entry.data.data);
    await face.load();
    document.fonts.add(face);
    document.documentElement.style.setProperty("--font-body", `"${CUSTOM_FONT_FAMILY}", "Inter", ui-sans-serif, system-ui, sans-serif`);
    return true;
  } catch {
    return false;
  }
}
