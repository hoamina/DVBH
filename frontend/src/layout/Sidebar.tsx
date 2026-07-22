import { useQuery } from "@tanstack/react-query";
import type { VaiTro } from "../auth/AuthContext";
import { NAV_GROUPS, ROLE_MODULES, type NavItem } from "./navConfig";
import { useIsMobile } from "../hooks/useMediaQuery";
import { APP_VERSION } from "../version";
import { api } from "../api/client";

interface NotificationCounts {
  canGiaiTrinh: number;
  choQc: number;
  caThieuLinhKien: number;
  khaoSat: number;
  caLap: number;
}
const COUNT_FIELD: Record<NonNullable<NavItem["countKey"]>, keyof NotificationCounts> = {
  backlog: "canGiaiTrinh",
  missingParts: "caThieuLinhKien",
  survey: "khaoSat",
  caLap: "caLap",
};

export function Sidebar({
  active,
  setActive,
  role,
  collapsed,
  setCollapsed,
  mobileOpen,
  onMobileClose,
}: {
  active: string;
  setActive: (key: string) => void;
  role: VaiTro;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  const isMobile = useIsMobile();
  const allowed = ROLE_MODULES[role] ?? [];
  // Cung queryKey voi TopBar.tsx ("notifications-count") de dung chung 1 cache/fetch, khong goi API
  // 2 lan cho cung 1 du lieu - refetchInterval PHAI khop voi TopBar.tsx, neu khong observer nao co
  // interval ngan hon se ep query chay theo nhip do (xem comment trong TopBar.tsx ve chi phi D1).
  const { data: counts } = useQuery({
    queryKey: ["notifications-count"],
    queryFn: () => api.get<NotificationCounts>("/notifications/count"),
    refetchInterval: 5 * 60_000,
  });

  const content = (
    <aside
      className={`ripple-bg h-full flex flex-col transition-all duration-200 ${isMobile ? "w-64" : collapsed ? "w-[72px]" : "w-64"}`}
      style={{ background: "linear-gradient(180deg, var(--sidebar-from), var(--sidebar-to) 60%)" }}
    >
      <div className="flex items-center gap-2.5 px-4 h-16 shrink-0 border-b border-[var(--sidebar-highlight)]">
        <img src="/logo-37.png" alt="Ông Thợ 3T" width={30} height={30} className="shrink-0 rounded-md" />
        {(!collapsed || isMobile) && (
          <div className="leading-tight">
            <div className="font-display font-extrabold text-[var(--sidebar-ink)] text-sm tracking-tight">ÔNG THỢ 3T - DVBH</div>
            <div className="text-[10px] text-[var(--sidebar-ink-dim)] font-medium">Giải trình tồn &amp; SLA</div>
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto sidebar-scroll py-3 px-2.5">
        {NAV_GROUPS.map((g) => {
          const items = g.items.filter((i) => allowed.includes(i.key));
          if (items.length === 0) return null;
          return (
            <div key={g.label} className="mb-4">
              {(!collapsed || isMobile) && <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--sidebar-ink-dim)] px-2.5 mb-1.5">{g.label}</div>}
              {items.map((it) => {
                const count = it.countKey && counts ? counts[COUNT_FIELD[it.countKey]] : 0;
                return (
                  <button
                    key={it.key}
                    onClick={() => {
                      setActive(it.key);
                      if (isMobile) onMobileClose();
                    }}
                    className={`focus-ring w-full flex items-center gap-3 px-2.5 py-2 rounded-xl mb-0.5 text-sm font-semibold transition-colors border-l-[3px] ${
                      active === it.key
                        ? "bg-[var(--sidebar-highlight)] text-[var(--sidebar-ink)] border-[var(--ocean-500)]"
                        : "border-transparent text-[var(--sidebar-ink-mid)] hover:bg-[var(--sidebar-highlight)] hover:text-[var(--sidebar-ink)]"
                    }`}
                  >
                    <span className="w-6 text-center text-base">{it.icon}</span>
                    {(!collapsed || isMobile) && (
                      <span className="truncate flex-1 text-left">
                        {it.label}
                        {count > 0 && <span className="text-[var(--sidebar-ink-dim)] font-medium"> ({count})</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>
      {!isMobile && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="focus-ring m-2.5 py-2 rounded-xl text-[var(--sidebar-ink-dim)] hover:bg-[var(--sidebar-highlight)] hover:text-[var(--sidebar-ink)] text-xs font-semibold"
        >
          {collapsed ? "»" : "« Thu gọn"}
        </button>
      )}
      {(!collapsed || isMobile) && (
        <div className="px-3.5 pb-3 pt-1 text-[9px] leading-snug text-[var(--sidebar-ink-dim)] shrink-0">
          Hệ thống nội bộ không chia sẻ dưới mọi hình thức.
          <br />
          Phiên bản v{APP_VERSION}
        </div>
      )}
    </aside>
  );

  if (isMobile) {
    return (
      <div className={`fixed inset-0 z-50 ${mobileOpen ? "" : "pointer-events-none"}`}>
        <div onClick={onMobileClose} className={`absolute inset-0 bg-[rgba(6,32,51,0.45)] transition-opacity duration-200 ${mobileOpen ? "opacity-100" : "opacity-0"}`} />
        <div className={`absolute left-0 top-0 h-full transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>{content}</div>
      </div>
    );
  }

  return <div className="h-screen sticky top-0">{content}</div>;
}
