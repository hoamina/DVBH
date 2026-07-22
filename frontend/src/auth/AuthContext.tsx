import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ThemeConfig } from "../theme/presets";

export type VaiTro = "Admin" | "Viewer" | "QC" | "Giam sat" | "TBP DVBH" | "CSKH" | "TN CSKH" | "TBP CSKH";
export type GioiTinh = "nam" | "nu";

export interface AppUser {
  email: string;
  ten: string | null;
  ten_goi: string | null;
  gioi_tinh: GioiTinh | null;
  vai_tro: VaiTro | null;
  khu_vuc_phu_trach: string[];
  trang_thai_duyet: "Cho duyet" | "Da duyet" | "Tu choi";
  theme_config: ThemeConfig | null;
}

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "pending" }
  | { status: "rejected" }
  | { status: "authenticated"; user: AppUser; showDailyReport: boolean };

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (cancelled) return;
        if (res.ok) {
          const { user, showDailyReport } = (await res.json()) as { user: AppUser; showDailyReport: boolean };
          setState({ status: "authenticated", user, showDailyReport });
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (body.error === "PENDING_APPROVAL") setState({ status: "pending" });
        else if (body.error === "REJECTED") setState({ status: "rejected" });
        else setState({ status: "anonymous" });
      } catch {
        if (!cancelled) setState({ status: "anonymous" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phai dung trong AuthProvider");
  return ctx;
}

export const ROLES_XEM_TOAN_BO: VaiTro[] = ["Admin", "Viewer", "TBP DVBH", "TBP CSKH"];

export function scopeKhuVuc(user: AppUser): string[] | null {
  if (user.vai_tro && ROLES_XEM_TOAN_BO.includes(user.vai_tro)) return null;
  return user.khu_vuc_phu_trach.length ? user.khu_vuc_phu_trach : null;
}
