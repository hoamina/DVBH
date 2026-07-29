import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "./ui/Btn";
import { Badge } from "./ui/Badge";
import { Select } from "./ui/Select";
import { Modal } from "./ui/Modal";
import { api } from "../api/client";
import { fmtDateTime } from "../types";
import { useToast } from "./ui/Toast";
import type { AppUser } from "../auth/AuthContext";
import {
  TRANG_THAI_LABELS,
  TRANG_THAI_TONE,
  TRANG_THAI_LOG_OPTIONS,
  TRANG_THAI_DONG,
  TRANG_THAI_CAN_KET_QUA,
  MUC_DO_OPTIONS,
  MUC_DO_TONE,
  MUC_DO_LABELS,
  HAI_LONG_OPTIONS,
  canWriteTranhChap,
  canEditTienTrinhMeta,
  describeTranhChapError,
  type ChoXuLyCase,
  type TranhChapLogRow,
  type TienTrinhDetail,
  type PhanLoaiTranhChapRow,
  type KetQuaXuLyTranhChapRow,
} from "../lib/tranhChapShared";

/**
 * Modal "Tiep nhan xu ly tranh chap" - dung chung boi TranhChapModule.tsx (tab "Cho xu ly") va
 * CaseDetail.tsx (tab "Tranh chap, khieu nai" khi ca chua co tien trinh nao).
 */
export function TiepNhanModal({
  caseRow,
  phanLoaiOptions,
  onClose,
  onSubmit,
  isPending,
}: {
  caseRow: ChoXuLyCase;
  phanLoaiOptions: PhanLoaiTranhChapRow[];
  onClose: () => void;
  onSubmit: (body: { phan_loai_tranh_chap: string; muc_do: string; ghi_chu?: string; thoi_gian_du_kien_xong?: string }) => void;
  isPending: boolean;
}) {
  const [phanLoai, setPhanLoai] = useState(phanLoaiOptions[0]?.ten_phan_loai ?? "");
  const [mucDo, setMucDo] = useState("Binh thuong");
  const [ngayDuKien, setNgayDuKien] = useState("");
  const [ghiChu, setGhiChu] = useState("");

  return (
    <Modal open onClose={onClose} title={`Tiếp nhận xử lý tranh chấp — ${caseRow.id}`}>
      <div className="space-y-3">
        <div className="text-sm text-[var(--ink-600)]">
          {caseRow.khach_hang ?? "—"} · {caseRow.khu_vuc ?? "—"}
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Phân loại tranh chấp</label>
          {phanLoaiOptions.length ? (
            <Select value={phanLoai} onChange={setPhanLoai} options={phanLoaiOptions.map((p) => p.ten_phan_loai)} className="w-full mt-1" />
          ) : (
            <div className="text-xs text-[var(--coral-500)] mt-1">Chưa có phân loại nào — vào Settings → Phân loại tranh chấp để thêm trước.</div>
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Mức độ</label>
          <Select value={mucDo} onChange={setMucDo} options={MUC_DO_OPTIONS} className="w-full mt-1" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Ngày dự kiến xử lý xong</label>
          <input type="date" value={ngayDuKien} onChange={(e) => setNgayDuKien(e.target.value)} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Ghi chú</label>
          <textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} rows={2} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>
            Hủy
          </Btn>
          <Btn
            onClick={() => onSubmit({ phan_loai_tranh_chap: phanLoai, muc_do: mucDo, ghi_chu: ghiChu.trim() || undefined, thoi_gian_du_kien_xong: ngayDuKien || undefined })}
            disabled={!phanLoai || !mucDo || isPending}
          >
            Tiếp nhận
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Noi dung 1 tien trinh tranh chap: thong tin/sua phan loai+muc do, timeline log, form them/sua
 * log - dung chung boi TranhChapModule.tsx (boc trong Modal) va CaseDetail.tsx (nhung inline
 * ngay trong tab, khong can Modal rieng vi da o trong the chi tiet ca roi). "onOpenCase" bo qua
 * (undefined) khi da o trong dung ngu canh ca do san (CaseDetail) - an nut "Xem ca su vu".
 */
export function TienTrinhPanel({
  id,
  currentUser,
  phanLoaiOptions,
  ketQuaOptions,
  onOpenCase,
}: {
  id: string;
  currentUser: AppUser | null;
  phanLoaiOptions: PhanLoaiTranhChapRow[];
  ketQuaOptions: KetQuaXuLyTranhChapRow[];
  onOpenCase?: (id: string) => void;
}) {
  const addToast = useToast();
  const qc = useQueryClient();
  const [newTrangThai, setNewTrangThai] = useState("");
  const [newNgayDuKien, setNewNgayDuKien] = useState("");
  const [newGhiChu, setNewGhiChu] = useState("");
  const [newKetQua, setNewKetQua] = useState("");
  const [newHaiLong, setNewHaiLong] = useState("");
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [editPhanLoai, setEditPhanLoai] = useState("");
  const [editMucDo, setEditMucDo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["tranh-chap-tien-trinh-detail", id],
    queryFn: () => api.get<TienTrinhDetail>(`/tranh-chap/tien-trinh/${encodeURIComponent(id)}`),
  });

  function invalidateAfterWrite() {
    qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh-detail", id] });
    qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh"] });
    qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh-stats"] });
    qc.invalidateQueries({ queryKey: ["notifications-count"] });
    qc.invalidateQueries({ queryKey: ["case", data?.tienTrinh.case_id] });
  }

  const addLog = useMutation({
    mutationFn: (body: {
      trang_thai_xu_ly: string;
      thoi_gian_du_kien_xong?: string;
      ghi_chu?: string;
      ket_qua_xu_ly?: string;
      hai_long_sau_tranh_chap?: string;
    }) => api.post(`/tranh-chap/tien-trinh/${encodeURIComponent(id)}/log`, body),
    onSuccess: () => {
      addToast("Đã thêm log xử lý");
      setNewTrangThai("");
      setNewNgayDuKien("");
      setNewGhiChu("");
      setNewKetQua("");
      setNewHaiLong("");
      invalidateAfterWrite();
    },
    onError: (err) => addToast(describeTranhChapError(err, "Không thể thêm log, thử lại sau.")),
  });

  const editLog = useMutation({
    mutationFn: ({
      logId,
      body,
    }: {
      logId: number;
      body: { trang_thai_xu_ly?: string; thoi_gian_du_kien_xong?: string; ghi_chu?: string; ket_qua_xu_ly?: string; hai_long_sau_tranh_chap?: string };
    }) => api.patch(`/tranh-chap/log/${logId}`, body),
    onSuccess: () => {
      addToast("Đã cập nhật log");
      setEditingLogId(null);
      invalidateAfterWrite();
    },
    onError: (err) => addToast(describeTranhChapError(err, "Không thể sửa log, thử lại sau.")),
  });

  const editMeta = useMutation({
    mutationFn: (body: { phan_loai_tranh_chap?: string; muc_do?: string }) => api.patch(`/tranh-chap/tien-trinh/${encodeURIComponent(id)}`, body),
    onSuccess: () => {
      addToast("Đã cập nhật phân loại/mức độ");
      setEditingMeta(false);
      invalidateAfterWrite();
    },
    onError: (err) => addToast(describeTranhChapError(err, "Không thể cập nhật, thử lại sau.")),
  });

  const tt = data?.tienTrinh;
  const logs = data?.logs ?? [];
  const latestLog = logs[0];
  const isDaDong = latestLog ? TRANG_THAI_DONG.includes(latestLog.trang_thai_xu_ly) : false;
  const canWrite = currentUser ? canWriteTranhChap(currentUser, tt?.khu_vuc ?? null) : false;
  const canEditMeta = currentUser ? canEditTienTrinhMeta(currentUser) && !isDaDong : false;

  function startEditMeta() {
    if (!tt) return;
    setEditPhanLoai(tt.phan_loai_tranh_chap);
    setEditMucDo(tt.muc_do);
    setEditingMeta(true);
  }

  if (isLoading || !tt) {
    return <div className="text-sm text-[var(--ink-400)] py-6 text-center">Đang tải…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="border border-[var(--line)] rounded-xl p-3 flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm flex-1 min-w-[200px]">
          <div className="font-semibold">
            Tiến trình <span className="font-mono">{tt.id}</span>
            {" · "}
            {tt.khach_hang ?? "—"}
          </div>
          {editingMeta ? (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Select value={editPhanLoai} onChange={setEditPhanLoai} options={phanLoaiOptions.map((p) => p.ten_phan_loai)} />
              <Select value={editMucDo} onChange={setEditMucDo} options={MUC_DO_OPTIONS} />
              <Btn size="sm" variant="ghost" onClick={() => setEditingMeta(false)}>
                Hủy
              </Btn>
              <Btn size="sm" onClick={() => editMeta.mutate({ phan_loai_tranh_chap: editPhanLoai, muc_do: editMucDo })} disabled={editMeta.isPending}>
                Lưu
              </Btn>
            </div>
          ) : (
            <div className="text-xs text-[var(--ink-400)] mt-0.5 flex items-center gap-1.5 flex-wrap">
              {tt.khu_vuc ?? "—"} · <Badge tone="gray">{tt.phan_loai_tranh_chap}</Badge>
              <Badge tone={MUC_DO_TONE[tt.muc_do] ?? "gray"}>{MUC_DO_LABELS[tt.muc_do] ?? tt.muc_do}</Badge>
              {canEditMeta && (
                <button className="text-[var(--ocean-600)] underline" onClick={startEditMeta}>
                  Sửa
                </button>
              )}
            </div>
          )}
        </div>
        {onOpenCase && (
          <Btn variant="ghost" size="sm" onClick={() => onOpenCase(tt.case_id)}>
            Xem ca sự vụ ({tt.case_id}) →
          </Btn>
        )}
      </div>

      <div>
        <div className="text-xs font-semibold text-[var(--ink-400)] uppercase mb-2">Lịch sử xử lý</div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {logs.map((log, idx) => {
            const isLatest = idx === 0;
            const isAuthor = currentUser?.email === log.nguoi_xu_ly;
            const hoursSince = (Date.now() - new Date(log.created_at.replace(" ", "T") + "Z").getTime()) / 3600000 - 7;
            const canEdit = isLatest && isAuthor && hoursSince < 24;
            const isEditing = editingLogId === log.id;
            return (
              <div key={log.id} className="border border-[var(--line)] rounded-lg p-2.5 text-sm">
                {isEditing ? (
                  <EditLogForm
                    log={log}
                    ketQuaOptions={ketQuaOptions}
                    onCancel={() => setEditingLogId(null)}
                    onSave={(body) => editLog.mutate({ logId: log.id, body })}
                    isPending={editLog.isPending}
                  />
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Badge tone={TRANG_THAI_TONE[log.trang_thai_xu_ly] ?? "gray"}>{TRANG_THAI_LABELS[log.trang_thai_xu_ly] ?? log.trang_thai_xu_ly}</Badge>
                      {canEdit && (
                        <button className="text-xs text-[var(--ocean-600)] underline" onClick={() => setEditingLogId(log.id)}>
                          Sửa (còn {Math.max(0, Math.ceil(24 - hoursSince))}h)
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-[var(--ink-400)] mt-1">
                      {log.nguoi_xu_ly} · {fmtDateTime(log.ngay_xu_ly)}
                      {log.thoi_gian_du_kien_xong ? ` · Dự kiến xong: ${log.thoi_gian_du_kien_xong}` : ""}
                    </div>
                    {(log.ket_qua_xu_ly || log.hai_long_sau_tranh_chap) && (
                      <div className="text-xs mt-1 flex gap-1.5 flex-wrap">
                        {log.ket_qua_xu_ly && <Badge tone="ocean">{log.ket_qua_xu_ly}</Badge>}
                        {log.hai_long_sau_tranh_chap && (
                          <Badge tone="teal">{HAI_LONG_OPTIONS.find((h) => h.value === log.hai_long_sau_tranh_chap)?.label ?? log.hai_long_sau_tranh_chap}</Badge>
                        )}
                      </div>
                    )}
                    {log.ghi_chu && <div className="text-xs mt-1 whitespace-pre-wrap">{log.ghi_chu}</div>}
                  </>
                )}
              </div>
            );
          })}
          {logs.length === 0 && <div className="text-xs text-[var(--ink-400)] italic">Chưa có log nào.</div>}
        </div>
      </div>

      {canWrite && (
        <div className="border-t border-[var(--line)] pt-3">
          <div className="text-xs font-semibold text-[var(--ink-400)] uppercase mb-2">{isDaDong ? "Tiến trình đã đóng" : "Thêm log xử lý mới"}</div>
          {!isDaDong && (
            <div className="space-y-2">
              <Select value={newTrangThai} onChange={setNewTrangThai} options={[{ value: "", label: "Chọn trạng thái…" }, ...TRANG_THAI_LOG_OPTIONS]} className="w-full" />
              <input
                type="date"
                value={newNgayDuKien}
                onChange={(e) => setNewNgayDuKien(e.target.value)}
                placeholder="Ngày dự kiến xong (để trống = giữ theo log trước)"
                className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
              {newTrangThai === TRANG_THAI_CAN_KET_QUA && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-[var(--ink-400)]">Kết quả xử lý *</label>
                    {ketQuaOptions.length ? (
                      <Select
                        value={newKetQua}
                        onChange={setNewKetQua}
                        options={[{ value: "", label: "Chọn kết quả xử lý…" }, ...ketQuaOptions.map((k) => ({ value: k.ten_ket_qua, label: k.ten_ket_qua }))]}
                        className="w-full mt-1"
                      />
                    ) : (
                      <div className="text-xs text-[var(--coral-500)] mt-1">Chưa có danh mục — vào Settings → Kết quả xử lý tranh chấp để thêm trước.</div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[var(--ink-400)]">Hài lòng sau tranh chấp *</label>
                    <Select
                      value={newHaiLong}
                      onChange={setNewHaiLong}
                      options={[{ value: "", label: "Chọn mức hài lòng…" }, ...HAI_LONG_OPTIONS]}
                      className="w-full mt-1"
                    />
                  </div>
                </>
              )}
              <textarea
                value={newGhiChu}
                onChange={(e) => setNewGhiChu(e.target.value)}
                rows={2}
                placeholder="Ghi chú…"
                className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
              <div className="flex justify-end">
                <Btn
                  size="sm"
                  onClick={() =>
                    addLog.mutate({
                      trang_thai_xu_ly: newTrangThai,
                      thoi_gian_du_kien_xong: newNgayDuKien || undefined,
                      ghi_chu: newGhiChu.trim() || undefined,
                      ket_qua_xu_ly: newTrangThai === TRANG_THAI_CAN_KET_QUA ? newKetQua : undefined,
                      hai_long_sau_tranh_chap: newTrangThai === TRANG_THAI_CAN_KET_QUA ? newHaiLong : undefined,
                    })
                  }
                  disabled={!newTrangThai || (newTrangThai === TRANG_THAI_CAN_KET_QUA && (!newKetQua || !newHaiLong)) || addLog.isPending}
                >
                  Thêm log
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EditLogForm({
  log,
  ketQuaOptions,
  onCancel,
  onSave,
  isPending,
}: {
  log: TranhChapLogRow;
  ketQuaOptions: KetQuaXuLyTranhChapRow[];
  onCancel: () => void;
  onSave: (body: { trang_thai_xu_ly: string; thoi_gian_du_kien_xong?: string; ghi_chu?: string; ket_qua_xu_ly?: string; hai_long_sau_tranh_chap?: string }) => void;
  isPending: boolean;
}) {
  const [trangThai, setTrangThai] = useState(log.trang_thai_xu_ly);
  const [ngayDuKien, setNgayDuKien] = useState(log.thoi_gian_du_kien_xong ?? "");
  const [ghiChu, setGhiChu] = useState(log.ghi_chu ?? "");
  const [ketQua, setKetQua] = useState(log.ket_qua_xu_ly ?? "");
  const [haiLong, setHaiLong] = useState(log.hai_long_sau_tranh_chap ?? "");
  const canKetQua = trangThai === TRANG_THAI_CAN_KET_QUA;

  return (
    <div className="space-y-2">
      <Select value={trangThai} onChange={setTrangThai} options={TRANG_THAI_LOG_OPTIONS} className="w-full" />
      <input type="date" value={ngayDuKien} onChange={(e) => setNgayDuKien(e.target.value)} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
      {canKetQua && (
        <>
          <Select
            value={ketQua}
            onChange={setKetQua}
            options={[{ value: "", label: "Chọn kết quả xử lý…" }, ...ketQuaOptions.map((k) => ({ value: k.ten_ket_qua, label: k.ten_ket_qua }))]}
            className="w-full"
          />
          <Select value={haiLong} onChange={setHaiLong} options={[{ value: "", label: "Chọn mức hài lòng…" }, ...HAI_LONG_OPTIONS]} className="w-full" />
        </>
      )}
      <textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} rows={2} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
      <div className="flex justify-end gap-2">
        <Btn variant="ghost" size="sm" onClick={onCancel}>
          Hủy
        </Btn>
        <Btn
          size="sm"
          onClick={() =>
            onSave({
              trang_thai_xu_ly: trangThai,
              thoi_gian_du_kien_xong: ngayDuKien || undefined,
              ghi_chu: ghiChu.trim() || undefined,
              ket_qua_xu_ly: canKetQua ? ketQua : undefined,
              hai_long_sau_tranh_chap: canKetQua ? haiLong : undefined,
            })
          }
          disabled={isPending || (canKetQua && (!ketQua || !haiLong))}
        >
          Lưu
        </Btn>
      </div>
    </div>
  );
}
