import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Btn } from "./ui/Btn";
import { useToast } from "./ui/Toast";
import { useQuocGia } from "../lib/quocGia";
import { tr } from "../i18n/tr";

// Quan ly User -> modal Phan quyen: "Quốc gia được xem" (migration 0148). Luu doc lap voi nut "Lưu" chinh cua modal
// (PATCH /users/:email chi gui pham_vi_quoc_gia) - giong "Khu vực phụ trách (Giám sát)". null = Toàn bộ.
export function PhamViQuocGiaEditor({ email, giaTri }: { email: string; giaTri: string[] | null }) {
  const qc = useQueryClient();
  const addToast = useToast();
  const { data } = useQuocGia();
  const dsNuoc = (data?.quoc_gia ?? []).filter((q) => q.kich_hoat || giaTri?.includes(q.ma));
  const [toanBo, setToanBo] = useState(giaTri === null);
  const [chon, setChon] = useState<Set<string>>(new Set(giaTri ?? []));

  const luu = useMutation({
    mutationFn: () => api.patch(`/users/${encodeURIComponent(email)}`, { pham_vi_quoc_gia: toanBo ? null : [...chon] }),
    onSuccess: () => {
      addToast(tr("Đã lưu quốc gia được xem"));
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => addToast(tr("Lỗi:") + " " + (err instanceof Error ? err.message : String(err))),
  });

  function bat(ma: string) {
    setToanBo(false);
    setChon((s) => {
      const next = new Set(s);
      next.has(ma) ? next.delete(ma) : next.add(ma);
      return next;
    });
  }
  const nut = (active: boolean) =>
    `focus-ring px-2.5 py-1 rounded-lg text-xs font-semibold border ${active ? "bg-[var(--ocean-500)] text-white border-[var(--ocean-500)]" : "border-[var(--line)] text-[var(--ink-600)]"}`;

  return (
    <div className="border-t border-[var(--line)] pt-3">
      <label className="block text-xs font-semibold text-[var(--ink-400)] mb-1.5">{tr("Quốc gia được xem")}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        <button className={nut(toanBo)} onClick={() => setToanBo(true)}>
          {tr("Toàn bộ")}
        </button>
        {dsNuoc.map((q) => (
          <button key={q.ma} className={nut(!toanBo && chon.has(q.ma))} onClick={() => bat(q.ma)} title={q.ten}>
            {q.ma} · {q.ten}
          </button>
        ))}
      </div>
      <div className="text-xs text-[var(--ink-400)] mb-2">
        {tr("Chưa áp dụng lọc dữ liệu — hệ thống sẽ lọc báo cáo/danh sách theo quốc gia ở giai đoạn sau.")}
      </div>
      <Btn size="sm" variant="ghost" onClick={() => luu.mutate()} disabled={luu.isPending || (!toanBo && chon.size === 0)}>
        {tr("Lưu quốc gia")}
      </Btn>
    </div>
  );
}
