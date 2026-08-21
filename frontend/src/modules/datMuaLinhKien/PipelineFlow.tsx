import { useState, useEffect, useRef } from "react";
import type { LuongQuyTrinhStep, JumpTarget } from "./types";
import { STEP_SHORT_LABEL, STEP_DESCRIPTION, PIPELINE_NOTCH, PIPELINE_SEG_WIDTH, PXK_TRANG_THAI_TONE, PXK_MINI_STEPS, PXK_MINI_LABEL, PXK_MINI_NHANH_RE, PXK_MINI_SEG_WIDTH } from "./constants";

// "Luong quy trinh" pipeline UI (thanh chevron so dem theo buoc) dung chung boi DatMuaLinhKienModule
// (tab tong quan) va PhieuXuatKhoTab (mini-pipeline PXK) - tach tu DatMuaLinhKienModule.tsx (UI
// redesign Phase 3, phan hoi Codex 2026-08-19).

// "Viec cua toi" (UI redesign phan hoi Codex 2026-08-19, muc P1#1) - loc TRUC TIEP tu du lieu
// luong-quy-trinh da co san (khong goi API moi, khong them logic nghiep vu moi) lay dung cac buoc
// isMine (roleKeys giao voi myRoleKeys) VA count>0, sap xep giam dan theo so luong - dat NGAY dau
// trang thay vi phai bam sang tab "Bao cao" moi thay (truoc do StatCard tuong tu chi nam trong
// BaoCaoTab). Tai su dung StatCard (size sm) de dong bo hinh anh voi BaoCaoTab, khong tao pattern
// chip moi rieng.
export function MyWorkloadStrip({
  steps, myRoleKeys, onJump,
}: {
  steps: LuongQuyTrinhStep[]; myRoleKeys: Set<string>; onJump: (t: JumpTarget) => void;
}) {
  const mine = steps.filter((s) => s.count > 0 && s.roleKeys.some((r) => myRoleKeys.has(r))).sort((a, b) => b.count - a.count);
  if (mine.length === 0) return null;
  // SUA (phan hoi 2026-08-19 #4: "chiếm hẳn 1 dòng, và rất to") - doi tu luoi StatCard size="sm"
  // (moi the min-w-[110px], 2 dong noi dung, co border/shadow rieng) sang 1 HANG PILL GON, nhan +
  // so dem NAM CHUNG 1 dong duy nhat, dung dung ngon ngu badge tron do da co san o Tabs.tsx ("nhu
  // thong bao tin nhan") - tiet kiem dien tich doc dang ke so voi luoi the cu.
  return (
    <div className="mb-2 flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-semibold text-[var(--ink-500)] uppercase tracking-wide shrink-0">Việc của tôi</span>
      {mine.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onJump({ tab: s.tab, filter: s.filter, nguoiNhanHang: "" })}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-[var(--coral-100)] hover:brightness-95 text-[var(--coral-700)] pl-2.5 pr-1.5 py-1 text-xs font-semibold transition-all"
        >
          {STEP_SHORT_LABEL[s.key] ?? s.label}
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--coral-500)] text-white text-[10px] font-bold leading-none">
            {s.count > 99 ? "99+" : s.count}
          </span>
        </button>
      ))}
    </div>
  );
}

// Thanh dieu huong dang PIPELINE thay cho SummaryStrip cu. Vong 5: chu he thong van thay "xau" sau ca
// vong 3/4 dung ky thuat clip-path chevron long khop - RA SOAT LAI TOAN BO HINH HOC va phat hien 1 LOI
// THAT (khong phai gu tham my): moi doan chi dat CANH NHAU (khong chong len), nhung 1 notch "khuyet V"
// chi thuc su khop voi 1 diem nhon ("<" tao boi mep phai) NEU 2 doan CHONG LEN NHAU dung PIPELINE_NOTCH
// px - neu khong chong len, diem nhon cua doan truoc (0 chieu cao tai canh phai) dung ngay canh phan
// "day du chieu cao" cua notch doan sau, tao ra 1 buoc nhay dot ngot roi 1 "eo that lung" thua (giong
// hinh "con thoi") ngay sau do thay vi 1 mui ten lien mach duy nhat - day chinh la nguyen nhan "xau".
// Sua: moi doan (tru doan dau) dung `marginLeft: -PIPELINE_NOTCH` de CHONG vao doan truoc dung do sau
// notch; trong vung chong nay ca 2 doan co hinh dang giong het nhau (cung tap tu day du -> 0), nen doan
// SAU (ve sau trong DOM, tu nhien de len tren khi khong dinh position/z-index) hoan toan che doan truoc
// - ket qua la 1 mui ten mau cua doan SAU chen giua 2 than hinh chu nhat, dung 1 duong noi lien mach.
// 4 yeu cau cu van giu nguyen: khong nhap nhay ca o (chi 1 cham nho canh nhan o muc khan cap nhat), mau
// nen mac dinh la gradient tang dan do dam theo vi tri (pipelineGradientStyle), o co viec can xu ly ghi
// de bang mau dac amber/coral, khong con tien to "B{n}.". Vong 7: chu he thong thay cac o "khong deu
// nhau" (dang tu co dan theo do dai nhan) - doi sang CHIEU RONG CO DINH (PIPELINE_SEG_WIDTH) cho moi
// o deu nhau tam tap, bo "whitespace-nowrap" tren nhan de chu dai tu XUONG DONG thay vi day rong o.
export function pipelineChevronClip(hasLeftNotch: boolean, hasRightPoint: boolean): string {
  const d = PIPELINE_NOTCH;
  const pts = ["0 0", hasRightPoint ? `calc(100% - ${d}px) 0` : "100% 0"];
  if (hasRightPoint) pts.push("100% 50%");
  pts.push(hasRightPoint ? `calc(100% - ${d}px) 100%` : "100% 100%", "0 100%");
  if (hasLeftNotch) pts.push(`${d}px 50%`);
  return `polygon(${pts.join(", ")})`;
}
export function pipelineGradientStyle(t: number): { background: string; color: string } {
  const r = Math.round(221 + (10 - 221) * t);
  const g = Math.round(241 + (70 - 241) * t);
  const b = Math.round(251 + (102 - 251) * t);
  return { background: `rgb(${r}, ${g}, ${b})`, color: t > 0.55 ? "#ffffff" : "#0e5d85" };
}
// CHOT (ra soat module "Dat Mua Linh Kien 2.0" #15):
// 1) Gradient mo dan (mask) o mep phai khi con noi dung bi cat - tu an khi da cuon het, dua theo
//    scrollLeft that su (khong phai gia dinh tinh).
// 2) onJump tu day (khong phai tu BaoCaoTab) LUON truyen nguoiNhanHang="" - so lieu tren pipeline la
//    TOAN HE THONG nen khi nhay sang tab dich phai CHU DONG xoa filter KTV cu dang ap dung, tranh
//    danh sach dich bi loc hep con so tren pipeline lai la tong toan he thong (khong khop nhau).
// 3) Cum "Tra hang" (6 buoc tra_hang_*) chi DOI MAU NEN (coral co dinh) o trang thai "yen" (khong
//    urgent/attention) thay vi gradient theo vi tri nhu cac buoc khac - GIU NGUYEN hinh chevron/kich
//    thuoc (chot voi chu he thong: "chỉ cần tô màu khác, không vẽ lại" - khong doi sang bo tron/pill).
export function PipelineFlow({
  steps, myRoleKeys, onJump, onCreateDon, canCreateDon, inHeader, collapsed, onToggleCollapsed,
}: {
  steps: LuongQuyTrinhStep[]; myRoleKeys: Set<string>; onJump: (t: JumpTarget) => void;
  // CHOT (theo yeu cau bo sung sau ra soat): "Buoc 0 - Tao don" dat DAU thanh pipeline - KHONG den tu
  // /luong-quy-trinh (khong phai 1 so dem, la 1 LOI TAT hanh dong luon co san bat ke co viec cho hay
  // khong) - bam mo thang TaoDonTab thay vi nhay tab+filter nhu cac buoc con lai.
  onCreateDon: () => void;
  canCreateDon: boolean;
  // Khi duoc portal len cung hang voi tieu de trang (App.tsx headerExtra) - bo margin-bottom vi luc
  // do no la 1 flex item CANH tieu de, khong con la 1 khoi rieng phia tren noi dung.
  inHeader?: boolean;
  // UI redesign (phan hoi Codex 2026-08-19, muc P1#3): thu gon danh sach TOAN BO cac buoc (toan he
  // thong) mac dinh, chi giu "+ Tao don" luon hien (day la loi tat hanh dong, KHONG duoc an - xem
  // comment onCreateDon o tren) + 1 nut toggle rieng NGOAI khoi pill chevron (tranh dung vao logic
  // hinh hoc clip-path da duoc tinh chinh rat ky o cac vong truoc).
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function update() {
      if (!el) return;
      setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    }
    update();
    el.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [steps.length, canCreateDon]);

  if (steps.length === 0 && !canCreateDon) return null;
  // SUA BUG (phan hoi 2026-08-19 #2, "xem full luồng quy trình bị tràn màn hình"): thieu min-w-0 tren
  // ca 2 lop flex-item (hang ngoai VA khoi "relative" boc scroll-area) - mac dinh trinh duyet dat
  // min-width:auto cho flex item, buoc ca hang phai no rong bang TONG chieu rong noi dung thay vi cho
  // phep overflow-x-auto ben trong tu cuon. Dac biet nghiem trong khi inHeader=true (portal vao
  // headerExtra cua App.tsx, 1 flex-row hep canh tieu de trang) - min-w-0 phai co O CA 2 CAP thi
  // overflow-x-auto moi thuc su phat huy tac dung thay vi day tran ca trang.
  return (
    <div className={`flex items-center gap-2 min-w-0 ${inHeader ? "" : "mb-3"}`}>
      <div className="relative min-w-0 flex-1">
      <div ref={scrollRef} className="overflow-x-auto pb-0.5">
        <div className="flex w-max items-stretch overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface)] py-1 shadow-sm">
          {canCreateDon && (
            <div className="shrink-0">
              <button
                type="button"
                onClick={onCreateDon}
                style={{
                  width: PIPELINE_SEG_WIDTH,
                  clipPath: pipelineChevronClip(false, true),
                  paddingLeft: 14,
                  paddingRight: PIPELINE_NOTCH + 6,
                  background: "var(--teal-500)",
                  color: "white",
                }}
                className="focus-ring flex h-full flex-col items-center justify-center py-2 text-center transition-all hover:brightness-95"
                title="Tạo đơn đặt linh kiện mới"
              >
                <span className="text-[10px] font-semibold leading-tight">＋ Tạo đơn</span>
              </button>
            </div>
          )}
          {!collapsed && steps.map((s, i) => {
            const isMine = s.roleKeys.some((r) => myRoleKeys.has(r));
            const hasCount = s.count > 0;
            const urgent = hasCount && isMine;
            const attention = hasCount && !isMine;
            const isTraHang = s.key.startsWith("tra_hang_");
            const toneClass = urgent ? "bg-[var(--coral-500)] text-white" : attention ? "bg-[var(--amber-500)] text-white" : "";
            // "Tao don" (neu co) luon dung TRUOC nen tu step data dau tien (i===0) tro di deu co 1
            // buoc dung truoc no roi - chi that su la "diem dau tien cua ca thanh" khi KHONG co nut
            // Tao don VA i===0.
            const isVeryFirst = i === 0 && !canCreateDon;
            const t = steps.length > 1 ? i / (steps.length - 1) : 0;
            return (
              <div
                key={s.key}
                className={`shrink-0 ${urgent ? "pipeline-urgent-ring" : ""}`}
                style={{ marginLeft: isVeryFirst ? 0 : -PIPELINE_NOTCH }}
              >
                <button
                  type="button"
                  onClick={() => onJump({ tab: s.tab, filter: s.filter, nguoiNhanHang: "" })}
                  style={{
                    width: PIPELINE_SEG_WIDTH,
                    clipPath: pipelineChevronClip(!isVeryFirst, true),
                    paddingLeft: isVeryFirst ? 14 : PIPELINE_NOTCH + 6,
                    paddingRight: PIPELINE_NOTCH + 6,
                    ...(toneClass ? {} : isTraHang ? { background: "var(--coral-100)", color: "var(--coral-700)" } : pipelineGradientStyle(t)),
                  }}
                  className={`focus-ring flex h-full flex-col items-center justify-center py-2 text-center transition-all hover:brightness-95 ${toneClass}`}
                  title={STEP_DESCRIPTION[s.key] ?? s.label}
                >
                  <span className="flex items-center gap-1">
                    {urgent && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white motion-safe:animate-pulse" />}
                    <span className="text-[10px] font-semibold leading-tight">{STEP_SHORT_LABEL[s.key] ?? s.label}</span>
                  </span>
                  <span className={`leading-tight tabular-nums ${hasCount ? "text-sm font-extrabold" : "text-xs font-medium opacity-80"}`}>{s.count}</span>
                </button>
              </div>
            );
          })}
          {!collapsed && (
            <div
              style={{
                width: PIPELINE_SEG_WIDTH,
                clipPath: pipelineChevronClip(true, false),
                marginLeft: -PIPELINE_NOTCH,
                paddingLeft: PIPELINE_NOTCH + 6,
                paddingRight: 14,
              }}
              className="flex shrink-0 flex-col items-center justify-center bg-[var(--surface-100)] py-2 text-center text-[var(--ink-400)]"
            >
              <span className="text-[10px] font-semibold leading-tight">🏁 Kết thúc</span>
            </div>
          )}
        </div>
      </div>
      {canScrollRight && !collapsed && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 bottom-0.5 w-10 rounded-r-full"
          style={{ background: "linear-gradient(to right, transparent, var(--bg))" }}
        />
      )}
      </div>
      {steps.length > 0 && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="focus-ring shrink-0 whitespace-nowrap text-xs font-semibold text-[var(--ink-500)] underline decoration-dotted underline-offset-2 hover:text-[var(--ink-700)]"
        >
          {collapsed ? `Xem toàn bộ quy trình (${steps.length}) ▾` : "Thu gọn quy trình ▴"}
        </button>
      )}
    </div>
  );
}

export function PxkMiniPipeline({ trangThai }: { trangThai: string }) {
  const idxHienTai = PXK_MINI_STEPS.indexOf(trangThai as (typeof PXK_MINI_STEPS)[number]);
  const isNhanhRe = PXK_MINI_NHANH_RE.has(trangThai);
  return (
    <div className="mb-3 overflow-x-auto pb-0.5">
      <div className="flex w-max items-stretch overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface)] py-0.5 shadow-sm">
        {PXK_MINI_STEPS.map((s, i) => {
          const isFirst = i === 0;
          // "Da qua" chi co y nghia khi con dang di tren truc chinh (idxHienTai>=0) - neu da re nhanh,
          // ca 5 buoc chinh deu coi la nen/trung tinh, khong to dam buoc nao tren truc nua.
          const daQua = idxHienTai >= 0 && i < idxHienTai;
          const dangO = idxHienTai >= 0 && i === idxHienTai;
          const toneStyle = dangO
            ? { background: "var(--ocean-500)", color: "white" }
            : daQua
              ? { background: "var(--teal-100)", color: "var(--teal-700)" }
              : { background: "var(--surface-100)", color: "var(--ink-400)" };
          return (
            <div key={s} className="shrink-0" style={{ marginLeft: isFirst ? 0 : -PIPELINE_NOTCH }}>
              <div
                style={{
                  width: PXK_MINI_SEG_WIDTH,
                  clipPath: pipelineChevronClip(!isFirst, true),
                  paddingLeft: isFirst ? 12 : PIPELINE_NOTCH + 5,
                  paddingRight: PIPELINE_NOTCH + 5,
                  ...toneStyle,
                }}
                className="flex h-full items-center justify-center py-1.5 text-center"
              >
                <span className="text-[9.5px] font-semibold leading-tight">{PXK_MINI_LABEL[s]}</span>
              </div>
            </div>
          );
        })}
        {isNhanhRe && (
          <div className="shrink-0" style={{ marginLeft: -PIPELINE_NOTCH }}>
            <div
              style={{
                width: PXK_MINI_SEG_WIDTH + 10,
                clipPath: pipelineChevronClip(true, false),
                paddingLeft: PIPELINE_NOTCH + 5,
                paddingRight: 12,
                background: PXK_TRANG_THAI_TONE[trangThai] === "teal" ? "var(--teal-500)" : "var(--ink-400)",
              }}
              className="flex h-full items-center justify-center py-1.5 text-center text-white"
            >
              <span className="text-[9.5px] font-semibold leading-tight">{trangThai === "Ke toan huy" ? "KT huỷ" : trangThai === "Hang tru kho" ? "Trừ kho" : "Kết thúc"}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
