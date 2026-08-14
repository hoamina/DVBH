import { useEffect, useState, type ReactNode } from "react";
import { applyFont, applyThemeColors, resolveThemeColors, resolveEffectiveThemeConfig, DEFAULT_FONT } from "./presets";
import { applyCustomFontFromCache } from "../lib/customFont";
import { loadLocalThemeConfig } from "./localThemeConfig";

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Giao dien tu 2026-08-13 la config CUC BO (localStorage may nay), khong con phu thuoc
  // auth.user.theme_config/server. "Tung" random (neu dang o che do ngau nhien) DUY NHAT 1 LAN
  // khi component nay mount (moi lan mo app) - xem resolveEffectiveThemeConfig trong presets.ts.
  const [effectiveConfig] = useState(() => resolveEffectiveThemeConfig(loadLocalThemeConfig()));

  useEffect(() => {
    applyThemeColors(resolveThemeColors(effectiveConfig));

    if (effectiveConfig.font === "custom") {
      // Font tuy chinh chi ton tai trong cache cua TRINH DUYET NAY (xem lib/customFont.ts) - neu
      // may/trinh duyet khac chua tung tai file (hoac cache bi hong/bi trinh duyet xoa) thi tu
      // dong lui ve font mac dinh, khong de trang bi vo font.
      applyCustomFontFromCache().then((ok) => {
        if (!ok) applyFont(DEFAULT_FONT);
      });
      return;
    }
    applyFont(effectiveConfig.font);
  }, [effectiveConfig]);

  return <>{children}</>;
}
