import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth/AuthContext";
import { api } from "./api/client";
import { fmtVND } from "./types";
import { LoginScreen } from "./login/LoginScreen";
import { Sidebar } from "./layout/Sidebar";
import { TopBar } from "./layout/TopBar";
import { ROLE_MODULES, MODULE_TITLES } from "./layout/navConfig";
import { CaseDetail } from "./modules/CaseDetail";
import { DashboardModule } from "./modules/DashboardModule";
import { RevenueModule } from "./modules/RevenueModule";
import { LuyKeModule } from "./modules/LuyKeModule";
import { BacklogModule } from "./modules/BacklogModule";
import { MissingPartsModule } from "./modules/MissingPartsModule";
import { TranhChapModule } from "./modules/TranhChapModule";
import { NapGasModule } from "./modules/NapGasModule";
import { SurveyModule } from "./modules/SurveyModule";
import { CaLapModule } from "./modules/CaLapModule";
import { DanhSachTongModule } from "./modules/DanhSachTongModule";
import { ImportModule } from "./modules/ImportModule";
import { SettingsModule } from "./modules/SettingsModule";
import { UsersModule } from "./modules/UsersModule";
import { ThemeModule } from "./modules/ThemeModule";
import { DatMuaLinhKienModule } from "./modules/DatMuaLinhKienModule";
import { DanhMucLinhKienModule } from "./modules/DanhMucLinhKienModule";
import { useToast } from "./components/ui/Toast";
import { LoadingInline } from "./components/ui/LoadingInline";
import { ThemeProvider } from "./theme/ThemeProvider";
import { usePurchaseWarrantyData } from "./hooks/usePurchaseWarrantyData";
import { GreetingPopup } from "./components/GreetingPopup";
import { TranhChapMentionPopup } from "./components/TranhChapMentionPopup";

const ACTIVE_MODULE_KEY = "dvbh_active_module";

export function App() {
  const auth = useAuth();

  if (auth.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingInline className="text-[var(--ink-700)] text-xl font-bold" />
      </div>
    );
  }
  if (auth.status === "anonymous") return <LoginScreen variant="login" />;
  if (auth.status === "pending") return <LoginScreen variant="pending" />;
  if (auth.status === "rejected") return <LoginScreen variant="rejected" />;
  if (auth.status === "disabled") return <LoginScreen variant="disabled" />;

  return (
    <ThemeProvider>
      <MainApp user={auth.user} showDailyReport={auth.showDailyReport} />
    </ThemeProvider>
  );
}

function MainApp({
  user,
  showDailyReport,
}: {
  user: Extract<ReturnType<typeof useAuth>, { status: "authenticated" }>["user"];
  showDailyReport: boolean;
}) {
  const role = user.vai_tro;
  // Tai khoan "chi Dat mua linh kien" - vai_tro=NULL CO CHU DICH (KTV/CTV/Tram/Ve tinh/Kho/Ke toan
  // thuan tuy, khong tham gia phan he DVBH con lai - chot 2026-08-14). Khac "chua duyet" (do la
  // trang_thai_duyet, da loc o AuthContext truoc khi toi day).
  const laTaiKhoanMuaHangThuanTuy = !role && !!(user.la_ktv_dvbh || user.la_ve_tinh || user.la_kho || user.la_ke_toan || user.la_tac_nghiep || user.la_tp_dvbh);
  // CHOT 2026-08-01: danh sach module gio tuy chinh HOAN TOAN theo tung tai khoan (user.modules,
  // xem migration 0042) - NULL = chua tuy chinh, fallback ve mac dinh theo vai_tro nhu truoc.
  // Admin luon full (khop dung logic hasModule() o backend/src/lib/moduleAccess.ts).
  let allowedModules = role === "Admin" ? ROLE_MODULES.Admin : (user.modules ?? (role ? ROLE_MODULES[role] ?? [] : []));
  // Cap them "dat-mua-lk"/"tra-hang" tu dong khi bat 1 trong 6 co "Dat mua linh kien", va
  // "danh-muc-lk" khi bat xem_danh_muc_lk (quyen xem, mac dinh true tru CSKH/TN CSKH/TBP CSKH) hoac
  // quan_ly_danh_muc_lk (quyen sua ke thua duoc xem) - phai khop dung effectiveModules() o
  // backend/src/lib/moduleAccess.ts, khong co co che dung chung giua 2 codebase nen phai tu dong bo
  // tay.
  if (role !== "Admin" && (user.la_ktv_dvbh || user.la_ve_tinh || user.la_kho || user.la_ke_toan || user.la_tac_nghiep || user.la_tp_dvbh)) {
    allowedModules = [...new Set([...allowedModules, "dat-mua-lk", "tra-hang"])];
  }
  if (role !== "Admin" && (user.xem_danh_muc_lk || user.quan_ly_danh_muc_lk)) {
    allowedModules = [...new Set([...allowedModules, "danh-muc-lk"])];
  }
  // CHOT 2026-08-21 (yeu cau chu he thong): tam an "dat-mua-lk"/"tra-hang" cho TOAN BO user - phai
  // khop dung TAM_TAT_MODULES o backend/src/lib/moduleAccess.ts. Loc SAU CUNG (sau moi buoc cong
  // them o tren) de khong bi "song lai" qua nhanh role-flag. Bat lai: xoa dong filter nay.
  allowedModules = allowedModules.filter((m) => m !== "dat-mua-lk" && m !== "tra-hang");
  const [active, setActive] = useState(() => {
    const saved = localStorage.getItem(ACTIVE_MODULE_KEY);
    return saved && allowedModules.includes(saved) ? saved : allowedModules[0] ?? "dashboard";
  });
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Slot dung chung de vai module (Quan ly ton/Ca thieu linh kien) "portal" bo loc rieng cua ho len
  // chung dong voi tieu de trang thay vi 1 hang rieng ben duoi - dung state (khong phai ref thuong)
  // vi createPortal can node DOM THAT SU da gan vao cay (khong the truyen ref rong luc render dau).
  const [headerExtraEl, setHeaderExtraEl] = useState<HTMLDivElement | null>(null);
  // Stack (khong phai 1 gia tri don) de ho tro nut "Quay lai" khi nguoi dung nhay giua cac ca
  // lien quan (vd: chuoi lich su Ca lap) - openCase() bat dau 1 phien MOI (reset stack), con
  // pushCase() chi dung khi dieu huong TU BEN TRONG popup chi tiet ca (khong reset lich su).
  // Moi tang stack tu luu rieng "viewMode" (ngan gon/mo rong) + "tab" dang xem - de khi dieu huong
  // qua ca lien quan roi bam Quay lai, man hinh phuc hoi DUNG NHU LUC ROI DI (khong bi reset ve
  // mac dinh), va khi dang o "ngan gon" ma mo 1 ca lien quan thi ca do luon mo o "mo rong" (De hon
  // cho nguoi kiem soat doi chieu chi tiet) roi Quay lai se tu quay ve "ngan gon" cua ca truoc do.
  const [caseStack, setCaseStack] = useState<{ id: string; viewMode: "compact" | "expanded"; tab: string }[]>([]);
  const addToast = useToast();
  const dailyReportShown = useRef(false);
  // Theo doi GreetingPopup dang hien hay khong - TranhChapMentionPopup can biet de xep BEN DUOI thay
  // vi tu tao lop nen rieng (chot 2026-08-20, xem TranhChapMentionPopup.tsx).
  const [greetingVisible, setGreetingVisible] = useState(false);

  // Kich hoat dong bo NGAM du lieu mua hang/bao hanh/xu ly thieu hang (Google Sheet -> cache
  // trinh duyet, xem hooks/usePurchaseWarrantyData.ts) ngay sau khi dang nhap - khong cho ket qua o
  // day, CaseDetail.tsx tu doc lai cung query (TanStack Query chia se cache theo key).
  usePurchaseWarrantyData();

  useEffect(() => {
    if (!allowedModules.includes(active)) setActive(allowedModules[0] ?? "dashboard");
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Tai khoan "chi Dat mua linh kien" khong xem duoc phan he DVBH chinh nen bao cao nay khong lien
    // quan gi - chot 2026-08-14.
    if (!showDailyReport || dailyReportShown.current || laTaiKhoanMuaHangThuanTuy) return;
    dailyReportShown.current = true;
    (async () => {
      try {
        const r = await api.get<{ tonTren3Ngay: number; thieuLinhKien: number; nghiNgoViPham: number; caLap: number; doanhThuThang: number | null }>("/dashboard/daily-report");
        const dtSuffix = r.doanhThuThang !== null ? ` · DT tháng: ${fmtVND(r.doanhThuThang)}` : "";
        addToast(
          `📊 Báo cáo nhanh hôm nay: ${r.tonTren3Ngay} ca tồn >3 ngày cần giải trình · ${r.thieuLinhKien} thiếu linh kiện · ${r.caLap} ca lặp cần xử lý · ${r.nghiNgoViPham} cần khảo sát${dtSuffix}`,
        );
      } catch {
        /* khong chan trai nghiem neu bao cao loi - im lang bo qua */
      }
    })();
  }, [showDailyReport]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem(ACTIVE_MODULE_KEY, active);
  }, [active]);

  if (!role && !laTaiKhoanMuaHangThuanTuy) {
    return <LoginScreen variant="pending" />;
  }

  // "KSNB Doi tac" DA BO KHOI danh sach nay (chot 2026-07-24) - vai tro nay truoc chi duoc giai
  // trinh ca dang TON thuoc tranh chap, nhung Quan ly tranh chap gio CHI con tinh tren ca DA DONG
  // (xem TRANH_CHAP_ELIGIBLE trong backend/src/routes/tranhChap.ts) nen quyen giai trinh rieng cua
  // vai tro nay vinh vien khong dung duoc nua - da go bo dong bo voi backend (cases.ts requireRole).
  // role co the null (tai khoan "chi Dat mua linh kien") - ep ve "" de .includes() khong bao gio
  // khop (dung: tai khoan nay khong co quyen nao trong so nay).
  const canGiaiTrinh = ["Giam sat", "TBP DVBH", "Admin"].includes(role ?? "");
  const canGsLap = ["Giam sat", "Admin"].includes(role ?? "");
  const canQcLap = ["QC", "Admin"].includes(role ?? "");
  // Khac canGiaiTrinh, KHONG gom "KSNB Doi tac" - vai tro do chi duoc gioi han trong module Tranh
  // chap (xem ROLE_MODULES trong layout/navConfig.ts, khong co "nap-gas" trong danh sach module cua
  // KSNB Doi tac).
  const canNapGas = ["Giam sat", "TBP DVBH", "Admin"].includes(role ?? "");
  // "Huy ca" - chi Admin, an ca khoi moi hang doi can xu ly + KPI, co the dao nguoc (xem
  // backend/src/routes/cases.ts POST /:id/huy, /bo-huy).
  const canHuyCa = role === "Admin";

  // Tab dau tien phu hop cho tung viewMode - "info" chi ton tai o "compact" (giu dung tab cu),
  // "expanded" khong co tab info rieng vi cot trai da ghim san thong tin khach hang.
  // "tranh-chap" them 2026-07-29 (tab moi trong CaseDetail.tsx) - PHAI co mat o day, thieu se lam
  // pushCase()/setTopViewMode() tuong nham la tab khong hop le va tu dong reset ve FIRST_TAB moi khi
  // dieu huong ca lien quan hoac doi che do xem, mat tab dang xem cua nguoi dung.
  const FIRST_TAB: Record<"compact" | "expanded", string> = { compact: "info", expanded: "giai-trinh" };
  // "tien-trinh-chung" them 2026-08-22 (CaseDetail.tsx) - PHAI co mat o day cung ly do voi "tranh-chap"
  // (xem chu thich ngay tren): thieu se lam tab bi coi la khong hop le, tu dong rot ve FIRST_TAB.
  const VALID_TABS: Record<"compact" | "expanded", string[]> = {
    compact: ["info", "tien-trinh-chung", "giai-trinh", "vi-pham", "khao-sat", "ca-lap", "nap-gas", "tranh-chap"],
    expanded: ["tien-trinh-chung", "giai-trinh", "vi-pham", "khao-sat", "ca-lap", "nap-gas", "tranh-chap"],
  };

  // openCase() bat dau phien MOI (reset stack) - dung cho moi noi mo ca tu 1 danh sach/tim kiem.
  // "tab" tuy chon (vd module Tranh chap goi openCase(id, "tranh-chap") de mo thang vao dung tab
  // lien quan thay vi tab mac dinh) - rot lai FIRST_TAB.expanded neu khong truyen hoac gia tri la.
  // pushCase() chi dung TU BEN TRONG popup (vd: bam vao ca lien quan trong chuoi lich su Ca lap)
  // de giu lai lich su cho nut "Quay lai" - LUON mo ca duoc tro toi o "expanded" (de nguoi kiem
  // soat thay chi tiet day du ngay), ke ca khi dang dung "compact" o tang truoc - popCase() vi vay
  // se tu phuc hoi dung "compact" da luu rieng cho tang truoc do. popCase()/backToRoot()/closeCase()
  // dieu khien nut Quay lai / shortcut ve ca goc / dong han popup.
  function openCase(id: string, tab?: string) {
    const validTab = tab && VALID_TABS.expanded.includes(tab) ? tab : FIRST_TAB.expanded;
    setCaseStack([{ id, viewMode: "expanded", tab: validTab }]);
  }
  function pushCase(id: string) {
    setCaseStack((s) => {
      const top = s.at(-1);
      const tab = top && VALID_TABS.expanded.includes(top.tab) ? top.tab : FIRST_TAB.expanded;
      return [...s, { id, viewMode: "expanded", tab }];
    });
  }
  function popCase() {
    setCaseStack((s) => s.slice(0, -1));
  }
  function backToRoot() {
    setCaseStack((s) => (s.length > 1 ? [s[0]] : s));
  }
  function closeCase() {
    setCaseStack([]);
  }
  function setTopTab(tab: string) {
    setCaseStack((s) => {
      if (s.length === 0) return s;
      const top = s[s.length - 1];
      return [...s.slice(0, -1), { ...top, tab }];
    });
  }
  function setTopViewMode(viewMode: "compact" | "expanded") {
    setCaseStack((s) => {
      if (s.length === 0) return s;
      const top = s[s.length - 1];
      const tab = VALID_TABS[viewMode].includes(top.tab) ? top.tab : FIRST_TAB[viewMode];
      return [...s.slice(0, -1), { ...top, viewMode, tab }];
    });
  }

  function handleSearch(id: string | null) {
    if (id) openCase(id);
    else addToast("Không tìm thấy ca với ID / Serial này");
  }

  return (
    <div className="flex min-h-screen">
      {/* Tai khoan "chi Dat mua linh kien" khong nhan loi chao/nhac nho danh cho nhan vien noi bo -
          chot 2026-08-14. */}
      {!laTaiKhoanMuaHangThuanTuy && <GreetingPopup onVisibleChange={setGreetingVisible} />}
      {/* CHOT 2026-08-20: chi hien voi tai khoan co module "tranh-chap" - xep BEN DUOI GreetingPopup
          neu ca 2 cung trigger (xem TranhChapMentionPopup.tsx). */}
      {!laTaiKhoanMuaHangThuanTuy && allowedModules.includes("tranh-chap") && (
        <TranhChapMentionPopup userEmail={user.email} stackedBelowGreeting={greetingVisible} onNavigateToTranhChap={() => setActive("tranh-chap")} />
      )}
      <Sidebar
        active={active}
        setActive={setActive}
        allowedModules={allowedModules}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          role={role ?? "Đặt mua linh kiện"}
          user={user}
          onSearch={handleSearch}
          onOpenMobileMenu={() => setMobileOpen(true)}
          onNavigate={setActive}
        />
        <main className="p-3 sm:p-5 flex-1">
          {/* SUA BUG (phan hoi 2026-08-19 #2, "xem full luồng quy trình bị tràn màn hình"): them
              min-w-0 tren ca 2 cap flex-item boc slot headerExtra - thieu no khien noi dung portal
              vao day (vd PipelineFlow o trang thai mo rong) khong the shrink/tu cuon ben trong, day
              tran ra ngoai ca trang thay vi cuon ngang gon trong khung. */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap min-w-0">
              {/* SUA (phan hoi 2026-08-19: "Bỏ tiêu đề module... thay vào đó là button 'Việc của tôi:
                  N'") - CHI an h1 khi active==="dat-mua-lk"; module do tu portal nut thay the vao
                  DUNG vi tri nay qua headerExtraEl (xem DatMuaLinhKienModule.tsx titleButtonEl). Moi
                  module khac (ke ca forceView="tra-hang", 1 active key rieng) khong doi. */}
              {active !== "dat-mua-lk" && (
                <h1 className="font-display text-lg sm:text-xl font-extrabold text-[var(--ink-900)]">{MODULE_TITLES[active]}</h1>
              )}
              <div ref={setHeaderExtraEl} className="flex items-center gap-2 flex-wrap min-w-0" />
            </div>
          </div>
          {active === "dashboard" && <DashboardModule onNavigate={setActive} />}
          {active === "revenue" && <RevenueModule />}
          {active === "luy-ke" && <LuyKeModule />}
          {active === "backlog" && <BacklogModule openCase={openCase} headerExtra={headerExtraEl} />}
          {active === "missing-parts" && <MissingPartsModule openCase={openCase} headerExtra={headerExtraEl} />}
          {active === "tranh-chap" && <TranhChapModule openCase={openCase} />}
          {active === "nap-gas" && <NapGasModule openCase={openCase} />}
          {active === "survey" && <SurveyModule openCase={openCase} />}
          {active === "ca-lap" && <CaLapModule openCase={openCase} role={role} />}
          {active === "danh-sach-tong" && <DanhSachTongModule openCase={openCase} />}
          {active === "import" && <ImportModule />}
          {active === "settings" && <SettingsModule />}
          {active === "users" && <UsersModule />}
          {active === "giao-dien" && <ThemeModule />}
          {active === "dat-mua-lk" && <DatMuaLinhKienModule openCase={openCase} headerExtra={headerExtraEl} />}
          {active === "tra-hang" && <DatMuaLinhKienModule forceView="tra-hang" openCase={openCase} headerExtra={headerExtraEl} />}
          {active === "danh-muc-lk" && <DanhMucLinhKienModule />}
        </main>
      </div>
      <CaseDetail
        caseId={caseStack.at(-1)?.id ?? null}
        viewMode={caseStack.at(-1)?.viewMode ?? "expanded"}
        tab={caseStack.at(-1)?.tab ?? FIRST_TAB.expanded}
        onTabChange={setTopTab}
        onViewModeChange={setTopViewMode}
        rootCaseId={caseStack[0]?.id ?? null}
        canGoBack={caseStack.length > 1}
        onBack={popCase}
        onBackToRoot={backToRoot}
        onClose={closeCase}
        onOpenCase={pushCase}
        canGiaiTrinh={canGiaiTrinh}
        canGsLap={canGsLap}
        canQcLap={canQcLap}
        canNapGas={canNapGas}
        canHuyCa={canHuyCa}
      />
    </div>
  );
}
