import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { StatCard } from "../components/ui/StatCard";
import { Tabs } from "../components/ui/Tabs";
import { api, buildQuery } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { exportRowsToExcel } from "../lib/exportExcel";
import { ImportUploader, describeError } from "../components/ImportUploader";
import { Select } from "../components/ui/Select";

interface CrmSummary {
  GHI_MOI: number;
  BO_QUA: number;
  GHI_DE: number;
  LOI: number;
  errors: string[];
}

interface BackfillSummary {
  thanhCong: number;
  loi: number;
  errors: string[];
}

interface ImportHistoryRow {
  id: number;
  ten_file: string;
  nguoi_import: string;
  ghi_moi: number;
  ghi_de: number;
  bo_qua: number;
  loi: number;
  thoi_gian: string;
  // Chi tiet loi/canh bao (ly do that bai khi dong bo tu dong qua cron, hoac danh sach loi tung
  // dong) - xem logImportHistory() o backfillImportProcessor.ts. Co the rat dai (nhieu dong loi
  // gop lai) - KHONG cat bot, hien day du trong bang (xem cell ben duoi).
  bg_error: string | null;
}

interface SheetUrlRow {
  loai_dong_bo: string;
  url: string | null;
  updated_at: string;
  updated_by: string | null;
}

interface UpdateColumnSummary {
  column: string;
  capNhat: number;
  khongTonTai: number;
  khongTonTaiList: string[];
  thieuId: number;
}

const TABS = [
  { key: "crm", label: "Import CRM hàng ngày" },
  { key: "giai-trinh", label: "Import giải trình cũ" },
  { key: "giai-trinh-lap", label: "Import giải trình lặp cũ" },
  { key: "khao-sat", label: "Import khảo sát cũ" },
  { key: "nap-gas", label: "Import đánh giá nạp gas cũ" },
  { key: "huy-ca", label: "Hủy ca hàng loạt" },
  { key: "update-column", label: "Cập nhật 1 cột theo ID" },
];

// "Lich su import" rieng cho tung loai (loc theo "loai" - xem migration 0027) - dung chung cho CA 5
// tab, khong con chi CRM moi co nhu truoc. queryKey ["import-history", loai] khac nhau theo loai nen
// invalidateQueries({queryKey: ["import-history"]}) (khong "exact") van tu dong invalidate DUNG bien
// the loai dang xem, khong can sua invalidateKeys o cac noi goi ImportUploader/mutation dong bo.
function ImportHistoryCard({ loai, exportFileName }: { loai: string; exportFileName: string }) {
  const { data: history } = useQuery({
    queryKey: ["import-history", loai],
    queryFn: () => api.get<{ rows: ImportHistoryRow[] }>(`/import/history${buildQuery({ loai })}`),
  });

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-display font-bold text-sm">Lịch sử import</div>
        <Btn
          variant="ghost"
          size="sm"
          onClick={async () => {
            const res = await api.get<{ rows: ImportHistoryRow[] }>(`/import/history${buildQuery({ loai, export: true })}`);
            await exportRowsToExcel(res.rows, exportFileName, "Data", {
              id: "ID",
              ten_file: "File",
              nguoi_import: "Người import",
              thoi_gian: "Thời gian",
              ghi_moi: "Ghi mới / Thành công",
              ghi_de: "Ghi đè",
              bo_qua: "Bỏ qua",
              loi: "Lỗi",
              bg_error: "Ghi chú / Lỗi chi tiết",
            });
          }}
        >
          ⬇ Xuất Excel
        </Btn>
      </div>
      <div className="overflow-x-auto">
        <table className="dense w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
              <th className="py-2 pr-3">File</th>
              <th className="py-2 pr-3">Người import</th>
              <th className="py-2 pr-3">Thời gian</th>
              <th className="py-2 pr-3">Ghi mới / Thành công</th>
              <th className="py-2 pr-3">Ghi đè</th>
              <th className="py-2 pr-3">Bỏ qua</th>
              <th className="py-2 pr-3">Lỗi</th>
              <th className="py-2 pr-3">Ghi chú / Lỗi chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {(history?.rows ?? []).map((h) => (
              <tr key={h.id} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                <td className="py-2 pr-3 font-mono text-xs">{h.ten_file}</td>
                <td className="py-2 pr-3">{h.nguoi_import}</td>
                <td className="py-2 pr-3 text-xs">{h.thoi_gian}</td>
                <td className="py-2 pr-3 font-mono text-[var(--teal-500)]">{h.ghi_moi}</td>
                <td className="py-2 pr-3 font-mono text-[var(--ocean-600)]">{h.ghi_de}</td>
                <td className="py-2 pr-3 font-mono text-[var(--ink-400)]">{h.bo_qua}</td>
                <td className="py-2 pr-3 font-mono">{h.loi > 0 ? <span className="text-[var(--coral-500)] font-bold">{h.loi}</span> : h.loi}</td>
                {/* whitespace-pre-wrap + break-words: bg_error co the la nhieu dong loi gop lai
                    (xem logImportHistory()) - KHONG cat bot/truncate, hien nguyen van du dai bao
                    nhieu, xuong dong tu nhien thay vi tran ra ngoai bang. */}
                <td className="py-2 pr-3 max-w-md whitespace-pre-wrap break-words text-xs text-[var(--coral-500)]">{h.bg_error}</td>
              </tr>
            ))}
            {(history?.rows ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-[var(--ink-400)] text-sm">
                  Chưa có lịch sử import.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function ImportModule() {
  const [tab, setTab] = useState("crm");
  const [updateColumnField, setUpdateColumnField] = useState("");
  // Toast tu dong bien mat sau 3.2s, khong hop de doc het danh sach loi (co the toi hang tram
  // dong) - luong "Dong bo ngay" (goi thang /sync-sheet, khong qua man hinh preview co san khung
  // loi cuon nhu ImportUploader) truoc day chi hien DEM SO LUONG loi trong toast roi mat, khong ai
  // xem duoc NOI DUNG tung dong loi ghi gi ca du backend van tra du trong "errors". Luu lai ket qua
  // dong bo gan nhat co loi de hien 1 khung rieng, khong tu dong mat, xem duoc het.
  const [syncErrors, setSyncErrors] = useState<{ title: string; errors: string[] } | null>(null);
  const auth = useAuth();
  const isAdmin = auth.status === "authenticated" && auth.user.vai_tro === "Admin";
  const addToast = useToast();
  const qc = useQueryClient();

  const { data: sheetUrls } = useQuery({
    queryKey: ["settings-sheet-urls"],
    queryFn: () => api.get<{ rows: SheetUrlRow[] }>("/settings/sheet-urls"),
    enabled: isAdmin,
  });
  const hasSheetUrl = (loai: string) => !!sheetUrls?.rows.find((r) => r.loai_dong_bo === loai)?.url;

  const { data: columnMapData } = useQuery({
    queryKey: ["import-column-map-full"],
    queryFn: () => api.get<{ columnMap: Record<string, string>; updatableColumns: string[] }>("/import/column-map"),
    enabled: isAdmin,
  });
  // Danh sach {field, label} de chon cot can cap nhat - dao nguoc columnMap (gia tri DB -> nhan
  // tieng Viet) chi cho cac cot trong updatableColumns (BUSINESS_FIELDS, KHONG gom 6 cot vi pham).
  const updateColumnOptions = (columnMapData?.updatableColumns ?? [])
    .map((field) => ({
      field,
      label: Object.entries(columnMapData?.columnMap ?? {}).find(([, dbCol]) => dbCol === field)?.[0] ?? field,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "vi"));

  const syncSheetMutation = useMutation({
    mutationFn: () => api.post<CrmSummary>("/import/sync-sheet"),
    onSuccess: (res) => {
      addToast(`Đồng bộ xong: ${res.GHI_MOI} ca mới, ${res.GHI_DE} ghi đè, ${res.BO_QUA} không đổi${res.LOI ? `, ${res.LOI} lỗi` : ""}`);
      setSyncErrors(res.errors.length > 0 ? { title: "Đồng bộ CRM hàng ngày", errors: res.errors } : null);
      qc.invalidateQueries({ queryKey: ["import-history"] });
      // "backlog" khong khop query key thuc te (da tach "backlog-list"/"backlog-stats"/
      // "backlog-by-khu-vuc" - xem giai thich chi tiet o CaseDetail.tsx cung sua).
      qc.invalidateQueries({ queryKey: ["backlog-list"] });
      qc.invalidateQueries({ queryKey: ["backlog-stats"] });
      qc.invalidateQueries({ queryKey: ["backlog-by-khu-vuc"] });
      qc.invalidateQueries({ queryKey: ["backlog-counts"] });
      qc.invalidateQueries({ queryKey: ["dashboard-kpis"] });
    },
    onError: (err) => addToast(`Đồng bộ Google Sheet thất bại: ${describeError(err)}`),
  });

  const syncGiaiTrinhMutation = useMutation({
    mutationFn: () => api.post<BackfillSummary>("/import/giai-trinh/sync-sheet"),
    onSuccess: (res) => {
      addToast(`Đồng bộ xong: ${res.thanhCong} dòng giải trình${res.loi ? `, ${res.loi} lỗi` : ""}`);
      setSyncErrors(res.errors.length > 0 ? { title: "Đồng bộ giải trình cũ", errors: res.errors } : null);
      qc.invalidateQueries({ queryKey: ["import-history"] });
    },
    onError: (err) => addToast(`Đồng bộ Google Sheet thất bại: ${describeError(err)}`),
  });

  const syncGiaiTrinhLapMutation = useMutation({
    mutationFn: () => api.post<BackfillSummary>("/import/giai-trinh-lap/sync-sheet"),
    onSuccess: (res) => {
      addToast(`Đồng bộ xong: ${res.thanhCong} dòng giải trình lặp${res.loi ? `, ${res.loi} lỗi` : ""}`);
      setSyncErrors(res.errors.length > 0 ? { title: "Đồng bộ giải trình lặp cũ", errors: res.errors } : null);
      qc.invalidateQueries({ queryKey: ["import-history"] });
      qc.invalidateQueries({ queryKey: ["ca-lap-status"] });
      qc.invalidateQueries({ queryKey: ["ca-lap-tong-quan"] });
      qc.invalidateQueries({ queryKey: ["notifications-count"] });
    },
    onError: (err) => addToast(`Đồng bộ Google Sheet thất bại: ${describeError(err)}`),
  });

  const syncNapGasMutation = useMutation({
    mutationFn: () => api.post<BackfillSummary>("/import/nap-gas/sync-sheet"),
    onSuccess: (res) => {
      addToast(`Đồng bộ xong: ${res.thanhCong} dòng đánh giá nạp gas${res.loi ? `, ${res.loi} lỗi` : ""}`);
      setSyncErrors(res.errors.length > 0 ? { title: "Đồng bộ đánh giá nạp gas cũ", errors: res.errors } : null);
      qc.invalidateQueries({ queryKey: ["import-history"] });
      qc.invalidateQueries({ queryKey: ["nap-gas"] });
      qc.invalidateQueries({ queryKey: ["nap-gas-by-khu-vuc"] });
      qc.invalidateQueries({ queryKey: ["notifications-count"] });
    },
    onError: (err) => addToast(`Đồng bộ Google Sheet thất bại: ${describeError(err)}`),
  });

  const syncKhaoSatMutation = useMutation({
    mutationFn: () => api.post<BackfillSummary>("/import/khao-sat/sync-sheet"),
    onSuccess: (res) => {
      addToast(`Đồng bộ xong: ${res.thanhCong} lượt khảo sát${res.loi ? `, ${res.loi} lỗi` : ""}`);
      setSyncErrors(res.errors.length > 0 ? { title: "Đồng bộ khảo sát cũ", errors: res.errors } : null);
      qc.invalidateQueries({ queryKey: ["import-history"] });
      qc.invalidateQueries({ queryKey: ["survey"] });
      qc.invalidateQueries({ queryKey: ["survey-counts"] });
    },
    onError: (err) => addToast(`Đồng bộ Google Sheet thất bại: ${describeError(err)}`),
  });

  // Ep tinh lai cache bao cao dashboard NGAY, khong doi import moi - dung khi cache bi "dong cung"
  // sai (vd bi 1 chuoi warm cu hon de mat ket qua dung cua chuoi khac, xem comment o
  // scheduleCaLapRefreshIfChanged trong backend/src/routes/importRoute.ts). Chi Admin.
  const refreshReportsMutation = useMutation({
    mutationFn: () => api.post("/import/refresh-reports"),
    onSuccess: () => {
      addToast("Đã làm mới xong toàn bộ báo cáo dashboard.");
      qc.invalidateQueries({ queryKey: ["daily-report"] });
    },
    onError: (err) => addToast(`Làm mới báo cáo thất bại: ${describeError(err)}`),
  });

  return (
    <div className="anim-in">
      {isAdmin && (
        <Card className="p-4 mb-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="font-display font-bold text-sm">Làm mới báo cáo dashboard</div>
            <div className="text-xs text-[var(--ink-600)] mt-0.5">
              Ép tính lại toàn bộ số liệu dashboard (KPI, xu hướng SLA, doanh thu, ca lặp...) ngay lập tức — dùng khi thấy số liệu có vẻ "đứng im" sai dù dữ
              liệu thật đã đổi. Đồng thời tính lại luôn "Báo cáo ngày 08:00" (banner Tổng quát) thay vì đợi đến 08:00 sáng hôm sau. Không cần đợi import mới.
            </div>
          </div>
          <Btn variant="ghost" size="sm" onClick={() => refreshReportsMutation.mutate()} disabled={refreshReportsMutation.isPending}>
            {refreshReportsMutation.isPending ? "Đang làm mới…" : "🔄 Làm mới báo cáo"}
          </Btn>
        </Card>
      )}
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {syncErrors && (
        <Card className="p-4 mb-5 border-[var(--coral-300)]">
          <div className="flex items-center justify-between mb-2">
            <div className="font-display font-bold text-sm text-[var(--coral-600)]">
              {syncErrors.title} — {syncErrors.errors.length} lỗi
            </div>
            <Btn variant="ghost" size="sm" onClick={() => setSyncErrors(null)}>
              Đóng
            </Btn>
          </div>
          <div className="text-xs text-[var(--coral-500)] max-h-48 overflow-y-auto space-y-0.5">
            {syncErrors.errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        </Card>
      )}

      {tab === "crm" && (
        <>
          {isAdmin && (
            <Card className="p-4 mb-5 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-display font-bold text-sm">Đồng bộ ca mới từ Google Sheet</div>
                <div className="text-xs text-[var(--ink-600)] mt-0.5">
                  Tự động tải và ghi ca mới từ sheet nội bộ (link "publish to web"), dùng chung logic so khớp/ghi đè như import thủ công ở dưới. Chỉ Admin.
                </div>
              </div>
              <Btn variant="ghost" size="sm" onClick={() => syncSheetMutation.mutate()} disabled={syncSheetMutation.isPending}>
                {syncSheetMutation.isPending ? "Đang đồng bộ…" : "🔄 Đồng bộ ngay"}
              </Btn>
            </Card>
          )}
          <ImportUploader<CrmSummary>
            description={
              <>
                Hệ thống so khớp theo cột <b className="font-mono">ID</b>: ID mới → ghi mới · ID đã có &amp; không đổi (đã hoàn thành) → bỏ qua · ID đã có &amp; chưa hoàn
                thành → cập nhật "Ngày cập nhật gần nhất" · ID đã có &amp; có thay đổi → ghi đè.
              </>
            }
            templateUrl="/api/import/template"
            previewUrl="/import/preview"
            commitUrl="/import/commit"
            columnMapUrl="/import/column-map"
            buildBody={(rows, filename) => ({ filename, rows })}
            renderSummary={(s) => (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
                <StatCard label="Ghi mới" value={s.GHI_MOI} tone="teal" />
                <StatCard label="Ghi đè" value={s.GHI_DE} tone="ocean" />
                <StatCard label="Bỏ qua" value={s.BO_QUA} tone="gray" />
                <StatCard label="Lỗi định dạng" value={s.LOI} tone={s.LOI > 0 ? "coral" : "gray"} />
              </div>
            )}
            getErrors={(s) => s.errors}
            successMessage={(s) => `Import thành công: ${s.GHI_MOI} ca mới, ${s.GHI_DE} ghi đè`}
            invalidateKeys={[
              ["import-history"],
              ["backlog-list"],
              ["backlog-stats"],
              ["backlog-by-khu-vuc"],
              ["backlog-counts"],
              ["dashboard-kpis"],
            ]}
          />
          <ImportHistoryCard loai="crm,quicksight_auto" exportFileName="lich_su_import_crm.xlsx" />
        </>
      )}

      {tab === "giai-trinh" && (
        <>
          {isAdmin && hasSheetUrl("giai_trinh_cu") && (
            <Card className="p-4 mb-5 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-display font-bold text-sm">Đồng bộ giải trình cũ từ Google Sheet</div>
                <div className="text-xs text-[var(--ink-600)] mt-0.5">
                  Tự động tải và ghi các dòng giải trình cũ từ sheet đã cấu hình (Cài đặt → Link đồng bộ Google Sheet). Chỉ Admin.
                </div>
              </div>
              <Btn variant="ghost" size="sm" onClick={() => syncGiaiTrinhMutation.mutate()} disabled={syncGiaiTrinhMutation.isPending}>
                {syncGiaiTrinhMutation.isPending ? "Đang đồng bộ…" : "🔄 Đồng bộ ngay"}
              </Btn>
            </Card>
          )}
          <ImportUploader<BackfillSummary>
          description={
            <>
              Nhập lại nội dung giải trình cho các ca đã từng được xử lý trước khi hệ thống này ra đời. Mỗi dòng ghi 1 lượt giải trình vào ca đã có sẵn (theo{" "}
              <b className="font-mono">case_id</b>), không thay đổi trạng thái ca.
            </>
          }
          templateUrl="/api/import/giai-trinh/template"
          previewUrl="/import/giai-trinh/preview"
          commitUrl="/import/giai-trinh/commit"
          buildBody={(rows, filename) => ({ rows, filename })}
          renderSummary={(s) => (
            <div className="grid grid-cols-2 gap-3 mb-2">
              <StatCard label="Hợp lệ, sẵn sàng ghi" value={s.thanhCong} tone="teal" />
              <StatCard label="Lỗi định dạng" value={s.loi} tone={s.loi > 0 ? "coral" : "gray"} />
            </div>
          )}
          getErrors={(s) => s.errors}
          successMessage={(s) => `Import thành công: ${s.thanhCong} dòng giải trình`}
          invalidateKeys={[["import-history"]]}
          />
          <ImportHistoryCard loai="giai_trinh_cu" exportFileName="lich_su_import_giai_trinh_cu.xlsx" />
        </>
      )}

      {tab === "giai-trinh-lap" && (
        <>
          {isAdmin && hasSheetUrl("giai_trinh_lap_cu") && (
            <Card className="p-4 mb-5 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-display font-bold text-sm">Đồng bộ giải trình lặp cũ từ Google Sheet</div>
                <div className="text-xs text-[var(--ink-600)] mt-0.5">
                  Tự động tải và ghi các dòng chốt đánh giá lặp cũ từ sheet đã cấu hình (Cài đặt → Link đồng bộ Google Sheet). Chỉ Admin.
                </div>
              </div>
              <Btn variant="ghost" size="sm" onClick={() => syncGiaiTrinhLapMutation.mutate()} disabled={syncGiaiTrinhLapMutation.isPending}>
                {syncGiaiTrinhLapMutation.isPending ? "Đang đồng bộ…" : "🔄 Đồng bộ ngay"}
              </Btn>
            </Card>
          )}
          <ImportUploader<BackfillSummary>
            description={
              <>
                Nhập lại chốt đánh giá lặp (Giám sát/QC) cho các ca lặp đã từng xử lý trước khi tính năng Ca lặp ra đời. Mỗi dòng ghi vào 1 ca đã có sẵn (theo{" "}
                <b className="font-mono">case_id</b>) — cần ít nhất 1 trong 2 cột <b className="font-mono">chot_danh_gia_lap</b>/<b className="font-mono">qc_chot</b>, kèm đúng ngày
                tương ứng.
              </>
            }
            templateUrl="/api/import/giai-trinh-lap/template"
            previewUrl="/import/giai-trinh-lap/preview"
            commitUrl="/import/giai-trinh-lap/commit"
            buildBody={(rows, filename) => ({ rows, filename })}
            renderSummary={(s) => (
              <div className="grid grid-cols-2 gap-3 mb-2">
                <StatCard label="Hợp lệ, sẵn sàng ghi" value={s.thanhCong} tone="teal" />
                <StatCard label="Lỗi định dạng" value={s.loi} tone={s.loi > 0 ? "coral" : "gray"} />
              </div>
            )}
            getErrors={(s) => s.errors}
            successMessage={(s) => `Import thành công: ${s.thanhCong} dòng giải trình lặp`}
            invalidateKeys={[["import-history"], ["ca-lap-status"], ["ca-lap-tong-quan"], ["notifications-count"]]}
          />
          <ImportHistoryCard loai="giai_trinh_lap_cu" exportFileName="lich_su_import_giai_trinh_lap_cu.xlsx" />
        </>
      )}

      {tab === "khao-sat" && (
        <>
          {isAdmin && hasSheetUrl("khao_sat_cu") && (
            <Card className="p-4 mb-5 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-display font-bold text-sm">Đồng bộ khảo sát cũ từ Google Sheet</div>
                <div className="text-xs text-[var(--ink-600)] mt-0.5">
                  Tự động tải và ghi các lượt khảo sát/gọi điện cũ từ sheet đã cấu hình (Cài đặt → Link đồng bộ Google Sheet). Chỉ Admin.
                </div>
              </div>
              <Btn variant="ghost" size="sm" onClick={() => syncKhaoSatMutation.mutate()} disabled={syncKhaoSatMutation.isPending}>
                {syncKhaoSatMutation.isPending ? "Đang đồng bộ…" : "🔄 Đồng bộ ngay"}
              </Btn>
            </Card>
          )}
          <ImportUploader<BackfillSummary>
          description={
            <>
              Nhập lại kết quả khảo sát/gọi điện cũ. Mỗi dòng = 1 lượt gọi (theo <b className="font-mono">case_id</b>), có thể kèm kết quả vi phạm cấp 1/cấp 2 nếu đã có.
            </>
          }
          templateUrl="/api/import/khao-sat/template"
          previewUrl="/import/khao-sat/preview"
          commitUrl="/import/khao-sat/commit"
          buildBody={(rows, filename) => ({ rows, filename })}
          renderSummary={(s) => (
            <div className="grid grid-cols-2 gap-3 mb-2">
              <StatCard label="Hợp lệ, sẵn sàng ghi" value={s.thanhCong} tone="teal" />
              <StatCard label="Lỗi định dạng" value={s.loi} tone={s.loi > 0 ? "coral" : "gray"} />
            </div>
          )}
          getErrors={(s) => s.errors}
          successMessage={(s) => `Import thành công: ${s.thanhCong} lượt khảo sát`}
          invalidateKeys={[["import-history"], ["survey"], ["survey-counts"]]}
          />
          <ImportHistoryCard loai="khao_sat_cu" exportFileName="lich_su_import_khao_sat_cu.xlsx" />
        </>
      )}

      {tab === "nap-gas" && (
        <>
          {isAdmin && hasSheetUrl("nap_gas_danh_gia_cu") && (
            <Card className="p-4 mb-5 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-display font-bold text-sm">Đồng bộ đánh giá nạp gas cũ từ Google Sheet</div>
                <div className="text-xs text-[var(--ink-600)] mt-0.5">
                  Tự động tải và ghi các dòng đánh giá nạp gas cũ từ sheet đã cấu hình (Cài đặt → Link đồng bộ Google Sheet). Chỉ Admin.
                </div>
              </div>
              <Btn variant="ghost" size="sm" onClick={() => syncNapGasMutation.mutate()} disabled={syncNapGasMutation.isPending}>
                {syncNapGasMutation.isPending ? "Đang đồng bộ…" : "🔄 Đồng bộ ngay"}
              </Btn>
            </Card>
          )}
          <ImportUploader<BackfillSummary>
            description={
              <>
                Nhập lại chốt đánh giá nạp gas (Đánh giá nạp gas + Phí dịch vụ) cho các ca đã từng xử lý trước khi tính năng này ra đời. Mỗi dòng ghi vào 1 ca đã có sẵn (theo{" "}
                <b className="font-mono">case_id</b>) — cần đủ cả <b className="font-mono">danh_gia_nap_gas</b>, <b className="font-mono">phi_dich_vu</b>,{" "}
                <b className="font-mono">nguoi_chot</b> và <b className="font-mono">ngay_chot</b>.
              </>
            }
            templateUrl="/api/import/nap-gas/template"
            previewUrl="/import/nap-gas/preview"
            commitUrl="/import/nap-gas/commit"
            columnMapUrl="/import/nap-gas/column-map"
            buildBody={(rows, filename) => ({ rows, filename })}
            renderSummary={(s) => (
              <div className="grid grid-cols-2 gap-3 mb-2">
                <StatCard label="Hợp lệ, sẵn sàng ghi" value={s.thanhCong} tone="teal" />
                <StatCard label="Lỗi định dạng" value={s.loi} tone={s.loi > 0 ? "coral" : "gray"} />
              </div>
            )}
            getErrors={(s) => s.errors}
            successMessage={(s) => `Import thành công: ${s.thanhCong} dòng đánh giá nạp gas`}
            invalidateKeys={[["import-history"], ["nap-gas"], ["nap-gas-by-khu-vuc"], ["notifications-count"]]}
          />
          <ImportHistoryCard loai="nap_gas_danh_gia_cu" exportFileName="lich_su_import_nap_gas_cu.xlsx" />
        </>
      )}

      {tab === "huy-ca" && (
        <>
          <ImportUploader<BackfillSummary>
            description={
              <>
                Đánh dấu hàng loạt các ca "hủy bỏ" (không cần xử lý) theo danh sách <b className="font-mono">id</b> — mỗi dòng 1 ca, cột{" "}
                <b className="font-mono">ly_do</b> tùy chọn. Ca hủy sẽ ẩn khỏi mọi hàng đợi cần xử lý (giải trình, khảo sát, ca lặp, thiếu linh
                kiện, nạp gas) và không tính vào KPI — có thể bỏ hủy lại từng ca trong trang chi tiết ca.
              </>
            }
            templateUrl="/api/cases/huy-bulk/template"
            previewUrl="/cases/huy-bulk/preview"
            commitUrl="/cases/huy-bulk/commit"
            buildBody={(rows, filename) => ({ rows, filename })}
            renderSummary={(s) => (
              <div className="grid grid-cols-2 gap-3 mb-2">
                <StatCard label="Hợp lệ, sẽ hủy" value={s.thanhCong} tone="teal" />
                <StatCard label="Lỗi định dạng" value={s.loi} tone={s.loi > 0 ? "coral" : "gray"} />
              </div>
            )}
            getErrors={(s) => s.errors}
            successMessage={(s) => `Đã hủy ${s.thanhCong} ca`}
            invalidateKeys={[
              ["import-history"],
              ["notifications-count"],
              ["backlog-list"],
              ["backlog-stats"],
              ["backlog-counts"],
              ["backlog-by-khu-vuc"],
              ["survey-counts"],
              ["survey-bao-cao-khu-vuc"],
              ["ca-lap-list"],
              ["ca-lap-status"],
              ["ca-lap-tong-quan"],
              ["missing-parts"],
              ["nap-gas"],
            ]}
          />
          <ImportHistoryCard loai="huy_ca_bulk" exportFileName="lich_su_huy_ca.xlsx" />
        </>
      )}

      {tab === "update-column" && (
        <>
          <Card className="p-4 mb-5">
            <div className="font-display font-bold text-sm mb-1">Cập nhật riêng 1 cột theo ID</div>
            <div className="text-xs text-[var(--ink-600)] mb-3">
              Dùng khi cần bổ sung/sửa dữ liệu của <b>đúng 1 cột</b> cho các ca đã có sẵn (ví dụ thiếu Link hình ảnh), mà không muốn đụng tới các cột khác của
              ca. File chỉ cần 2 cột: <b className="font-mono">ID</b> và cột đã chọn bên dưới. ID không tồn tại trong hệ thống sẽ bị bỏ qua và báo lỗi, không
              chặn các dòng còn lại. Lưu ý: nếu lần đồng bộ CRM thật tiếp theo vẫn mang dữ liệu khác cho đúng cột này, giá trị vừa cập nhật tay có thể bị ghi
              đè lại — không có cách nào tránh hoàn toàn vì so khớp import luôn dựa vào dữ liệu CRM gốc.
            </div>
            <label className="block text-xs font-semibold text-[var(--ink-600)] mb-1">Chọn cột cần cập nhật</label>
            <Select
              className="max-w-sm"
              value={updateColumnField}
              onChange={setUpdateColumnField}
              options={[{ value: "", label: "— Chọn cột —" }, ...updateColumnOptions.map((o) => ({ value: o.field, label: o.label }))]}
            />
          </Card>

          {updateColumnField && (
            <ImportUploader<UpdateColumnSummary>
              key={updateColumnField}
              description={
                <>
                  Cập nhật cột <b>{updateColumnOptions.find((o) => o.field === updateColumnField)?.label}</b> theo <b className="font-mono">ID</b> — các cột
                  khác của ca giữ nguyên không đổi.
                </>
              }
              templateUrl={`/api/import/update-column/template?column=${updateColumnField}`}
              previewUrl="/import/update-column/preview"
              commitUrl="/import/update-column/commit"
              columnMap={{
                ID: "id",
                [updateColumnOptions.find((o) => o.field === updateColumnField)?.label ?? updateColumnField]: updateColumnField,
              }}
              requireAllColumns
              buildBody={(rows, filename) => ({ column: updateColumnField, rows, filename })}
              renderSummary={(s) => (
                <div className="grid grid-cols-3 gap-3 mb-2">
                  <StatCard label="Sẽ cập nhật" value={s.capNhat} tone="teal" />
                  <StatCard label="ID không tồn tại" value={s.khongTonTai} tone={s.khongTonTai > 0 ? "coral" : "gray"} />
                  <StatCard label="Thiếu ID" value={s.thieuId} tone={s.thieuId > 0 ? "coral" : "gray"} />
                </div>
              )}
              getErrors={(s) => s.khongTonTaiList.map((id) => `ID không tồn tại trong hệ thống: ${id}`)}
              successMessage={(s) => `Đã cập nhật ${s.capNhat} ca${s.khongTonTai ? `, ${s.khongTonTai} ID không tồn tại (bỏ qua)` : ""}`}
              invalidateKeys={[["import-history"]]}
            />
          )}
          <ImportHistoryCard loai="update_column" exportFileName="lich_su_cap_nhat_cot.xlsx" />
        </>
      )}
    </div>
  );
}
