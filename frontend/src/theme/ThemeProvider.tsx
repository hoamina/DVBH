import { useEffect, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { applyFont, applyThemeColors, resolveThemeColors, DEFAULT_FONT } from "./presets";
import { applyCustomFontFromCache } from "../lib/customFont";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const themeConfig = auth.status === "authenticated" ? auth.user.theme_config : null;

  useEffect(() => {
    applyThemeColors(resolveThemeColors(themeConfig));

    if (themeConfig?.font === "custom") {
      // Font tuy chinh chi ton tai trong cache cua TRINH DUYET NAY (xem lib/customFont.ts) - neu
      // may/trinh duyet khac chua tung tai file (hoac cache bi hong/bi trinh duyet xoa) thi tu
      // dong lui ve font mac dinh, khong de trang bi vo font.
      applyCustomFontFromCache().then((ok) => {
        if (!ok) applyFont(DEFAULT_FONT);
      });
      return;
    }
    applyFont(themeConfig?.font);
  }, [themeConfig]);

  return <>{children}</>;
}
