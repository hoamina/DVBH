import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { fmtDateTime, type CancelRequestItem } from "../types";

// "Yêu cầu hủy" (CaseDetail) - nguon Odoo OCRM. Khac Lịch hẹn: Odoo CHI luu 1 trang thai xin huy HIEN
// TAI (xin lai thi ghi de, khong co lich su nhieu lan) nen day la 1 the trang thai, khong phai timeline
// nhieu dong. Gom phia KTV/CTV de nghi (dang_cho_duyet, nguoi/ly do/ghi chu/thoi diem xin huy) va phia
// CSKH quyet dinh (ly do/ghi chu quyet dinh, ghi chu KTV, ly do/ghi chu huy cuoi cung).

export function parseCancelRequest(raw: string | null | undefined): CancelRequestItem[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-1.5 border-b border-[var(--line)] last:border-0 text-sm">
      <div className="w-36 shrink-0 text-[var(--ink-400)] text-xs font-semibold uppercase tracking-wide pt-0.5">{label}</div>
      <div className="flex-1 min-w-0 text-[var(--ink-900)] break-words">{value}</div>
    </div>
  );
}

export function CancelRequestPanel({ items }: { items: CancelRequestItem[] }) {
  const item = items[0];
  if (!item) {
    return <div className="text-sm text-[var(--ink-400)] italic">Ca này chưa từng có yêu cầu xin hủy (nguồn Odoo).</div>;
  }
  const coQuyetDinh = item.ly_do_huy_cuoi || item.ghi_chu_huy_cuoi || item.ly_do_quyet_dinh_cskh || item.ghi_chu_quyet_dinh_cskh;
  return (
    <div className="space-y-3">
      <Card className={`p-4 border-l-4 ${item.dang_cho_duyet ? "border-l-[var(--amber-500)]" : "border-l-slate-300"}`}>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {item.dang_cho_duyet ? (
            <Badge tone="amber" solid>
              Đang chờ duyệt hủy
            </Badge>
          ) : (
            <Badge tone="gray">Đã xử lý / không còn chờ duyệt</Badge>
          )}
        </div>
        <div className="text-xs font-semibold text-[var(--ink-500)] mb-1">Yêu cầu từ KTV/CTV</div>
        <Row label="Người xin hủy" value={item.nguoi_xin_huy} />
        <Row label="Thời điểm xin hủy" value={item.thoi_diem_xin_huy ? fmtDateTime(item.thoi_diem_xin_huy) : null} />
        <Row label="Lý do xin hủy" value={item.ly_do_xin_huy} />
        <Row label="Ghi chú xin hủy" value={item.ghi_chu_xin_huy} />
      </Card>

      {coQuyetDinh && (
        <Card className="p-4">
          <div className="text-xs font-semibold text-[var(--ink-500)] mb-1">Quyết định của CSKH</div>
          <Row label="Lý do quyết định" value={item.ly_do_quyet_dinh_cskh} />
          <Row label="Ghi chú CSKH" value={item.ghi_chu_quyet_dinh_cskh} />
          <Row label="Ghi chú KTV" value={item.ghi_chu_ktv_xin_huy} />
          <Row label="Lý do hủy cuối" value={item.ly_do_huy_cuoi} />
          <Row label="Ghi chú hủy cuối" value={item.ghi_chu_huy_cuoi} />
        </Card>
      )}
    </div>
  );
}
