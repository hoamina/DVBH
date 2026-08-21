import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "./ui/Modal";
import { Btn } from "./ui/Btn";
import { api } from "../api/client";
import { useToast } from "./ui/Toast";
import { extractMaKtv, useKtvPhoneMap, KTV_PHONE_QUERY_KEY } from "../lib/ktvPhone";
import type { VaiTro } from "../auth/AuthContext";
import { usePersonDirectory, formatPersonDisplay } from "../lib/personDisplay";

/** Vai tro duoc them/sua/xoa SDT KTV qua bam ten (CHOT 2026-08-06) - khop dung nhom ktvWriteRoles o
 * backend/src/routes/settings.ts, giu 2 noi nay dong bo neu doi quyen. */
export const KTV_PHONE_EDIT_ROLES: VaiTro[] = ["Admin", "CSKH", "TN CSKH", "TBP CSKH"];

export function KtvNameWithPhone({ kyThuatVien, canEdit }: { kyThuatVien: string | null | undefined; canEdit: boolean }) {
  const maKtv = extractMaKtv(kyThuatVien);
  const map = useKtvPhoneMap();
  const [open, setOpen] = useState(false);

  if (!kyThuatVien) return <span>—</span>;
  if (!maKtv) return <span>{kyThuatVien}</span>;

  const entry = map.get(maKtv);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="focus-ring text-left hover:underline decoration-dotted underline-offset-2"
      >
        {kyThuatVien}
        {entry?.sdt && <span className="text-[var(--ocean-600)]"> · 📞 {entry.sdt}</span>}
      </button>
      {open && (
        // Modal.tsx khong dung React portal - vi tri "fixed" chi anh huong hien thi, DOM van la con
        // cua <tr>, nen click ben trong (Luu, dong...) se bubble len toi onRowClick cua bang chua no
        // (vd DanhSachTongModule mo lai CaseDetail ngoai y muon) neu khong chan o day.
        <div onClick={(e) => e.stopPropagation()}>
          <KtvPhoneModal maKtv={maKtv} kyThuatVien={kyThuatVien} canEdit={canEdit} onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

function KtvPhoneModal({ maKtv, kyThuatVien, canEdit, onClose }: { maKtv: string; kyThuatVien: string; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const addToast = useToast();
  const personDir = usePersonDirectory();
  const map = useKtvPhoneMap();
  const entry = map.get(maKtv);

  const [tenHienThi, setTenHienThi] = useState(entry?.ten_hien_thi ?? kyThuatVien);
  const [sdt, setSdt] = useState(entry?.sdt ?? "");
  const [ghiChu, setGhiChu] = useState(entry?.ghi_chu ?? "");

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: KTV_PHONE_QUERY_KEY });
  }

  const save = useMutation({
    mutationFn: () => api.post("/settings/ktv-lien-he", { ma_ktv: maKtv, ten_hien_thi: tenHienThi || undefined, sdt, ghi_chu: ghiChu || undefined }),
    onSuccess: async () => {
      addToast("Đã lưu số điện thoại KTV");
      await invalidate();
      onClose();
    },
    onError: () => addToast("Không thể lưu, thử lại sau."),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/settings/ktv-lien-he/${encodeURIComponent(maKtv)}`),
    onSuccess: async () => {
      addToast("Đã xóa số điện thoại KTV");
      await invalidate();
      onClose();
    },
    onError: () => addToast("Không thể xóa, thử lại sau."),
  });

  return (
    <Modal open onClose={onClose} title="Số điện thoại kỹ thuật viên" width="max-w-sm">
      <div className="space-y-3 text-sm">
        <div>
          <div className="text-xs font-semibold text-[var(--ink-400)] mb-1">Mã KTV</div>
          <div className="font-mono text-xs text-[var(--ink-600)]">{maKtv}</div>
        </div>
        {canEdit ? (
          <>
            <div>
              <label className="text-xs font-semibold text-[var(--ink-400)]">Tên hiển thị</label>
              <input value={tenHienThi} onChange={(e) => setTenHienThi(e.target.value)} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--ink-400)]">Số điện thoại</label>
              <input value={sdt} onChange={(e) => setSdt(e.target.value)} placeholder="09xxxxxxxx" className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--ink-400)]">Ghi chú</label>
              <textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} rows={2} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm mt-1" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Btn size="sm" onClick={() => save.mutate()} disabled={!sdt.trim() || save.isPending}>
                {save.isPending ? "Đang lưu…" : "Lưu"}
              </Btn>
              {entry && (
                <Btn size="sm" variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
                  {remove.isPending ? "Đang xóa…" : "Xóa"}
                </Btn>
              )}
            </div>
            {entry?.nguoi_cap_nhat && (
              <div className="text-xs text-[var(--ink-400)]">
                Cập nhật gần nhất: {formatPersonDisplay(entry.nguoi_cap_nhat, personDir)} · {entry.ngay_cap_nhat}
              </div>
            )}
          </>
        ) : entry ? (
          <>
            <div>
              <div className="text-xs font-semibold text-[var(--ink-400)] mb-1">Số điện thoại</div>
              <div className="text-[var(--ocean-600)] font-semibold">📞 {entry.sdt ?? "Chưa có SĐT"}</div>
            </div>
            {entry.ghi_chu && (
              <div>
                <div className="text-xs font-semibold text-[var(--ink-400)] mb-1">Ghi chú</div>
                <div>{entry.ghi_chu}</div>
              </div>
            )}
          </>
        ) : (
          <div className="text-[var(--ink-400)] italic">Chưa có số điện thoại được ghi nhận.</div>
        )}
      </div>
    </Modal>
  );
}
