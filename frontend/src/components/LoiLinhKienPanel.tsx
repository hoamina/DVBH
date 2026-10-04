import { useMemo, useState } from "react";
import { Badge, type BadgeTone } from "./ui/Badge";
import { Card } from "./ui/Card";
import { fmtDateTime, fmtVND, type DonBaoHanhOdooRow, type LinhKienLoiItem } from "../types";

// Tab "Loi linh kien" (CaseDetail) - nguon Odoo OCRM: danh sach linh kien bao loi cua ca
// (case_dvbh.linh_kien_loi, JSON array - migration 0122) + don bao hanh linh kien
// (don_bao_hanh_odoo). Linh kien bao loi <-> don bao hanh noi theo ma_linh_kien (Odoo khong co
// khoa lien ket truc tiep; ca 2 cung tro ve phieu su vu + san pham linh kien).

export function parseLinhKienLoi(raw: string | null | undefined): LinhKienLoiItem[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map((p, i) => ({ ...p, stt: Number(p?.stt) || i + 1 })) : [];
  } catch {
    return [];
  }
}

export const DON_BH_TRANG_THAI: Record<string, { label: string; tone: BadgeTone }> = {
  new: { label: "Chưa tiếp nhận", tone: "gray" },
  repairing: { label: "Đang sửa chữa", tone: "amber" },
  repaired: { label: "Đã sửa xong", tone: "ocean" },
  done: { label: "Hoàn thành", tone: "teal" },
  cancelled: { label: "Hủy đơn bảo hành", tone: "coral" },
  rejected: { label: "Từ chối bảo hành", tone: "coral" },
};

export function donBhTrangThai(code: string | null) {
  return DON_BH_TRANG_THAI[code ?? ""] ?? { label: code || "—", tone: "gray" as BadgeTone };
}

function nguonGocTone(v: string): BadgeTone {
  const t = v.toLowerCase();
  if (t.includes("sản xuất")) return "coral";
  if (t.includes("khách hàng")) return "amber";
  return "gray";
}

/** Gom don bao hanh theo ma_linh_kien; don khong khop linh kien bao loi nao -> "unmatched". */
export function matchDonBaoHanh(parts: LinhKienLoiItem[], orders: DonBaoHanhOdooRow[]) {
  const codes = new Set(parts.map((p) => p.ma_linh_kien).filter(Boolean));
  const byCode = new Map<string, DonBaoHanhOdooRow[]>();
  const unmatched: DonBaoHanhOdooRow[] = [];
  for (const o of orders) {
    if (o.ma_linh_kien && codes.has(o.ma_linh_kien)) {
      byCode.set(o.ma_linh_kien, [...(byCode.get(o.ma_linh_kien) ?? []), o]);
    } else {
      unmatched.push(o);
    }
  }
  return { byCode, unmatched };
}

export function DonBaoHanhOdooItem({ o }: { o: DonBaoHanhOdooRow }) {
  const st = donBhTrangThai(o.trang_thai);
  return (
    <div className={`rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 ${o.con_hieu_luc === 0 ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs font-bold text-[var(--ink-900)]">{o.ma_don ?? `#${o.odoo_id}`}</span>
          <Badge tone={st.tone}>{st.label}</Badge>
          {o.con_hieu_luc === 0 && <Badge tone="gray">Đã lưu trữ</Badge>}
        </div>
        <span className="text-xs text-[var(--ink-500)]">
          SL {o.so_luong ?? "—"}
          {o.thanh_tien ? ` · ${fmtVND(o.thanh_tien)}` : ""}
        </span>
      </div>
      {o.tinh_trang_loi && <div className="text-xs text-[var(--ink-700)] mt-1">Tình trạng lỗi: {o.tinh_trang_loi}</div>}
      {o.ghi_chu && <div className="text-xs text-[var(--ink-500)] mt-0.5">Ghi chú: {o.ghi_chu}</div>}
      <div className="text-[11px] text-[var(--ink-400)] mt-1">
        Tạo {fmtDateTime(o.ngay_tao)}
        {o.nguoi_tao ? ` bởi ${o.nguoi_tao}` : ""}
        {o.ngay_hoan_thanh ? ` · Hoàn thành ${fmtDateTime(o.ngay_hoan_thanh)}` : ""}
      </div>
    </div>
  );
}

function Step({ label, main, desc, tone }: { label: string; main: string; desc?: string; tone: string }) {
  return (
    <div className="relative pl-5">
      <span className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full ${tone}`} />
      <div className="text-[11px] font-semibold text-[var(--ink-400)] uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium text-[var(--ink-900)]">{main || "—"}</div>
      {desc && <div className="text-xs text-[var(--ink-500)] mt-0.5 whitespace-pre-line">{desc}</div>}
    </div>
  );
}

function PartCard({ p, orders }: { p: LinhKienLoiItem; orders: DonBaoHanhOdooRow[] }) {
  const nguyenNhan = [p.nhom_loi, p.nguyen_nhan_loi].filter(Boolean).join(" — ");
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="shrink-0 w-7 h-7 rounded-full bg-[var(--ocean-500)] text-white text-sm font-bold flex items-center justify-center">
            {p.stt}
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-[var(--ink-900)] leading-snug">{p.ten_linh_kien || "(chưa rõ tên linh kiện)"}</div>
            {p.ma_linh_kien && <div className="font-mono text-xs text-[var(--ink-400)]">{p.ma_linh_kien}</div>}
          </div>
        </div>
        {p.nguon_goc_loi && <Badge tone={nguonGocTone(p.nguon_goc_loi)}>{p.nguon_goc_loi}</Badge>}
      </div>

      <div className="space-y-2.5 border-l-2 border-[var(--line)] ml-3 pl-2">
        <Step label="Hiện tượng lỗi" main={p.hien_tuong_loi} desc={p.mo_ta_hien_tuong} tone="bg-[var(--coral-500)]" />
        <Step label="Nhóm lỗi — Nguyên nhân" main={nguyenNhan} desc={p.mo_ta_nguyen_nhan} tone="bg-[var(--amber-500)]" />
        <Step label="Cách thức xử lý" main={p.cach_thuc_xu_ly} desc={p.ghi_chu} tone="bg-[var(--teal-500)]" />
      </div>

      <div className="mt-3 pt-3 border-t border-[var(--line)]">
        <div className="text-xs font-semibold text-[var(--ink-500)] mb-1.5">Đơn bảo hành linh kiện ({orders.length})</div>
        {orders.length === 0 ? (
          <div className="text-xs italic text-[var(--ink-400)]">Chưa có đơn bảo hành cho linh kiện này.</div>
        ) : (
          <div className="space-y-1.5">
            {orders.map((o) => (
              <DonBaoHanhOdooItem key={o.odoo_id} o={o} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export function LoiLinhKienPanel({ parts, orders }: { parts: LinhKienLoiItem[]; orders: DonBaoHanhOdooRow[] }) {
  const [selected, setSelected] = useState<number | "all">("all");
  const { byCode, unmatched } = useMemo(() => matchDonBaoHanh(parts, orders), [parts, orders]);
  const ordersOf = (p: LinhKienLoiItem) => (p.ma_linh_kien ? byCode.get(p.ma_linh_kien) ?? [] : []);
  const coDon = parts.filter((p) => ordersOf(p).length > 0).length;
  const shown = selected === "all" ? parts : parts.filter((p) => p.stt === selected);

  if (parts.length === 0 && orders.length === 0) {
    return <div className="text-sm text-[var(--ink-400)] italic">Ca này chưa có linh kiện lỗi được báo (nguồn Odoo).</div>;
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          ["Linh kiện lỗi", parts.length, "text-[var(--ocean-600)]"],
          ["Đã có đơn BH", coDon, "text-[var(--teal-500)]"],
          ["Đơn bảo hành", orders.length, "text-[var(--ink-900)]"],
        ].map(([label, n, cls]) => (
          <Card key={label as string} className="px-3 py-2">
            <div className="text-[11px] font-semibold text-[var(--ink-400)] uppercase tracking-wide">{label}</div>
            <div className={`text-xl font-bold ${cls}`}>{n}</div>
          </Card>
        ))}
      </div>

      {parts.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(["all", ...parts.map((p) => p.stt)] as const).map((k) => {
            const p = k === "all" ? null : parts.find((x) => x.stt === k)!;
            const active = selected === k;
            return (
              <button
                key={String(k)}
                type="button"
                onClick={() => setSelected(k)}
                title={p ? `${p.ten_linh_kien} — ${p.hien_tuong_loi}` : "Hiện tất cả linh kiện"}
                className={`focus-ring inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  active
                    ? "bg-[var(--ocean-500)] border-[var(--ocean-500)] text-white"
                    : "bg-[var(--surface)] border-[var(--line)] text-[var(--ink-700)] hover:border-[var(--ocean-500)]"
                }`}
              >
                {p ? (
                  <>
                    ({p.stt}) <span className="max-w-[140px] truncate">{p.ten_linh_kien || p.ma_linh_kien}</span>
                    {ordersOf(p).length > 0 && <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white" : "bg-[var(--teal-500)]"}`} />}
                  </>
                ) : (
                  `Tất cả (${parts.length})`
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-3">
        {shown.map((p) => (
          <PartCard key={p.stt} p={p} orders={ordersOf(p)} />
        ))}
      </div>

      {unmatched.length > 0 && selected === "all" && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-[var(--ink-500)] mb-1.5">
            Đơn bảo hành không khớp linh kiện báo lỗi ({unmatched.length})
          </div>
          <div className="space-y-1.5">
            {unmatched.map((o) => (
              <div key={o.odoo_id}>
                <div className="text-xs text-[var(--ink-600)] mb-0.5">
                  {o.ten_linh_kien || "(chưa rõ linh kiện)"} {o.ma_linh_kien && <span className="font-mono text-[var(--ink-400)]">{o.ma_linh_kien}</span>}
                </div>
                <DonBaoHanhOdooItem o={o} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
