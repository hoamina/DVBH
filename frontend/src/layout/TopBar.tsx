import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AppUser } from "../auth/AuthContext";
import { api } from "../api/client";
import { fmtDateTime, fmtVND } from "../types";
import { clearAllCache } from "../lib/closedDataCache";
import { Greeting } from "../components/Greeting";
import { LoadingInline } from "../components/ui/LoadingInline";

interface DailyReport {
  scope: "khu_vuc" | "toan_he_thong";
  khuVucList: string[];
  tonTren3Ngay: number;
  thieuLinhKien: number;
  nghiNgoViPham: number;
  doanhThuThang: number;
}

function GlobalSearch({ onFound }: { onFound: (id: string | null) => void }) {
  const [q, setQ] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    try {
      const res = await api.get<{ found: string | null }>(`/cases/search?q=${encodeURIComponent(q.trim())}`);
      onFound(res.found);
      if (res.found) setQ("");
    } catch {
      onFound(null);
    }
  }

  return (
    <form onSubmit={submit} className="relative w-40 sm:w-52 shrink-0 hidden sm:block">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-400)] text-sm">🔍</span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tra cứu ID/Serial…"
        className="focus-ring w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 border border-transparent focus:bg-white focus:border-[var(--ocean-400)] text-sm"
      />
    </form>
  );
}

export function TopBar({
  role,
  user,
  onSearch,
  onOpenMobileMenu,
  onNavigate,
}: {
  role: string;
  user: AppUser;
  onSearch: (id: string | null) => void;
  onOpenMobileMenu: () => void;
  onNavigate?: (module: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const { data: counts } = useQuery({
    queryKey: ["notifications-count"],
    queryFn: () => api.get<{ canGiaiTrinh: number; choQc: number }>("/notifications/count"),
    refetchInterval: 60_000,
  });
  const notifCount = (counts?.canGiaiTrinh ?? 0) + (counts?.choQc ?? 0);

  const { data: dailyReport } = useQuery({
    queryKey: ["daily-report"],
    queryFn: () => api.get<DailyReport>("/dashboard/daily-report"),
    enabled: notifOpen,
  });

  const { data: syncStatus } = useQuery({
    queryKey: ["sync-status"],
    queryFn: () => api.get<{ lastSynced: string | null }>("/dashboard/sync-status"),
    refetchInterval: 5 * 60_000,
  });

  useEffect(() => {
    function onClickOutside() {
      setMenuOpen(false);
      setNotifOpen(false);
    }
    if (menuOpen || notifOpen) document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, [menuOpen, notifOpen]);

  function goTo(module: string) {
    setNotifOpen(false);
    onNavigate?.(module);
  }

  async function logout() {
    await api.post("/auth/logout");
    await clearAllCache();
    window.location.href = "/";
  }

  const displayName = user.ten || user.email;

  return (
    <header className="h-16 bg-[var(--topbar-bg)] border-b border-[var(--line)] flex items-center gap-4 px-5 sticky top-0 z-30">
      <button onClick={onOpenMobileMenu} className="focus-ring md:hidden w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-[var(--ink-600)]">
        ☰
      </button>
      <GlobalSearch onFound={onSearch} />
      <Greeting />
      <div className="ml-auto flex items-center gap-3">
        <button onClick={() => goTo("giao-dien")} className="focus-ring w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-base" title="Đổi giao diện">
          🎨
        </button>
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="focus-ring relative w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-[var(--ink-600)]"
            title="Thông báo"
          >
            <span className="bell-shake">🔔</span>
            {notifCount > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[var(--coral-500)]"></span>}
          </button>
          {notifOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-lg py-1.5 anim-in">
              <div className="px-3.5 py-2 text-xs text-[var(--ink-600)] border-b border-[var(--line)] flex items-center gap-1.5" title="Thời gian tiếp nhận của ca gần nhất đã được import vào hệ thống">
                <span>🔄</span>
                <span>
                  Đồng bộ đến: <b className="font-semibold">{syncStatus?.lastSynced ? fmtDateTime(syncStatus.lastSynced) : "—"}</b>
                </span>
              </div>
              <div className="px-3.5 py-2 text-xs font-semibold text-[var(--ink-400)] border-b border-[var(--line)]">Việc cần xử lý</div>
              <button onClick={() => goTo("backlog")} className="w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 flex items-center justify-between">
                <span>Ca cần giải trình</span>
                <span className="font-semibold text-[var(--coral-500)]">{counts?.canGiaiTrinh ?? 0}</span>
              </button>
              <button onClick={() => goTo("survey")} className="w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 flex items-center justify-between">
                <span>Ca chờ QC chốt cấp 2</span>
                <span className="font-semibold text-[var(--coral-500)]">{counts?.choQc ?? 0}</span>
              </button>
              <div className="px-3.5 py-2 text-xs font-semibold text-[var(--ink-400)] border-y border-[var(--line)] mt-1">📊 Báo cáo nhanh trong ngày</div>
              {dailyReport ? (
                <>
                  <button onClick={() => goTo("backlog")} className="w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 flex items-center justify-between">
                    <span>Tồn &gt;3 ngày cần giải trình</span>
                    <span className="font-semibold">{dailyReport.tonTren3Ngay}</span>
                  </button>
                  <button onClick={() => goTo("missing-parts")} className="w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 flex items-center justify-between">
                    <span>Ca thiếu linh kiện tồn đọng</span>
                    <span className="font-semibold">{dailyReport.thieuLinhKien}</span>
                  </button>
                  <button onClick={() => goTo("survey")} className="w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 flex items-center justify-between">
                    <span>Ca nghi ngờ vi phạm</span>
                    <span className="font-semibold">{dailyReport.nghiNgoViPham}</span>
                  </button>
                  <div className="w-full px-3.5 py-2 text-sm flex items-center justify-between">
                    <span>Doanh thu tháng này</span>
                    <span className="font-semibold text-[var(--teal-500)]">{fmtVND(dailyReport.doanhThuThang)}</span>
                  </div>
                  {dailyReport.scope === "khu_vuc" && dailyReport.khuVucList.length > 0 && (
                    <div className="px-3.5 pb-2 text-[10px] text-[var(--ink-400)]">Khu vực: {dailyReport.khuVucList.join(", ")}</div>
                  )}
                </>
              ) : (
                <div className="px-3.5 py-3">
                  <LoadingInline className="text-xs text-[var(--ink-400)] italic" />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setMenuOpen(!menuOpen)} className="focus-ring flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-100">
            <div className="w-8 h-8 rounded-full bg-[var(--ocean-500)] text-white flex items-center justify-center text-xs font-bold">
              {displayName.trim().split(" ").slice(-1)[0]?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-semibold leading-tight">{displayName}</div>
              <div className="text-[10px] text-[var(--ink-400)] leading-tight">{role}</div>
            </div>
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-lg py-1.5 anim-in">
              <div className="px-3.5 py-2 text-xs text-[var(--ink-400)] border-b border-[var(--line)] truncate">{user.email}</div>
              <button onClick={logout} className="w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 text-[var(--coral-500)]">
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
