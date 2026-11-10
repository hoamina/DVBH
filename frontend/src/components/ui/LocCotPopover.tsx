import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { tr } from "../../i18n/tr";

/** Loc kieu Excel tren tieu de cot (2026-11-10) - dung chung cho PaginatedTable + thanh "Bộ lọc" ngoai bang.
 * Gia tri gui len server nguyen dang (backend lib/locCot.ts): { in } chon nhieu / { q } chua tu / { tu, den } khoang ngay-so. */
export type KieuLocCot = "list" | "text" | "date" | "number";
export interface LocCot {
  in?: string[];
  q?: string;
  tu?: string;
  den?: string;
}
export interface GiaTriLoc {
  v: string | null;
  n: number;
}
export const GIA_TRI_TRONG = "__TRONG__";

export function locCotDangBat(f: LocCot | undefined): boolean {
  return !!f && ((f.in?.length ?? 0) > 0 || !!f.q?.trim() || !!f.tu || !!f.den);
}

export function boDau(v: string): string {
  return v.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

export function tomTatLoc(f: LocCot | undefined, nhanGiaTri: (v: string) => string, kieu: KieuLocCot): string {
  if (!f) return "";
  if (f.in?.length) return f.in.length === 1 ? nhanGiaTri(f.in[0]) : tr("{0} giá trị", f.in.length);
  if (f.q) return `“${f.q}”`;
  if (f.tu || f.den) {
    const fmt = (x?: string) => (x ? (kieu === "date" ? x.split("-").reverse().join("/") : x) : "…");
    return `${fmt(f.tu)} – ${fmt(f.den)}`;
  }
  return "";
}

interface Props {
  kieu: KieuLocCot;
  tieuDe: ReactNode;
  value: LocCot | undefined;
  onChange: (v: LocCot | undefined) => void;
  /** Bat buoc voi kieu "list": tai danh sach gia tri (+ so ca) cua cot, da ap cac bo loc KHAC. */
  layGiaTri?: () => Promise<GiaTriLoc[]>;
  nhanGiaTri?: (v: string) => string;
  /** Sap xep tu popup (tuy chon). */
  sapXep?: { dangChon: "asc" | "desc" | null; onChon: (dir: "asc" | "desc") => void };
  /** Nut mo popup - nhan (dangMo, mo) va tra ve phan tu bam. */
  nut: (p: { dangBat: boolean; mo: () => void; ref: (el: HTMLElement | null) => void }) => ReactNode;
}

const nhanMacDinh = (v: string) => (v === GIA_TRI_TRONG ? tr("(Trống)") : v);

export function LocCotPopover({ kieu, tieuDe, value, onChange, layGiaTri, nhanGiaTri = nhanMacDinh, sapXep, nut }: Props) {
  const [mo, setMo] = useState(false);
  const neo = useRef<HTMLElement | null>(null);
  const hop = useRef<HTMLDivElement | null>(null);
  const [viTri, setViTri] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Nhap nhap (chi ap dung khi bam "Áp dụng").
  const [chon, setChon] = useState<Set<string>>(new Set());
  const [tim, setTim] = useState("");
  const [q, setQ] = useState("");
  const [tu, setTu] = useState("");
  const [den, setDen] = useState("");
  const [giaTri, setGiaTri] = useState<GiaTriLoc[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  const moPopup = () => {
    setChon(new Set(value?.in ?? []));
    setQ(value?.q ?? "");
    setTu(value?.tu ?? "");
    setDen(value?.den ?? "");
    setTim("");
    setMo(true);
    if (kieu === "list" && layGiaTri) {
      setGiaTri(null);
      setLoi(null);
      layGiaTri()
        .then(setGiaTri)
        .catch((e: unknown) => setLoi(e instanceof Error ? e.message : String(e)));
    }
  };

  const datViTri = () => {
    if (!neo.current) return;
    const r = neo.current.getBoundingClientRect();
    const rong = 288;
    setViTri({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - rong - 8)) });
  };
  useLayoutEffect(() => {
    if (mo) datViTri();
  }, [mo]);

  useEffect(() => {
    if (!mo) return;
    const dong = (e: MouseEvent) => {
      if (hop.current?.contains(e.target as Node) || neo.current?.contains(e.target as Node)) return;
      setMo(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMo(false);
    // Cuon trang / cuon ngang bang -> popup di theo nut (khong dong, tranh mat lua chon dang tick do lo tay cuon).
    const cuon = (e: Event) => {
      if (hop.current?.contains(e.target as Node)) return;
      datViTri();
    };
    document.addEventListener("mousedown", dong);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", cuon, true);
    window.addEventListener("resize", datViTri);
    return () => {
      window.removeEventListener("resize", datViTri);
      document.removeEventListener("mousedown", dong);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", cuon, true);
    };
  }, [mo]);

  const dsHien = useMemo(() => {
    const ds = (giaTri ?? []).map((g) => ({ v: g.v === null || g.v === "" ? GIA_TRI_TRONG : g.v, n: g.n }));
    // gop gia tri trong (null + "")
    const gop = new Map<string, number>();
    for (const g of ds) gop.set(g.v, (gop.get(g.v) ?? 0) + g.n);
    // gia tri dang chon nhung khong con trong danh sach (do bo loc khac) van hien de bo chon duoc
    for (const v of value?.in ?? []) if (!gop.has(v)) gop.set(v, 0);
    const k = boDau(tim.trim());
    return [...gop.entries()]
      .map(([v, n]) => ({ v, n, nhan: nhanGiaTri(v) }))
      .filter((x) => !k || boDau(x.nhan).includes(k))
      .sort((a, b) => (a.v === GIA_TRI_TRONG ? 1 : b.v === GIA_TRI_TRONG ? -1 : a.nhan.localeCompare(b.nhan, "vi")));
  }, [giaTri, tim, nhanGiaTri, value]);

  const apDung = () => {
    let next: LocCot | undefined;
    if (kieu === "list") next = chon.size ? { in: [...chon] } : undefined;
    else if (kieu === "text") next = q.trim() ? { q: q.trim() } : undefined;
    else next = tu || den ? { ...(tu ? { tu } : {}), ...(den ? { den } : {}) } : undefined;
    onChange(next);
    setMo(false);
  };

  const dangBat = locCotDangBat(value);
  const tatCaHienDaChon = dsHien.length > 0 && dsHien.every((x) => chon.has(x.v));

  return (
    <>
      {nut({ dangBat, mo: () => (mo ? setMo(false) : moPopup()), ref: (el) => (neo.current = el) })}
      {mo &&
        createPortal(
          <div
            ref={hop}
            style={{ position: "fixed", top: viTri.top, left: viTri.left, width: 288 }}
            className="z-50 rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-xl text-sm normal-case font-normal text-[var(--ink-700)] anim-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 pt-2.5 pb-1.5 text-xs font-semibold text-[var(--ink-400)] uppercase tracking-wide">{tieuDe}</div>
            {sapXep && (
              <div className="px-1.5 pb-1.5 border-b border-[var(--line)]">
                {(["asc", "desc"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      sapXep.onChon(d);
                      setMo(false);
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-50 ${sapXep.dangChon === d ? "font-semibold text-[var(--ocean-600)]" : ""}`}
                  >
                    {d === "asc" ? tr("↑ Sắp xếp tăng dần (A→Z, cũ→mới)") : tr("↓ Sắp xếp giảm dần (Z→A, mới→cũ)")}
                    {sapXep.dangChon === d && " ✓"}
                  </button>
                ))}
              </div>
            )}

            <div className="p-3 space-y-2">
              {kieu === "list" && (
                <>
                  <input
                    autoFocus
                    value={tim}
                    onChange={(e) => setTim(e.target.value)}
                    placeholder={tr("Tìm giá trị…")}
                    className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                  {loi ? (
                    <div className="text-xs text-[var(--coral-600)]">{tr("Không tải được danh sách giá trị.")} {loi}</div>
                  ) : giaTri === null ? (
                    <div className="text-xs text-[var(--ink-400)] py-2">{tr("Đang tải danh sách giá trị…")}</div>
                  ) : (
                    <>
                      <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tatCaHienDaChon}
                          onChange={() => {
                            const next = new Set(chon);
                            for (const x of dsHien) tatCaHienDaChon ? next.delete(x.v) : next.add(x.v);
                            setChon(next);
                          }}
                        />
                        {tim ? tr("Chọn tất cả kết quả tìm") : tr("Chọn tất cả")}
                        {chon.size > 0 && (
                          <button type="button" onClick={() => setChon(new Set())} className="ml-auto font-normal text-[var(--ocean-600)] hover:underline">
                            {tr("Bỏ chọn ({0})", chon.size)}
                          </button>
                        )}
                      </label>
                      <div className="max-h-60 overflow-y-auto border border-[var(--line)] rounded-lg py-1">
                        {dsHien.length === 0 && <div className="px-2 py-2 text-xs text-[var(--ink-400)]">{tr("Không có giá trị phù hợp.")}</div>}
                        {dsHien.map((x) => (
                          <label key={x.v} className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-slate-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={chon.has(x.v)}
                              onChange={() => {
                                const next = new Set(chon);
                                if (next.has(x.v)) next.delete(x.v);
                                else next.add(x.v);
                                setChon(next);
                              }}
                            />
                            <span className={`flex-1 truncate ${x.v === GIA_TRI_TRONG ? "italic text-[var(--ink-400)]" : ""}`} title={x.nhan}>
                              {x.nhan}
                            </span>
                            <span className="font-mono text-[var(--ink-400)]">{x.n}</span>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
              {kieu === "text" && (
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && apDung()}
                  placeholder={tr("Chứa từ… (không phân biệt dấu)")}
                  className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
              )}
              {(kieu === "date" || kieu === "number") && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-[var(--ink-400)]">
                    {kieu === "date" ? tr("Từ ngày") : tr("Từ")}
                    <input
                      type={kieu === "date" ? "date" : "number"}
                      value={tu}
                      onChange={(e) => setTu(e.target.value)}
                      className="focus-ring mt-0.5 w-full border border-[var(--line)] rounded-lg px-2 py-1.5 text-sm text-[var(--ink-700)]"
                    />
                  </label>
                  <label className="text-xs text-[var(--ink-400)]">
                    {kieu === "date" ? tr("Đến ngày") : tr("Đến")}
                    <input
                      type={kieu === "date" ? "date" : "number"}
                      value={den}
                      onChange={(e) => setDen(e.target.value)}
                      className="focus-ring mt-0.5 w-full border border-[var(--line)] rounded-lg px-2 py-1.5 text-sm text-[var(--ink-700)]"
                    />
                  </label>
                  {kieu === "date" && (
                    <div className="col-span-2 text-[11px] text-[var(--ink-400)]">{tr("Chọn 1 ngày: điền cùng ngày ở cả 2 ô. Để trống 1 ô = không giới hạn.")}</div>
                  )}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                {dangBat && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(undefined);
                      setMo(false);
                    }}
                    className="mr-auto text-xs text-[var(--coral-600)] hover:underline"
                  >
                    {tr("✕ Xóa lọc cột này")}
                  </button>
                )}
                <button type="button" onClick={() => setMo(false)} className="px-2.5 py-1 rounded-lg text-xs hover:bg-slate-100">
                  {tr("Hủy")}
                </button>
                <button type="button" onClick={apDung} className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--ocean-500)] text-white hover:bg-[var(--ocean-600)]">
                  {tr("Áp dụng")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
