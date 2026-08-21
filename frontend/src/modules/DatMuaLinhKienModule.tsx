import { lazy, Suspense, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "../components/ui/Tabs";
import { api } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import type { LuongQuyTrinhStep, JumpTarget } from "./datMuaLinhKien/types";
import { PipelineFlow, MyWorkloadStrip } from "./datMuaLinhKien/PipelineFlow";

// Module "Dat mua linh kien" (Phase 2) - thay the quy trinh dat hang linh kien tren Google
// Sheets/AppSheet, xem plan "Module Dat Mua Linh Kien". Tabs hien theo co vai tro (la_ktv_dvbh/
// la_ve_tinh/la_kho/la_ke_toan) + vai_tro chuan (Giam sat theo doi, TBP DVBH/Admin = TN tac nghiep).
//
// UI redesign Phase 3 (phan hoi Codex 2026-08-19, "tach component/hook, lazy-load tab"): file nay
// tach tu 1 file duy nhat ~5234 dong thanh thu muc datMuaLinhKien/ (types/constants/helpers dung
// chung + 1 file rieng cho moi tab). 6 tab nang (TaoDonTab/DonCuaToiTab/PhieuXuatKhoTab/ThieuLkTab/
// TraHangTab/BaoCaoTab) dung React.lazy - chi tai code khi nguoi dung thuc su vao tab do, thay vi
// tai toan bo ~5000 dong ngay khi mo module. PipelineFlow/MyWorkloadStrip GIU EAGER (khong lazy) vi
// luon render ngay khi mo module (khong doi tab nao ca).
const TaoDonTab = lazy(() => import("./datMuaLinhKien/TaoDonTab").then((m) => ({ default: m.TaoDonTab })));
const DonCuaToiTab = lazy(() => import("./datMuaLinhKien/DonCuaToiTab").then((m) => ({ default: m.DonCuaToiTab })));
const PhieuXuatKhoTab = lazy(() => import("./datMuaLinhKien/PhieuXuatKhoTab").then((m) => ({ default: m.PhieuXuatKhoTab })));
const ThieuLkTab = lazy(() => import("./datMuaLinhKien/ThieuLkTab").then((m) => ({ default: m.ThieuLkTab })));
const TraHangTab = lazy(() => import("./datMuaLinhKien/TraHangTab").then((m) => ({ default: m.TraHangTab })));
const BaoCaoTab = lazy(() => import("./datMuaLinhKien/BaoCaoTab").then((m) => ({ default: m.BaoCaoTab })));

function TabFallback() {
  return <div className="text-sm text-[var(--ink-500)] py-6 text-center mt-4">Đang tải...</div>;
}

export function DatMuaLinhKienModule({
  forceView,
  openCase,
  headerExtra,
}: {
  forceView?: string;
  openCase?: (id: string, tab?: string) => void;
  // Node DOM cua slot canh tieu de trang (App.tsx) - co thi "portal" thanh luong quy trinh len do
  // thay vi render 1 hang rieng ben duoi (theo yeu cau bo sung sau ra soat: "đẩy luồng thẻ quy trình
  // lên cùng dòng với tiêu đề, tiết kiệm diện tích") - dung dung pattern da co san o BacklogModule.
  headerExtra?: HTMLElement | null;
} = {}) {
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;
  const addToast = useToast();
  const qc = useQueryClient();

  // CHOT 2026-08-16 (migration 0081): Tac nghiep DOC LAP khoi vai_tro="TBP DVBH" - truoc day dong
  // cung vai tro nen check thang vai_tro, gio phai doc flag rieng (khop dung canTacNghiep() backend
  // trong datMuaLinhKien.ts). BAO CHUA UPDATE truoc do la 1 bug - sua lai o day.
  const canTacNghiep = !!user?.la_tac_nghiep || user?.vai_tro === "Admin";
  // Xac nhan "linh kien dac thu" truoc buoc Tac nghiep - CHOT 2026-08-17, xem migration 0082.
  const canTPDvbhXacNhan = !!user?.la_tp_dvbh || user?.vai_tro === "Admin";
  const isGiamSat = user?.vai_tro === "Giam sat";
  // UI xem chi tiet ca (case_dvbh, du lieu CRM noi bo) khong danh cho KTV/CTV/Tram (deu la co
  // la_ktv_dvbh/la_ve_tinh) - chot voi chu he thong 2026-08-15: cot "Ma yeu cau su co" van hien gia
  // tri cho nhom nay, chi khong bam mo duoc. Kho/Ke toan/QC/GS/TN/Admin van xem duoc binh thuong.
  const canXemChiTietCa = !(user?.la_ktv_dvbh || user?.la_ve_tinh);
  // "canDatHo" (tao ho, xem "nguoi nhan hang") = KTV/Ve tinh tu tao + TN/GS tao ho - khop dung
  // canQuanLyDonHo() backend. Tach rieng khoi "canBulkTram" (quyen bulk-duyet o "Don cua toi"):
  // truoc day 2 quyen nay dung CHUNG 1 bien canCreatePhieuDat nen khi them Giam sat vao de mo tab
  // "Tao phieu dat" (bug rieng phien 14/8 - GS khong vao duoc du TaoDonTab/canQuanLy da ho tro san),
  // GS se VO TINH duoc ca giao dien bulk-duyet Tram (backend van chan dung FORBIDDEN_ROLE vi GS
  // khong phai tram_cha cua ai, nhung nut se luon that bai - trai UX). canBulkTram GIU NGUYEN tap
  // vai tro cu (KTV/Ve tinh/TN/Admin, khong Giam sat).
  const canDatHo = !!(user?.la_ktv_dvbh || user?.la_ve_tinh || canTacNghiep || isGiamSat);
  const canKho = !!user?.la_kho || user?.vai_tro === "Admin";
  const canKeToan = !!user?.la_ke_toan || user?.vai_tro === "Admin";
  const canQC = user?.vai_tro === "QC" || user?.vai_tro === "Admin";
  // CHOT (ra soat module "Dat Mua Linh Kien 2.0" #14): tab Bao cao chon layout (the StatCard ca nhan
  // hay bang pivot nhieu KTV) theo VAI TRO nguoi dang xem, KHONG con theo SO DONG du lieu tra ve nhu
  // truoc - truoc day 1 GS chi quan ly dung 1 KTV se bi rows.length<=1 nen dot ngot thay the ca nhan
  // don gian thay vi bang pivot ma cac GS khac quen dung, doi theo bien dong nhan su la khong on dinh.
  const isManagerView = canTacNghiep || canKho || canKeToan || isGiamSat || user?.vai_tro === "Admin";

  // Tab "Tao phieu dat" rieng da bo (2026-08-15, phan hoi UX #12) - gop thanh nut "+ Tao don" mo
  // Modal ngay trong "Don cua toi/Danh sach" (xem DonCuaToiTab) de toan bo xu ly nam tren 1 man
  // hinh, tranh loang thong tin.
  //
  // "tabs" o day la danh sach VIEW THAT (dung cho isValidView/defaultView/jump target "don-cua-toi"
  // ma PipelineFlow + BaoCaoTab dang goi thang o hang chuc noi - KHONG doi ten key nay). Thanh tab
  // HIEN THI thuc te (displayTabs, xem duoi) tach rieng: 3 nut "Mua hang/Cong no/Tra hang" (phan hoi
  // 2026-08-19: "tach thành Mua hàng/Công nợ/Trả hàng") deu tro ve CUNG 1 view "don-cua-toi", chi
  // khac o xemLoaiDon (nang len module, xem duoi) - giu view that lam 1 khai niem duy nhat de khong
  // phai sua lai hang chuc onJump({tab:"don-cua-toi",...}) da co san trong PipelineFlow/BaoCaoTab.
  const tabs = [
    { key: "don-cua-toi", label: "Đơn của tôi / Danh sách" },
    // Giam sat them vao tab duoi - CHI de theo doi (khong co canTacNghiep/canKho/canKeToan rieng nen
    // khong nut hanh dong nao hien ra, xem PxkDetailModal).
    ...(canTacNghiep || canKho || canKeToan || isGiamSat ? [{ key: "phieu-xuat-kho", label: "Phiếu xuất kho" }] : []),
    { key: "thieu-lk", label: "Thiếu linh kiện" },
    // Tab rieng cho 12 chi so tong quan (phan hoi UX muc 6, nang cap 2026-08-15) - luon hien, noi
    // dung tu doi theo vai tro qua API (KTV/Ve tinh: the tong hop; GS/TN/Kho/Ke toan: bang theo KTV).
    { key: "bao-cao", label: "Báo cáo" },
  ];
  // "Đơn trả hàng" KHONG con la tab rieng tren thanh menu (CHOT vong 7: "thừa" - thanh luong quy trinh
  // da co san 3 buoc bam thang vao dung day: Trả hàng KT/Kho/QC). Van GIU render/activeView cho key
  // "tra-hang" (KHONG xoa component TraHangTab) vi day la 3 buoc DUYET DAU TIEN cua luong tra hang
  // (Ke toan duyet mem/Kho xac nhan/QC xac nhan, dung bang tra_hang_log rieng - KHAC voi phieu_xuat_kho
  // nen khong the gop thanh 1 o loc trong "Phieu xuat kho") - chi khong con hien nut trong thanh tab,
  // van vao duoc qua onJump() cua PipelineFlow. canTraHangView tai dung dieu kien cu cua tab nay.
  const canTraHangView = canTacNghiep || canKho || canKeToan || canQC || isGiamSat;
  // Tab "hang cho" mac dinh THEO VAI TRO - Kho/Ke toan/QC "thuan" truoc day luon roi vao "Don cua
  // toi" - tab khong lien quan gi den viec cua ho (viec that o "Thieu linh kien"/"Phieu xuat kho"/
  // "Don tra hang"). Chi anh huong LAN DAU vao module (useLocalStorageState chi doc default nay khi
  // chua co gia tri luu san), nhung tu do khong bao gio tu doi lai (dung y muon).
  const defaultView = canKho
    ? "thieu-lk"
    : canKeToan
      ? "phieu-xuat-kho"
      : canQC
        ? "tra-hang"
        : (tabs[0]?.key ?? "don-cua-toi");
  const [view, setView] = useLocalStorageState("filters:dat-mua-lk-view", defaultView);
  const isValidView = (v: string) => tabs.some((t) => t.key === v) || (v === "tra-hang" && canTraHangView);
  const activeView = forceView && isValidView(forceView) ? forceView : isValidView(view) ? view : (tabs[0]?.key ?? "don-cua-toi");

  // Sub-loc "Mua hang | Cong no | Tra hang" cua tab "Don cua toi" - NANG LEN module (phan hoi
  // 2026-08-19: hien thanh 3 tab thuc su o thanh tab tren cung, thay vi 1 hang nut rieng ben trong
  // DonCuaToiTab nhu truoc). So dem dong dang mo theo loai don dung CHUNG 1 query voi DonCuaToiTab
  // truoc day (react-query dedupe theo queryKey, khong ton them request).
  const [xemLoaiDon, setXemLoaiDon] = useLocalStorageState<"mua" | "cong_no" | "tra_hang">("filters:dmlk-xem-loai-don", "mua");
  const { data: loaiDonCountsData } = useQuery({
    queryKey: ["dat-mua-lk-loai-don-counts"],
    queryFn: () => api.get<{ mua: number; cong_no: number; tra_hang: number }>("/dat-mua-lk/loai-don-counts"),
  });
  const loaiDonCounts = loaiDonCountsData ?? { mua: 0, cong_no: 0, tra_hang: 0 };
  // Thanh tab HIEN THI: thay 1 muc "don-cua-toi" bang 3 muc "don-cua-toi:<loai>" mang so dem do
  // (badge tron mau do co san trong Tabs.tsx, dung "nhu thong bao tin nhan" dung y yeu cau). Cac muc
  // con lai (phieu-xuat-kho/thieu-lk/bao-cao) giu nguyen key that.
  const displayTabs = [
    { key: "don-cua-toi:mua", label: "Mua hàng", count: loaiDonCounts.mua },
    { key: "don-cua-toi:cong_no", label: "Công nợ", count: loaiDonCounts.cong_no },
    { key: "don-cua-toi:tra_hang", label: "Trả hàng", count: loaiDonCounts.tra_hang },
    ...tabs.slice(1),
  ];
  const displayActive = activeView === "don-cua-toi" ? `don-cua-toi:${xemLoaiDon}` : activeView;
  function handleTabChange(key: string) {
    if (key.startsWith("don-cua-toi:")) {
      setXemLoaiDon(key.slice("don-cua-toi:".length) as "mua" | "cong_no" | "tra_hang");
      setView("don-cua-toi");
    } else {
      setView(key);
    }
  }

  // Thanh tom tat + nhay dung tab/filter (tieu chi UX #1/#2) - jumpTarget tieu thu 1 lan roi tu xoa
  // (setTimeout 0 chay sau khi effect cua tab con da doc prop initialFilterOverride trong cung 1 luot
  // flush), tranh ap lai gia tri cu moi lan re-render.
  // "Buoc 0 - Tao don" tren pipeline (theo yeu cau bo sung sau ra soat) - mo TaoDonTab NGAY tai day
  // (module wrapper) thay vi qua nut rieng trong DonCuaToiTab, vi pipeline hien dung chung tren MOI
  // tab (kha nang bam "Tao don" phai co bat ke dang xem tab nao). Doc lap voi showCreate cua
  // DonCuaToiTab (khong lift state len de tranh dung cham vao luong da on dinh cua tab do).
  const [showCreateFromPipeline, setShowCreateFromPipeline] = useState(false);
  const [jumpTarget, setJumpTarget] = useState<JumpTarget | null>(null);
  useEffect(() => {
    if (!jumpTarget) return;
    const t = setTimeout(() => setJumpTarget(null), 0);
    return () => clearTimeout(t);
  }, [jumpTarget]);
  function jumpTo(target: JumpTarget) {
    setJumpTarget(target);
    setView(target.tab);
  }
  const filterFor = (tab: string) => (jumpTarget?.tab === tab ? jumpTarget.filter : undefined);
  const nguoiNhanHangFor = (tab: string) => (jumpTarget?.tab === tab ? jumpTarget.nguoiNhanHang : undefined);

  const { data: luongQuyTrinh } = useQuery({
    queryKey: ["dat-mua-lk-luong-quy-trinh"],
    queryFn: () => api.get<{ steps: LuongQuyTrinhStep[] }>("/dat-mua-lk/luong-quy-trinh"),
    refetchInterval: 5 * 60_000,
  });

  // Tap role cua nguoi dang xem, khop dung tu vung roleKeys backend tra ve - dung de to mau/phong to
  // buoc "cua minh" trong PipelineFlow. "tram": dung user.la_tram that (GD4, xem AuthContext.tsx).
  const myRoleKeys = new Set<string>();
  if (canTPDvbhXacNhan) myRoleKeys.add("tp_dvbh");
  if (canKeToan) myRoleKeys.add("ke_toan");
  if (canKho) myRoleKeys.add("kho");
  if (canQC) myRoleKeys.add("qc");
  if (canTacNghiep) myRoleKeys.add("tac_nghiep");
  if (user?.la_ktv_dvbh) myRoleKeys.add("ktv");
  // GD4 (phan hoi Codex #16/#17): dung truc tiep user.la_tram (tinh that o backend, GET
  // /api/auth/me) thay vi heuristic cu "la_ktv_dvbh && khong co tram_cha" - heuristic do nham moi
  // KTV thuong (khong quan ly Ve tinh nao) thanh Tram, vi tram_cha=null cung dung cho ho.
  if (user?.la_tram) myRoleKeys.add("tram");

  // Tong so "viec cua toi" (phan hoi 2026-08-19: "Bỏ tiêu đề module... thay vào đó là button 'Việc
  // của tôi: N'") - tinh o CAP MODULE (khong chi trong MyWorkloadStrip) de dung cho nut thay the h1.
  // Cung logic loc "isMine && count>0" nhu MyWorkloadStrip, khong them nguon du lieu moi.
  const mySteps = (luongQuyTrinh?.steps ?? []).filter((s) => s.count > 0 && s.roleKeys.some((r) => myRoleKeys.has(r)));
  const tongViecCuaToi = mySteps.reduce((sum, s) => sum + s.count, 0);
  // Nut tieu de bam de mo/dong bang chi tiet tung buoc (MyWorkloadStrip) - mac dinh AN (giam chrome
  // mac dinh, tiep tuc dung tinh than "gọn diện tích" da chot o cac fix truoc). CHI ap dung cho
  // duong vao "dat-mua-lk" that su (khong phai forceView="tra-hang", entry rieng van giu tieu de +
  // hien san chi tiet nhu cu vi khong co nut tieu de nao de bam mo lai).
  const [showWorkloadDetail, setShowWorkloadDetail] = useState(false);

  // UI redesign (phan hoi Codex 2026-08-19, muc P1#3) - mac dinh THU GON danh sach toan bo cac buoc
  // (chi giu "+ Tao don"), day la trang thai bat dau moi lan mo module (khong nho qua phien, chu
  // dinh don gian - day chi la 1 toggle xem them, khong phai bo loc can nho lau dai).
  const [pipelineCollapsed, setPipelineCollapsed] = useState(true);
  const pipelineEl = (
    <PipelineFlow
      steps={luongQuyTrinh?.steps ?? []}
      myRoleKeys={myRoleKeys}
      onJump={jumpTo}
      onCreateDon={() => setShowCreateFromPipeline(true)}
      canCreateDon={canDatHo}
      inHeader={!!headerExtra}
      collapsed={pipelineCollapsed}
      onToggleCollapsed={() => setPipelineCollapsed((v) => !v)}
    />
  );

  // Nut "Việc của tôi: N" thay the tieu de trang h1 (phan hoi 2026-08-19) - CHI khi vao thang
  // "dat-mua-lk" (khong phai forceView="tra-hang", entry rieng do van hien tieu de MODULE_TITLES cua
  // no o App.tsx binh thuong). App.tsx da bo qua render h1 cho active==="dat-mua-lk" cu the de nhuong
  // cho o day, xem App.tsx. LUON hien (ke ca N=0) de khong bao gio bo trong khu vuc tieu de - chi
  // TAT tuong tac (khong con gi de mo rong) khi N=0.
  const titleButtonEl = !forceView ? (
    <button
      type="button"
      onClick={() => tongViecCuaToi > 0 && setShowWorkloadDetail((v) => !v)}
      disabled={tongViecCuaToi === 0}
      title={tongViecCuaToi === 0 ? undefined : showWorkloadDetail ? "Ẩn chi tiết việc cần làm" : "Xem chi tiết việc cần làm theo từng bước"}
      className="focus-ring font-display text-lg sm:text-xl font-extrabold text-[var(--ink-900)] enabled:hover:text-[var(--ocean-600)] transition-colors whitespace-nowrap disabled:cursor-default"
    >
      Việc của tôi: {tongViecCuaToi}
    </button>
  ) : null;
  const headerContentEl = (
    <>
      {titleButtonEl}
      {pipelineEl}
    </>
  );

  return (
    <div className="anim-in">
      {/* CHOT (theo yeu cau bo sung sau ra soat #2): co headerExtra (portal tu App.tsx, canh tieu
          de trang) thi day pipeline len do thay vi chiem 1 hang rieng ben tren Tabs - tiet kiem
          dien tich doc, dung dung pattern da co san o BacklogModule. Nut "Việc của tôi: N" (khi co)
          di CUNG portal, dat TRUOC pipeline de nam dung vi tri h1 cu. */}
      {headerExtra ? createPortal(headerContentEl, headerExtra) : headerContentEl}
      {/* UI redesign (phan hoi Codex 2026-08-19, muc P1#1) - "Viec cua toi" luon nam TRUOC Tabs, hien
          ngay khi mo module thay vi phai bam sang tab "Bao cao" moi thay (StatCard tuong tu von chi
          nam trong BaoCaoTab). Rong (return null) khi khong co viec khop role - khong chiem cho.
          SUA (phan hoi 2026-08-19): khi vao qua "dat-mua-lk" (co nut tieu de "Việc của tôi: N" o
          tren), chi tiet tung buoc nay mac dinh AN, bam nut tieu de moi mo - giam chrong mac dinh.
          Khi vao qua forceView="tra-hang" (khong co nut tieu de) van hien san nhu truoc, tranh mat
          tinh nang. */}
      {(forceView || showWorkloadDetail) && <MyWorkloadStrip steps={luongQuyTrinh?.steps ?? []} myRoleKeys={myRoleKeys} onJump={jumpTo} />}
      <Tabs active={displayActive} onChange={handleTabChange} tabs={displayTabs} />
      <Suspense fallback={<TabFallback />}>
        {activeView === "don-cua-toi" && (
          <DonCuaToiTab
            user={user}
            addToast={addToast}
            qc={qc}
            xemLoaiDon={xemLoaiDon}
            canTacNghiep={canTacNghiep}
            canTPDvbhXacNhan={canTPDvbhXacNhan}
            // GD4 (phan hoi Codex #16/#17): dung user.la_tram that (tinh o backend qua EXISTS(users
            // WHERE tram_cha = email)) thay vi heuristic "la_ktv_dvbh/la_ve_tinh && khong co tram_cha"
            // - heuristic cu nham moi KTV thuong (kkhong quan ly Ve tinh nao, tram_cha cua CHINH ho
            // cung null) thanh Tram, khien ho mac dinh vao bucket "Cho Tram duyet" luon rong. TN
            // (canTacNghiep) van giu quyen nay khong dieu kien, khop dung y cu (tram_cha cua TN gan
            // nhu luon null nen truoc day TN cung luon lot qua dieu kien nay).
            canBulkTram={canTacNghiep || !!user?.la_tram}
            canXemChiTietCa={canXemChiTietCa}
            openCase={openCase}
            initialFilterOverride={filterFor("don-cua-toi")}
            initialNguoiNhanHangOverride={nguoiNhanHangFor("don-cua-toi")}
          />
        )}
        {activeView === "phieu-xuat-kho" && (
          <PhieuXuatKhoTab
            addToast={addToast}
            qc={qc}
            canTacNghiep={canTacNghiep}
            canKho={canKho}
            canKeToan={canKeToan}
            currentEmail={user?.email ?? ""}
            isAdmin={user?.vai_tro === "Admin"}
            initialFilterOverride={filterFor("phieu-xuat-kho")}
            initialNguoiNhanHangOverride={nguoiNhanHangFor("phieu-xuat-kho")}
          />
        )}
        {activeView === "thieu-lk" && (
          <ThieuLkTab addToast={addToast} qc={qc} canKho={canKho} canTacNghiep={canTacNghiep} currentEmail={user?.email ?? ""} initialFilterOverride={filterFor("thieu-lk")} />
        )}
        {activeView === "tra-hang" && (
          <TraHangTab addToast={addToast} qc={qc} canKeToan={canKeToan} canKho={canKho} canQC={canQC} canTacNghiep={canTacNghiep} initialFilterOverride={filterFor("tra-hang")} />
        )}
        {activeView === "bao-cao" && <BaoCaoTab onJump={jumpTo} isManagerView={isManagerView} />}
        {showCreateFromPipeline && (
          <TaoDonTab
            addToast={addToast}
            qc={qc}
            canQuanLy={canTacNghiep || isGiamSat}
            onClose={() => setShowCreateFromPipeline(false)}
          />
        )}
      </Suspense>
    </div>
  );
}
