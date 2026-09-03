import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../components/ui/Btn";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import { Badge } from "../components/ui/Badge";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { api } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { fmtVND, type LinhKienRow } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { fetchWithHashCache } from "../lib/staticListCache";
import { usePersonDirectory, formatPersonDisplay } from "../lib/personDisplay";

const PAGE_SIZE = 20;
const BOOL_FILTER_OPTIONS = [
  { value: "", label: "Tất cả" },
  { value: "true", label: "Có" },
  { value: "false", label: "Không" },
];

// KHOA CHINH SUA (2026-09-04): danh muc linh_kien chuyen sang dong bo tu he "linh-kien-app" doc lap
// qua POST /api/partner/sync/linh-kien (cron 1h/lan, ghi de khong merge - xem routes/partnerApi.ts).
// Sua tay o day se bi ghi de trong vong toi da 1h nen khoa het duong ghi qua UI (giu nguyen route
// backend - chi khoa frontend, xem feedback nguoi dung). Doi lai false neu he linh-kien-app ngung
// dong bo va can quay lai sua tay o day.
const DANH_MUC_LOCKED = true;

// Nhap hang loat "anh demo" tu file Excel co san (cot "Mã linh kiện" / "ẢNH DEMO", vd export tu
// AppSheet cu) - CHOT 2026-08-17. Backend tu chia chunk 10 dong/lan (xem settings.ts
// bulk-import-anh) vi moi dong ton 1 fetch anh nguon + 3 goi Google Drive - frontend chi lap goi
// voi offset tra ve den khi done:true, khong can biet truoc kich thuoc chunk.
interface BulkImportRow { ma_linh_kien: string; source_url: string }
interface BulkImportChunkResult {
  done: boolean;
  nextOffset: number;
  success: number;
  notFound: number;
  fetchFailed: number;
  error: number;
  details: { ma_linh_kien: string; status: string }[];
}

async function parseBulkImportFile(file: File): Promise<BulkImportRow[]> {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  const rows: BulkImportRow[] = [];
  for (const raw of rawRows) {
    const maRaw = raw["Mã linh kiện"] ?? raw["Ma linh kien"];
    const urlRaw = raw["ẢNH DEMO"] ?? raw["ANH DEMO"];
    if (maRaw == null || urlRaw == null) continue;
    // File nguon co dong ma dang "[A039-140]" (bracket) lan ma so thuan (2010020647) - bo bracket
    // neu co de khop dung linh_kien.ma_linh_kien.
    const ma = String(maRaw).trim().replace(/^\[(.*)\]$/, "$1");
    const url = String(urlRaw).trim();
    if (ma && url) rows.push({ ma_linh_kien: ma, source_url: url });
  }
  return rows;
}

function IconImageOff({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="9" r="1.6" />
      <path d="M21 15l-5-5-4 4-3-3-6 6" />
    </svg>
  );
}

function IconZoom({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
    </svg>
  );
}

// Anh minh hoa - <img> nhung truc tiep tu Google Drive (link cong khai "anyone with link", xem
// backend/src/lib/googleDrive.ts uploadPublicImage()) - 3 trang thai ro rang (dang tai/da tai/loi)
// thay vi chi co onError nhu ban truoc: skeleton nhap nhay trong luc cho, fade-in khi xong, roi ve
// placeholder gon gang khi loi - KHONG BAO GIO chan luong lam viec chinh (danh sach/sua) du anh
// cham hay hong. Bam vao thumbnail mo PartDetailDrawer (xem duoi) thay vi mo tab moi.
function AnhThumbnail({ url, cacheBust, size = 40, onClick }: { url: string | null; cacheBust?: number; size?: number; onClick?: () => void }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  useEffect(() => setStatus("loading"), [url]);

  if (!url) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-[var(--line)] text-[var(--ink-400)]"
        style={{ width: size, height: size }}
      >
        <IconImageOff className="w-4 h-4" />
      </div>
    );
  }

  const src = cacheBust ? `${url}${url.includes("?") ? "&" : "?"}cb=${cacheBust}` : url;
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative block rounded-lg border border-[var(--line)] overflow-hidden shrink-0 focus-ring"
      style={{ width: size, height: size }}
      title="Xem chi tiết"
    >
      {status === "loading" && <div className="img-skeleton absolute inset-0 bg-[var(--surface-200)]" />}
      {status === "error" ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-100)] text-[var(--ink-400)]">
          <IconImageOff className="w-4 h-4" />
        </div>
      ) : (
        <img
          src={src}
          loading="lazy"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={`w-full h-full object-cover transition-opacity duration-300 ${status === "loaded" ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </button>
  );
}

// Xem anh phong to toan man hinh - lop tren ca Modal (z-[60] > 50) vi PartDetailDrawer co the dang
// mo cung luc. object-contain (khac object-cover cua thumbnail) de KHONG cat mat anh du ty le nao.
function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm p-8 anim-in" onClick={onClose}>
      <button onClick={onClose} className="focus-ring absolute top-4 right-4 w-9 h-9 rounded-lg bg-white/10 text-white hover:bg-white/20 text-lg">
        ✕
      </button>
      <img src={url} alt="Ảnh linh kiện phóng to" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-5 text-xs text-white/70 hover:text-white hover:underline"
      >
        Mở ảnh gốc trên Google Drive ↗
      </a>
    </div>
  );
}

// Anh lon trong drawer xem chi tiet - khung ty le co dinh (4:3) nen bo cuc khong "nhay" khi doi
// giua cac linh kien co/khong co anh; object-contain de khong cat mat, nen trung tinh lam noi bat
// anh san pham thuc te. Bam vao anh (khi da tai xong) mo ImageLightbox phong to.
function PartHeroImage({ url, alt, onZoom }: { url: string | null; alt: string; onZoom: () => void }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(url ? "loading" : "error");
  useEffect(() => setStatus(url ? "loading" : "error"), [url]);

  return (
    <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-[var(--line)] bg-[var(--surface-100)]">
      {status === "loading" && <div className="img-skeleton absolute inset-0 bg-[var(--surface-200)]" />}
      {url && status !== "error" && (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          onClick={() => status === "loaded" && onZoom()}
          className={`w-full h-full object-contain transition-opacity duration-300 ${status === "loaded" ? "opacity-100 cursor-zoom-in" : "opacity-0"}`}
        />
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-[var(--ink-400)]">
          <IconImageOff className="w-7 h-7" />
          <span className="text-xs font-medium">{url ? "Không tải được ảnh" : "Chưa có ảnh minh hoạ"}</span>
        </div>
      )}
      {status === "loaded" && (
        <div className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center pointer-events-none">
          <IconZoom className="w-3.5 h-3.5" />
        </div>
      )}
    </div>
  );
}

// Drawer truot tu phai - man hinh "XEM" chi tiet 1 linh kien, tach rieng voi Modal "SUA" (form) o
// duoi: xem la thao tac tra cuu nhanh (bam vao dong/thumbnail trong bang), khong nen dung chung
// giao dien voi form chinh sua de tranh nguoi dung tuong nham co the sua ngay tai day.
function PartDetailDrawer({ part, onClose, onEdit }: { part: LinhKienRow | null; onClose: () => void; onEdit: () => void }) {
  const personDir = usePersonDirectory();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  useEffect(() => setLightboxOpen(false), [part?.ma_linh_kien]);
  useEffect(() => {
    if (!part) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !lightboxOpen) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [part, lightboxOpen, onClose]);

  if (!part) return null;

  const specs: { label: string; value: ReactNode }[] = [
    { label: "Giá bán", value: <span className="font-mono">{fmtVND(part.gia_ban)}</span> },
    { label: "Giá tham chiếu", value: <span className="font-mono">{fmtVND(part.gia_tham_chieu)}</span> },
    { label: "Đơn vị", value: part.don_vi ?? "—" },
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 bg-[rgba(6,32,51,0.45)] backdrop-blur-[2px]" onClick={onClose} />
      <div className="drawer-in fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[var(--surface)] shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--line)] shrink-0">
          <div className="min-w-0">
            <div className="font-mono text-xs font-semibold text-[var(--ocean-600)] tracking-wide">{part.ma_linh_kien}</div>
            <h3 className="font-display font-bold text-lg text-[var(--ink-900)] leading-snug mt-0.5 truncate">{part.ten_linh_kien}</h3>
          </div>
          <button onClick={onClose} className="focus-ring shrink-0 w-8 h-8 rounded-lg hover:bg-slate-100 text-[var(--ink-400)]">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5 flex-1">
          <PartHeroImage url={part.anh_demo} alt={part.ten_linh_kien} onZoom={() => setLightboxOpen(true)} />

          <div className="flex flex-wrap gap-1.5">
            {!!part.bat_tat === false && <Badge tone="gray">Đang ẩn</Badge>}
            {!!part.dac_thu && <Badge tone="amber">Đặc thù — cần TP DVBH xác nhận</Badge>}
            {!!part.chi_sua_chua && <Badge tone="coral">Only sửa chữa</Badge>}
            {!part.dac_thu && !part.chi_sua_chua && !!part.bat_tat && <Badge tone="teal">Đang hiển thị bình thường</Badge>}
          </div>

          <div className="rounded-xl border border-[var(--line)] divide-y divide-[var(--line)] overflow-hidden">
            {specs.map((s) => (
              <div key={s.label} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                <span className="text-[var(--ink-500)]">{s.label}</span>
                <span className="font-semibold text-[var(--ink-900)]">{s.value}</span>
              </div>
            ))}
          </div>

          <div>
            <div className="text-xs font-semibold text-[var(--ink-400)] uppercase tracking-wide mb-1.5">Ghi chú</div>
            <div className="text-sm text-[var(--ink-700)] whitespace-pre-wrap rounded-xl bg-[var(--surface-100)] px-3.5 py-2.5 min-h-[2.5rem]">
              {part.ghi_chu?.trim() || <span className="text-[var(--ink-400)]">Không có ghi chú.</span>}
            </div>
          </div>

          <div className="text-xs text-[var(--ink-400)] pt-1">
            Cập nhật lần cuối bởi <span className="font-medium text-[var(--ink-500)]">{part.nguoi_cap_nhat ? formatPersonDisplay(part.nguoi_cap_nhat, personDir) : "—"}</span> lúc {part.ngay_cap_nhat}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-[var(--line)] shrink-0">
          <Btn variant="ghost" onClick={onClose}>
            Đóng
          </Btn>
          {!DANH_MUC_LOCKED && <Btn onClick={onEdit}>Sửa thông tin</Btn>}
        </div>
      </div>
      {lightboxOpen && part.anh_demo && <ImageLightbox url={part.anh_demo} onClose={() => setLightboxOpen(false)} />}
    </>
  );
}

// Tach ra khoi SettingsModule.tsx (truoc la 1 tab trong trang Settings Admin-only) thanh module
// rieng tren sidebar - CHOT 2026-08-17: nguoi co quan_ly_danh_muc_lk (hoac Admin) can vao thang,
// khong phai qua trang Settings. Truoc day co 2 section trung lap (1 cho "giai trinh thieu linh
// kien", 1 cho "dat mua linh kien") cung doc/ghi 1 bang linh_kien - gop lai con 1 o day.
export function DanhMucLinhKienModule() {
  const addToast = useToast();
  const qc = useQueryClient();
  const personDir = usePersonDirectory();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterDacThu, setFilterDacThu] = useState("");
  const [filterChiSuaChua, setFilterChiSuaChua] = useState("");
  const [filterBatTat, setFilterBatTat] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingMa, setEditingMa] = useState<string | null>(null);
  const [viewingMa, setViewingMa] = useState<string | null>(null);
  const [uploadingAnh, setUploadingAnh] = useState(false);
  const [imgCacheBust, setImgCacheBust] = useState(0);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [bulkImportRunning, setBulkImportRunning] = useState(false);
  const [bulkImportTotal, setBulkImportTotal] = useState(0);
  const [bulkImportProcessed, setBulkImportProcessed] = useState(0);
  const [bulkImportSummary, setBulkImportSummary] = useState<{ success: number; notFound: number; fetchFailed: number; error: number } | null>(null);
  const [bulkImportFailDetails, setBulkImportFailDetails] = useState<{ ma_linh_kien: string; status: string }[]>([]);
  const [form, setForm] = useState({
    ma_linh_kien: "", ten_linh_kien: "", gia_ban: "", gia_tham_chieu: "", don_vi: "", ghi_chu: "", dac_thu: false, chi_sua_chua: false,
  });

  const { data: parts } = useQuery({
    queryKey: ["settings-linh-kien"],
    queryFn: () => fetchWithHashCache<{ rows: LinhKienRow[] }>("settings-linh-kien", "/settings/linh-kien/version", "/settings/linh-kien"),
  });

  const filteredRows = useMemo(() => {
    let rows = parts?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((p) => p.ma_linh_kien.toLowerCase().includes(q) || p.ten_linh_kien.toLowerCase().includes(q));
    if (filterDacThu) rows = rows.filter((p) => (filterDacThu === "true" ? !!p.dac_thu : !p.dac_thu));
    if (filterChiSuaChua) rows = rows.filter((p) => (filterChiSuaChua === "true" ? !!p.chi_sua_chua : !p.chi_sua_chua));
    if (filterBatTat) rows = rows.filter((p) => (filterBatTat === "true" ? !!p.bat_tat : !p.bat_tat));
    return rows;
  }, [parts?.rows, search, filterDacThu, filterChiSuaChua, filterBatTat]);

  const editingRow = editingMa ? parts?.rows.find((p) => p.ma_linh_kien === editingMa) ?? null : null;
  const viewingRow = viewingMa ? parts?.rows.find((p) => p.ma_linh_kien === viewingMa) ?? null : null;

  function openEdit(p: LinhKienRow) {
    setViewingMa(null);
    setEditingMa(p.ma_linh_kien);
    setImgCacheBust(0);
    setForm({
      ma_linh_kien: p.ma_linh_kien,
      ten_linh_kien: p.ten_linh_kien,
      gia_ban: p.gia_ban?.toString() ?? "",
      gia_tham_chieu: p.gia_tham_chieu?.toString() ?? "",
      don_vi: p.don_vi ?? "",
      ghi_chu: p.ghi_chu ?? "",
      dac_thu: !!p.dac_thu,
      chi_sua_chua: !!p.chi_sua_chua,
    });
    setEditOpen(true);
  }

  const togglePart = useMutation({
    mutationFn: ({ ma, bat_tat }: { ma: string; bat_tat: boolean }) => api.patch(`/settings/linh-kien/${ma}`, { bat_tat }),
    onSuccess: () => {
      addToast("Đã cập nhật danh mục linh kiện");
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    },
  });

  const syncSheetMutation = useMutation({
    mutationFn: () => api.post<{ moi: number; capNhat: number; boQua: number; loi: number }>("/settings/linh-kien/sync-sheet"),
    onSuccess: (res) => {
      addToast(`Đồng bộ xong: ${res.moi} mã mới, ${res.capNhat} mã cập nhật, ${res.boQua} không đổi${res.loi ? `, ${res.loi} lỗi` : ""}`);
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    },
    onError: () => addToast("Đồng bộ Google Sheet thất bại, thử lại sau."),
  });

  const addMutation = useMutation({
    mutationFn: () =>
      api.post("/settings/linh-kien", {
        ma_linh_kien: form.ma_linh_kien.trim(),
        ten_linh_kien: form.ten_linh_kien.trim(),
        gia_ban: form.gia_ban ? Number(form.gia_ban) : undefined,
        gia_tham_chieu: form.gia_tham_chieu ? Number(form.gia_tham_chieu) : undefined,
        don_vi: form.don_vi.trim() || undefined,
        ghi_chu: form.ghi_chu.trim() || undefined,
        dac_thu: form.dac_thu,
        chi_sua_chua: form.chi_sua_chua,
      }),
    onSuccess: () => {
      addToast("Đã thêm linh kiện mới");
      setForm({ ma_linh_kien: "", ten_linh_kien: "", gia_ban: "", gia_tham_chieu: "", don_vi: "", ghi_chu: "", dac_thu: false, chi_sua_chua: false });
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    },
    onError: () => addToast("Không thể thêm linh kiện (mã có thể đã tồn tại)."),
  });

  const editMutation = useMutation({
    mutationFn: () =>
      api.patch(`/settings/linh-kien/${editingMa}`, {
        ten_linh_kien: form.ten_linh_kien.trim(),
        gia_ban: form.gia_ban ? Number(form.gia_ban) : null,
        gia_tham_chieu: form.gia_tham_chieu ? Number(form.gia_tham_chieu) : null,
        don_vi: form.don_vi.trim() || null,
        ghi_chu: form.ghi_chu.trim() || null,
        dac_thu: form.dac_thu,
        chi_sua_chua: form.chi_sua_chua,
      }),
    onSuccess: () => {
      addToast("Đã cập nhật linh kiện");
      setEditOpen(false);
      setEditingMa(null);
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    },
    onError: () => addToast("Không thể cập nhật linh kiện."),
  });

  async function handleUploadAnh(file: File) {
    if (!editingMa) return;
    setUploadingAnh(true);
    try {
      const bytes = await file.arrayBuffer();
      await api.postBinary(`/settings/linh-kien/${editingMa}/anh`, bytes, file.type || "image/jpeg");
      addToast("Đã tải ảnh linh kiện lên Google Drive");
      setImgCacheBust((n) => n + 1);
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    } catch (err) {
      addToast("Lỗi tải ảnh: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploadingAnh(false);
    }
  }

  async function handleBulkImportAnh(file: File) {
    setBulkImportRunning(true);
    setBulkImportSummary(null);
    setBulkImportFailDetails([]);
    try {
      const rows = await parseBulkImportFile(file);
      if (rows.length === 0) {
        addToast('Không đọc được dòng nào hợp lệ (kiểm tra lại tiêu đề cột "Mã linh kiện" / "ẢNH DEMO")');
        return;
      }
      setBulkImportTotal(rows.length);
      let offset = 0;
      let success = 0, notFound = 0, fetchFailed = 0, errorCount = 0;
      const failDetails: { ma_linh_kien: string; status: string }[] = [];
      while (offset < rows.length) {
        const res = await api.post<BulkImportChunkResult>("/settings/linh-kien/bulk-import-anh", { rows, offset });
        success += res.success;
        notFound += res.notFound;
        fetchFailed += res.fetchFailed;
        errorCount += res.error;
        failDetails.push(...res.details.filter((d) => d.status !== "OK"));
        offset = res.nextOffset;
        setBulkImportProcessed(offset);
        if (res.done) break;
      }
      setBulkImportSummary({ success, notFound, fetchFailed, error: errorCount });
      setBulkImportFailDetails(failDetails);
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
      addToast(`Đã nhập xong: ${success} thành công / ${rows.length} dòng`);
    } catch (err) {
      addToast("Lỗi nhập ảnh hàng loạt: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBulkImportRunning(false);
    }
  }

  const columns: Column<LinhKienRow>[] = [
    { key: "ma_linh_kien", header: "Mã", render: (p) => <span className="font-mono text-xs">{p.ma_linh_kien}</span> },
    { key: "ten_linh_kien", header: "Tên linh kiện", render: (p) => <span className="font-medium">{p.ten_linh_kien}</span> },
    { key: "gia_ban", header: "Giá bán", render: (p) => <span className="font-mono">{fmtVND(p.gia_ban)}</span> },
    { key: "don_vi", header: "Đơn vị", render: (p) => <span className="text-xs">{p.don_vi ?? "—"}</span> },
    { key: "anh_demo", header: "Ảnh minh hoạ", render: (p) => <AnhThumbnail url={p.anh_demo} /> },
    { key: "ghi_chu", header: "Ghi chú", render: (p) => <span className="text-xs text-[var(--ink-600)]">{p.ghi_chu ?? "—"}</span> },
    {
      key: "dac_thu",
      header: "Đặc thù",
      render: (p) => (!!p.dac_thu ? <span className="text-xs font-semibold text-[var(--amber-600)]">Đặc thù</span> : <span className="text-xs text-[var(--ink-400)]">—</span>),
    },
    {
      key: "chi_sua_chua",
      header: "Only sửa chữa",
      render: (p) => (!!p.chi_sua_chua ? <span className="text-xs font-semibold text-[var(--coral-600)]">Only sửa chữa</span> : <span className="text-xs text-[var(--ink-400)]">—</span>),
    },
    { key: "nguoi_cap_nhat", header: "Người cập nhật", render: (p) => (p.nguoi_cap_nhat ? formatPersonDisplay(p.nguoi_cap_nhat, personDir) : p.nguoi_cap_nhat) },
    { key: "ngay_cap_nhat", header: "Ngày cập nhật", render: (p) => <span className="text-xs">{p.ngay_cap_nhat}</span> },
    {
      key: "bat_tat",
      header: "Hiển thị",
      // stopPropagation - cot nay nam trong dong da co onRowClick (bam dong mo xem chi tiet), khong
      // muon bam nham vao cong tac lai mo them drawer xem.
      render: (p) => (
        <span onClick={(e) => e.stopPropagation()} className="inline-block">
          <ToggleSwitch checked={!!p.bat_tat} disabled={DANH_MUC_LOCKED} onChange={() => togglePart.mutate({ ma: p.ma_linh_kien, bat_tat: !p.bat_tat })} />
        </span>
      ),
    },
    ...(DANH_MUC_LOCKED
      ? []
      : [
          {
            key: "action",
            header: "",
            render: (p: LinhKienRow) => (
              <button className="text-xs text-[var(--ocean-600)] hover:underline" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>
                Sửa
              </button>
            ),
          } satisfies Column<LinhKienRow>,
        ]),
  ];

  return (
    <div className="anim-in">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-[var(--ink-600)]">
          Danh mục linh kiện dùng chung cho giải trình ca "thiếu linh kiện" và module "Đặt mua linh kiện". Đánh dấu "Đặc thù" để chèn thêm bước TP DVBH xác nhận trước khi Tác nghiệp duyệt khi tạo phiếu đặt. Đánh dấu "Only sửa chữa" để ẩn mã này khỏi danh sách chọn khi tạo đơn mua hàng.
          {DANH_MUC_LOCKED && (
            <div className="mt-1.5 text-[var(--amber-600)] font-medium">
              🔒 Đã khoá chỉnh sửa — danh mục nay được đồng bộ tự động (hàng giờ) từ hệ thống "Đặt mua linh kiện" độc lập. Chỉ xem/xuất Excel tại đây.
            </div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Btn
            variant="ghost"
            size="sm"
            onClick={() =>
              exportRowsToExcel(filteredRows, "danh_muc_linh_kien.xlsx", "Data", {
                ma_linh_kien: "Mã",
                ten_linh_kien: "Tên linh kiện",
                gia_ban: "Giá bán",
                gia_tham_chieu: "Giá tham chiếu",
                don_vi: "Đơn vị",
                ghi_chu: "Ghi chú",
                dac_thu: "Đặc thù",
                chi_sua_chua: "Only sửa chữa",
                bat_tat: "Hiển thị",
                nguoi_cap_nhat: "Người cập nhật",
                ngay_cap_nhat: "Ngày cập nhật",
              })
            }
          >
            ⬇ Xuất Excel
          </Btn>
          {!DANH_MUC_LOCKED && (
            <Btn variant="ghost" size="sm" onClick={() => syncSheetMutation.mutate()} disabled={syncSheetMutation.isPending}>
              {syncSheetMutation.isPending ? "Đang đồng bộ…" : "🔄 Đồng bộ từ Google Sheet"}
            </Btn>
          )}
          {!DANH_MUC_LOCKED && (
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => {
                setBulkImportOpen(true);
                setBulkImportSummary(null);
                setBulkImportFailDetails([]);
                setBulkImportTotal(0);
                setBulkImportProcessed(0);
              }}
            >
              📥 Nhập ảnh demo hàng loạt
            </Btn>
          )}
          {!DANH_MUC_LOCKED && (
          <Btn
            size="sm"
            onClick={() => {
              setForm({ ma_linh_kien: "", ten_linh_kien: "", gia_ban: "", gia_tham_chieu: "", don_vi: "", ghi_chu: "", dac_thu: false, chi_sua_chua: false });
              setAddOpen(true);
            }}
          >
            + Thêm linh kiện
          </Btn>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Tìm theo mã hoặc tên linh kiện..."
          className="focus-ring w-64 bg-white border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
        />
        <div className="flex items-center gap-1 text-xs text-[var(--ink-500)]">
          <span>Đặc thù:</span>
          <Select value={filterDacThu} onChange={(v) => { setFilterDacThu(v); setPage(1); }} options={BOOL_FILTER_OPTIONS} />
        </div>
        <div className="flex items-center gap-1 text-xs text-[var(--ink-500)]">
          <span>Only sửa chữa:</span>
          <Select value={filterChiSuaChua} onChange={(v) => { setFilterChiSuaChua(v); setPage(1); }} options={BOOL_FILTER_OPTIONS} />
        </div>
        <div className="flex items-center gap-1 text-xs text-[var(--ink-500)]">
          <span>Hiển thị:</span>
          <Select value={filterBatTat} onChange={(v) => { setFilterBatTat(v); setPage(1); }} options={BOOL_FILTER_OPTIONS} />
        </div>
      </div>

      <PaginatedTable
        columns={columns}
        rows={filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
        isLoading={false}
        isError={false}
        page={page}
        pageSize={PAGE_SIZE}
        total={filteredRows.length}
        onPageChange={setPage}
        onRowClick={(p) => setViewingMa(p.ma_linh_kien)}
        rowKey={(p) => p.ma_linh_kien}
        emptyText="Không có linh kiện phù hợp."
        storageKey="danh-muc-lk"
      />

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Thêm linh kiện mới">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Mã linh kiện</label>
            <input value={form.ma_linh_kien} onChange={(e) => setForm({ ...form, ma_linh_kien: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Tên linh kiện</label>
            <input value={form.ten_linh_kien} onChange={(e) => setForm({ ...form, ten_linh_kien: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--ink-400)]">Giá bán</label>
              <input type="number" value={form.gia_ban} onChange={(e) => setForm({ ...form, gia_ban: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--ink-400)]">Giá tham chiếu</label>
              <input type="number" value={form.gia_tham_chieu} onChange={(e) => setForm({ ...form, gia_tham_chieu: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Đơn vị</label>
            <input value={form.don_vi} onChange={(e) => setForm({ ...form, don_vi: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Ghi chú</label>
            <textarea value={form.ghi_chu} onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })} rows={2} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <div className="text-xs text-[var(--ink-400)]">Ảnh minh hoạ có thể tải lên sau khi lưu (mở lại "Sửa").</div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.dac_thu} onChange={(e) => setForm({ ...form, dac_thu: e.target.checked })} className="w-4 h-4" />
            <span className="font-semibold">Linh kiện đặc thù</span>
          </label>
          <div className="text-xs text-[var(--ink-400)] -mt-2">Khi tạo/duyệt phiếu đặt mua dùng mã này, hệ thống chèn thêm bước "Chờ TP DVBH xác nhận" trước khi Tác nghiệp (TN) duyệt.</div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.chi_sua_chua} onChange={(e) => setForm({ ...form, chi_sua_chua: e.target.checked })} className="w-4 h-4" />
            <span className="font-semibold">Only sửa chữa</span>
          </label>
          <div className="text-xs text-[var(--ink-400)] -mt-2">Mã này sẽ không hiện trong danh sách chọn khi tạo đơn mua hàng ở module "Đặt mua linh kiện".</div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setAddOpen(false)}>
              Hủy
            </Btn>
            <Btn onClick={() => addMutation.mutate()} disabled={!form.ma_linh_kien.trim() || !form.ten_linh_kien.trim() || addMutation.isPending}>
              Thêm
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={editOpen} onClose={() => { setEditOpen(false); setEditingMa(null); }} title={`Sửa linh kiện ${editingMa ?? ""}`}>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Tên linh kiện</label>
            <input value={form.ten_linh_kien} onChange={(e) => setForm({ ...form, ten_linh_kien: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--ink-400)]">Giá bán</label>
              <input type="number" value={form.gia_ban} onChange={(e) => setForm({ ...form, gia_ban: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--ink-400)]">Giá tham chiếu</label>
              <input type="number" value={form.gia_tham_chieu} onChange={(e) => setForm({ ...form, gia_tham_chieu: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Đơn vị</label>
            <input value={form.don_vi} onChange={(e) => setForm({ ...form, don_vi: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Ảnh minh hoạ</label>
            <div className="flex items-center gap-3 mt-1">
              <AnhThumbnail url={editingRow?.anh_demo ?? null} cacheBust={imgCacheBust || undefined} size={64} />
              <div className="flex flex-col gap-1">
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingAnh}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUploadAnh(f); e.target.value = ""; }}
                  className="text-xs"
                />
                {editingRow?.anh_demo && (
                  <button type="button" className="text-xs text-[var(--ocean-600)] hover:underline self-start" onClick={() => setImgCacheBust((n) => n + 1)}>
                    🔄 Đồng bộ lại ảnh
                  </button>
                )}
                {uploadingAnh && <div className="text-xs text-[var(--ink-500)]">Đang tải ảnh lên Google Drive...</div>}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Ghi chú</label>
            <textarea value={form.ghi_chu} onChange={(e) => setForm({ ...form, ghi_chu: e.target.value })} rows={2} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.dac_thu} onChange={(e) => setForm({ ...form, dac_thu: e.target.checked })} className="w-4 h-4" />
            <span className="font-semibold">Linh kiện đặc thù</span>
          </label>
          <div className="text-xs text-[var(--ink-400)] -mt-2">Khi tạo/duyệt phiếu đặt mua dùng mã này, hệ thống chèn thêm bước "Chờ TP DVBH xác nhận" trước khi Tác nghiệp (TN) duyệt.</div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.chi_sua_chua} onChange={(e) => setForm({ ...form, chi_sua_chua: e.target.checked })} className="w-4 h-4" />
            <span className="font-semibold">Only sửa chữa</span>
          </label>
          <div className="text-xs text-[var(--ink-400)] -mt-2">Mã này sẽ không hiện trong danh sách chọn khi tạo đơn mua hàng ở module "Đặt mua linh kiện".</div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => { setEditOpen(false); setEditingMa(null); }}>
              Hủy
            </Btn>
            <Btn onClick={() => editMutation.mutate()} disabled={!form.ten_linh_kien.trim() || editMutation.isPending}>
              Lưu
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={bulkImportOpen} onClose={() => { if (!bulkImportRunning) setBulkImportOpen(false); }} title="Nhập ảnh demo hàng loạt">
        <div className="space-y-3">
          <div className="text-xs text-[var(--ink-500)]">
            Chọn file Excel có 2 cột <span className="font-mono">Mã linh kiện</span> và <span className="font-mono">ẢNH DEMO</span> (link ảnh nguồn). Hệ thống sẽ tải từng ảnh về và lưu lên Google Drive của hệ thống, khớp theo mã linh kiện đã có sẵn trong danh mục — mã chưa tồn tại sẽ bị bỏ qua.
          </div>
          {!bulkImportRunning && !bulkImportSummary && (
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleBulkImportAnh(f); e.target.value = ""; }}
              className="text-sm"
            />
          )}
          {bulkImportRunning && (
            <div className="text-sm">
              Đang xử lý... {bulkImportProcessed}/{bulkImportTotal} dòng
              <div className="w-full h-2 bg-[var(--surface-100)] rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full bg-[var(--ocean-500)] transition-all"
                  style={{ width: `${bulkImportTotal ? Math.min(100, (bulkImportProcessed / bulkImportTotal) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}
          {bulkImportSummary && (
            <div className="text-sm space-y-2">
              <div>
                ✅ Thành công: <b>{bulkImportSummary.success}</b> · Không tìm thấy mã: <b>{bulkImportSummary.notFound}</b> · Lỗi tải ảnh nguồn: <b>{bulkImportSummary.fetchFailed}</b> · Lỗi khác: <b>{bulkImportSummary.error}</b>
              </div>
              {bulkImportFailDetails.length > 0 && (
                <div className="max-h-40 overflow-y-auto border border-[var(--line)] rounded-lg p-2 text-xs font-mono space-y-0.5">
                  {bulkImportFailDetails.map((d, i) => (
                    <div key={i}>{d.ma_linh_kien}: {d.status}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setBulkImportOpen(false)} disabled={bulkImportRunning}>
              {bulkImportSummary ? "Đóng" : "Hủy"}
            </Btn>
          </div>
        </div>
      </Modal>

      <PartDetailDrawer part={viewingRow} onClose={() => setViewingMa(null)} onEdit={() => { if (viewingRow) openEdit(viewingRow); }} />
    </div>
  );
}
