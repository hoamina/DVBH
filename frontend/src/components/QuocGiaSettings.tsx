import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Card } from "./ui/Card";
import { Btn } from "./ui/Btn";
import { useToast } from "./ui/Toast";
import { QUOC_GIA_QUERY_KEY, useQuocGia, type MauIdQuocGia } from "../lib/quocGia";
import { tr } from "../i18n/tr";

// Cai dat -> "Quốc gia" (2026-10-29, migration 0148, "Đa quốc gia" GĐ1): danh muc quoc gia + mau ID -> quoc gia/nguon.
// Mau ID la GLOB (vd "SC[0-9]*"), xet theo do uu tien tang dan; chi ap dung cho ca TAO MOI tu lan import sau.
const O_NHAP = "focus-ring px-2 py-1.5 rounded-lg border border-[var(--line)] text-sm bg-[var(--surface)]";

export function QuocGiaSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuocGia();
  const nuoc = data?.quoc_gia ?? [];
  const mau = data?.mau_id ?? [];
  const lamMoi = () => qc.invalidateQueries({ queryKey: QUOC_GIA_QUERY_KEY });
  const loi = (e: Error) => toast(e.message);

  const luuNuoc = useMutation({
    mutationFn: (b: { ma: string; ten: string; thu_tu: number; kich_hoat: boolean }) => api.put("/quoc-gia/nuoc", b),
    onSuccess: () => {
      lamMoi();
      toast(tr("Đã lưu quốc gia"));
    },
    onError: loi,
  });
  const luuMau = useMutation({
    mutationFn: (b: Partial<MauIdQuocGia>) => api.put("/quoc-gia/mau-id", b),
    onSuccess: () => {
      lamMoi();
      toast(tr("Đã lưu mẫu ID"));
    },
    onError: loi,
  });
  const xoaMau = useMutation({
    mutationFn: (id: number) => api.delete(`/quoc-gia/mau-id?id=${id}`),
    onSuccess: lamMoi,
    onError: loi,
  });

  const [nuocMoi, setNuocMoi] = useState({ ma: "", ten: "" });
  const [mauMoi, setMauMoi] = useState({ mau_glob: "", ma_quoc_gia: "", nguon: "", do_uu_tien: "100", ghi_chu: "" });
  const [idThu, setIdThu] = useState("");
  const [ketQuaThu, setKetQuaThu] = useState<string | null>(null);

  async function thu() {
    if (!idThu.trim()) return;
    try {
      const r = await api.get<{ khop: { ma_quoc_gia: string; nguon: string } | null; ma_quoc_gia: string }>(`/quoc-gia/thu?id=${encodeURIComponent(idThu.trim())}`);
      setKetQuaThu(r.khop ? `${r.khop.ma_quoc_gia} · ${r.khop.nguon}` : tr("Không khớp mẫu nào → mặc định {0}", r.ma_quoc_gia));
    } catch (e) {
      setKetQuaThu(e instanceof Error ? e.message : String(e));
    }
  }

  if (!data) return null;
  const canEdit = data.canEdit;

  return (
    <div className="mt-4 space-y-4 max-w-4xl">
      <Card className="p-4">
        <div className="font-semibold mb-1">{tr("Danh mục quốc gia")}</div>
        <div className="text-xs text-[var(--ink-400)] mb-3">
          {tr("Mã 2-5 chữ in hoa. Không xóa được quốc gia (ca và người dùng đã gắn mã) — chỉ tắt.")}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--ink-400)]">
              <th className="py-1">{tr("Mã")}</th>
              <th>{tr("Tên")}</th>
              <th>{tr("Thứ tự")}</th>
              <th>{tr("Bật")}</th>
            </tr>
          </thead>
          <tbody>
            {nuoc.map((q) => (
              <tr key={q.ma} className="border-t border-[var(--line)]">
                <td className="py-1.5 font-mono font-semibold">{q.ma}</td>
                <td>{q.ten}</td>
                <td>{q.thu_tu}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!q.kich_hoat}
                    disabled={!canEdit || luuNuoc.isPending}
                    onChange={(e) => luuNuoc.mutate({ ma: q.ma, ten: q.ten, thu_tu: q.thu_tu, kich_hoat: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {canEdit && (
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <input className={`${O_NHAP} w-24 font-mono`} placeholder={tr("Mã")} value={nuocMoi.ma} onChange={(e) => setNuocMoi({ ...nuocMoi, ma: e.target.value.toUpperCase() })} />
            <input className={`${O_NHAP} w-56`} placeholder={tr("Tên quốc gia")} value={nuocMoi.ten} onChange={(e) => setNuocMoi({ ...nuocMoi, ten: e.target.value })} />
            <Btn
              size="sm"
              disabled={!nuocMoi.ma || !nuocMoi.ten || luuNuoc.isPending}
              onClick={() =>
                luuNuoc.mutate(
                  { ma: nuocMoi.ma, ten: nuocMoi.ten, thu_tu: nuoc.length + 1, kich_hoat: true },
                  { onSuccess: () => setNuocMoi({ ma: "", ten: "" }) },
                )
              }
            >
              {tr("Thêm / sửa quốc gia")}
            </Btn>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="font-semibold mb-1">{tr("Mẫu ID → quốc gia / nguồn")}</div>
        <div className="text-xs text-[var(--ink-400)] mb-3">
          {tr("Mẫu dạng GLOB: * = chuỗi bất kỳ, ? = 1 ký tự, [0-9] = 1 chữ số (phân biệt hoa/thường). Xét theo độ ưu tiên tăng dần; ID không khớp mẫu nào xếp vào {0}. Chỉ áp dụng cho ca tạo mới từ lần import sau.", data.mac_dinh)}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--ink-400)]">
              <th className="py-1">{tr("Mẫu ID")}</th>
              <th>{tr("Quốc gia")}</th>
              <th>{tr("Nguồn")}</th>
              <th>{tr("Ưu tiên")}</th>
              <th>{tr("Ghi chú")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {mau.map((m) => (
              <tr key={m.id} className="border-t border-[var(--line)]">
                <td className="py-1.5 font-mono">{m.mau_glob}</td>
                <td className="font-mono">{m.ma_quoc_gia}</td>
                <td>{m.nguon}</td>
                <td>{m.do_uu_tien}</td>
                <td className="text-xs text-[var(--ink-500)]">{m.ghi_chu}</td>
                <td className="text-right">
                  {canEdit && (
                    <Btn size="sm" variant="ghost" onClick={() => confirm(tr("Xóa mẫu {0}?", m.mau_glob)) && xoaMau.mutate(m.id)}>
                      {tr("Xóa")}
                    </Btn>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {canEdit && (
          <div className="flex flex-wrap gap-2 mt-3 items-center">
            <input className={`${O_NHAP} w-36 font-mono`} placeholder="SC[0-9]*" value={mauMoi.mau_glob} onChange={(e) => setMauMoi({ ...mauMoi, mau_glob: e.target.value })} />
            <select className={O_NHAP} value={mauMoi.ma_quoc_gia} onChange={(e) => setMauMoi({ ...mauMoi, ma_quoc_gia: e.target.value })}>
              <option value="">{tr("Quốc gia")}</option>
              {nuoc.map((q) => (
                <option key={q.ma} value={q.ma}>
                  {q.ma} · {q.ten}
                </option>
              ))}
            </select>
            <input className={`${O_NHAP} w-32`} placeholder={tr("Nguồn (vd odoo_id)")} value={mauMoi.nguon} onChange={(e) => setMauMoi({ ...mauMoi, nguon: e.target.value })} />
            <input className={`${O_NHAP} w-20`} type="number" value={mauMoi.do_uu_tien} onChange={(e) => setMauMoi({ ...mauMoi, do_uu_tien: e.target.value })} />
            <input className={`${O_NHAP} w-40`} placeholder={tr("Ghi chú")} value={mauMoi.ghi_chu} onChange={(e) => setMauMoi({ ...mauMoi, ghi_chu: e.target.value })} />
            <Btn
              size="sm"
              disabled={!mauMoi.mau_glob || !mauMoi.ma_quoc_gia || !mauMoi.nguon || luuMau.isPending}
              onClick={() =>
                luuMau.mutate(
                  { ...mauMoi, do_uu_tien: Number(mauMoi.do_uu_tien) || 100 },
                  { onSuccess: () => setMauMoi({ mau_glob: "", ma_quoc_gia: "", nguon: "", do_uu_tien: "100", ghi_chu: "" }) },
                )
              }
            >
              {tr("Thêm mẫu")}
            </Btn>
          </div>
        )}
        {canEdit && (
          <div className="flex flex-wrap gap-2 mt-4 items-center border-t border-[var(--line)] pt-3">
            <span className="text-xs font-semibold text-[var(--ink-400)]">{tr("Thử 1 ID:")}</span>
            <input className={`${O_NHAP} w-44 font-mono`} value={idThu} onChange={(e) => setIdThu(e.target.value)} onKeyDown={(e) => e.key === "Enter" && thu()} />
            <Btn size="sm" variant="ghost" onClick={thu}>
              {tr("Thử")}
            </Btn>
            {ketQuaThu && <span className="text-sm font-semibold">{ketQuaThu}</span>}
          </div>
        )}
      </Card>
    </div>
  );
}
