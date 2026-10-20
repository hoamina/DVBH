import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useMoHoSoLinhKien } from "./HoSoLinhKienProvider";

// O "Tra tồn LK" canh o "Tra cứu ID/Serial" tren TopBar (2026-10-20): go ma HOAC ten linh kien -> danh sach ma khop
// kem ton MB / MN / KTV (GET /api/ton-kho-lk/tim), bam 1 dong -> mo "Hồ sơ linh kiện" (ton tung kho, PO, ca thieu...).
// Chi hien khi co quyen module "missing-parts" (cung dieu kien Ho so linh kien - useMoHoSoLinhKien() tra null).
interface Row { ma_hang: string; ten_hang: string | null; dvt: string | null; ton_mb: number; ton_mn: number; ton_ktv: number; co_du_lieu_ton: number }

const n = (v: number | null | undefined) => (v ? Math.round(v * 100) / 100 : 0).toLocaleString("vi-VN");

export function TonKhoSearch({ className = "w-44 lg:w-56" }: { className?: string }) {
  const mo = useMoHoSoLinhKien();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const res = useQuery({
    queryKey: ["ton-kho-lk-tim", debounced],
    queryFn: () => api.get<{ rows: Row[]; phien_ban: string | null }>(`/ton-kho-lk/tim?q=${encodeURIComponent(debounced)}`),
    enabled: !!mo && debounced.length >= 2,
    staleTime: 60_000,
  });

  if (!mo) return null;
  const rows = res.data?.rows ?? [];
  const chon = (r: Row) => {
    setOpen(false);
    mo(r.ma_hang, r.ten_hang);
  };

  return (
    <div ref={boxRef} className={`relative shrink-0 ${className}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (rows.length === 1) chon(rows[0]);
          else setOpen(true);
        }}
      >
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-400)] text-sm">📦</span>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          placeholder="Tra tồn LK (mã/tên)…"
          title="Tra tồn kho linh kiện theo mã hoặc tên"
          className="focus-ring w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 border border-transparent focus:bg-white focus:border-[var(--ocean-400)] text-sm"
        />
      </form>
      {open && debounced.length >= 2 && (
        <div className="absolute left-0 mt-1.5 w-[560px] max-w-[90vw] max-h-[60vh] overflow-auto bg-[var(--surface)] border border-[var(--line)] rounded-xl shadow-lg z-40 anim-in">
          {res.isLoading ? (
            <div className="px-3 py-3 text-sm text-[var(--ink-400)]">Đang tìm…</div>
          ) : res.isError ? (
            <div className="px-3 py-3 text-sm text-[var(--coral-500)]">Không tra được tồn kho.</div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-3 text-sm text-[var(--ink-400)]">Không thấy linh kiện khớp "{debounced}".</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--surface)] text-[var(--ink-400)]">
                <tr className="border-b border-[var(--line)]">
                  <th className="text-left py-1.5 px-2.5">Mã LK</th>
                  <th className="text-left py-1.5 px-2">Tên linh kiện</th>
                  <th className="text-right py-1.5 px-2">Tồn MB</th>
                  <th className="text-right py-1.5 px-2">Tồn MN</th>
                  <th className="text-right py-1.5 px-2.5">KTV</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const het = (r.ton_mb ?? 0) + (r.ton_mn ?? 0) <= 0;
                  return (
                    <tr key={r.ma_hang} onClick={() => chon(r)} className="border-b border-[var(--line)] last:border-0 cursor-pointer hover:bg-[var(--surface-100)]">
                      <td className="py-1.5 px-2.5 font-mono font-semibold whitespace-nowrap">{r.ma_hang}</td>
                      <td className="py-1.5 px-2 text-[var(--ink-600)]">{r.ten_hang || "—"}{r.dvt ? <span className="text-[var(--ink-400)]"> · {r.dvt}</span> : null}</td>
                      <td className={`py-1.5 px-2 text-right tabular-nums ${het ? "text-[var(--coral-500)]" : "font-semibold"}`}>{n(r.ton_mb)}</td>
                      <td className={`py-1.5 px-2 text-right tabular-nums ${het ? "text-[var(--coral-500)]" : "font-semibold"}`}>{n(r.ton_mn)}</td>
                      <td className="py-1.5 px-2.5 text-right tabular-nums text-[var(--ink-600)]">{n(r.ton_ktv)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {rows.length > 0 && (
            <div className="px-3 py-1.5 text-[11px] text-[var(--ink-400)] border-t border-[var(--line)]">
              Bấm 1 dòng để xem tồn từng kho, PO đặt hàng, ca thiếu.{res.data?.phien_ban ? ` Tồn kho cập nhật ${res.data.phien_ban}.` : ""}
              {rows.length >= 40 ? " Hiển thị 40 kết quả đầu — gõ cụ thể hơn." : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
