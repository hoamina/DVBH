import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "../components/ui/Tabs";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { Modal } from "../components/ui/Modal";
import { ToggleSwitch } from "../components/ui/ToggleSwitch";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { api } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { fmtVND, type LinhKienRow, type LyDoRow } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { fetchWithHashCache } from "../lib/staticListCache";

const PAGE_SIZE = 20;

interface SheetUrlRow {
  loai_dong_bo: string;
  url: string | null;
  updated_at: string;
  updated_by: string | null;
}

const LOAI_DONG_BO_LABELS: Record<string, string> = {
  case: "Ca mới (import CRM hàng ngày)",
  linh_kien: "Bảng giá linh kiện",
  giai_trinh_cu: "Giải trình cũ",
  giai_trinh_lap_cu: "Giải trình lặp cũ",
  khao_sat_cu: "Khảo sát cũ",
};

export function SettingsModule() {
  const [tab, setTab] = useState("ly-do");
  const addToast = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newReason, setNewReason] = useState({ ten: "", thieu: false });
  const [addLinhKienOpen, setAddLinhKienOpen] = useState(false);
  const [newLinhKien, setNewLinhKien] = useState({ ma: "", ten: "", gia: "" });
  const [editingUrls, setEditingUrls] = useState<Record<string, string>>({});
  const [lyDoPage, setLyDoPage] = useState(1);
  const [linhKienPage, setLinhKienPage] = useState(1);

  const { data: reasons } = useQuery({
    queryKey: ["settings-ly-do"],
    queryFn: () => fetchWithHashCache<{ rows: LyDoRow[] }>("settings-ly-do", "/settings/ly-do/version", "/settings/ly-do"),
  });
  const { data: parts } = useQuery({
    queryKey: ["settings-linh-kien"],
    queryFn: () => fetchWithHashCache<{ rows: LinhKienRow[] }>("settings-linh-kien", "/settings/linh-kien/version", "/settings/linh-kien"),
  });
  const { data: sheetUrls } = useQuery({
    queryKey: ["settings-sheet-urls"],
    queryFn: () => api.get<{ rows: SheetUrlRow[] }>("/settings/sheet-urls"),
  });

  const toggleReason = useMutation({
    mutationFn: ({ id, field, value }: { id: number; field: "bat_tat" | "thuoc_thieu_linh_kien"; value: boolean }) => api.patch(`/settings/ly-do/${id}`, { [field]: value }),
    onSuccess: () => {
      addToast("Đã cập nhật cài đặt lý do chậm");
      qc.invalidateQueries({ queryKey: ["settings-ly-do"] });
    },
  });

  const addReasonMutation = useMutation({
    mutationFn: () => api.post("/settings/ly-do", { ten_ly_do: newReason.ten, thuoc_thieu_linh_kien: newReason.thieu }),
    onSuccess: () => {
      addToast("Đã thêm lý do chậm mới");
      setNewReason({ ten: "", thieu: false });
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["settings-ly-do"] });
    },
  });

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

  const saveUrlMutation = useMutation({
    mutationFn: ({ loai, url }: { loai: string; url: string }) => api.patch(`/settings/sheet-urls/${loai}`, { url: url || null }),
    onSuccess: () => {
      addToast("Đã lưu link đồng bộ");
      qc.invalidateQueries({ queryKey: ["settings-sheet-urls"] });
    },
    onError: () => addToast("Không lưu được link, thử lại sau."),
  });

  const addLinhKienMutation = useMutation({
    mutationFn: () =>
      api.post("/settings/linh-kien", {
        ma_linh_kien: newLinhKien.ma,
        ten_linh_kien: newLinhKien.ten,
        gia_ban: newLinhKien.gia ? Number(newLinhKien.gia) : undefined,
      }),
    onSuccess: () => {
      addToast("Đã thêm linh kiện mới");
      setNewLinhKien({ ma: "", ten: "", gia: "" });
      setAddLinhKienOpen(false);
      qc.invalidateQueries({ queryKey: ["settings-linh-kien"] });
    },
    onError: () => addToast("Không thể thêm linh kiện (mã có thể đã tồn tại)."),
  });

  const lyDoColumns: Column<LyDoRow>[] = [
    { key: "ten_ly_do", header: "Tên lý do", render: (r) => <span className="font-medium">{r.ten_ly_do}</span> },
    { key: "bat_tat", header: "Bật / Tắt", render: (r) => <ToggleSwitch checked={!!r.bat_tat} onChange={() => toggleReason.mutate({ id: r.id, field: "bat_tat", value: !r.bat_tat })} /> },
    {
      key: "thuoc_thieu_linh_kien",
      header: "Thuộc thiếu linh kiện",
      render: (r) => <ToggleSwitch checked={!!r.thuoc_thieu_linh_kien} onChange={() => toggleReason.mutate({ id: r.id, field: "thuoc_thieu_linh_kien", value: !r.thuoc_thieu_linh_kien })} />,
    },
  ];

  const linhKienColumns: Column<LinhKienRow>[] = [
    { key: "ma_linh_kien", header: "Mã", render: (p) => <span className="font-mono text-xs">{p.ma_linh_kien}</span> },
    { key: "ten_linh_kien", header: "Tên linh kiện", render: (p) => <span className="font-medium">{p.ten_linh_kien}</span> },
    { key: "gia_ban", header: "Giá bán", render: (p) => <span className="font-mono">{fmtVND(p.gia_ban)}</span> },
    { key: "nguoi_cap_nhat", header: "Người cập nhật", render: (p) => p.nguoi_cap_nhat },
    { key: "ngay_cap_nhat", header: "Ngày cập nhật", render: (p) => <span className="text-xs">{p.ngay_cap_nhat}</span> },
    { key: "bat_tat", header: "Hiển thị", render: (p) => <ToggleSwitch checked={!!p.bat_tat} onChange={() => togglePart.mutate({ ma: p.ma_linh_kien, bat_tat: !p.bat_tat })} /> },
  ];

  return (
    <div className="anim-in">
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "ly-do", label: "Lý do chậm" },
          { key: "linh-kien", label: "Danh mục linh kiện" },
          { key: "sheet-urls", label: "Link đồng bộ Google Sheet" },
        ]}
      />
      {tab === "ly-do" && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-[var(--ink-600)]">
              Cấu hình danh sách lý do chậm dùng khi giải trình ca tồn. Đánh dấu "Thuộc thiếu linh kiện" để đẩy ca vào module <b>Ca thiếu linh kiện</b>.
            </div>
            <div className="flex gap-2 shrink-0">
              <Btn variant="ghost" size="sm" onClick={() => exportRowsToExcel(reasons?.rows ?? [], "ly_do_cham.xlsx")}>
                ⬇ Xuất Excel
              </Btn>
              <Btn size="sm" onClick={() => setAddOpen(true)}>
                + Thêm lý do
              </Btn>
            </div>
          </div>
          <PaginatedTable
            columns={lyDoColumns}
            rows={(reasons?.rows ?? []).slice((lyDoPage - 1) * PAGE_SIZE, lyDoPage * PAGE_SIZE)}
            isLoading={false}
            isError={false}
            page={lyDoPage}
            pageSize={PAGE_SIZE}
            total={(reasons?.rows ?? []).length}
            onPageChange={setLyDoPage}
            rowKey={(r) => r.id}
            emptyText="Chưa có lý do chậm nào."
          />
        </div>
      )}
      {tab === "linh-kien" && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-[var(--ink-600)]">Danh mục linh kiện dùng khi giải trình ca "thiếu linh kiện".</div>
            <div className="flex gap-2 shrink-0">
              <Btn variant="ghost" size="sm" onClick={() => exportRowsToExcel(parts?.rows ?? [], "danh_muc_linh_kien.xlsx")}>
                ⬇ Xuất Excel
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => syncSheetMutation.mutate()} disabled={syncSheetMutation.isPending}>
                {syncSheetMutation.isPending ? "Đang đồng bộ…" : "🔄 Đồng bộ từ Google Sheet"}
              </Btn>
              <Btn size="sm" onClick={() => setAddLinhKienOpen(true)}>
                + Thêm linh kiện
              </Btn>
            </div>
          </div>
          <PaginatedTable
            columns={linhKienColumns}
            rows={(parts?.rows ?? []).slice((linhKienPage - 1) * PAGE_SIZE, linhKienPage * PAGE_SIZE)}
            isLoading={false}
            isError={false}
            page={linhKienPage}
            pageSize={PAGE_SIZE}
            total={(parts?.rows ?? []).length}
            onPageChange={setLinhKienPage}
            rowKey={(p) => p.ma_linh_kien}
            emptyText="Chưa có linh kiện nào."
          />
        </div>
      )}

      {tab === "sheet-urls" && (
        <Card className="p-4">
          <div className="text-sm text-[var(--ink-600)] mb-4">
            Cấu hình link Google Sheet (dạng "Xuất bản lên web" → TSV) dùng để đồng bộ tự động cho từng loại dữ liệu. Để trống nếu chưa cần dùng loại đồng bộ đó — nút "Đồng bộ" tương ứng
            sẽ ẩn cho tới khi có link.
          </div>
          <div className="space-y-3">
            {(sheetUrls?.rows ?? []).map((row) => {
              const currentValue = editingUrls[row.loai_dong_bo] ?? row.url ?? "";
              return (
                <div key={row.loai_dong_bo} className="border border-[var(--line)] rounded-xl p-3">
                  <div className="font-semibold text-sm mb-1.5">{LOAI_DONG_BO_LABELS[row.loai_dong_bo] ?? row.loai_dong_bo}</div>
                  <div className="flex gap-2">
                    <input
                      value={currentValue}
                      onChange={(e) => setEditingUrls({ ...editingUrls, [row.loai_dong_bo]: e.target.value })}
                      placeholder="https://docs.google.com/spreadsheets/.../pub?...&output=tsv"
                      className="focus-ring flex-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-xs font-mono"
                    />
                    <Btn size="sm" onClick={() => saveUrlMutation.mutate({ loai: row.loai_dong_bo, url: currentValue.trim() })} disabled={saveUrlMutation.isPending}>
                      Lưu
                    </Btn>
                  </div>
                  {row.url && (
                    <div className="text-xs text-[var(--ink-400)] mt-1.5">
                      Cập nhật lần cuối: {row.updated_at}
                      {row.updated_by ? ` bởi ${row.updated_by}` : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Thêm lý do chậm mới">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Tên lý do</label>
            <input value={newReason.ten} onChange={(e) => setNewReason({ ...newReason, ten: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={newReason.thieu} onChange={(e) => setNewReason({ ...newReason, thieu: e.target.checked })} /> Thuộc nhóm thiếu linh kiện
          </label>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setAddOpen(false)}>
              Hủy
            </Btn>
            <Btn onClick={() => addReasonMutation.mutate()} disabled={!newReason.ten.trim() || addReasonMutation.isPending}>
              Thêm
            </Btn>
          </div>
        </div>
      </Modal>

      <Modal open={addLinhKienOpen} onClose={() => setAddLinhKienOpen(false)} title="Thêm linh kiện mới">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Mã linh kiện</label>
            <input value={newLinhKien.ma} onChange={(e) => setNewLinhKien({ ...newLinhKien, ma: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Tên linh kiện</label>
            <input value={newLinhKien.ten} onChange={(e) => setNewLinhKien({ ...newLinhKien, ten: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Giá bán</label>
            <input type="number" value={newLinhKien.gia} onChange={(e) => setNewLinhKien({ ...newLinhKien, gia: e.target.value })} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setAddLinhKienOpen(false)}>
              Hủy
            </Btn>
            <Btn onClick={() => addLinhKienMutation.mutate()} disabled={!newLinhKien.ma.trim() || !newLinhKien.ten.trim() || addLinhKienMutation.isPending}>
              Thêm
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
