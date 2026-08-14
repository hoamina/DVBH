import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AppUser } from "../auth/AuthContext";
import { api } from "../api/client";
import { fmtDateTime, fmtVND } from "../types";
import { clearAllCache } from "../lib/closedDataCache";
import { Greeting } from "../components/Greeting";
import { LoadingInline } from "../components/ui/LoadingInline";
import { fmtGeneratedAt } from "../lib/formatSnapshotTime";
import { SearchResultsPopup, type SearchMatchRow } from "../components/SearchResultsPopup";
import { shortKhuVuc } from "../lib/khuVucShortLabel";

interface DeltaBucket {
  baseline: number;
  resolved: number;
  remaining: number;
}

// CHOT 2026-08-01: khop dung DailyReportWithDeltaPayload cua backend/src/lib/dailySnapshot.ts -
// "Bao cao ngay 08:00" (dong bang + delta trong ngay), chuong thong bao "an theo" bao cao nay thay
// vi tinh song (truoc day interface o day sai hoan toan shape thuc te - tonTren3Ngay/nghiNgoViPham
// khong con ton tai - la nguyen nhan panel "Bao cao nhanh" hien rong/sai khi bam chuong).
interface DailyReport {
  scope: "khu_vuc" | "toan_he_thong";
  khuVucList: string[];
  generatedAt: string;
  generatedBy: string;
  tonCanGiaiTrinh: DeltaBucket;
  thieuLinhKien: DeltaBucket;
  caLap: DeltaBucket;
  canKhaoSat: DeltaBucket;
  doanhThuThang: number | null;
}

function deltaSub(bucket: DeltaBucket): string {
  return `Đầu ngày ${bucket.baseline} · đã xử lý ${bucket.resolved}`;
}

// "className" tuy chinh do rong/hien-an tu noi goi - dung LAI 1 component cho ca 2 ngu canh: o
// tim kiem gon trong header desktop/tablet (md+), VA o tim kiem bung rong het chieu ngang khi
// nguoi dung tren dien thoai bam icon 🔍 rieng de mo (xem TopBar ben duoi).
function GlobalSearch({
  onFound,
  onSubmitted,
  autoFocus,
  className = "w-40 lg:w-52",
}: {
  onFound: (id: string | null) => void;
  onSubmitted?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const [q, setQ] = useState("");
  // >1 ket qua khi tim theo Serial (trung nhieu ca) - hien popup de nguoi dung tu chon, thay vi
  // nuot bot con lai nhu truoc (chi tra ve 1 ID dau tien). Tim theo ID luon ra dung 1 ket qua nen
  // hanh vi "nhay thang vao ca" khong doi - chi them nhanh MOI cho truong hop >1.
  const [multiMatches, setMultiMatches] = useState<{ query: string; rows: SearchMatchRow[] } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    try {
      const res = await api.get<{ matches: SearchMatchRow[] }>(`/cases/search?q=${encodeURIComponent(query)}`);
      if (res.matches.length > 1) {
        setMultiMatches({ query, rows: res.matches });
      } else {
        onFound(res.matches[0]?.id ?? null);
        if (res.matches[0]) setQ("");
      }
    } catch {
      onFound(null);
    }
    onSubmitted?.();
  }

  return (
    <>
      <form onSubmit={submit} className={`relative shrink-0 ${className}`}>
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-400)] text-sm">🔍</span>
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tra cứu ID/Serial…"
          className="focus-ring w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 border border-transparent focus:bg-white focus:border-[var(--ocean-400)] text-sm"
        />
      </form>
      {multiMatches && (
        <SearchResultsPopup
          query={multiMatches.query}
          matches={multiMatches.rows}
          onClose={() => setMultiMatches(null)}
          onSelect={(id) => {
            setMultiMatches(null);
            setQ("");
            onFound(id);
          }}
        />
      )}
    </>
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
  // Duoi 768px (md - khop nguong "mobile" cua useIsMobile()/Sidebar), o tim kiem + loi chao AN
  // HAN (khong du cho, xem GlobalSearch/Greeting) - thay bang 1 icon 🔍 rieng, bam vao moi bung
  // ra o nhap FULL WIDTH thay cho toan bo phan con lai cua header (tranh mat han tinh nang tim
  // kiem tren dien thoai, chot 2026-07-30 sau khi phat hien o tim kiem/loi chao dung 2 nguong
  // response khac nhau (sm/lg) gay canh "o tim kiem hien le loi, loi chao bien mat" tren man hinh
  // trung gian 640-1024px).
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // 5 phut (truoc la 60s) - /notifications/count chua truy van CA_LAP_CTE (window function LAG()
  // quet toan bo lich su case_dvbh, khong dung duoc index de rut gon), poll qua day khi cong don
  // ca ngay (tab mo lien tuc) da vuot han muc "rows read" free tier cua D1 (xem nhat_ky_lam_viec.md).
  const { data: counts } = useQuery({
    queryKey: ["notifications-count"],
    queryFn: () => api.get<{ canGiaiTrinh: number; choQc: number }>("/notifications/count"),
    refetchInterval: 5 * 60_000,
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

  if (mobileSearchOpen) {
    return (
      <header className="h-16 bg-[var(--topbar-bg)] border-b border-[var(--line)] flex items-center gap-2 px-5 sticky top-0 z-30">
        <button
          onClick={() => setMobileSearchOpen(false)}
          className="focus-ring w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-[var(--ink-600)] shrink-0"
          aria-label="Đóng tìm kiếm"
        >
          ←
        </button>
        <GlobalSearch
          onFound={(id) => {
            onSearch(id);
            setMobileSearchOpen(false);
          }}
          onSubmitted={() => setMobileSearchOpen(false)}
          autoFocus
          className="flex-1"
        />
      </header>
    );
  }

  return (
    <header className="h-16 bg-[var(--topbar-bg)] border-b border-[var(--line)] flex items-center gap-4 px-5 sticky top-0 z-30">
      <button onClick={onOpenMobileMenu} className="focus-ring md:hidden w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-[var(--ink-600)] shrink-0">
        ☰
      </button>
      <button
        onClick={() => setMobileSearchOpen(true)}
        className="focus-ring md:hidden w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-[var(--ink-600)] shrink-0"
        aria-label="Tra cứu ID/Serial"
        title="Tra cứu ID/Serial"
      >
        🔍
      </button>
      <GlobalSearch onFound={onSearch} className="hidden md:block w-40 lg:w-52" />
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
              <div className="px-3.5 py-2 text-xs text-[var(--ink-600)] border-b border-[var(--line)] flex items-center gap-1.5" title="Thời điểm xuất dữ liệu CRM mới nhất được cập nhật vào hệ thống">
                <span>🔄</span>
                <span>
                  Đồng bộ đến: <b className="font-semibold">{syncStatus?.lastSynced ? fmtDateTime(syncStatus.lastSynced) : "—"}</b>
                </span>
              </div>
              <div className="px-3.5 py-2 text-xs font-semibold text-[var(--ink-400)] border-b border-[var(--line)]">Việc cần xử lý</div>
              <button onClick={() => goTo("survey")} className="w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 flex items-center justify-between">
                <span>Ca chờ QC chốt cấp 2</span>
                <span className="font-semibold text-[var(--coral-500)]">{counts?.choQc ?? 0}</span>
              </button>
              <div className="px-3.5 py-2 text-xs font-semibold text-[var(--ink-400)] border-y border-[var(--line)] mt-1">📊 Báo cáo lúc 08:00</div>
              {dailyReport ? (
                <>
                  <div className="px-3.5 pt-1 pb-1.5 text-[10px] text-[var(--ink-400)]">Cập nhật lúc {fmtGeneratedAt(dailyReport.generatedAt)}</div>
                  <button onClick={() => goTo("backlog")} className="w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 flex items-center justify-between">
                    <span>Cần giải trình</span>
                    <span className="text-right">
                      <span className="font-semibold text-[var(--coral-500)]">{dailyReport.tonCanGiaiTrinh.remaining}</span>
                      <div className="text-[10px] text-[var(--ink-400)] font-normal">{deltaSub(dailyReport.tonCanGiaiTrinh)}</div>
                    </span>
                  </button>
                  <button onClick={() => goTo("missing-parts")} className="w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 flex items-center justify-between">
                    <span>Ca thiếu linh kiện tồn đọng</span>
                    <span className="text-right">
                      <span className="font-semibold">{dailyReport.thieuLinhKien.remaining}</span>
                      <div className="text-[10px] text-[var(--ink-400)] font-normal">{deltaSub(dailyReport.thieuLinhKien)}</div>
                    </span>
                  </button>
                  <button onClick={() => goTo("ca-lap")} className="w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 flex items-center justify-between">
                    <span>Ca lặp cần xử lý</span>
                    <span className="text-right">
                      <span className="font-semibold">{dailyReport.caLap.remaining}</span>
                      <div className="text-[10px] text-[var(--ink-400)] font-normal">{deltaSub(dailyReport.caLap)}</div>
                    </span>
                  </button>
                  <button onClick={() => goTo("survey")} className="w-full text-left px-3.5 py-2 text-sm hover:bg-slate-50 flex items-center justify-between">
                    <span>Cần khảo sát</span>
                    <span className="text-right">
                      <span className="font-semibold">{dailyReport.canKhaoSat.remaining}</span>
                      <div className="text-[10px] text-[var(--ink-400)] font-normal">{deltaSub(dailyReport.canKhaoSat)}</div>
                    </span>
                  </button>
                  {dailyReport.doanhThuThang !== null && (
                    <div className="w-full px-3.5 py-2 text-sm flex items-center justify-between">
                      <span>Doanh thu tháng này</span>
                      <span className="font-semibold text-[var(--teal-500)]">{fmtVND(dailyReport.doanhThuThang)}</span>
                    </div>
                  )}
                  {dailyReport.scope === "khu_vuc" && dailyReport.khuVucList.length > 0 && (
                    <div className="px-3.5 pb-2 text-[10px] text-[var(--ink-400)]">Khu vực: {dailyReport.khuVucList.map(shortKhuVuc).join(", ")}</div>
                  )}
                </>
              ) : (
                <div className="px-3.5 py-3">
                  <LoadingInline className="text-sm font-semibold text-[var(--ink-600)]" />
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
