// Luong quy trinh NGANG 8 buoc cua 1 ca (2026-11-27) - dau tab "Tiến trình chung" giao dien Chi tiet ca v1.
// Du lieu: lib/buocQuyTrinh.ts (tinhBuocQuyTrinh) - dung chung voi giao dien v2. CHI hien thi (chua co SLA / ma loi theo buoc).
// Luat UI chi tiet (CLAUDE.md toan cuc): moc xong xanh la + gio ngan + "+khoang", moc dang cam noi, chua toi xam, bo qua net dut;
// re chuot xem ten day du / gio / nguoi / chi so; nut "▾ Xem chi tiết" xo danh sach doc 8 buoc. Dien thoai (<768px) chi con cham + so.
import { useState } from "react";
import { fmtKhoang, type BuocQuyTrinh, type KetQuaBuocQuyTrinh, type TrangThaiBuoc } from "../lib/buocQuyTrinh";
import { tr } from "../i18n/tr";

const vnIso = (ms: number) => new Date(ms + 7 * 3600_000).toISOString();
/** "27/11 14:05" */
export const gioNganBuoc = (ms: number | null) => {
  if (ms === null) return "";
  const s = vnIso(ms);
  return `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`;
};

const NHAN_TT: Record<TrangThaiBuoc, string> = {
  xong: "Đã xong",
  dang: "Đang xử lý",
  chua: "Chưa tới",
  bo_qua: "Bỏ qua",
};

const CHU_TT: Record<TrangThaiBuoc, string> = {
  xong: "text-[var(--teal-600)]",
  dang: "text-[var(--amber-600)]",
  chua: "text-[var(--ink-400)]",
  bo_qua: "text-[var(--ink-400)]",
};

const NEN_TT: Record<TrangThaiBuoc, string> = {
  xong: "bg-[var(--teal-100)] text-[var(--teal-600)]",
  dang: "bg-[var(--amber-100)] text-[var(--amber-700)]",
  chua: "bg-[var(--surface-200)] text-[var(--ink-500)]",
  bo_qua: "bg-[var(--surface-200)] text-[var(--ink-400)]",
};

function tieuDeMoc(b: BuocQuyTrinh) {
  return [
    `${b.so}. ${b.ten} — ${tr(NHAN_TT[b.trangThai])}`,
    b.lucMs !== null ? gioNganBuoc(b.lucMs) + (b.cachTruocMs !== null ? ` (+${fmtKhoang(b.cachTruocMs)})` : "") : null,
    b.nguoi ? tr("Người: {0}", b.nguoi) : null,
    ...b.chiSo,
    b.ghiChu,
  ]
    .filter(Boolean)
    .join("\n");
}

function ChamBuoc({ b, nho = false }: { b: BuocQuyTrinh; nho?: boolean }) {
  const kt = nho ? "w-6 h-6 text-[11px]" : "w-7 h-7 text-xs";
  const cls =
    b.trangThai === "xong"
      ? "bg-[var(--teal-500)] text-white"
      : b.trangThai === "dang"
        ? "bg-[var(--amber-500)] text-white shadow-[0_0_0_4px_var(--amber-100)]"
        : b.trangThai === "bo_qua"
          ? "border-2 border-dashed border-[var(--line2,#c7c7cc)] bg-[var(--surface-100)] text-[var(--ink-400)]"
          : "border-2 border-[var(--line2,#d1d1d6)] bg-white text-[var(--ink-400)]";
  return (
    <span className={`relative z-10 flex items-center justify-center rounded-full font-bold tabular-nums ${kt} ${cls}`}>
      {b.trangThai === "dang" && <span className="absolute inset-0 rounded-full bg-[var(--amber-500)] opacity-40 motion-safe:animate-ping" />}
      <span className="relative">{b.trangThai === "xong" ? "✓" : b.so}</span>
    </span>
  );
}

/** Doan noi TOI moc b (tu moc truoc). */
function doanNoi(b: BuocQuyTrinh) {
  if (b.trangThai === "xong") return "bg-[var(--teal-500)]";
  if (b.trangThai === "dang") return "bg-gradient-to-r from-[var(--teal-500)] to-[var(--line)]";
  if (b.trangThai === "bo_qua") return "border-t-2 border-dashed border-[var(--line2,#c7c7cc)] bg-transparent";
  return "bg-[var(--line)]";
}

export function LuongTamBuoc({ kq }: { kq: KetQuaBuocQuyTrinh }) {
  const [mo, setMo] = useState(false);
  const ht = kq.buocHienTai;
  return (
    <div className="mb-3 rounded-2xl bg-[var(--surface-100)] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-400)]">{tr("Quy trình 8 bước")}</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--ink-600)]">{tr("{0}/8 xong", kq.soXong)}</span>
        {ht && (
          <span className="rounded-full bg-[var(--amber-100)] px-2 py-0.5 text-[11px] font-semibold text-[var(--amber-700)]">
            {tr("Đang ở: B{0} {1}", ht.so, ht.tenNgan)}
          </span>
        )}
        <button
          type="button"
          onClick={() => setMo((v) => !v)}
          className="ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold text-[var(--ocean-600)] hover:bg-[var(--ocean-100)]"
          aria-expanded={mo}
        >
          {mo ? tr("▴ Thu gọn") : tr("▾ Xem chi tiết")}
        </button>
      </div>

      {/* May tinh / may tinh bang: day du nhan + gio */}
      <ol className="hidden md:grid grid-cols-8">
        {kq.buoc.map((b, i) => (
          <li key={b.so} className="relative flex flex-col items-center text-center px-0.5" title={tieuDeMoc(b)}>
            {i > 0 && <span className={`absolute top-[13px] right-1/2 w-full h-[3px] ${doanNoi(b)}`} />}
            <ChamBuoc b={b} />
            <span className={`mt-1 text-[11.5px] leading-tight ${b.trangThai === "dang" ? "font-bold text-[var(--amber-600)]" : b.trangThai === "xong" ? "font-semibold text-[var(--ink-800)]" : "text-[var(--ink-400)]"}`}>
              {b.tenNgan}
            </span>
            {b.lucMs !== null ? (
              <span className={`text-[11px] leading-tight tabular-nums ${b.trangThai === "dang" ? "font-semibold text-[var(--amber-600)]" : "text-[var(--ink-500)]"}`}>{gioNganBuoc(b.lucMs)}</span>
            ) : b.trangThai === "bo_qua" && b.ghiChu ? (
              <span className="text-[10.5px] leading-tight italic text-[var(--ink-400)]">{b.ghiChu}</span>
            ) : null}
            {b.cachTruocMs !== null && <span className="text-[10.5px] leading-tight tabular-nums text-[var(--ink-400)]">+{fmtKhoang(b.cachTruocMs)}</span>}
          </li>
        ))}
      </ol>

      {/* Dien thoai: chi cham + so buoc */}
      <div className="md:hidden">
        <ol className="flex items-center">
          {kq.buoc.map((b, i) => (
            <li key={b.so} className={`relative flex items-center ${i > 0 ? "flex-1" : ""}`} title={tieuDeMoc(b)}>
              {i > 0 && <span className={`h-[3px] flex-1 ${doanNoi(b)}`} />}
              <ChamBuoc b={b} nho />
            </li>
          ))}
        </ol>
        {ht && (
          <div className="mt-1.5 text-xs text-[var(--amber-700)]">
            <span className="font-semibold">
              {tr("B{0} {1}", ht.so, ht.ten)}
            </span>
            {ht.lucMs !== null && <span className="tabular-nums text-[var(--ink-500)]"> · {gioNganBuoc(ht.lucMs)}</span>}
          </div>
        )}
      </div>

      {mo && (
        <ol className="mt-2.5 space-y-1.5">
          {kq.buoc.map((b) => (
            <li key={b.so} className={`flex items-start gap-2.5 rounded-xl px-2.5 py-2 ${b.trangThai === "dang" ? "bg-white shadow-[0_0_0_2px_var(--amber-500)]" : "bg-white"}`}>
              <ChamBuoc b={b} nho />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className={`text-sm font-semibold ${b.trangThai === "chua" || b.trangThai === "bo_qua" ? "text-[var(--ink-500)]" : "text-[var(--ink-900)]"}`}>{b.ten}</span>
                  <span className={`rounded-full px-2 py-px text-[11px] font-semibold ${NEN_TT[b.trangThai]}`}>{tr(NHAN_TT[b.trangThai])}</span>
                  <span className="text-[11px] text-[var(--ink-400)]">{b.ai}</span>
                </div>
                <div className="text-xs text-[var(--ink-600)] leading-snug">
                  {b.lucMs !== null && (
                    <span className={`tabular-nums ${CHU_TT[b.trangThai]}`}>
                      {gioNganBuoc(b.lucMs)}
                      {b.cachTruocMs !== null && <span className="text-[var(--ink-400)]"> (+{fmtKhoang(b.cachTruocMs)})</span>}
                    </span>
                  )}
                  {b.nguoi && <span> · {b.nguoi}</span>}
                  {b.chiSo.length > 0 && <span> · {b.chiSo.join(" · ")}</span>}
                  {b.ghiChu && <span className="italic text-[var(--ink-400)]"> · {b.ghiChu}</span>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
