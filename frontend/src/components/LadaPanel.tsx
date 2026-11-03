// Truong "ID Lada" trong the "Thong tin case" (CaseDetail, 2026-11-03, migration 0153): cac don Lada (he ETX) lien ket voi
// ca, ghi luc dong bo "Giai trinh ton B2B" (backend lib/etxGiaiTrinhSync.ts ghiLienKetLada). 1 ca co the co nhieu ID Lada
// (vd ca Lada bi huy chuyen KTV roi tao don moi). Bam 1 ID -> popup: anh chup don (luu D1) + nhat ky giai trinh cua don do
// tra TRUC TIEP API ETX (GET /api/cases/:id/lada/:orderId, khong luu D1, chi 60 ngay gan nhat theo han luu cua ETX).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";
import { Badge, type BadgeTone } from "./ui/Badge";
import { Field } from "./ui/Field";
import { LoadingInline } from "./ui/LoadingInline";
import { Modal } from "./ui/Modal";
import { fmtDate, fmtDateTime } from "../types";
import { tr } from "../i18n/tr";

export interface CaseLadaRow {
  order_id: string;
  case_id: string;
  ma_doi_tac: string;
  ten_doi_tac: string | null;
  trang_thai_don: string | null;
  loai_lead: string | null;
  ktv: string | null;
  tinh_thanh: string | null;
  ten_khach: string | null;
  ngay_khoi_tao: string | null;
  ngay_hen: string | null;
  so_lan_giai_trinh: number | null;
  giai_trinh_cuoi_luc: string | null;
}

interface LadaDong {
  order_id: string;
  thoi_diem: string;
  lan?: number;
  ly_do?: string;
  ma_ly_do?: string;
  ghi_chu?: string;
  du_kien_xong?: string;
  trang_thai_don?: string;
  co_anh?: boolean;
  ktv?: string;
  id_dat_linh_kien?: string;
  nguoi_giai_trinh?: { ho_ten?: string; ma_ns?: string } | null;
}

function trangThaiTone(s: string | null | undefined): BadgeTone {
  if (!s) return "gray";
  if (/thành công|hoàn thành/i.test(s)) return "teal";
  if (/hủy/i.test(s)) return "coral";
  return "amber";
}

export function LadaIds({ caseId, items }: { caseId: string; items: CaseLadaRow[] }) {
  const [chon, setChon] = useState<CaseLadaRow | null>(null);
  if (!items.length) return <span className="text-[var(--ink-400)]">—</span>;
  return (
    <>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {items.map((l) => (
          <button
            key={l.order_id}
            type="button"
            onClick={() => setChon(l)}
            title={tr("Xem thông tin đơn Lada")}
            className="font-mono underline decoration-dotted underline-offset-2 hover:text-[var(--ocean-600)] focus-ring rounded inline-flex items-center gap-1"
          >
            {l.order_id}
            {l.trang_thai_don && (
              <span className="whitespace-nowrap">
                <Badge tone={trangThaiTone(l.trang_thai_don)}>{l.trang_thai_don}</Badge>
              </span>
            )}
          </button>
        ))}
      </span>
      {chon && <LadaDonModal caseId={caseId} don={chon} onClose={() => setChon(null)} />}
    </>
  );
}

function LadaDonModal({ caseId, don, onClose }: { caseId: string; don: CaseLadaRow; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["case-lada", caseId, don.order_id],
    queryFn: () => api.get<{ dong: LadaDong[] }>(`/cases/${encodeURIComponent(caseId)}/lada/${encodeURIComponent(don.order_id)}`),
    staleTime: 5 * 60_000,
  });
  const dong = q.data?.dong ?? [];
  return (
    <Modal open onClose={onClose} title={tr("Đơn Lada {0}", don.order_id)} width="max-w-3xl">
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2.5">
          <Field label={tr("Trạng thái đơn")} value={don.trang_thai_don ? <Badge tone={trangThaiTone(don.trang_thai_don)}>{don.trang_thai_don}</Badge> : "—"} />
          <Field label={tr("Loại lead")} value={don.loai_lead ?? "—"} />
          <Field label={tr("Đối tác")} value={[don.ma_doi_tac, don.ten_doi_tac].filter(Boolean).join(" — ")} />
          <Field label={tr("Ngày khởi tạo")} value={fmtDate(don.ngay_khoi_tao)} />
          <Field label={tr("Ngày hẹn")} value={fmtDate(don.ngay_hen)} />
          <Field label={tr("Tỉnh thành")} value={don.tinh_thanh ?? "—"} />
          <Field label={tr("KTV (Lada)")} value={don.ktv ?? "—"} />
          <Field label={tr("Khách / điểm giao")} value={don.ten_khach ?? "—"} />
          <Field label={tr("Giải trình gần nhất")} value={`${fmtDateTime(don.giai_trinh_cuoi_luc)}${don.so_lan_giai_trinh ? ` · ${tr("lần {0}", don.so_lan_giai_trinh)}` : ""}`} />
        </div>
        <div>
          <div className="font-display font-bold text-sm mb-2">{tr("Nhật ký giải trình trên Lada")}</div>
          {q.isLoading && <LoadingInline />}
          {q.isError && (
            <div className="text-[var(--coral-600)]">
              {tr("Không lấy được dữ liệu từ Lada")}
              {q.error instanceof ApiError ? `: ${q.error.detail ?? q.error.message}` : ""}
            </div>
          )}
          {q.isSuccess && dong.length === 0 && <div className="text-[var(--ink-500)]">{tr("Lada không còn nhật ký nào của đơn này trong 60 ngày gần nhất.")}</div>}
          {dong.length > 0 && (
            <div className="space-y-2">
              {dong.map((d, i) => (
                <div key={`${d.thoi_diem}|${i}`} className="rounded-lg border border-[var(--line)] p-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-500)]">
                    <span className="font-mono">{fmtDateTime(d.thoi_diem.replace("T", " ").replace(/\+07:00$/, ""))}</span>
                    {d.lan != null && <span>{tr("lần {0}", d.lan)}</span>}
                    {d.trang_thai_don && <Badge tone={trangThaiTone(d.trang_thai_don)}>{d.trang_thai_don}</Badge>}
                    {d.nguoi_giai_trinh?.ho_ten && <span>· {d.nguoi_giai_trinh.ho_ten}</span>}
                    {d.co_anh && <span>· {tr("có ảnh")}</span>}
                  </div>
                  <div className="mt-1 font-semibold">{d.ly_do || "—"}</div>
                  {d.ghi_chu && <div className="mt-0.5 whitespace-pre-wrap text-[var(--ink-700)]">{d.ghi_chu}</div>}
                  {(d.du_kien_xong || d.id_dat_linh_kien) && (
                    <div className="mt-1 text-xs text-[var(--ink-500)]">
                      {d.du_kien_xong && <span>{tr("Dự kiến xong")}: {fmtDate(d.du_kien_xong)}</span>}
                      {d.du_kien_xong && d.id_dat_linh_kien && " · "}
                      {d.id_dat_linh_kien && <span>{tr("ID đặt linh kiện")}: {d.id_dat_linh_kien}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
