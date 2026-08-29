import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { Card } from "./ui/Card";
import { Btn } from "./ui/Btn";
import { api, ApiError } from "../api/client";
import { useToast } from "./ui/Toast";

/** Rut ra thong diep loi cu the tu ApiError (ma loi backend tra ve, hoac HTTP status neu backend
 * khong tra ma) thay vi luon hien 1 cau chung chung - truoc day moi loi (400/500/mat mang...) deu
 * hien y het nhau nen nguoi dung khong biet dang loi gi that su. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.detail ?? (err.code ? err.code : `Loi may chu (HTTP ${err.status})`);
  return "Mat ket noi hoac may chu khong phan hoi";
}

// CHOT 2026-08-03: phat hien "cot Excel khong khop tieu de" - truoc day neu 1 header trong columnMap
// khong ton tai trong file (sai chinh ta, thieu dau, khac tieu de mau...), raw[excelCol] luon
// undefined -> ?? null -> TOAN BO dong ghi gia tri null cho cot do, ma khong co canh bao gi (preview/
// commit van bao "thanh cong"). Xay ra that: import "Link hinh anh" qua /update-column ghi de NULL
// len 10185 ca vi file nguoi dung dung tieu de khac file mau, khong 1 dong loi nao duoc bao. Chi bat
// buoc kiem tra khi requireAllColumns=true (dung cho /update-column, noi CHI co 2 cot nen KHONG co ly
// do hop le nao de 1 cot bi thieu) - KHONG bat cho CRM import thuong (columnMap ~40 cot, file that co
// the hop le thieu vai cot khong bat buoc).
// "preferredSheetNames" (them 2026-08-28 cho luong "Bao cao luy ke") - file nguon co nhieu sheet
// (vd "BIỂU ĐỒ" dung cho pivot chart cua nguoi dung, dat TRUOC sheet du lieu "Sheet1" trong thu tu
// workbook) nen KHONG the dua vao "DATA" hoac sheet DAU TIEN nhu truoc gio - phai chi dinh ro ten
// sheet du lieu can doc, thu lan luot tung ten trong danh sach truoc khi fallback ve hanh vi cu.
export async function parseSpreadsheet(
  file: File,
  columnMap?: Record<string, string>,
  requireAllColumns?: boolean,
  preferredSheetNames?: string[],
): Promise<Record<string, unknown>[]> {
  const XLSX = await import("xlsx");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary", cellDates: true });
        const preferredSheet = preferredSheetNames?.map((name) => workbook.Sheets[name]).find((s) => s);
        const sheet = preferredSheet ?? workbook.Sheets["DATA"] ?? workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
        if (!columnMap) {
          resolve(rawRows);
          return;
        }
        if (requireAllColumns) {
          const headerRow = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })[0] ?? [];
          const headerSet = new Set(headerRow.map((h) => String(h ?? "").trim()));
          const missing = Object.keys(columnMap).filter((h) => !headerSet.has(h));
          if (missing.length > 0) {
            reject(new Error(`Không tìm thấy cột "${missing.join('", "')}" trong file — kiểm tra lại tên cột (phải khớp chính xác với file mẫu, kể cả dấu).`));
            return;
          }
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
  // Anh xa Excel->DB truyen thang tu component cha, dung khi map thay doi dong theo lua chon cua
  // nguoi dung (vd chon cot can cap nhat) - khong the fetch tinh 1 lan qua columnMapUrl duoc. Neu
  // ca 2 cung truyen, columnMap (truc tiep) duoc uu tien.
  columnMap?: Record<string, string>;
  // Bat buoc TAT CA header trong columnMap phai co that trong file (xem giai thich o parseSpreadsheet)
  // - dung cho cac luong "vai cot co dinh, bat buoc" nhu /update-column, KHONG bat cho CRM import
  // thuong (nhieu cot, co the hop le thieu vai cot khong bat buoc).
  requireAllColumns?: boolean;
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
  columnMap,
  requireAllColumns,
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
    onError: (err) => addToast(`Không đọc được file: ${describeError(err)}`),
  });

  const commitMutation = useMutation({
    mutationFn: () => api.post<TSummary>(commitUrl, buildBody(parsedRows, filename)),
    onSuccess: (summary) => {
      addToast(successMessage(summary));
      setStep("idle");
      setPreview(null);
      for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => addToast(`Import thất bại: ${describeError(err)}`),
  });

  async function handleFileChosen(file: File) {
    if (columnMapUrl && !columnMap && !columnMapData) return;
    setFilename(file.name);
    try {
      const rows = await parseSpreadsheet(file, columnMap ?? columnMapData?.columnMap, requireAllColumns);
      setParsedRows(rows);
      previewMutation.mutate(rows);
    } catch (err) {
      addToast(`Không đọc được file: ${err instanceof Error ? err.message : String(err)}`);
    }
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
