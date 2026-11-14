// Khoi "Doanh thu chuẩn · Xuất hóa đơn · Hạn bảo hành" trong muc Doanh thu cua chi tiet ca (2026-11-14, migration 0170).
// Backend: routes/suaDoanhThu.ts (/api/sua-doanh-thu/ca/:id...). Quyen sua do server tra ve (duocSua): GS khu vuc minh phu trach,
// CSKH / TN CSKH / TBP DVBH / TBP CSKH / Admin.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { Badge } from "./ui/Badge";
import { Btn } from "./ui/Btn";
import { useToast } from "./ui/Toast";
import { fmtDate, fmtDateTime, fmtVND, type CaseRow } from "../types";
import { NHAN_BH, tinhHanBaoHanh, trangThaiBhCuoi } from "../lib/hanBaoHanh";
import { tr } from "../i18n/tr";

export interface DonHoaDonRow {
  don_id: string;
  case_id: string;
  ma_misa: string | null;
  pxk_id: string | null;
  chot_ke_toan_luc: string | null;
  trang_thai_pxk: string | null;
  da_huy: number;
  yeu_cau_hoa_don: string | null;
  ma_lk: string | null;
  ten_lk: string | null;
  so_luong: number | null;
}
interface SuaLog {
  id: number;
  loai: "dt" | "hd" | "bh";
  gia_tri_cu: string | null;
  gia_tri_moi: string | null;
  ly_do: string | null;
  nguon: string;
  nguoi: string;
  luc: string;
}
interface CaPayload {
  hdBh: { xuat_hoa_don: number | null; hd_sua_by: string | null; hd_sua_at: string | null; con_bao_hanh: number | null; bh_sua_by: string | null; bh_sua_at: string | null; ghi_chu: string | null } | null;
  donHoaDon: DonHoaDonRow[];
  log: SuaLog[];
  duocSua: boolean;
}

const muted = "text-[11px] text-[var(--ink-400)]";
const NGUON: Record<string, string> = { tay: "Sửa tay", excel: "Import Excel", khoi_phuc: "Khôi phục CRM" };

function moTaGiaTri(loai: SuaLog["loai"], raw: string | null): string {
  if (raw === null) return "—";
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (loai === "dt") {
    if (Array.isArray(v)) return `SP ${fmtVND(v[0])} · LK ${fmtVND(v[1])} · DV ${fmtVND(v[2])}`;
    return v === "CRM" ? tr("Theo CRM") : String(v);
  }
  if (v === null) return tr("Tự động");
  if (loai === "hd") return v === 1 ? tr("Có xuất HĐ") : tr("Không xuất HĐ");
  return v === 1 ? tr("Còn bảo hành") : tr("Hết bảo hành");
}

export function DtHdBhPanel({ c, onCaseChanged }: { c: CaseRow; onCaseChanged: () => Promise<void> }) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = ["sua-dt", "ca", String(c.id)];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<CaPayload>(`/sua-doanh-thu/ca/${encodeURIComponent(String(c.id))}`) });
  const [suaDt, setSuaDt] = useState(false);
  const [form, setForm] = useState({ sp: "", lk: "", dv: "", lyDo: "" });
  const [dangLuu, setDangLuu] = useState(false);
  const [xemLog, setXemLog] = useState(false);
  const duocSua = !!data?.duocSua;

  async function goi(fn: () => Promise<unknown>, ok: string, doiDt: boolean) {
    setDangLuu(true);
    try {
      await fn();
      toast(ok);
      await qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["sua-dt"] });
      if (doiDt) await onCaseChanged();
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? (e.detail ?? e.message) : String(e));
      return false;
    } finally {
      setDangLuu(false);
    }
  }

  function moSuaDt() {
    setForm({ sp: String(c.dt_san_pham ?? 0), lk: String(c.dt_linh_kien ?? 0), dv: String(c.dt_dich_vu ?? 0), lyDo: "" });
    setSuaDt(true);
  }
  async function luuDt() {
    const so = (s: string) => Number(s.replace(/\D/g, "") || 0);
    const ok = await goi(
      () => api.put(`/sua-doanh-thu/ca/${encodeURIComponent(String(c.id))}/doanh-thu`, { dt_san_pham: so(form.sp), dt_linh_kien: so(form.lk), dt_dich_vu: so(form.dv), ly_do: form.lyDo }),
      tr("Đã lưu doanh thu chuẩn"),
      true,
    );
    if (ok) setSuaDt(false);
  }

  // --- Xuat hoa don ---
  const donCon = (data?.donHoaDon ?? []).filter((d) => !d.da_huy);
  const hdTay = data?.hdBh?.xuat_hoa_don ?? null;
  const hdCuoi = hdTay !== null ? hdTay === 1 : donCon.length > 0;
  // --- Han bao hanh ---
  const bh = tinhHanBaoHanh(c.ngay_mua, c.ngay_san_xuat, c.thoi_gian_cskh_tiep_nhan);
  const bhTay = data?.hdBh?.con_bao_hanh ?? null;
  const bhCuoi = trangThaiBhCuoi(bhTay, bh.tu_dong);

  const nutChon = (hienTai: number | null, path: "hoa-don" | "bao-hanh", truong: string, nhanCo: string, nhanKhong: string) =>
    duocSua && (
      <span className="inline-flex flex-wrap gap-1 ml-1">
        {([
          [1, nhanCo],
          [0, nhanKhong],
          [null, tr("Tự động")],
        ] as [number | null, string][]).map(([v, nhan]) => (
          <button
            key={String(v)}
            type="button"
            disabled={dangLuu || hienTai === v}
            onClick={() => goi(() => api.put(`/sua-doanh-thu/ca/${encodeURIComponent(String(c.id))}/${path}`, { [truong]: v }), tr("Đã lưu"), false)}
            className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${hienTai === v ? "border-[var(--ocean-500)] bg-[var(--ocean-100)] text-[var(--ocean-700)]" : "border-[var(--line)] text-[var(--ink-500)] hover:bg-slate-50"} disabled:cursor-default`}
          >
            {nhan}
          </button>
        ))}
      </span>
    );

  return (
    <div className="col-span-3 mt-1 space-y-2.5 border-t border-[var(--line)] pt-2.5 text-sm">
      {/* Doanh thu chuan */}
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[var(--ink-500)] text-xs font-semibold">{tr("Doanh thu chuẩn")}:</span>
          <b>{fmtVND((c.dt_san_pham ?? 0) + (c.dt_linh_kien ?? 0) + (c.dt_dich_vu ?? 0))}</b>
          {c.dt_sua_at ? <Badge tone="amber">{tr("Đã sửa")}</Badge> : <span className={muted}>{tr("(theo CRM)")}</span>}
          {duocSua && !suaDt && (
            <button type="button" onClick={moSuaDt} className="text-xs font-semibold text-[var(--ocean-600)] hover:underline">
              ✎ {tr("Sửa doanh thu")}
            </button>
          )}
          {duocSua && c.dt_sua_at && !suaDt && (
            <button
              type="button"
              disabled={dangLuu}
              onClick={() => goi(() => api.delete(`/sua-doanh-thu/ca/${encodeURIComponent(String(c.id))}/doanh-thu`), tr("Đã khôi phục doanh thu theo CRM"), true)}
              className="text-xs font-semibold text-[var(--ink-500)] hover:underline disabled:opacity-40"
            >
              {tr("Khôi phục theo CRM")}
            </button>
          )}
        </div>
        {c.dt_sua_at && (
          <div className={muted}>
            {tr("CRM gốc")}: SP {fmtVND(c.dt_san_pham_crm)} · LK {fmtVND(c.dt_linh_kien_crm)} · DV {fmtVND(c.dt_dich_vu_crm)} — {c.dt_sua_by} · {fmtDateTime(c.dt_sua_at)}
            {c.dt_sua_ly_do ? ` · ${tr("Lý do")}: ${c.dt_sua_ly_do}` : ""}
          </div>
        )}
        {suaDt && (
          <div className="mt-1.5 rounded-lg border border-[var(--line)] p-2 space-y-1.5">
            <div className="grid grid-cols-3 gap-2">
              {([
                ["sp", tr("DT sản phẩm")],
                ["lk", tr("DT linh kiện")],
                ["dv", tr("DT dịch vụ")],
              ] as const).map(([k, nhan]) => (
                <label key={k} className="text-xs text-[var(--ink-500)]">
                  {nhan}
                  <input
                    inputMode="numeric"
                    value={form[k] ? Number(form[k].replace(/\D/g, "") || 0).toLocaleString("vi-VN") : ""}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value.replace(/\D/g, "") })}
                    className="focus-ring mt-0.5 w-full rounded border border-[var(--line)] px-2 py-1 text-sm text-right"
                  />
                </label>
              ))}
            </div>
            <input
              placeholder={tr("Lý do sửa (bắt buộc) — vd: khảo sát KH thực trả 350.000đ")}
              value={form.lyDo}
              onChange={(e) => setForm({ ...form, lyDo: e.target.value })}
              className="focus-ring w-full rounded border border-[var(--line)] px-2 py-1 text-sm"
            />
            <div className="flex gap-2">
              <Btn size="sm" onClick={luuDt} loading={dangLuu} disabled={!form.lyDo.trim()}>
                {tr("Lưu")}
              </Btn>
              <Btn size="sm" variant="ghost" onClick={() => setSuaDt(false)}>
                {tr("Huỷ")}
              </Btn>
            </div>
          </div>
        )}
      </div>

      {/* Xuat hoa don */}
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[var(--ink-500)] text-xs font-semibold">{tr("Đơn xuất hóa đơn")}:</span>
          <Badge tone={hdCuoi ? "teal" : "gray"}>{hdCuoi ? tr("Có") : tr("Không")}</Badge>
          <span className={muted}>
            {hdTay !== null
              ? tr("sửa tay — {0} · {1}", data?.hdBh?.hd_sua_by ?? "", fmtDateTime(data?.hdBh?.hd_sua_at))
              : donCon.length
                ? tr("tự động — {0} đơn có yêu cầu HĐ trên app linh kiện", donCon.length)
                : tr("tự động — chưa có đơn yêu cầu HĐ trên app linh kiện")}
          </span>
          {nutChon(hdTay, "hoa-don", "xuat_hoa_don", tr("Có"), tr("Không"))}
        </div>
        {donCon.length > 0 && (
          <ul className={`${muted} mt-0.5 list-disc pl-5`}>
            {donCon.map((d) => (
              <li key={d.don_id}>
                {d.don_id} · {d.ma_lk} {d.ten_lk ?? ""} ×{d.so_luong ?? "?"} · {d.yeu_cau_hoa_don}
                {d.ma_misa ? ` · MISA ${d.ma_misa}` : ""} · {tr("KT chốt")} {fmtDateTime(d.chot_ke_toan_luc)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Han bao hanh */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[var(--ink-500)] text-xs font-semibold">{tr("Hạn bảo hành")}:</span>
        <Badge tone={bhCuoi === "con" ? "teal" : bhCuoi === "het" ? "coral" : "gray"}>{tr(NHAN_BH[bhCuoi])}</Badge>
        <span className={muted}>
          {bh.han
            ? tr("hạn {0} (theo {1})", fmtDate(bh.han), bh.theo === "ngay_mua" ? tr("ngày mua +24 tháng") : tr("ngày SX +36 tháng"))
            : tr("không có ngày mua / ngày sản xuất")}
          {bhTay !== null ? ` · ${tr("sửa tay — {0} · {1}", data?.hdBh?.bh_sua_by ?? "", fmtDateTime(data?.hdBh?.bh_sua_at))}` : ""}
        </span>
        {nutChon(bhTay, "bao-hanh", "con_bao_hanh", tr("Còn"), tr("Hết"))}
      </div>

      {(data?.log.length ?? 0) > 0 && (
        <div>
          <button type="button" onClick={() => setXemLog(!xemLog)} className="text-xs font-semibold text-[var(--ocean-600)] hover:underline">
            {xemLog ? tr("▴ Thu gọn") : tr("▾ Nhật ký sửa ({0})", data!.log.length)}
          </button>
          {xemLog && (
            <ul className={`${muted} mt-1 space-y-0.5`}>
              {data!.log.map((l) => (
                <li key={l.id}>
                  {fmtDateTime(l.luc)} · {l.nguoi} · {tr(NGUON[l.nguon] ?? l.nguon)} ·{" "}
                  {l.loai === "dt" ? tr("Doanh thu") : l.loai === "hd" ? tr("Xuất HĐ") : tr("Bảo hành")}: {moTaGiaTri(l.loai, l.gia_tri_cu)} → {moTaGiaTri(l.loai, l.gia_tri_moi)}
                  {l.ly_do ? ` · ${l.ly_do}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
