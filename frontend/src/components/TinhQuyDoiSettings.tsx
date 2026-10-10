import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { Card } from "./ui/Card";
import { Btn } from "./ui/Btn";
import { useToast } from "./ui/Toast";
import { DiaGioiIndex, khoaTen, soSanhTen, useTinhQuyDoi, type QuyDoiRow } from "../lib/diaGioi";

// Cai dat -> "Quy đổi tỉnh" (2026-10-10): bang tinh cu (63) -> tinh moi (34) dung cho che do "Địa giới mới" voi ca
// chua co tinh moi (moi ca QuickSight cu). Sua tinh moi cua 1 dong, them ten bien the (vd "Hà Tây"), xoa dong.
export function TinhQuyDoiSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useTinhQuyDoi();
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const canEdit = !!data?.canEdit;
  const { data: toHop } = useQuery({
    queryKey: ["dia-gioi-to-hop"],
    queryFn: () => api.get<{ rows: [string | null, string | null, string | null, string | null][] }>("/dia-gioi/to-hop"),
    staleTime: 30 * 60_000,
  });

  const tinhMoiList = useMemo(() => [...new Set(rows.map((r) => r.tinh_moi))].sort(soSanhTen), [rows]);
  const nhom = useMemo(() => {
    const m = new Map<string, QuyDoiRow[]>();
    for (const r of rows) m.set(r.tinh_moi, [...(m.get(r.tinh_moi) ?? []), r]);
    return [...m.entries()].sort((a, b) => soSanhTen(a[0], b[0]));
  }, [rows]);

  // Ten tinh cu dang co trong du lieu (ca chua co tinh moi) nhung khong khop dong nao -> can them quy doi.
  const chuaQuyDoi = useMemo(() => {
    const khoaCo = new Set(rows.map((r) => khoaTen(r.tinh_cu)));
    const dem = new Map<string, number>();
    for (const [t, , tm] of toHop?.rows ?? []) {
      if (!t?.trim() || tm?.trim()) continue;
      if (!khoaCo.has(khoaTen(t))) dem.set(t.trim(), (dem.get(t.trim()) ?? 0) + 1);
    }
    return [...dem.keys()].sort(soSanhTen);
  }, [rows, toHop]);

  const save = useMutation({
    mutationFn: (body: { tinh_cu: string; tinh_moi: string }) => api.put("/dia-gioi/quy-doi", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dia-gioi-quy-doi"] });
      toast("Đã lưu quy đổi");
    },
    onError: (e: Error) => toast(e.message),
  });
  const remove = useMutation({
    mutationFn: (tinhCu: string) => api.delete(`/dia-gioi/quy-doi?tinh_cu=${encodeURIComponent(tinhCu)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dia-gioi-quy-doi"] }),
    onError: (e: Error) => toast(e.message),
  });

  const [moiCu, setMoiCu] = useState("");
  const [moiMoi, setMoiMoi] = useState("");
  const idx = useMemo(() => new DiaGioiIndex(rows), [rows]);

  return (
    <div className="mt-4 grid gap-4 max-w-5xl">
      <Card className="p-4">
        <div className="font-display font-bold text-sm">Quy đổi tỉnh cũ → tỉnh mới</div>
        <div className="text-xs text-[var(--ink-500)] mt-1 leading-relaxed">
          Dùng khi chọn <b>Địa giới: Mới</b> (nút trên thanh đầu trang): ca chưa có tỉnh mới (toàn bộ ca cũ từ QuickSight) được quy
          đổi theo bảng này. Ca Odoo đã có tỉnh mới thì dùng thẳng. Tên được so khớp không phân biệt tiền tố/dấu ("Hà Nội" =
          "Thành phố Hà Nội", "Hoà Bình" = "Hòa Bình"). {rows.length} dòng · {tinhMoiList.length} tỉnh mới.
        </div>
        {chuaQuyDoi.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs">
            <b>⚠️ Tên tỉnh trong dữ liệu chưa có quy đổi:</b> {chuaQuyDoi.join(", ")} — các ca này hiện ở nhóm "… (chưa quy đổi)"
            khi xem địa giới mới. Thêm dòng bên dưới để gộp.
          </div>
        )}
        {canEdit && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <div className="text-[var(--ink-500)] mb-1">Tỉnh cũ / tên biến thể</div>
              <input
                list="dg-tinh-cu-list"
                value={moiCu}
                onChange={(e) => setMoiCu(e.target.value)}
                className="border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm w-56 bg-[var(--surface)]"
                placeholder="vd Hà Tây"
              />
              <datalist id="dg-tinh-cu-list">
                {chuaQuyDoi.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label className="text-xs">
              <div className="text-[var(--ink-500)] mb-1">→ Tỉnh mới</div>
              <select
                value={moiMoi}
                onChange={(e) => setMoiMoi(e.target.value)}
                className="border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm w-56 bg-[var(--surface)]"
              >
                <option value="">-- Chọn tỉnh mới --</option>
                {tinhMoiList.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <Btn
              size="sm"
              disabled={!moiCu.trim() || !moiMoi || save.isPending}
              onClick={() => save.mutate({ tinh_cu: moiCu.trim(), tinh_moi: moiMoi }, { onSuccess: () => setMoiCu("") })}
            >
              + Thêm / cập nhật
            </Btn>
            {moiCu.trim() && idx.tinhCu(moiCu) !== moiCu.trim() && (
              <span className="text-[11px] text-[var(--ink-400)]">Khớp sẵn với "{idx.tinhCu(moiCu)}" — lưu sẽ thêm dòng riêng.</span>
            )}
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="dense w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
              <th className="py-2 px-3 w-64">Tỉnh mới</th>
              <th className="py-2 px-3">Tỉnh cũ gộp vào</th>
            </tr>
          </thead>
          <tbody>
            {nhom.map(([moi, list]) => (
              <tr key={moi} className="border-b border-[var(--line)] last:border-0 align-top">
                <td className="py-2 px-3 font-semibold">
                  {moi}
                  <div className="text-[11px] font-normal text-[var(--ink-400)]">{list.length} tỉnh cũ</div>
                </td>
                <td className="py-2 px-3">
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((r) => (
                      <span
                        key={r.tinh_cu}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-0.5 text-xs"
                        title={r.nguoi_sua ? `Sửa bởi ${r.nguoi_sua} lúc ${r.ngay_sua}` : "Mặc định theo nghị quyết sáp nhập"}
                      >
                        {r.tinh_cu}
                        {canEdit && (
                          <>
                            <select
                              aria-label={`Đổi tỉnh mới của ${r.tinh_cu}`}
                              value={r.tinh_moi}
                              onChange={(e) => save.mutate({ tinh_cu: r.tinh_cu, tinh_moi: e.target.value })}
                              className="ml-1 bg-transparent text-[11px] text-[var(--ink-500)] max-w-[1.4rem] cursor-pointer"
                              title="Chuyển sang tỉnh mới khác"
                            >
                              {tinhMoiList.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                            <button
                              className="text-[var(--coral-500)] hover:underline"
                              title="Xóa dòng quy đổi"
                              onClick={() => {
                                if (confirm(`Xóa quy đổi "${r.tinh_cu}" → "${r.tinh_moi}"?`)) remove.mutate(r.tinh_cu);
                              }}
                            >
                              ×
                            </button>
                          </>
                        )}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
