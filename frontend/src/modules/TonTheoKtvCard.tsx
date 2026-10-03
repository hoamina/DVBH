import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { StatCard } from "../components/ui/StatCard";
import { api, buildQuery } from "../api/client";
import { exportRowsToExcel } from "../lib/exportExcel";
import { shortKhuVuc } from "../lib/khuVucShortLabel";

// "So ca ton theo KTV" (Quan ly ton > Bao cao, CHOT 2026-10-03) - doc GET /cases/ton-ktv (chot chet
// 08:00 moi ngay vao ton_ktv_daily, xem backend/src/lib/tonKtvSnapshot.ts). Server da loc khu_vuc +
// khoang tuoi ton; moi chi so phu (luy ke, trung binh, bien dong, theo doi nhanh) tinh o client tu
// cung 1 ma tran KTV x ngay.

interface TonKtvRow {
  ktv: string;
  khu_vuc: string;
  truoc: number | null;
  so: (number | null)[];
}

interface TonKtvReport {
  thang: string;
  days: string[];
  ngayCoDuLieu: string[];
  ngayTruoc: string | null;
  rows: TonKtvRow[];
}

type TuoiPreset = "all" | "3" | "5" | "7" | "14" | "custom";
const TUOI_PRESETS: { value: TuoiPreset; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "3", label: "≥3 ngày" },
  { value: "5", label: "≥5 ngày" },
  { value: "7", label: "≥7 ngày" },
  { value: "14", label: "≥14 ngày" },
  { value: "custom", label: "Tùy chọn" },
];

type SortKey = "ktv" | "khu_vuc" | "luy_ke" | "tb" | "cuoi" | "bien_dong";

const vnMonthStr = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
const fmtDay = (ngay: string) => `${ngay.slice(8, 10)}/${ngay.slice(5, 7)}`;
const tenKtv = (ktv: string) => ktv || "(Chưa có KTV)";
const fmtDelta = (d: number) => (d > 0 ? `+${d}` : String(d));
// Ton tang = xau (do), giam = tot (xanh).
const deltaClass = (d: number | null) => (d === null || d === 0 ? "text-[var(--ink-400)]" : d > 0 ? "text-[var(--coral-500)] font-semibold" : "text-[var(--teal-600)] font-semibold");

interface Computed extends TonKtvRow {
  delta: (number | null)[];
  luyKe: number;
  tb: number;
  dau: number | null;
  cuoi: number | null;
  bienDong: number | null;
}

export function TonTheoKtvCard({ khuVucFilter, filterLabel }: { khuVucFilter: string; filterLabel: string }) {
  const [thang, setThang] = useState(vnMonthStr);
  const [preset, setPreset] = useState<TuoiPreset>("all");
  const [customTu, setCustomTu] = useState("");
  const [customDen, setCustomDen] = useState("");
  const [mode, setMode] = useState<"so" | "bien-dong">("so");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "cuoi", desc: true });

  const tuoiTu = preset === "all" ? "" : preset === "custom" ? customTu : preset;
  const tuoiDen = preset === "custom" ? customDen : "";

  const { data, isLoading } = useQuery({
    queryKey: ["ton-ktv", thang, khuVucFilter, tuoiTu, tuoiDen],
    queryFn: () => api.get<TonKtvReport>(`/cases/ton-ktv${buildQuery({ thang, khu_vuc: khuVucFilter, tuoi_tu: tuoiTu, tuoi_den: tuoiDen })}`),
    enabled: /^\d{4}-\d{2}$/.test(thang),
  });

  const days = data?.days ?? [];
  const dataIdx = useMemo(() => {
    const set = new Set(data?.ngayCoDuLieu ?? []);
    return days.map((d, i) => (set.has(d) ? i : -1)).filter((i) => i >= 0);
  }, [data, days]);
  const soNgay = dataIdx.length;

  const computed: Computed[] = useMemo(
    () =>
      (data?.rows ?? []).map((r) => {
        const delta: (number | null)[] = r.so.map(() => null);
        let prev: number | null = r.truoc;
        let luyKe = 0;
        for (const i of dataIdx) {
          const v = r.so[i] ?? 0;
          delta[i] = prev === null ? null : v - prev;
          prev = v;
          luyKe += v;
        }
        const dau = soNgay ? (r.so[dataIdx[0]] ?? 0) : null;
        const cuoi = soNgay ? (r.so[dataIdx[soNgay - 1]] ?? 0) : null;
        return { ...r, delta, luyKe, tb: soNgay ? luyKe / soNgay : 0, dau, cuoi, bienDong: dau !== null && cuoi !== null ? cuoi - dau : null };
      }),
    [data, dataIdx, soNgay],
  );

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? computed.filter((r) => tenKtv(r.ktv).toLowerCase().includes(q) || r.khu_vuc.toLowerCase().includes(q)) : computed;
    const val = (r: Computed): string | number => {
      switch (sort.key) {
        case "ktv":
          return tenKtv(r.ktv);
        case "khu_vuc":
          return shortKhuVuc(r.khu_vuc);
        case "luy_ke":
          return r.luyKe;
        case "tb":
          return r.tb;
        case "cuoi":
          return r.cuoi ?? 0;
        case "bien_dong":
          return r.bienDong ?? 0;
      }
    };
    return [...list].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "vi");
      return sort.desc ? -cmp : cmp;
    });
  }, [computed, search, sort]);

  // Dong "Tong cong" tinh tren cac dong dang hien (sau khi tim KTV).
  const tong = useMemo(() => {
    const so = days.map((_, i) => (dataIdx.includes(i) ? displayed.reduce((s, r) => s + (r.so[i] ?? 0), 0) : null));
    const coTruoc = data?.ngayTruoc != null;
    const truoc = coTruoc ? displayed.reduce((s, r) => s + (r.truoc ?? 0), 0) : null;
    const delta: (number | null)[] = days.map(() => null);
    let prev = truoc;
    for (const i of dataIdx) {
      delta[i] = prev === null ? null : so[i]! - prev;
      prev = so[i];
    }
    const luyKe = displayed.reduce((s, r) => s + r.luyKe, 0);
    const dau = soNgay ? so[dataIdx[0]] : null;
    const cuoi = soNgay ? so[dataIdx[soNgay - 1]] : null;
    return { so, delta, luyKe, tb: soNgay ? luyKe / soNgay : 0, dau, cuoi, bienDong: dau !== null && cuoi !== null ? cuoi - dau : null };
  }, [days, dataIdx, displayed, data, soNgay]);

  // Theo doi nhanh - tren TOAN BO dong (khong phu thuoc o tim KTV).
  const quick = useMemo(() => {
    if (!soNgay) return null;
    const last = dataIdx[soNgay - 1];
    const tongCuoi = computed.reduce((s, r) => s + (r.so[last] ?? 0), 0);
    const coSoSanh = computed.length > 0 && computed.every((r) => r.delta[last] !== null);
    const deltaCuoi = coSoSanh ? computed.reduce((s, r) => s + (r.delta[last] ?? 0), 0) : null;
    const prevLabel = soNgay > 1 ? fmtDay(days[dataIdx[soNgay - 2]]) : data?.ngayTruoc ? fmtDay(data.ngayTruoc) : null;
    const luyKe = computed.reduce((s, r) => s + r.luyKe, 0);
    const topTon = [...computed].filter((r) => (r.so[last] ?? 0) > 0).sort((a, b) => (b.so[last] ?? 0) - (a.so[last] ?? 0)).slice(0, 10);
    const topTang = [...computed].filter((r) => (r.delta[last] ?? 0) > 0).sort((a, b) => (b.delta[last] ?? 0) - (a.delta[last] ?? 0)).slice(0, 10);
    return {
      ngay: fmtDay(days[last]),
      last,
      tongCuoi,
      deltaCuoi,
      prevLabel,
      luyKe,
      tb: luyKe / soNgay,
      soKtv: computed.filter((r) => (r.so[last] ?? 0) > 0).length,
      topTon,
      topTang,
    };
  }, [computed, dataIdx, soNgay, days, data]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "ktv" && key !== "khu_vuc" }));
  const sortMark = (key: SortKey) => (sort.key === key ? (sort.desc ? " ▼" : " ▲") : "");

  const tuoiLabel =
    preset === "all"
      ? "mọi tuổi tồn"
      : preset === "custom"
        ? `tồn ${customTu || "0"}${customDen ? `–${customDen}` : "+"} ngày`
        : `tồn ≥${preset} ngày`;

  const exportExcel = () => {
    const cell = (r: { so: (number | null)[]; delta: (number | null)[] }, i: number) => (mode === "so" ? r.so[i] : r.delta[i]) ?? "";
    const toRow = (ktv: string, kv: string, r: typeof tong) => {
      const out: Record<string, string | number> = { ktv, khu_vuc: kv };
      days.forEach((d, i) => (out[`d_${d}`] = cell(r, i)));
      out.luy_ke = r.luyKe;
      out.tb = Math.round(r.tb * 10) / 10;
      out.dau_ky = r.dau ?? "";
      out.cuoi_ky = r.cuoi ?? "";
      out.bien_dong = r.bienDong ?? "";
      return out;
    };
    const labels: Record<string, string> = { ktv: "KTV", khu_vuc: "Khu vực" };
    days.forEach((d) => (labels[`d_${d}`] = fmtDay(d)));
    Object.assign(labels, { luy_ke: "Lũy kế (ca-ngày)", tb: "TB tồn/ngày", dau_ky: "Đầu kỳ", cuoi_ky: "Cuối kỳ", bien_dong: "Biến động (cuối − đầu)" });
    exportRowsToExcel(
      [toRow("TỔNG CỘNG", "", tong), ...displayed.map((r) => toRow(tenKtv(r.ktv), shortKhuVuc(r.khu_vuc), r))],
      `ton_theo_ktv_${thang}${mode === "bien-dong" ? "_bien_dong" : ""}.xlsx`,
      mode === "so" ? "So ca ton" : "Bien dong",
      labels,
    );
  };

  const renderDayCell = (r: { so: (number | null)[]; delta: (number | null)[] }, i: number, bold = false) => {
    if (!dataIdx.includes(i)) return <span className="text-[var(--line)]">·</span>;
    if (mode === "so") {
      const v = r.so[i] ?? 0;
      return <span className={`font-mono ${v === 0 ? "text-[var(--ink-400)]" : bold ? "font-bold" : ""}`}>{v}</span>;
    }
    const d = r.delta[i];
    return <span className={`font-mono ${deltaClass(d)}`}>{d === null ? "—" : d === 0 ? "0" : fmtDelta(d)}</span>;
  };

  const thSort = (key: SortKey, label: string, cls = "") => (
    <th className={`py-2 px-2 cursor-pointer select-none hover:text-[var(--ink-900)] ${cls}`} onClick={() => toggleSort(key)}>
      {label}
      {sortMark(key)}
    </th>
  );

  return (
    <Card className="p-3 mt-3">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="font-display font-bold text-sm">Số ca tồn theo KTV</div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="month" value={thang} max={vnMonthStr()} onChange={(e) => setThang(e.target.value)} className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          <Btn variant="ghost" size="sm" onClick={exportExcel} disabled={!data || displayed.length === 0}>
            ⬇ Xuất Excel
          </Btn>
        </div>
      </div>
      <div className="text-xs text-[var(--ink-400)] mb-2">
        Chốt lúc 08:00 mỗi ngày (gán KTV tại thời điểm chốt) — đang hiển thị: <span className="font-semibold text-[var(--indigo-700)]">{filterLabel}</span>,{" "}
        <span className="font-semibold text-[var(--indigo-700)]">{tuoiLabel}</span>.
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-xs font-semibold text-[var(--ink-400)]">Tuổi tồn:</span>
        {TUOI_PRESETS.map((p) => (
          <Btn key={p.value} size="sm" variant={preset === p.value ? "subtle" : "ghost"} onClick={() => setPreset(p.value)}>
            {p.label}
          </Btn>
        ))}
        {preset === "custom" && (
          <span className="flex items-center gap-1.5 text-xs text-[var(--ink-400)]">
            từ
            <input type="number" min={0} value={customTu} onChange={(e) => setCustomTu(e.target.value)} className="focus-ring w-16 border border-[var(--line)] rounded-lg px-2 py-1 text-sm" />
            đến
            <input type="number" min={0} value={customDen} onChange={(e) => setCustomDen(e.target.value)} placeholder="∞" className="focus-ring w-16 border border-[var(--line)] rounded-lg px-2 py-1 text-sm" />
            ngày
          </span>
        )}
      </div>

      {quick && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-[var(--ink-400)] uppercase tracking-wide mb-1.5">Theo dõi tồn nhanh</div>
          <div className="flex gap-2 flex-wrap mb-2">
            <StatCard
              size="sm"
              tone="coral"
              label={`Tồn ngày ${quick.ngay}`}
              value={quick.tongCuoi}
              sub={quick.deltaCuoi !== null && quick.prevLabel ? <span className={deltaClass(quick.deltaCuoi)}>{fmtDelta(quick.deltaCuoi)} so với {quick.prevLabel}</span> : undefined}
            />
            <StatCard size="sm" tone="ocean" label="Lũy kế tháng (ca-ngày)" value={quick.luyKe} sub={`${soNgay} ngày có dữ liệu`} />
            <StatCard size="sm" tone="amber" label="TB tồn/ngày" value={quick.tb.toFixed(1)} />
            <StatCard size="sm" tone="gray" label="Số KTV đang có tồn" value={quick.soKtv} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {[
              { title: `Top 10 KTV tồn cao nhất (${quick.ngay})`, list: quick.topTon, val: (r: Computed) => String(r.so[quick.last] ?? 0), cls: "font-mono font-semibold" },
              {
                title: `Top 10 KTV tăng tồn nhiều nhất${quick.prevLabel ? ` (so với ${quick.prevLabel})` : ""}`,
                list: quick.topTang,
                val: (r: Computed) => fmtDelta(r.delta[quick.last] ?? 0),
                cls: "font-mono font-semibold text-[var(--coral-500)]",
              },
            ].map((box) => (
              <div key={box.title} className="border border-[var(--line)] rounded-xl p-2">
                <div className="text-xs font-semibold mb-1">{box.title}</div>
                {box.list.length === 0 ? (
                  <div className="text-xs text-[var(--ink-400)] italic">Không có.</div>
                ) : (
                  <ol className="text-xs space-y-0.5">
                    {box.list.map((r, i) => (
                      <li key={`${r.ktv}|${r.khu_vuc}`} className="flex items-center gap-2">
                        <span className="w-4 text-right text-[var(--ink-400)]">{i + 1}.</span>
                        <span className="flex-1 truncate">
                          {tenKtv(r.ktv)} <span className="text-[var(--ink-400)]">· {shortKhuVuc(r.khu_vuc)}</span>
                        </span>
                        <span className={box.cls}>{box.val(r)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap mb-2">
        <div className="inline-flex rounded-lg border border-[var(--line)] overflow-hidden text-xs font-semibold">
          {(
            [
              ["so", "Số ca tồn"],
              ["bien-dong", "Biến động so với ngày trước"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setMode(v)} className={`px-3 py-1.5 ${mode === v ? "bg-[var(--ocean-500)] text-white" : "bg-white text-[var(--ink-600)] hover:bg-slate-50"}`}>
              {label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm KTV / khu vực…"
          className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm ml-auto w-56"
        />
      </div>

      <div className="overflow-auto max-h-[640px]">
        <table className="dense w-full text-sm">
          <thead className="sticky top-0 z-20 bg-[var(--surface)]">
            <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
              {thSort("ktv", "KTV", "pl-0 pr-3 sticky left-0 bg-[var(--surface)] z-10 min-w-[180px]")}
              {thSort("khu_vuc", "Khu vực", "whitespace-nowrap")}
              {days.map((d) => (
                <th key={d} className="py-2 px-1.5 text-center font-mono">
                  {Number(d.slice(8, 10))}
                </th>
              ))}
              {thSort("luy_ke", "Lũy kế", "text-right whitespace-nowrap")}
              {thSort("tb", "TB/ngày", "text-right whitespace-nowrap")}
              <th className="py-2 px-2 text-right whitespace-nowrap">Đầu kỳ</th>
              {thSort("cuoi", "Cuối kỳ", "text-right whitespace-nowrap")}
              {thSort("bien_dong", "Biến động", "text-right whitespace-nowrap")}
            </tr>
          </thead>
          <tbody>
            {displayed.length > 0 && (
              <tr className="border-b border-[var(--line)] bg-slate-50 font-bold">
                <td className="py-2 pr-3 sticky left-0 bg-slate-50 z-10">Tổng cộng</td>
                <td className="py-2 px-2 text-[var(--ink-400)] font-normal text-xs">{displayed.length} dòng</td>
                {days.map((d, i) => (
                  <td key={d} className="py-2 px-1.5 text-center">
                    {renderDayCell(tong, i, true)}
                  </td>
                ))}
                <td className="py-2 px-2 text-right font-mono">{tong.luyKe}</td>
                <td className="py-2 px-2 text-right font-mono">{tong.tb.toFixed(1)}</td>
                <td className="py-2 px-2 text-right font-mono">{tong.dau ?? "—"}</td>
                <td className="py-2 px-2 text-right font-mono">{tong.cuoi ?? "—"}</td>
                <td className={`py-2 px-2 text-right font-mono ${deltaClass(tong.bienDong)}`}>{tong.bienDong === null ? "—" : fmtDelta(tong.bienDong)}</td>
              </tr>
            )}
            {displayed.map((r) => (
              <tr key={`${r.ktv}|${r.khu_vuc}`} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50 group">
                <td className="py-1.5 pr-3 font-semibold sticky left-0 bg-[var(--surface)] group-hover:bg-slate-50 z-10 max-w-[240px] truncate" title={tenKtv(r.ktv)}>
                  {tenKtv(r.ktv)}
                </td>
                <td className="py-1.5 px-2 whitespace-nowrap text-xs">{shortKhuVuc(r.khu_vuc)}</td>
                {days.map((d, i) => (
                  <td key={d} className="py-1.5 px-1.5 text-center">
                    {renderDayCell(r, i)}
                  </td>
                ))}
                <td className="py-1.5 px-2 text-right font-mono">{r.luyKe}</td>
                <td className="py-1.5 px-2 text-right font-mono">{r.tb.toFixed(1)}</td>
                <td className="py-1.5 px-2 text-right font-mono">{r.dau ?? "—"}</td>
                <td className="py-1.5 px-2 text-right font-mono font-semibold">{r.cuoi ?? "—"}</td>
                <td className={`py-1.5 px-2 text-right font-mono ${deltaClass(r.bienDong)}`}>{r.bienDong === null ? "—" : fmtDelta(r.bienDong)}</td>
              </tr>
            ))}
            {displayed.length === 0 && (
              <tr>
                <td colSpan={days.length + 7} className="py-8 text-center text-[var(--ink-400)] text-sm">
                  {isLoading
                    ? "Đang tải…"
                    : soNgay === 0
                      ? "Chưa có dữ liệu tháng này — bảng tồn theo KTV ghi nhận từ ngày triển khai, chốt 08:00 mỗi ngày."
                      : "Không có KTV nào khớp bộ lọc."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-[var(--ink-400)] mt-1.5">
        Lũy kế = tổng số ca tồn cộng dồn các ngày có dữ liệu (ca-ngày) · TB/ngày = lũy kế ÷ số ngày có dữ liệu · Biến động = cuối kỳ − đầu kỳ. Ô "·" là ngày chưa có dữ liệu chốt.
      </div>
    </Card>
  );
}
