import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { Card } from "./ui/Card";
import { Btn } from "./ui/Btn";
import { api } from "../api/client";
import { useToast } from "./ui/Toast";

async function parseSpreadsheet(file: File, columnMap?: Record<string, string>): Promise<Record<string, unknown>[]> {
  const XLSX = await import("xlsx");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary", cellDates: true });
        const sheet = workbook.Sheets["DATA"] ?? workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
        if (!columnMap) {
          resolve(rawRows);
          return;
        }
        const mapped = rawRows.map((raw) => {
          const row: Record<string, unknown> = {};
          for (const [excelCol, dbCol] of Object.entries(columnMap)) {
            row[dbCol] = raw[excelCol] ?? null;
          }
          return row;
        });
        resolve(mapped);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

export interface ImportUploaderProps<TSummary> {
  description: ReactNode;
  templateUrl: string;
  previewUrl: string;
  commitUrl: string;
  columnMapUrl?: string;
  buildBody: (rows: Record<string, unknown>[], filename: string) => unknown;
  renderSummary: (summary: TSummary) => ReactNode;
  getErrors: (summary: TSummary) => string[];
  successMessage: (summary: TSummary) => string;
  invalidateKeys: QueryKey[];
}

export function ImportUploader<TSummary>({
  description,
  templateUrl,
  previewUrl,
  commitUrl,
  columnMapUrl,
  buildBody,
  renderSummary,
  getErrors,
  successMessage,
  invalidateKeys,
}: ImportUploaderProps<TSummary>) {
  const [step, setStep] = useState<"idle" | "preview">("idle");
  const [preview, setPreview] = useState<TSummary | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [filename, setFilename] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addToast = useToast();
  const qc = useQueryClient();

  const { data: columnMapData } = useQuery({
    queryKey: ["import-column-map", columnMapUrl],
    queryFn: () => api.get<{ columnMap: Record<string, string> }>(columnMapUrl!),
    enabled: !!columnMapUrl,
  });

  const previewMutation = useMutation({
    mutationFn: (rows: Record<string, unknown>[]) => api.post<TSummary>(previewUrl, buildBody(rows, filename)),
    onSuccess: (summary) => {
      setPreview(summary);
      setStep("preview");
    },
    onError: () => addToast("Không đọc được file, kiểm tra lại định dạng."),
  });

  const commitMutation = useMutation({
    mutationFn: () => api.post<TSummary>(commitUrl, buildBody(parsedRows, filename)),
    onSuccess: (summary) => {
      addToast(successMessage(summary));
      setStep("idle");
      setPreview(null);
      for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key });
    },
    onError: () => addToast("Import thất bại, thử lại sau."),
  });

  async function handleFileChosen(file: File) {
    if (columnMapUrl && !columnMapData) return;
    setFilename(file.name);
    const rows = await parseSpreadsheet(file, columnMapData?.columnMap);
    setParsedRows(rows);
    previewMutation.mutate(rows);
  }

  const errors = preview ? getErrors(preview) : [];

  return (
    <Card className="p-6 mb-5">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="text-sm text-[var(--ink-600)] flex-1 min-w-[240px]">{description}</div>
        <a href={templateUrl} className="text-xs font-semibold text-[var(--ocean-600)] hover:underline whitespace-nowrap">
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
          {renderSummary(preview)}
          {errors.length > 0 && (
            <div className="text-xs text-[var(--coral-500)] mb-4 mt-3 max-h-24 overflow-y-auto">
              {errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <Btn onClick={() => commitMutation.mutate()} disabled={commitMutation.isPending}>
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
