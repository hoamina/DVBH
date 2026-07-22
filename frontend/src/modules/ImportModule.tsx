import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { StatCard } from "../components/ui/StatCard";
import { Tabs } from "../components/ui/Tabs";
import { api } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { exportRowsToExcel } from "../lib/exportExcel";
import { ImportUploader } from "../components/ImportUploader";

interface CrmSummary {
  GHI_MOI: number;
  BO_QUA: number;
  CAP_NHAT_MOC_THOI_GIAN: number;
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
}

interface SheetUrlRow {
  loai_dong_bo: string;
  url: string | null;
  updated_at: string;
  updated_by: string | null;
}

const TABS = [
  { key: "crm", label: "Import CRM hàng ngày" },
  { key: "giai-trinh", label: "Import giải trình cũ" },
  { key: "giai-trinh-lap", label: "Import giải trình lặp cũ" },
  { key: "khao-sat", label: "Import khảo sát cũ" },
];

export function ImportModule() {
  const [tab, setTab] = useState("crm");
  const auth = useAuth();
  const isAdmin = auth.status === "authenticated" && auth.user.vai_tro === "Admin";
  const addToast = useToast();
  const qc = useQueryClient();
  const { data: history } = useQuery({
    queryKey: ["import-history"],
    queryFn: () => api.get<{ rows: ImportHistoryRow[] }>("/import/history"),
  });

  const { data: sheetUrls } = useQuery({
    queryKey: ["settings-sheet-urls"],
    queryFn: () => api.get<{ rows: SheetUrlRow[] }>("/settings/sheet-urls"),
    enabled: isAdmin,
  });
  const hasSheetUrl = (loai: string) => !!sheetUrls?.rows.find((r) => r.loai_dong_bo === loai)?.url;

  const syncSheetMutation = useMutation({
    mutationFn: () => api.post<CrmSummary>("/import/sync-sheet"),
    onSuccess: (res) => {
      addToast(`Đồng bộ xong: ${res.GHI_MOI} ca mới, ${res.GHI_DE} ghi đè, ${res.BO_QUA} không đổi${res.LOI ? `, ${res.LOI} lỗi` : ""}`);
      qc.invalidateQueries({ queryKey: ["import-history"] });
      qc.invalidateQueries({ queryKey: ["backlog"] });
      qc.invalidateQueries({ queryKey: ["backlog-counts"] });
      qc.invalidateQueries({ queryKey: ["dashboard-kpis"] });
    },
    onError: () => addToast("Đồng bộ Google Sheet thất bại, thử lại sau."),
  });

  const syncGiaiTrinhMutation = useMutation({
    mutationFn: () => api.post<BackfillSummary>("/import/giai-trinh/sync-sheet"),
    onSuccess: (res) => {
      addToast(`Đồng bộ xong: ${res.thanhCong} dòng giải trình${res.loi ? `, ${res.loi} lỗi` : ""}`);
      qc.invalidateQueries({ queryKey: ["import-history"] });
    },
    onError: () => addToast("Đồng bộ Google Sheet thất bại, thử lại sau."),
  });

  const syncGiaiTrinhLapMutation = useMutation({
    mutationFn: () => api.post<BackfillSummary>("/import/giai-trinh-lap/sync-sheet"),
    onSuccess: (res) => {
      addToast(`Đồng bộ xong: ${res.thanhCong} dòng giải trình lặp${res.loi ? `, ${res.loi} lỗi` : ""}`);
      qc.invalidateQueries({ queryKey: ["import-history"] });
      qc.invalidateQueries({ queryKey: ["ca-lap-danh-sach"] });
      qc.invalidateQueries({ queryKey: ["ca-lap-tong-quan"] });
      qc.invalidateQueries({ queryKey: ["notifications-count"] });
    },
    onError: () => addToast("Đồng bộ Google Sheet thất bại, thử lại sau."),
  });

  const syncKhaoSatMutation = useMutation({
    mutationFn: () => api.post<BackfillSummary>("/import/khao-sat/sync-sheet"),
    onSuccess: (res) => {
      addToast(`Đồng bộ xong: ${res.thanhCong} lượt khảo sát${res.loi ? `, ${res.loi} lỗi` : ""}`);
      qc.invalidateQueries({ queryKey: ["import-history"] });
      qc.invalidateQueries({ queryKey: ["survey"] });
      qc.invalidateQueries({ queryKey: ["survey-counts"] });
    },
    onError: () => addToast("Đồng bộ Google Sheet thất bại, thử lại sau."),
  });

  return (
    <div className="anim-in">
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

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
            invalidateKeys={[["import-history"], ["backlog"], ["backlog-counts"], ["dashboard-kpis"]]}
          />
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
          buildBody={(rows) => ({ rows })}
          renderSummary={(s) => (
            <div className="grid grid-cols-2 gap-3 mb-2">
              <StatCard label="Hợp lệ, sẵn sàng ghi" value={s.thanhCong} tone="teal" />
              <StatCard label="Lỗi định dạng" value={s.loi} tone={s.loi > 0 ? "coral" : "gray"} />
            </div>
          )}
          getErrors={(s) => s.errors}
          successMessage={(s) => `Import thành công: ${s.thanhCong} dòng giải trình`}
          invalidateKeys={[]}
          />
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
            buildBody={(rows) => ({ rows })}
            renderSummary={(s) => (
              <div className="grid grid-cols-2 gap-3 mb-2">
                <StatCard label="Hợp lệ, sẵn sàng ghi" value={s.thanhCong} tone="teal" />
                <StatCard label="Lỗi định dạng" value={s.loi} tone={s.loi > 0 ? "coral" : "gray"} />
              </div>
            )}
            getErrors={(s) => s.errors}
            successMessage={(s) => `Import thành công: ${s.thanhCong} dòng giải trình lặp`}
            invalidateKeys={[["ca-lap-danh-sach"], ["ca-lap-tong-quan"], ["notifications-count"]]}
          />
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
          buildBody={(rows) => ({ rows })}
          renderSummary={(s) => (
            <div className="grid grid-cols-2 gap-3 mb-2">
              <StatCard label="Hợp lệ, sẵn sàng ghi" value={s.thanhCong} tone="teal" />
              <StatCard label="Lỗi định dạng" value={s.loi} tone={s.loi > 0 ? "coral" : "gray"} />
            </div>
          )}
          getErrors={(s) => s.errors}
          successMessage={(s) => `Import thành công: ${s.thanhCong} lượt khảo sát`}
          invalidateKeys={[["survey"], ["survey-counts"]]}
          />
        </>
      )}

      {tab === "crm" && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-display font-bold text-sm">Lịch sử import</div>
            <Btn
              variant="ghost"
              size="sm"
              onClick={async () => {
                const res = await api.get<{ rows: ImportHistoryRow[] }>("/import/history?export=true");
                await exportRowsToExcel(res.rows, "lich_su_import.xlsx");
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
                  <th className="py-2 pr-3">Ghi mới</th>
                  <th className="py-2 pr-3">Ghi đè</th>
                  <th className="py-2 pr-3">Bỏ qua</th>
                  <th className="py-2 pr-3">Lỗi</th>
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
                  </tr>
                ))}
                {(history?.rows ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-[var(--ink-400)] text-sm">
                      Chưa có lịch sử import.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
