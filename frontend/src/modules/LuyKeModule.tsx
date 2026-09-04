import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { ChartOptions } from "chart.js";
import { Card } from "../components/ui/Card";
import { LoadingCard } from "../components/ui/LoadingCard";
import { Btn } from "../components/ui/Btn";
import { Select } from "../components/ui/Select";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { StatCard } from "../components/ui/StatCard";
import { Tabs } from "../components/ui/Tabs";
import { ChartCanvas } from "../components/chart/ChartCanvas";
import { useToast } from "../components/ui/Toast";
import { describeError, parseSpreadsheet } from "../components/ImportUploader";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { useLuyKeChunked, type LuyKeRow } from "../hooks/useLuyKeChunked";
import { exportRowsToExcel } from "../lib/exportExcel";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { KHU_VUC_AN_KHOI_BAO_CAO } from "../constants";

// Anh xa dung tieu de cot file Excel mau (xem sheet "Sheet1" cua "Phân tích báo cáo lũy kế.xlsx")
// sang field noi bo - dung truc tiep cho parseSpreadsheet(), khong qua columnMapUrl vi schema co
// dinh, khong tuy chinh duoc.
const COLUMN_MAP: Record<string, string> = {
  "Trưởng BP bảo trì": "khu_vuc",
  "Phân loại": "phan_loai",
  "Đúng hạn": "dung_han",
  "Tốc độ": "toc_do",
  "Tháng hoàn thành": "thang_hoan_thanh",
  "Trên 96h": "tren_96h",
  "Năm hoàn thành": "nam_hoan_thanh",
  Hãng: "hang",
  "Tất cả": "doi_tuong",
  Ngành: "nganh",
  "Nguồn CRM": "nguon_crm",
  "KH VIPs": "kh_vip",
  SL: "sl",
};

interface ImportSummary {
  thanhCong: number;
  loi: number;
  errors: string[];
  thangList: { thang: string; soDong: number }[];
}

// Moi dim la 1 chuoi cac gia tri da chon cach nhau "|" (rong = "Tat ca", khong loc gi) - cung quy
// uoc voi MultiSelectFilter/DELIM (xem components/MultiSelectFilter.tsx). Luu qua useLocalStorageState
// (filters:luy-ke) nen tu dong duoc cache lai giua cac lan mo module, khong can co che rieng.
const DELIM = "|";

interface Filters {
  thang: string;
  khu_vuc: string;
  phan_loai: string;
  dung_han: string;
  toc_do: string;
  tren_96h: string;
  hang: string;
  doi_tuong: string;
  nganh: string;
  nguon_crm: string;
  kh_vip: string;
}

const DEFAULT_FILTERS: Filters = {
  thang: "",
  khu_vuc: "",
  phan_loai: "",
  dung_han: "",
  toc_do: "",
  tren_96h: "",
  hang: "",
  doi_tuong: "",
  nganh: "",
  nguon_crm: "",
  kh_vip: "",
};

const FILTER_DIMS: { key: keyof Filters; label: string; field: keyof LuyKeRow }[] = [
  { key: "thang", label: "Tháng", field: "thang" },
  { key: "khu_vuc", label: "Khu vực", field: "khu_vuc" },
  { key: "phan_loai", label: "Phân loại", field: "phan_loai" },
  { key: "dung_han", label: "Đúng hạn", field: "dung_han" },
  { key: "toc_do", label: "Tốc độ", field: "toc_do" },
  { key: "tren_96h", label: "96h", field: "tren_96h" },
  { key: "hang", label: "Hãng", field: "hang" },
  { key: "doi_tuong", label: "Đối tượng", field: "doi_tuong" },
  { key: "nganh", label: "Ngành", field: "nganh" },
  { key: "nguon_crm", label: "Nguồn CRM", field: "nguon_crm" },
  { key: "kh_vip", label: "KH VIP", field: "kh_vip" },
];

const GROUP_OPTIONS: { value: keyof LuyKeRow; label: string }[] = [
  { value: "khu_vuc", label: "Khu vực" },
  { value: "hang", label: "Hãng" },
  { value: "nganh", label: "Ngành" },
  { value: "nam", label: "Năm" },
  { value: "thang", label: "Tháng" },
  { value: "phan_loai", label: "Phân loại" },
  { value: "toc_do", label: "Tốc độ" },
  { value: "nguon_crm", label: "Nguồn CRM" },
  { value: "doi_tuong", label: "Đối tượng" },
  { value: "kh_vip", label: "KH VIP" },
];

function pct(n: number, d: number): string {
  return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—";
}

// 4 dataset cua chart "Xu huong theo thang" (dung dung ten dataset.label ben duoi) - dung de sinh
// tickbox "hien/an so" rieng tung duong, khong an ca duong (chi an SO hien tren duong, xem
// components/chart/ChartCanvas.tsx valueLabelsPlugin).
const CHART_SERIES_LABELS = ["Đúng hạn", "Quá hạn", "% SLA (đúng hạn)", "% Dưới 24h"];

// Nhan 12 thang + cot "TB" (trung binh cong cac thang da co du lieu) cho chart "So sanh cung ky theo
// nam" - moi nam la 1 mau rieng, cung dong mau voi cac chart khac trong module (khong tao bang mau
// rieng).
const MONTH_LABELS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];
const YEAR_CHART_COLORS = ["#94A3B8", "#159C93", "#E8604C", "#0F3D5C", "#B8860B"];

function LuyKeImportPanel({ onImported }: { onImported: () => void }) {
  const [step, setStep] = useState<"idle" | "preview">("idle");
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [filename, setFilename] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addToast = useToast();

  const previewMutation = useMutation({
    mutationFn: (rows: Record<string, unknown>[]) => api.post<ImportSummary>("/luy-ke/import/preview", { rows }),
    onSuccess: (summary) => {
      setPreview(summary);
      setStep("preview");
    },
    onError: (err) => addToast(`Không đọc được file: ${describeError(err)}`),
  });

  const commitMutation = useMutation({
    mutationFn: () => api.post<ImportSummary>("/luy-ke/import/commit", { rows: parsedRows, filename }),
    onSuccess: (summary) => {
      addToast(`Đã import ${summary.thanhCong} dòng cho ${summary.thangList.length} tháng (${summary.thangList.map((t) => t.thang).join(", ")}).`);
      setStep("idle");
      setPreview(null);
      onImported();
    },
    onError: (err) => addToast(`Import thất bại: ${describeError(err)}`),
  });

  async function handleFileChosen(file: File) {
    setFilename(file.name);
    try {
      // File nguon co sheet "BIỂU ĐỒ" (chart) dat TRUOC sheet du lieu "Sheet1" trong workbook - phai
      // chi dinh ro ten sheet can doc, khong the dua vao sheet dau tien (xem parseSpreadsheet()).
      // Doc RAW truoc (khong columnMap) roi tu nhan dang dinh dang tieu de: file xuat truc tiep tu
      // CRM dung tieu de tieng Viet (COLUMN_MAP), nhung nguoi dung cung co the tu ghep nhieu file lai
      // lam 1 va dat tieu de theo dung ten cot cua file mau CSV (/api/luy-ke/template, vd "khu_vuc",
      // "phan_loai"...) - ca 2 dinh dang deu phai import duoc, khong bat nguoi dung phai doi ten cot.
      const rawRows = await parseSpreadsheet(file, undefined, false, ["Sheet1", "DATA"]);
      const firstKeys = new Set(Object.keys(rawRows[0] ?? {}));
      const alreadyInternal = Object.values(COLUMN_MAP).some((dbCol) => firstKeys.has(dbCol));
      const rows = alreadyInternal
        ? rawRows
        : rawRows.map((raw) => {
            const row: Record<string, unknown> = {};
            for (const [excelCol, dbCol] of Object.entries(COLUMN_MAP)) row[dbCol] = raw[excelCol] ?? null;
            return row;
          });
      setParsedRows(rows);
      previewMutation.mutate(rows);
    } catch (err) {
      addToast(`Không đọc được file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <Card className="p-6 mb-5">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="text-sm text-[var(--ink-600)] flex-1 min-w-[240px]">
          Upload file Excel/CSV báo cáo lũy kế (đúng định dạng file phân tích CRM xuất ra). Mỗi lần import sẽ{" "}
          <b>thay thế toàn bộ</b> dữ liệu của những tháng có trong file — không cộng dồn với dữ liệu tháng đó đã có sẵn.
        </div>
        <a href="/api/luy-ke/template" className="text-xs font-semibold text-[var(--ocean-600)] hover:underline whitespace-nowrap">
          ⬇ Tải file mẫu
        </a>
      </div>
      {step === "idle" && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="mt-4 cursor-pointer border-2 border-dashed border-[var(--ocean-100)] rounded-2xl p-10 text-center hover:border-[var(--ocean-400)] hover:bg-[var(--ocean-100)]/20 transition-colors"
        >
          <div className="text-3xl mb-2">⇩</div>
          <div className="font-semibold text-[var(--ink-900)]">{previewMutation.isPending ? "Đang phân tích file…" : "Kéo thả hoặc bấm để chọn file Excel/CSV"}</div>
          <div className="text-xs text-[var(--ink-400)] mt-1">Định dạng .xlsx/.xls/.csv</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileChosen(file);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {step === "preview" && preview && (
        <div className="anim-in mt-4">
          <div className="flex items-center gap-2 mb-4 bg-slate-50 rounded-xl p-3">
            <span className="text-xl">📄</span>
            <div className="flex-1">
              <div className="font-semibold text-sm">{filename}</div>
              <div className="text-xs text-[var(--ink-400)]">Đã phân tích xong — sẵn sàng import</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <StatCard label="Dòng hợp lệ" value={preview.thanhCong} tone="teal" size="sm" />
            <StatCard label="Dòng lỗi" value={preview.loi} tone="coral" muted={preview.loi === 0} size="sm" />
          </div>
          {preview.thangList.length > 0 && (
            <div className="text-xs text-[var(--ink-600)] mb-3">
              Sẽ thay thế dữ liệu: {preview.thangList.map((t) => `${t.thang} (${t.soDong} dòng)`).join(", ")}
            </div>
          )}
          {preview.errors.length > 0 && (
            <div className="text-xs text-[var(--coral-500)] mb-4 mt-3 max-h-24 overflow-y-auto">
              {preview.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <Btn onClick={() => commitMutation.mutate()} disabled={commitMutation.isPending || preview.thanhCong === 0}>
              {commitMutation.isPending ? "Đang import…" : "Xác nhận import"}
            </Btn>
            <Btn
              variant="ghost"
              onClick={() => {
                setStep("idle");
                setPreview(null);
              }}
            >
              Hủy
            </Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

export function LuyKeModule() {
  const auth = useAuth();
  const canImport = auth.status === "authenticated" && (auth.user.vai_tro === "Admin" || auth.user.vai_tro === "TBP DVBH");
  const [tab, setTab] = useLocalStorageState<"dashboard" | "import">("luy-ke:tab", "dashboard");
  const { rows: rawRows, months, isLoading, isError, refetch } = useLuyKeChunked();
  // An khoi bao cao - khop KHU_VUC_AN_KHOI_BAO_CAO da CHOT o he thong khac (xem constants.ts): du
  // lieu doc thang tu R2 KHONG qua endpoint co loc san nen phai tu loc o client, giong BacklogModule.tsx
  // tab "Ca da dong". Loc TRUOC moi tinh toan khac (filter option, chart, bang, tong) de khu_vuc nay
  // khong con xuat hien o dau trong bao cao lũy ke, ke ca dropdown loc.
  // kh_vip || "KH thường": cac thang da import TRUOC khi co cot nay (them 2026-08-28) khong co field
  // kh_vip trong JSON R2 cu (undefined), va cac thang import ngay luc chua sua lai quy tac (co the
  // luu "" rong) - ca 2 truong hop deu quy ve nhan "KH thường" (CHOT: khong con de rong).
  const rows = useMemo(
    () => rawRows.filter((r) => !KHU_VUC_AN_KHOI_BAO_CAO.includes(r.khu_vuc)).map((r) => ({ ...r, kh_vip: r.kh_vip || "KH thường" })),
    [rawRows],
  );
  // "v2" (CHOT 2026-08-28): doi tu Select don ("__ALL__" sentinel) sang MultiSelectFilter (chuoi gia
  // tri cach nhau "|", rong = tat ca) - key cu se lam moi bo loc bi hieu la loc theo dung chuoi
  // "__ALL__" (khong khop dong nao) neu doc lai gia tri localStorage cu, nen doi ten key thay vi
  // migrate tai cho, tranh anh huong nguoi da tung mo bao cao truoc do.
  const [filters, setFilters] = useLocalStorageState<Filters>("filters:luy-ke:v2", DEFAULT_FILTERS);
  const [groupBy, setGroupBy] = useLocalStorageState<keyof LuyKeRow>("filters:luy-ke-group", "khu_vuc");
  const [hiddenChartLabels, setHiddenChartLabels] = useLocalStorageState<string[]>("luy-ke:chart-hidden-labels", []);
  function toggleChartLabel(label: string) {
    setHiddenChartLabels(hiddenChartLabels.includes(label) ? hiddenChartLabels.filter((l) => l !== label) : [...hiddenChartLabels, label]);
  }
  // Chart "So sanh cung ky theo nam": duong % SLA/% Duoi 24h AN mac dinh (khac chart "Xu huong theo
  // thang" - o do 2 duong nay LUON ve san, chi tickbox AN/HIEN SO tren duong). O day tickbox dieu
  // khien CA duong (dataset.hidden), khong chi so - moi nam co 1 duong rieng nhung dung chung 1
  // tickbox theo LOAI (sla/duoi24h) de khong no ra qua nhieu tickbox khi co nhieu nam.
  const [visibleYearChartLines, setVisibleYearChartLines] = useLocalStorageState<string[]>("luy-ke:year-chart-visible-lines", []);
  function toggleYearChartLine(key: string) {
    setVisibleYearChartLines(visibleYearChartLines.includes(key) ? visibleYearChartLines.filter((k) => k !== key) : [...visibleYearChartLines, key]);
  }

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        FILTER_DIMS.every(({ key, field }) => {
          const val = filters[key];
          return !val || val.split(DELIM).includes(String(r[field]));
        }),
      ),
    [rows, filters],
  );

  // "3 thang" = 3 thang gan nhat co du lieu; "Cung ky" = cung thang lich (MM) o TAT CA cac nam co du
  // lieu, lay thang tham chieu tu dung 1 thang dang chon (neu co), khong thi lay thang gan nhat.
  const monthsDesc = useMemo(() => [...months].sort((a, b) => b.localeCompare(a)), [months]);
  function selectLastMonths(n: number) {
    setFilters({ ...filters, thang: monthsDesc.slice(0, n).join(DELIM) });
  }
  function selectSameCycle() {
    const selectedMonths = filters.thang ? filters.thang.split(DELIM) : [];
    const reference = selectedMonths.length === 1 ? selectedMonths[0] : monthsDesc[0];
    if (!reference) return;
    const mm = reference.slice(5, 7);
    setFilters({ ...filters, thang: months.filter((m) => m.slice(5, 7) === mm).join(DELIM) });
  }

  const totals = useMemo(() => {
    let tong = 0;
    let dungHan = 0;
    let duoi96 = 0;
    for (const r of filtered) {
      tong += r.sl;
      if (r.dung_han === "Đúng hạn") dungHan += r.sl;
      if (r.tren_96h.startsWith("1")) duoi96 += r.sl;
    }
    return { tong, dungHan, quaHan: tong - dungHan, duoi96, tren96: tong - duoi96 };
  }, [filtered]);

  // "sla" = % dung han (dungHan/tong) - "duoi24h" = % so ca thuoc toc do "1. Duoi 24h" tren tong SL
  // thang do - ve dang duong tren truc % rieng (truc phai), chong len 2 cot Dung han/Qua han.
  const byMonth = useMemo(() => {
    const map = new Map<string, { dungHan: number; quaHan: number; duoi24h: number }>();
    for (const r of filtered) {
      const cur = map.get(r.thang) ?? { dungHan: 0, quaHan: 0, duoi24h: 0 };
      if (r.dung_han === "Đúng hạn") cur.dungHan += r.sl;
      else cur.quaHan += r.sl;
      if (r.toc_do.startsWith("1.")) cur.duoi24h += r.sl;
      map.set(r.thang, cur);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([thang, v]) => {
        const tong = v.dungHan + v.quaHan;
        return { thang, ...v, tong, slaPct: tong ? (v.dungHan / tong) * 100 : 0, duoi24hPct: tong ? (v.duoi24h / tong) * 100 : 0 };
      });
  }, [filtered]);

  // Rieng cho chart "So sanh cung ky theo nam": bo qua dim "thang" (chon thang cu the se trieu tieu
  // muc dich so sanh du 12 thang), van giu cac dim con lai (khu vuc/hang/phan loai...) de loc theo
  // y muon nguoi dung.
  const filteredForYearChart = useMemo(
    () =>
      rows.filter((r) =>
        FILTER_DIMS.filter((d) => d.key !== "thang").every(({ key, field }) => {
          const val = filters[key];
          return !val || val.split(DELIM).includes(String(r[field]));
        }),
      ),
    [rows, filters],
  );

  // Gom SL/dungHan/duoi24h theo (nam, thang so 1-12) - "TB" = trung binh cong CAC THANG DA CO DU
  // LIEU (bo qua thang rong, giong cach tinh cot "TB" trong file bao cao goc nguoi dung gui lam
  // mau). slaPct/duoi24hPct dung chung cong thuc voi byMonth o tren, tach rieng theo TUNG NAM.
  const yearlyByMonth = useMemo(() => {
    const map = new Map<string, { sl: number[]; dungHan: number[]; duoi24h: number[] }>();
    for (const r of filteredForYearChart) {
      const year = r.nam || r.thang.slice(0, 4);
      const monthIdx = Number(r.thang.slice(5, 7)) - 1;
      if (monthIdx < 0 || monthIdx > 11) continue;
      const cur = map.get(year) ?? { sl: new Array(12).fill(0), dungHan: new Array(12).fill(0), duoi24h: new Array(12).fill(0) };
      cur.sl[monthIdx] += r.sl;
      if (r.dung_han === "Đúng hạn") cur.dungHan[monthIdx] += r.sl;
      if (r.toc_do.startsWith("1.")) cur.duoi24h[monthIdx] += r.sl;
      map.set(year, cur);
    }
    const years = [...map.keys()].sort();
    return years.map((year) => {
      const { sl: monthly, dungHan, duoi24h } = map.get(year)!;
      const withData = monthly.filter((v) => v > 0);
      const avg = withData.length > 0 ? withData.reduce((a, b) => a + b, 0) / withData.length : 0;
      const slaPct = monthly.map((tong, i) => (tong ? (dungHan[i] / tong) * 100 : 0));
      const duoi24hPct = monthly.map((tong, i) => (tong ? (duoi24h[i] / tong) * 100 : 0));
      const monthIdxWithData = monthly.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
      const avgOf = (pctArr: number[]) => (monthIdxWithData.length > 0 ? monthIdxWithData.reduce((a, i) => a + pctArr[i], 0) / monthIdxWithData.length : 0);
      return { year, monthly, avg, slaPct: [...slaPct, avgOf(slaPct)], duoi24hPct: [...duoi24hPct, avgOf(duoi24hPct)] };
    });
  }, [filteredForYearChart]);

  const groupRows = useMemo(() => {
    const map = new Map<string, { tong: number; dungHan: number }>();
    for (const r of filtered) {
      const key = String(r[groupBy]);
      const cur = map.get(key) ?? { tong: 0, dungHan: 0 };
      cur.tong += r.sl;
      if (r.dung_han === "Đúng hạn") cur.dungHan += r.sl;
      map.set(key, cur);
    }
    return [...map.entries()].map(([nhom, v]) => ({ nhom, tong: v.tong, dungHan: v.dungHan, quaHan: v.tong - v.dungHan })).sort((a, b) => b.tong - a.tong);
  }, [filtered, groupBy]);

  const labelFor = (field: keyof LuyKeRow, value: string) => (field === "khu_vuc" ? shortKhuVuc(value) : value);

  return (
    <div className="anim-in">
      <Tabs
        tabs={[
          { key: "dashboard", label: "Tổng quan" },
          ...(canImport ? [{ key: "import", label: "Nhập dữ liệu" }] : []),
        ]}
        active={tab}
        onChange={(k) => setTab(k as "dashboard" | "import")}
      />

      {tab === "import" && canImport && <LuyKeImportPanel onImported={refetch} />}

      {tab === "dashboard" && (
        <>
          {isError && (
            <Card className="p-4 mb-4 text-sm text-[var(--coral-500)]">
              Không tải được dữ liệu báo cáo lũy kế. <Btn variant="ghost" size="sm" onClick={() => refetch()}>Thử lại</Btn>
            </Card>
          )}
          {isLoading && rows.length === 0 ? (
            <LoadingCard label="Đang tải dữ liệu báo cáo lũy kế…" />
          ) : rows.length === 0 ? (
            <Card className="p-8 text-center text-sm text-[var(--ink-400)]">
              Chưa có dữ liệu báo cáo lũy kế. {canImport && "Vào tab \"Nhập dữ liệu\" để import file Excel đầu tiên."}
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2 mb-4">
                {FILTER_DIMS.map(({ key, label, field }) => {
                  const options = [...new Set(rows.map((r) => String(r[field])))]
                    .sort((a, b) => a.localeCompare(b, "vi"))
                    .map((o) => ({ value: o, label: labelFor(field, o) }));
                  return <MultiSelectFilter key={key} label={label} value={filters[key]} onChange={(v) => setFilters({ ...filters, [key]: v })} options={options} />;
                })}
                <div className="flex items-center gap-1.5 ml-1">
                  <Btn variant="ghost" size="sm" onClick={() => selectLastMonths(3)}>
                    3 tháng gần nhất
                  </Btn>
                  <Btn variant="ghost" size="sm" onClick={selectSameCycle}>
                    Cùng kỳ
                  </Btn>
                </div>
                <div className="ml-auto self-center">
                  <Btn variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)}>
                    Xóa lọc
                  </Btn>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 mb-4">
                <StatCard label="Tổng SL" value={totals.tong.toLocaleString("vi-VN")} tone="ocean" />
                <StatCard label="Đúng hạn" value={pct(totals.dungHan, totals.tong)} sub={`${totals.dungHan.toLocaleString("vi-VN")} / ${totals.tong.toLocaleString("vi-VN")}`} tone="teal" />
                <StatCard label="Quá hạn" value={pct(totals.quaHan, totals.tong)} sub={totals.quaHan.toLocaleString("vi-VN")} tone="coral" />
                <StatCard label="Dưới 96h" value={pct(totals.duoi96, totals.tong)} sub={totals.duoi96.toLocaleString("vi-VN")} tone="amber" />
              </div>

              <Card className="p-4 mb-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="font-display font-bold text-sm">Xu hướng theo tháng</div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {CHART_SERIES_LABELS.map((label) => (
                      <label key={label} className="flex items-center gap-1.5 text-xs text-[var(--ink-600)] cursor-pointer">
                        <input type="checkbox" checked={!hiddenChartLabels.includes(label)} onChange={() => toggleChartLabel(label)} className="w-3.5 h-3.5" />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <ChartCanvas
                  type="bar"
                  data={{
                    labels: byMonth.map((m) => m.thang),
                    datasets: [
                      { type: "bar", label: "Đúng hạn", data: byMonth.map((m) => m.dungHan), backgroundColor: "#159C93", borderRadius: 6, stack: "s", yAxisID: "y" },
                      { type: "bar", label: "Quá hạn", data: byMonth.map((m) => m.quaHan), backgroundColor: "#E8604C", borderRadius: 6, stack: "s", yAxisID: "y" },
                      {
                        type: "line",
                        label: "% SLA (đúng hạn)",
                        data: byMonth.map((m) => m.slaPct),
                        borderColor: "#0F3D5C",
                        backgroundColor: "#0F3D5C",
                        yAxisID: "y1",
                        tension: 0.25,
                        pointRadius: 3,
                      },
                      {
                        type: "line",
                        label: "% Dưới 24h",
                        data: byMonth.map((m) => m.duoi24hPct),
                        borderColor: "#B8860B",
                        backgroundColor: "#B8860B",
                        borderDash: [5, 3],
                        yAxisID: "y1",
                        tension: 0.25,
                        pointRadius: 3,
                      },
                    ],
                  }}
                  options={{
                    scales: {
                      x: { stacked: true },
                      y: { stacked: true, beginAtZero: true, position: "left" },
                      y1: { min: 0, max: 100, position: "right", grid: { display: false }, ticks: { callback: (v) => `${v}%` } },
                    },
                    plugins: { valueLabels: { hiddenLabels: hiddenChartLabels } } as ChartOptions["plugins"],
                  }}
                />
              </Card>

              <Card className="p-4 mb-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="font-display font-bold text-sm">So sánh sản lượng cùng kỳ theo năm</div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {[
                      { key: "sla", label: "% SLA (đúng hạn)" },
                      { key: "duoi24h", label: "% Dưới 24h" },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-1.5 text-xs text-[var(--ink-600)] cursor-pointer">
                        <input type="checkbox" checked={visibleYearChartLines.includes(key)} onChange={() => toggleYearChartLine(key)} className="w-3.5 h-3.5" />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <ChartCanvas
                  type="bar"
                  data={{
                    labels: [...MONTH_LABELS, "TB"],
                    datasets: [
                      ...yearlyByMonth.map((y, i) => ({
                        type: "bar" as const,
                        label: y.year,
                        data: [...y.monthly.map((v) => v || null), y.avg || null],
                        backgroundColor: YEAR_CHART_COLORS[i % YEAR_CHART_COLORS.length],
                        borderRadius: 6,
                      })),
                      ...yearlyByMonth.map((y, i) => ({
                        type: "line" as const,
                        label: `% SLA ${y.year}`,
                        data: y.slaPct,
                        borderColor: YEAR_CHART_COLORS[i % YEAR_CHART_COLORS.length],
                        backgroundColor: YEAR_CHART_COLORS[i % YEAR_CHART_COLORS.length],
                        yAxisID: "y1",
                        tension: 0.25,
                        pointRadius: 3,
                        hidden: !visibleYearChartLines.includes("sla"),
                      })),
                      ...yearlyByMonth.map((y, i) => ({
                        type: "line" as const,
                        label: `% Dưới 24h ${y.year}`,
                        data: y.duoi24hPct,
                        borderColor: YEAR_CHART_COLORS[i % YEAR_CHART_COLORS.length],
                        backgroundColor: YEAR_CHART_COLORS[i % YEAR_CHART_COLORS.length],
                        borderDash: [5, 3],
                        yAxisID: "y1",
                        tension: 0.25,
                        pointRadius: 3,
                        hidden: !visibleYearChartLines.includes("duoi24h"),
                      })),
                    ],
                  }}
                  options={{
                    scales: {
                      y: { beginAtZero: true, position: "left" },
                      y1: { min: 0, max: 100, position: "right", grid: { display: false }, ticks: { callback: (v) => `${v}%` } },
                    },
                  }}
                />
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-sm">Bảng chi tiết — nhóm theo</span>
                    <Select value={groupBy} onChange={(v) => setGroupBy(v as keyof LuyKeRow)} options={GROUP_OPTIONS.map((g) => ({ value: g.value, label: g.label }))} />
                  </div>
                  <Btn
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      exportRowsToExcel(
                        groupRows.map((r) => ({ ...r, nhom: labelFor(groupBy, r.nhom), tyLeDungHan: totals.tong ? `${((r.dungHan / r.tong) * 100).toFixed(1)}%` : "—" })),
                        `bao_cao_luy_ke_${groupBy}.xlsx`,
                        "Data",
                        { nhom: GROUP_OPTIONS.find((g) => g.value === groupBy)?.label ?? "Nhóm", tong: "Tổng SL", dungHan: "Đúng hạn", quaHan: "Quá hạn", tyLeDungHan: "% Đúng hạn" },
                      )
                    }
                  >
                    ⬇ Xuất Excel
                  </Btn>
                </div>
                <table className="dense w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                      <th className="py-2 pr-3">{GROUP_OPTIONS.find((g) => g.value === groupBy)?.label}</th>
                      <th className="py-2 pr-3">Tổng SL</th>
                      <th className="py-2 pr-3">Đúng hạn</th>
                      <th className="py-2 pr-3">Quá hạn</th>
                      <th className="py-2 pr-3">% Đúng hạn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupRows.map((r) => (
                      <tr key={r.nhom} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                        <td className="py-2 pr-3 font-semibold">{labelFor(groupBy, r.nhom)}</td>
                        <td className="py-2 pr-3 font-mono">{r.tong.toLocaleString("vi-VN")}</td>
                        <td className="py-2 pr-3 font-mono">{r.dungHan.toLocaleString("vi-VN")}</td>
                        <td className="py-2 pr-3 font-mono">{r.quaHan.toLocaleString("vi-VN")}</td>
                        <td className="py-2 pr-3 font-mono">{pct(r.dungHan, r.tong)}</td>
                      </tr>
                    ))}
                    {groupRows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-[var(--ink-400)] text-sm">
                          Không có dữ liệu khớp bộ lọc.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
