// Tab "Tiến trình chung" cua CaseDetail - thiet ke lai 2026-11-18 (chu he thong: "lam gon log voi cac buoc lien tuc gan nhau,
// de nhin, de xac nhan nhanh nhung van du; log phu an bot, co tien trinh dang ngang").
//  1. Dau tab: LUONG XU LY CA dang ngang (dung lai LuongNgang cua tab Bao hanh) - buoc dang cho to noi.
//  2. Moc gop theo DOI TUONG (cum: 1 don LK / 1 don bao hanh / 1 luong doi tra / 1 tien trinh tranh chap / 1 cuoc goi khao sat ->
//     vi pham...), khong chi theo nhan nhu truoc: cac moc LIEN TIEP cung cum = 1 the (luong ngang mini cua doi tuong + moc moi nhat +
//     "▸ Xem N log").
//  3. Log phu (log chi ghi du lieu, vd PXK "Da luu ma MISA") AN mac dinh, thong tin cua no rut thanh chip (vd "MISA: CK04969BN").
//  4. Chia theo NGAY (tieu de ngay + khoang cach toi ngay truoc), trong dong chi con gio:phut; nguoi lam chi hien ten (re chuot xem mail).
//  5. Chip loc theo nguon (nho trong localStorage).
// Du lieu: CaseDetail dung mang LichSuChungEvent (khong goi them API nao).
import { useMemo, useState } from "react";
import { Badge, type AnyBadgeTone } from "./ui/Badge";
import { LuongNgang } from "./SuaChuaPanel";
import { formatPersonDisplay, type PersonDirectory } from "../lib/personDisplay";
import type { SuaChuaMoc } from "../lib/suaChuaTimeline";
import { tr } from "../i18n/tr";

// Chi dung Tailwind class TINH (JIT khong nhan class ghep dong).
export const TIMELINE_TONE_BORDER: Record<AnyBadgeTone, string> = {
  ocean: "border-[var(--ocean-100)]",
  teal: "border-[var(--teal-100)]",
  amber: "border-[var(--amber-100)]",
  coral: "border-[var(--coral-100)]",
  orange: "border-[var(--orange-100)]",
  gray: "border-slate-200",
  indigo: "border-[var(--indigo-100)]",
  violet: "border-violet-200",
  sky: "border-sky-200",
  rose: "border-rose-200",
  lime: "border-lime-200",
  cyan: "border-cyan-200",
  fuchsia: "border-fuchsia-200",
};
export const TIMELINE_TONE_DOT: Record<AnyBadgeTone, string> = {
  ocean: "bg-[var(--ocean-500)]",
  teal: "bg-[var(--teal-500)]",
  amber: "bg-[var(--amber-500)]",
  coral: "bg-[var(--coral-500)]",
  orange: "bg-[var(--orange-500)]",
  gray: "bg-slate-400",
  indigo: "bg-[var(--indigo-500)]",
  violet: "bg-[var(--violet-500)]",
  sky: "bg-sky-500",
  rose: "bg-rose-500",
  lime: "bg-lime-500",
  cyan: "bg-cyan-500",
  fuchsia: "bg-fuchsia-500",
};

export type NguonTtc = "ca" | "gt" | "vp" | "lk" | "bh" | "dt" | "tc" | "khac";

const NGUON: { key: NguonTtc; label: string }[] = [
  { key: "ca", label: "Ca" },
  { key: "gt", label: "GT tồn" },
  { key: "vp", label: "Vi phạm · Khảo sát" },
  { key: "lk", label: "Mua hàng · Xuất kho" },
  { key: "bh", label: "Bảo hành" },
  { key: "dt", label: "Đổi trả" },
  { key: "tc", label: "Tranh chấp" },
  { key: "khac", label: "Khác" },
];

export interface LichSuChungEvent {
  key: string;
  /** epoch ms that (sap xep + chia ngay). Nguon D1 / Sheet / ISO deu quy ve day. */
  sortMs: number;
  displayTime: string;
  tone: AnyBadgeTone;
  typeLabel: string;
  actor: string | null;
  summary: string;
  /** null = khong nhay tab. */
  jumpTab: string | null;
  nguon: NguonTtc;
  /** Khoa cum doi tuong - moc LIEN TIEP cung cum gop 1 the. Mac dinh = loai moc. */
  cum?: string;
  /** Nhan badge cua the khi la cum (vd "Xuất kho LK"), mac dinh = typeLabel moc moi nhat. */
  cumNhan?: string;
  /** Tieu de doi tuong (ma don + linh kien...) - hien 1 lan o the, khong lap o tung moc. */
  cumTieuDe?: string;
  /** Nhan buoc ngan khi liet ke trong cum (bo tien to nguon). */
  buoc?: string;
  /** Noi dung khi o trong cum (da bo phan tieu de lap lai). */
  noiDung?: string;
  /** Log phu: an mac dinh, thong tin rut thanh chip. */
  phu?: boolean;
  chip?: string;
  /** Luong ngang mini cua doi tuong (gan o moc nao cung duoc, lay moc dau tien co). */
  luong?: SuaChuaMoc[];
}

const cumKey = (e: LichSuChungEvent) => e.cum ?? `${e.typeLabel}|${e.jumpTab}|${e.tone}`;

// Gio VN tu epoch.
const vnIso = (ms: number) => new Date(ms + 7 * 3600_000).toISOString();
const ngayKey = (ms: number) => vnIso(ms).slice(0, 10);
const hhmm = (ms: number) => vnIso(ms).slice(11, 16);
const ddmm = (ms: number) => {
  const s = vnIso(ms);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`;
};
const THU = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
function tieuDeNgay(ms: number) {
  const s = vnIso(ms);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} (${tr(THU[new Date(ms + 7 * 3600_000).getUTCDay()])})`;
}

interface Nhom {
  key: string;
  ds: LichSuChungEvent[]; // moc chinh (hoac ca phu khi bat "hien log phu"), moi -> cu
  phu: LichSuChungEvent[]; // log phu bi an duoc gan vao the nay
}

const LS_AN_NGUON = "dvbh_ttc_an_nguon";
const LS_HIEN_PHU = "dvbh_ttc_hien_phu";
function docLs<T>(k: string, macDinh: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : macDinh;
  } catch {
    return macDinh;
  }
}

export function TienTrinhChung({
  events,
  luongTong,
  summaryItems,
  personDir,
  onJump,
}: {
  events: LichSuChungEvent[];
  luongTong: SuaChuaMoc[];
  summaryItems: { label: string; value: number | null }[];
  personDir: PersonDirectory;
  onJump: (tab: string) => void;
}) {
  const [anNguon, setAnNguon] = useState<Set<NguonTtc>>(() => new Set(docLs<NguonTtc[]>(LS_AN_NGUON, [])));
  const [hienPhu, setHienPhu] = useState<boolean>(() => docLs(LS_HIEN_PHU, false));
  const [moThe, setMoThe] = useState<Set<string>>(() => new Set());
  const [moNoiDung, setMoNoiDung] = useState<Set<string>>(() => new Set());

  const demNguon = useMemo(() => {
    const m = new Map<NguonTtc, number>();
    for (const e of events) if (!e.phu) m.set(e.nguon, (m.get(e.nguon) ?? 0) + 1);
    return m;
  }, [events]);
  const soPhu = useMemo(() => events.filter((e) => e.phu && !anNguon.has(e.nguon)).length, [events, anNguon]);

  const nhom = useMemo<Nhom[]>(() => {
    const loc = events.filter((e) => !anNguon.has(e.nguon));
    const hien = hienPhu ? loc : loc.filter((e) => !e.phu);
    const out: Nhom[] = [];
    for (const e of hien) {
      const k = cumKey(e);
      const last = out[out.length - 1];
      if (last && last.key === k) last.ds.push(e);
      else out.push({ key: k, ds: [e], phu: [] });
    }
    if (!hienPhu) {
      // Log phu an -> gan vao the cung cum gan nhat theo thoi gian (de mo "Xem log" van thay du).
      for (const p of loc) {
        if (!p.phu) continue;
        const k = cumKey(p);
        let best: Nhom | null = null;
        let bestD = Infinity;
        for (const g of out) {
          if (g.key !== k) continue;
          const moi = g.ds[0].sortMs;
          const cu = g.ds[g.ds.length - 1].sortMs;
          const d = p.sortMs > moi ? p.sortMs - moi : p.sortMs < cu ? cu - p.sortMs : 0;
          if (d < bestD) {
            bestD = d;
            best = g;
          }
        }
        if (best) best.phu.push(p);
      }
    }
    return out;
  }, [events, anNguon, hienPhu]);

  // Chia ngay theo moc moi nhat cua the.
  const ngay = useMemo(() => {
    const out: { key: string; ms: number; nhom: Nhom[] }[] = [];
    for (const g of nhom) {
      const k = ngayKey(g.ds[0].sortMs);
      const last = out[out.length - 1];
      if (last && last.key === k) last.nhom.push(g);
      else out.push({ key: k, ms: g.ds[0].sortMs, nhom: [g] });
    }
    return out;
  }, [nhom]);

  const ten = (a: string | null) => {
    if (!a) return "";
    const t = personDir.ktv.get(a) ?? personDir.users.get(a);
    if (t) return t;
    // "Ten (mail)" -> "Ten"
    const m = a.match(/^(.+?)\s*\([^()]*@[^()]*\)\s*$/);
    return m ? m[1] : a;
  };
  const tenDay = (a: string | null) => (a ? (a.includes("(") ? a : formatPersonDisplay(a, personDir)) : "");

  const doiNguon = (k: NguonTtc) =>
    setAnNguon((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      localStorage.setItem(LS_AN_NGUON, JSON.stringify([...n]));
      return n;
    });
  const doiPhu = () =>
    setHienPhu((v) => {
      localStorage.setItem(LS_HIEN_PHU, JSON.stringify(!v));
      return !v;
    });
  const doiSet = (set: (f: (s: Set<string>) => Set<string>) => void, k: string) =>
    set((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const dongCon = (x: LichSuChungEvent, cungNgay: boolean) => (
    <li key={x.key} className={`text-xs leading-snug ${x.phu ? "text-[var(--ink-400)]" : "text-[var(--ink-600)]"}`}>
      <span className="tabular-nums text-[var(--ink-400)]">{cungNgay ? hhmm(x.sortMs) : `${ddmm(x.sortMs)} ${hhmm(x.sortMs)}`}</span>{" "}
      <span className={x.phu ? "italic" : "font-semibold text-[var(--ink-800)]"}>{x.buoc ?? x.typeLabel}</span>
      {x.actor && (
        <span className="text-[var(--ink-400)]" title={tenDay(x.actor)}>
          {" "}
          · {ten(x.actor)}
        </span>
      )}
      {(x.noiDung ?? x.summary) && (x.noiDung ?? x.summary) !== "—" && <span className="whitespace-pre-wrap"> — {x.noiDung ?? x.summary}</span>}
    </li>
  );

  const theNhom = (g: Nhom, gi: number) => {
    const e = g.ds[0];
    const cu = g.ds[g.ds.length - 1];
    const laCum = g.ds.length > 1 || g.phu.length > 0 || !!g.ds.find((x) => x.luong);
    const luong = [...g.ds, ...g.phu].find((x) => x.luong)?.luong;
    // Chip cung loai ("Mã MISA: ...") chi giu gia tri MOI NHAT (luu lai ma thi ma cu khong con dung).
    const chipTheoLoai = new Map<string, string>();
    for (const x of [...g.ds, ...g.phu].sort((a, b) => b.sortMs - a.sortMs)) {
      if (!x.chip) continue;
      const loai = x.chip.split(":")[0].trim().toLowerCase();
      if (!chipTheoLoai.has(loai)) chipTheoLoai.set(loai, x.chip);
    }
    const chips = [...chipTheoLoai.values()];
    const nguoi = [...new Set(g.ds.map((x) => x.actor).filter(Boolean) as string[])];
    const cungNgay = ngayKey(e.sortMs) === ngayKey(cu.sortMs);
    const thoiGian = g.ds.length === 1 ? hhmm(e.sortMs) : cungNgay ? `${hhmm(cu.sortMs)}–${hhmm(e.sortMs)}` : `${ddmm(cu.sortMs)} ${hhmm(cu.sortMs)} → ${hhmm(e.sortMs)}`;
    const mo = moThe.has(e.key);
    const tatCa = [...g.ds, ...g.phu].sort((a, b) => b.sortMs - a.sortMs);
    const ngan = g.ds.length <= 2 && g.phu.length === 0; // cum nho: hien luon tung dong
    const noiDungDon = e.summary;
    const dai = noiDungDon.length > 220 || noiDungDon.split("\n").length > 3;
    const moND = moNoiDung.has(e.key);

    const dau = (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-semibold tabular-nums text-[var(--ink-500)] min-w-[2.6rem]">{thoiGian}</span>
        <Badge tone={e.tone}>{laCum ? (e.cumNhan ?? e.typeLabel) : e.typeLabel}</Badge>
        {g.ds.length > 1 && <Badge tone="gray">{tr("{0} bước", g.ds.length)}</Badge>}
        {nguoi.length > 0 && (
          <span className="text-xs text-[var(--ink-400)] truncate" title={nguoi.map(tenDay).join("\n")}>
            {nguoi.map(ten).join(", ")}
          </span>
        )}
      </div>
    );

    return (
      <div key={e.key + gi} className={`relative pl-4 border-l-2 pb-2.5 ${TIMELINE_TONE_BORDER[e.tone]}`}>
        <div className={`absolute -left-[5px] top-1.5 w-2 h-2 rounded-full ${TIMELINE_TONE_DOT[e.tone]}`}></div>
        <div
          role={e.jumpTab ? "button" : undefined}
          tabIndex={e.jumpTab ? 0 : undefined}
          onClick={e.jumpTab ? () => onJump(e.jumpTab!) : undefined}
          onKeyDown={e.jumpTab ? (ev) => ev.key === "Enter" && onJump(e.jumpTab!) : undefined}
          className={`rounded-r-lg px-1 -mx-1 ${e.jumpTab ? "cursor-pointer hover:bg-[var(--bg)]" : ""}`}
          title={e.jumpTab ? tr("Bấm để mở tab chi tiết") : undefined}
        >
          {dau}
          {laCum ? (
            <>
              {e.cumTieuDe && <div className="text-sm font-medium text-[var(--ink-800)] mt-0.5">{e.cumTieuDe}</div>}
              {ngan ? (
                <ul className="mt-0.5 space-y-0.5">{g.ds.map((x) => dongCon(x, true))}</ul>
              ) : (
                !mo && <ul className="mt-0.5">{dongCon(e, true)}</ul>
              )}
            </>
          ) : (
            <div className={`text-sm text-[var(--ink-600)] whitespace-pre-wrap mt-0.5 ${dai && !moND ? "line-clamp-3" : ""}`}>{noiDungDon}</div>
          )}
        </div>
        {laCum && luong && luong.length > 0 && (
          <div className="mt-1">
            <LuongNgang moc={luong} anGhiChu />
          </div>
        )}
        {(chips.length > 0 || (laCum && !ngan) || dai) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <span key={c} className="rounded bg-[var(--surface-100)] px-1.5 py-0.5 text-[11px] text-[var(--ink-600)]">
                {c}
              </span>
            ))}
            {laCum && !ngan && (
              <button type="button" onClick={() => doiSet(setMoThe, e.key)} className="text-xs font-semibold text-[var(--ocean-600)] hover:underline">
                {mo ? tr("▴ Thu gọn") : g.phu.length ? tr("▸ Xem {0} log (gồm {1} log phụ)", tatCa.length, g.phu.length) : tr("▸ Xem {0} log", tatCa.length)}
              </button>
            )}
            {!laCum && dai && (
              <button type="button" onClick={() => doiSet(setMoNoiDung, e.key)} className="text-xs font-semibold text-[var(--ocean-600)] hover:underline">
                {moND ? tr("▴ Thu gọn") : tr("▸ Xem thêm")}
              </button>
            )}
          </div>
        )}
        {laCum && !ngan && mo && <ol className="mt-1 space-y-0.5 border-l border-dashed border-[var(--line)] pl-3">{tatCa.map((x) => dongCon(x, ngayKey(x.sortMs) === ngayKey(e.sortMs)))}</ol>}
      </div>
    );
  };

  return (
    <div>
      {luongTong.length > 0 && (
        <div className="mb-3 rounded-lg border border-[var(--line)] px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-400)] mb-1">{tr("Luồng xử lý ca")}</div>
          <LuongNgang moc={luongTong} />
        </div>
      )}
      {summaryItems.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-600)] mb-3 px-2.5 py-2 rounded-lg bg-slate-50 border border-[var(--line)]">
          {summaryItems.map((it) => (
            <span key={it.label}>
              {it.label}: <strong className="text-[var(--ink-900)]">{it.value!.toFixed(1)} {tr("ngày")}</strong>
            </span>
          ))}
        </div>
      )}
      {events.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {NGUON.filter((n) => demNguon.get(n.key)).map((n) => {
            const an = anNguon.has(n.key);
            return (
              <button
                key={n.key}
                type="button"
                onClick={() => doiNguon(n.key)}
                className={`rounded-full border px-2 py-0.5 text-xs ${an ? "border-[var(--line)] text-[var(--ink-400)] line-through" : "border-[var(--ocean-500)] bg-[var(--ocean-100)] text-[var(--ocean-700)] font-medium"}`}
                title={an ? tr("Đang ẩn - bấm để hiện") : tr("Bấm để ẩn")}
              >
                {tr(n.label)} <span className="opacity-70">{demNguon.get(n.key)}</span>
              </button>
            );
          })}
          {soPhu > 0 && (
            <label className="ml-1 inline-flex items-center gap-1 text-xs text-[var(--ink-500)] cursor-pointer">
              <input type="checkbox" checked={hienPhu} onChange={doiPhu} />
              {tr("Hiện log phụ ({0})", soPhu)}
            </label>
          )}
        </div>
      )}
      {events.length === 0 && <div className="text-sm text-[var(--ink-400)] italic">{tr("Chưa có mốc nào cho ca này.")}</div>}
      {events.length > 0 && nhom.length === 0 && <div className="text-sm text-[var(--ink-400)] italic">{tr("Không có mốc nào theo bộ lọc nguồn đang chọn.")}</div>}
      {ngay.map((d, di) => {
        const next = ngay[di + 1];
        const cuNhat = d.nhom[d.nhom.length - 1];
        const cachNgay = next ? (cuNhat.ds[cuNhat.ds.length - 1].sortMs - next.nhom[0].ds[0].sortMs) / 86400000 : null;
        return (
          <section key={d.key} className="mb-1">
            <div className="flex items-center gap-2 py-1 text-xs">
              <span className="font-semibold text-[var(--ink-700)]">{tieuDeNgay(d.ms)}</span>
              <span className="h-px flex-1 bg-[var(--line)]" />
            </div>
            <div className="pl-1">{d.nhom.map(theNhom)}</div>
            {cachNgay !== null && cachNgay >= 0.05 && (
              <div className="text-[11px] text-[var(--ink-400)] pl-4 pb-1">
                {tr("↳ cách mốc trước")} <strong className="text-[var(--ink-700)]">{cachNgay.toFixed(1)} {tr("ngày")}</strong>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
