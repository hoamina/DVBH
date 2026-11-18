// 2 bieu do cho "Quản lý tồn > Lý do giải trình cuối cùng theo tháng" (2026-11-18, chu he thong):
//  1. Ty le tung ly do trong thang dang chon (thanh ngang, giam dan, ghi %).
//  2. Tung ly do chia theo khu vuc (MB1, MB2...) - biet cung 1 ly do khu vuc nao chon nhieu hon. Mac dinh: moi ly do 1 thanh chong
//     mau theo khu vuc (So ca | % trong ly do); chon 1 ly do -> cot theo tung khu vuc, giam dan.
// Du lieu = dung cac dong API /cases/giai-trinh-ly-do-thang ma bang ben duoi da tai (khong goi them API / D1).
import { useMemo, useState } from "react";
import type { TooltipItem } from "chart.js";
import { ChartCanvas } from "./chart/ChartCanvas";
import { Select } from "./ui/Select";
import { tr } from "../i18n/tr";

export interface LyDoDong {
  nhom: string; // khu vuc (hoac nhom PH)
  ly_do: string;
  so_ca: number;
}

const TOP_LY_DO = 12;
// Bang mau phan loai (khu vuc) - de phan biet tren nen sang, lap lai neu > 12 khu vuc.
const MAU = ["#0F6FB4", "#159C93", "#E8604C", "#B8860B", "#7C5CC4", "#2E9E4F", "#D9467A", "#4C6478", "#E08A1E", "#1FA2C9", "#8C6D46", "#94A3B8"];

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export function LyDoGiaiTrinhCharts({ dong, nhanNhom }: { dong: LyDoDong[]; nhanNhom: (raw: string) => string }) {
  const [cheDo, setCheDo] = useState<"so_ca" | "pct">("so_ca");
  const [lyDoChon, setLyDoChon] = useState("");

  const { theoLyDo, tong, nhoms } = useMemo(() => {
    const m = new Map<string, number>();
    const nh = new Map<string, number>();
    let t = 0;
    for (const d of dong) {
      m.set(d.ly_do, (m.get(d.ly_do) ?? 0) + d.so_ca);
      nh.set(d.nhom, (nh.get(d.nhom) ?? 0) + d.so_ca);
      t += d.so_ca;
    }
    const ds = [...m.entries()].map(([ly_do, so_ca]) => ({ ly_do, so_ca })).sort((a, b) => b.so_ca - a.so_ca);
    return { theoLyDo: ds, tong: t, nhoms: [...nh.entries()].sort((a, b) => a[0].localeCompare(b[0], "vi")).map(([k]) => k) };
  }, [dong]);

  // Top N ly do + "Khác".
  const top = useMemo(() => {
    if (theoLyDo.length <= TOP_LY_DO + 1) return theoLyDo;
    const dau = theoLyDo.slice(0, TOP_LY_DO);
    const khac = theoLyDo.slice(TOP_LY_DO).reduce((s, r) => s + r.so_ca, 0);
    return [...dau, { ly_do: tr("Khác ({0} lý do)", theoLyDo.length - TOP_LY_DO), so_ca: khac }];
  }, [theoLyDo]);

  if (!tong) return null;

  const lyDoChart2 = theoLyDo.slice(0, TOP_LY_DO).map((r) => r.ly_do);
  const soCa = (ly_do: string, nhom: string) => dong.filter((d) => d.ly_do === ly_do && d.nhom === nhom).reduce((s, d) => s + d.so_ca, 0);
  const tongLyDo = (ly_do: string) => theoLyDo.find((r) => r.ly_do === ly_do)?.so_ca ?? 0;
  const catNgan = (s: string) => (s.length > 42 ? s.slice(0, 40) + "…" : s);

  // Chart 2 khi chon 1 ly do: cot theo khu vuc, giam dan.
  const motLyDo = lyDoChon && theoLyDo.some((r) => r.ly_do === lyDoChon) ? lyDoChon : "";
  const theoNhom1 = motLyDo
    ? nhoms.map((n) => ({ n, v: soCa(motLyDo, n) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v)
    : [];

  return (
    <div className="grid gap-4 xl:grid-cols-2 mb-4">
      <div className="min-w-0 rounded-lg border border-[var(--line)] p-3">
        <div className="text-sm font-semibold mb-0.5">{tr("Tỷ lệ lý do tồn trong tháng")}</div>
        <div className="text-xs text-[var(--ink-400)] mb-2">{tr("{0} ca · % trên tổng số ca có giải trình trong tháng", tong.toLocaleString("vi-VN"))}</div>
        <ChartCanvas
          type="bar"
          height={Math.max(160, top.length * 26 + 30)}
          data={{
            labels: top.map((r) => catNgan(r.ly_do)),
            datasets: [{ label: tr("Tỷ lệ (%)"), data: top.map((r) => pct(r.so_ca, tong)), backgroundColor: "#0F6FB4", borderRadius: 4 }],
          }}
          options={{
            indexAxis: "y",
            scales: {
              x: { beginAtZero: true, grid: { color: "#EEF3F7" }, ticks: { font: { size: 10 }, callback: (v) => `${v}%` }, suggestedMax: Math.min(100, Math.ceil((pct(top[0]?.so_ca ?? 0, tong) * 1.15) / 5) * 5) },
              y: { grid: { display: false }, ticks: { font: { size: 10 } } },
            },
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { title: (it) => top[it[0].dataIndex]?.ly_do ?? "", label: (it) => tr("{0}% · {1} ca", it.parsed.x, top[it.dataIndex]?.so_ca ?? 0) } },
            },
          }}
        />
      </div>

      <div className="min-w-0 rounded-lg border border-[var(--line)] p-3">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <div className="text-sm font-semibold mr-auto">{tr("Lý do theo khu vực")}</div>
          <Select
            value={motLyDo}
            onChange={setLyDoChon}
            options={[{ value: "", label: tr("Top {0} lý do (chồng theo khu vực)", Math.min(TOP_LY_DO, theoLyDo.length)) }, ...theoLyDo.map((r) => ({ value: r.ly_do, label: `${catNgan(r.ly_do)} (${r.so_ca})` }))]}
          />
          {!motLyDo && (
            <div className="inline-flex rounded-lg border border-[var(--line)] overflow-hidden text-xs">
              {(["so_ca", "pct"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setCheDo(k)} className={`px-2 py-1 ${cheDo === k ? "bg-[var(--ocean-600)] text-white font-semibold" : "bg-white text-[var(--ink-600)]"}`}>
                  {k === "so_ca" ? tr("Số ca") : tr("% trong lý do")}
                </button>
              ))}
            </div>
          )}
        </div>
        {motLyDo ? (
          <>
            <div className="text-xs text-[var(--ink-400)] mb-2">{tr("{0}: {1} ca · cột = số ca từng khu vực, rê chuột xem % trong lý do", catNgan(motLyDo), tongLyDo(motLyDo))}</div>
            <ChartCanvas
              type="bar"
              height={240}
              data={{
                labels: theoNhom1.map((x) => nhanNhom(x.n)),
                datasets: [{ label: tr("Số ca"), data: theoNhom1.map((x) => x.v), backgroundColor: theoNhom1.map((x) => MAU[nhoms.indexOf(x.n) % MAU.length]), borderRadius: 4 }],
              }}
              options={{
                scales: {
                  y: { beginAtZero: true, suggestedMax: Math.ceil((theoNhom1[0]?.v ?? 0) * 1.15), grid: { color: "#EEF3F7" }, ticks: { font: { size: 10 }, precision: 0 } },
                  x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                },
                plugins: {
                  legend: { display: false },
                  tooltip: { callbacks: { label: (it) => tr("{0} ca · {1}% trong lý do", it.parsed.y, pct(Number(it.parsed.y), tongLyDo(motLyDo))) } },
                },
              }}
            />
          </>
        ) : (
          <ChartCanvas
            type="bar"
            height={Math.max(200, lyDoChart2.length * 28 + 60)}
            data={{
              labels: lyDoChart2.map(catNgan),
              datasets: nhoms.map((n, i) => ({
                label: nhanNhom(n),
                data: lyDoChart2.map((ld) => (cheDo === "pct" ? pct(soCa(ld, n), tongLyDo(ld)) : soCa(ld, n))),
                backgroundColor: MAU[i % MAU.length],
                stack: "s",
              })),
            }}
            options={{
              indexAxis: "y",
              scales: {
                x: { stacked: true, beginAtZero: true, max: cheDo === "pct" ? 100 : undefined, grid: { color: "#EEF3F7" }, ticks: { font: { size: 10 }, callback: (v) => (cheDo === "pct" ? `${v}%` : `${v}`) } },
                y: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
              },
              plugins: {
                // Doan nho: an so de khoi chen chuc, rê chuột xem.
                valueLabels: { display: false },
                legend: { display: true, position: "bottom", labels: { boxWidth: 10, font: { size: 10 } } },
                tooltip: {
                  callbacks: {
                    title: (it: TooltipItem<"bar">[]) => lyDoChart2[it[0].dataIndex] ?? "",
                    label: (it: TooltipItem<"bar">) => {
                      const ld = lyDoChart2[it.dataIndex];
                      const n = nhoms[it.datasetIndex];
                      const v = soCa(ld, n);
                      return v ? tr("{0}: {1} ca · {2}% trong lý do", nhanNhom(n), v, pct(v, tongLyDo(ld))) : "";
                    },
                  },
                  filter: (it: TooltipItem<"bar">) => (it.parsed.x ?? 0) > 0,
                },
              } as never,
            }}
          />
        )}
      </div>
    </div>
  );
}
