import { useEffect, useRef } from "react";
import { Chart, type ChartData, type ChartOptions, type ChartType, type Plugin, registerables } from "chart.js";

function formatLabelValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// Ve gia tri ngay tren cot/diem/lat cua bieu do thay vi chi thay duoc qua tooltip khi hover chuot
// vao - bat mac dinh cho MOI bieu do (dung chung 1 ChartCanvas). Tat rieng cho 1 bieu do cu the
// bang options={{ plugins: { valueLabels: { display: false } } }}, hoac tat rieng TUNG dataset (vd
// tickbox "hien/an so" theo tung duong trong 1 chart nhieu series - them 2026-08-28 cho chart "Xu
// huong theo thang" cua Bao cao luy ke) bang options={{ plugins: { valueLabels: { hiddenLabels:
// ["Ten dataset can an"] } } }} - so sanh theo dataset.label, khong phai index (on dinh hon khi thu
// tu dataset thay doi).
const valueLabelsPlugin: Plugin = {
  id: "valueLabels",
  afterDatasetsDraw(chart) {
    const pluginOpts = (chart.options.plugins as Record<string, { display?: boolean; hiddenLabels?: string[] } | undefined> | undefined)?.valueLabels;
    if (pluginOpts?.display === false) return;
    const hiddenLabels = new Set(pluginOpts?.hiddenLabels ?? []);

    const { ctx } = chart;
    const isHorizontalBar = chart.options.indexAxis === "y";
    const chartType = (chart.config as unknown as { type: string }).type;
    const isPieLike = chartType === "doughnut" || chartType === "pie";

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;
      if (dataset.label && hiddenLabels.has(dataset.label)) return;
      const values = dataset.data as (number | null)[];

      meta.data.forEach((element, index) => {
        const value = values[index];
        if (value === null || value === undefined || value === 0) return;
        const pos = (element as unknown as { tooltipPosition: () => { x: number; y: number } }).tooltipPosition();

        ctx.save();
        ctx.font = "10px Inter, sans-serif";
        ctx.fillStyle = "#4c6478";
        if (isPieLike) {
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(formatLabelValue(value), pos.x, pos.y);
        } else if (isHorizontalBar) {
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(formatLabelValue(value), pos.x + 6, pos.y);
        } else {
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(formatLabelValue(value), pos.x, pos.y - 4);
        }
        ctx.restore();
      });
    });
  },
};

Chart.register(...registerables, valueLabelsPlugin);

export function ChartCanvas({
  type,
  data,
  options,
  height = 220,
}: {
  type: ChartType;
  data: ChartData;
  options?: ChartOptions;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(ctx, {
      type,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: (data.datasets ?? []).length > 1, labels: { boxWidth: 10, font: { size: 11 } } },
        },
        scales:
          type === "doughnut"
            ? {}
            : {
                y: { beginAtZero: true, grid: { color: "#EEF3F7" }, ticks: { font: { size: 10 } } },
                x: { grid: { display: false }, ticks: { font: { size: 10 } } },
              },
        ...options,
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // JSON.stringify (khong phai reference truc tiep) cho ca data LAN options - nhieu noi goi
    // truyen "options" dang object literal inline, tao reference moi moi lan render cha, neu dung
    // truc tiep se ve lai chart moi lan render thay vi chi khi noi dung thuc su doi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, JSON.stringify(data), JSON.stringify(options)]);

  return (
    <div style={{ height }}>
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}
