import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type VaiTro = "Admin" | "Viewer" | "QC" | "Giam sat" | "TBP DVBH" | "CSKH" | "TN CSKH" | "TBP CSKH" | "KSNB Doi tac";
export type GioiTinh = "nam" | "nu";

export interface AppUser {
  email: string;
  ten: string | null;
  ten_goi: string | null;
  gioi_tinh: GioiTinh | null;
  vai_tro: VaiTro | null;
  khu_vuc_phu_trach: string[];
  trang_thai_duyet: "Cho duyet" | "Da duyet" | "Tu choi";
  // Co rieng "KSNB Doi tac", tach khoi vai_tro - xem backend/src/types.ts.
  la_ksnb_doi_tac: boolean;
  // Danh sach module (sidebar) tuy chinh rieng - xem backend/src/types.ts + migration 0042. NULL =
  // chua tuy chinh (dung ROLE_MODULES[vai_tro] mac dinh, xem layout/navConfig.ts).
  modules: string[] | null;
  // Khoa tai khoan - xem backend/src/types.ts + migration 0043. Luon false o day tren thuc te vi
  // tai khoan bi khoa bi chan tai loadUser.ts, khong bao gio den duoc trang thai "authenticated".
  bi_khoa: boolean;
  // Quyen import hang loat tranh chap theo ID - xem backend/src/types.ts + migration 0052.
  co_the_import_tranh_chap: boolean;
  // Cac co module "Dat mua linh kien" - xem backend/src/types.ts + migration 0053.
  la_ktv_dvbh: boolean;
  la_ve_tinh: boolean;
  la_kho: boolean;
  la_ke_toan: boolean;
  // Nguoi duyet don mua/PXK/tra hang ("TN") - tach doc lap khoi vai_tro="TBP DVBH", xem
  // backend/src/types.ts + migration 0081.
  la_tac_nghiep: boolean;
  // Xac nhan "linh kien dac thu" truoc buoc Tac nghiep - xem backend/src/types.ts + migration 0082.
  la_tp_dvbh: boolean;
  // Quyen SUA module "Danh muc linh kien" - xem backend/src/types.ts + migration 0082.
  quan_ly_danh_muc_lk: boolean;
  // Quyen XEM module "Danh muc linh kien" - doc lap voi quan_ly_danh_muc_lk, mac dinh true tru
  // CSKH/TN CSKH/TBP CSKH - xem backend/src/types.ts + migration 0084.
  xem_danh_muc_lk: boolean;
  tram_cha: string | null;
  giam_sat_quan_ly: string | null;
  // Tinh o backend (GET /api/auth/me, khong phai cot DB) - true khi co it nhat 1 Ve tinh voi
  // tram_cha = email minh. Thay the heuristic cu `la_ktv_dvbh && !tram_cha` (GD4, phan hoi Codex
  // #16/#17, module Dat mua linh kien) - heuristic do sai voi KTV thuong khong quan ly Ve tinh nao.
  la_tram: boolean;
}

type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "pending" }
  | { status: "rejected" }
  | { status: "disabled" }
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
        else if (body.error === "DISABLED") setState({ status: "disabled" });
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

// Giu dong bo voi backend/src/types.ts (QC them 2026-07-29 - xem chu thich o do).
export const ROLES_XEM_TOAN_BO: VaiTro[] = ["Admin", "Viewer", "TBP DVBH", "TBP CSKH", "QC"];

// Giu dong bo voi scopeByKhuVuc() trong backend/src/middleware/scopeByKhuVuc.ts - "Viewer" la
// truong hop rieng (chot 2026-07-29): mac dinh xem toan bo khi chua gan khu vuc, nhung neu duoc
// gan 1-2 khu vuc cu the thi chi xem duoc dung khu vuc do (giong Giam sat).
export function scopeKhuVuc(user: AppUser): string[] | null {
  if (user.vai_tro === "Viewer") return user.khu_vuc_phu_trach.length ? user.khu_vuc_phu_trach : null;
  if (user.vai_tro && ROLES_XEM_TOAN_BO.includes(user.vai_tro)) return null;
  return user.khu_vuc_phu_trach.length ? user.khu_vuc_phu_trach : null;
}
