import { useMemo, useState, type ReactNode } from "react";
import { Badge, type BadgeTone } from "./ui/Badge";
import { Card } from "./ui/Card";
import { MaLinhKienLink } from "./HoSoLinhKienProvider";
import { Modal } from "./ui/Modal";
import { fmtDateTime, fmtVND, type DonBaoHanhOdooRow, type LinhKienLoiItem } from "../types";

// Tab "Loi linh kien" (CaseDetail) - nguon Odoo OCRM. Logic Odoo: don bao hanh linh kien
// (technical.service.warranty) la CON cua 1 linh kien bao loi (technical.service.broken.detail) cung
// phieu su vu. Odoo khong co khoa lien ket truc tiep giua 2 model (da kiem tra fields_get 2026-10-04) -
// ca 2 cung tro ve phieu (request_id) + san pham linh kien (part_id/product_id) -> noi theo ma_linh_kien
// trong pham vi 1 ca. Linh kien KHONG co don nao = "Khong tao don bao hanh".

const ODOO_WARRANTY_URL = "https://ocrm.happinno.com/odoo/technical-warranty/";

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
const FLOW = ["new", "repairing", "repaired", "done"] as const;

// Trang thai gui sua ben he "Sua chua bao hanh" (suachua day ve qua /api/partner/sync/sua-chua-trang-thai).
const SC_TRANG_THAI: Record<string, { label: string; tone: BadgeTone }> = {
  cho_gui: { label: "Sửa chữa: KTV đã đóng thùng", tone: "gray" },
  dang_gui: { label: "Sửa chữa: đang gửi về kho", tone: "amber" },
  kho_da_nhan: { label: "Sửa chữa: kho đã nhận", tone: "ocean" },
  dang_xu_ly: { label: "Sửa chữa: đang xử lý", tone: "ocean" },
  cho_tra: { label: "Sửa chữa: chờ trả KTV", tone: "orange" },
  dang_tra: { label: "Sửa chữa: đang trả KTV", tone: "orange" },
  hoan_tat: { label: "Sửa chữa: KTV đã nhận lại", tone: "teal" },
  tu_choi: { label: "Sửa chữa: từ chối/huỷ", tone: "coral" },
  // KTV xac nhan don Odoo tao nham, khong can gui bao hanh (suachua v1.014, 09/10/2026) - mo lai -> null.
  khong_gui: { label: "Sửa chữa: KTV hủy đơn lỗi", tone: "gray" },
};
export function scTrangThai(code: string | null | undefined) {
  if (!code) return null;
  return SC_TRANG_THAI[code] ?? { label: `Sửa chữa: ${code}`, tone: "gray" as BadgeTone };
}

export function donBhTrangThai(code: string | null) {
  return DON_BH_TRANG_THAI[code ?? ""] ?? { label: code || "—", tone: "gray" as BadgeTone };
}

function nguonGocTone(v: string): BadgeTone {
  const t = v.toLowerCase();
  if (t.includes("sản xuất")) return "coral";
  if (t.includes("khách hàng")) return "amber";
  return "gray";
}

/** Gan moi don bao hanh cho DUNG 1 linh kien bao loi (cha). Noi theo ma_linh_kien; neu nhieu dong linh
 * kien bao loi trung ma (KTV khai nhieu dong cung 1 linh kien, vd SC261002619: 4 dong "Ro le nhiet" chi
 * 1 don) thi chia don theo thu tu tao (odoo_id) cho tung dong theo STT: don thu i -> dong thu i, don du
 * (nhieu don hon so dong) don vao dong cuoi. Dong khong nhan duoc don nao = "Khong tao don bao hanh".
 * Don khong khop ma nao -> "unmatched". */
export function matchDonBaoHanh(parts: LinhKienLoiItem[], orders: DonBaoHanhOdooRow[]) {
  const partsByCode = new Map<string, LinhKienLoiItem[]>();
  for (const p of [...parts].sort((a, b) => a.stt - b.stt)) {
    if (p.ma_linh_kien) partsByCode.set(p.ma_linh_kien, [...(partsByCode.get(p.ma_linh_kien) ?? []), p]);
  }
  const ordersByCode = new Map<string, DonBaoHanhOdooRow[]>();
  const unmatched: DonBaoHanhOdooRow[] = [];
  for (const o of [...orders].sort((a, b) => a.odoo_id - b.odoo_id)) {
    if (o.ma_linh_kien && partsByCode.has(o.ma_linh_kien)) {
      ordersByCode.set(o.ma_linh_kien, [...(ordersByCode.get(o.ma_linh_kien) ?? []), o]);
    } else {
      unmatched.push(o);
    }
  }
  const byStt = new Map<number, DonBaoHanhOdooRow[]>();
  const parentOf = new Map<number, LinhKienLoiItem>(); // odoo_id -> linh kien cha
  for (const [code, list] of ordersByCode) {
    const ps = partsByCode.get(code)!;
    list.forEach((o, i) => {
      const p = ps[Math.min(i, ps.length - 1)];
      byStt.set(p.stt, [...(byStt.get(p.stt) ?? []), o]);
      parentOf.set(o.odoo_id, p);
    });
  }
  return { byStt, parentOf, unmatched };
}

// ---------------------------------------------------------------------------------------------
// The don bao hanh (rut gon, bam de xem chi tiet)
// ---------------------------------------------------------------------------------------------

export function DonBaoHanhOdooItem({ o, onOpen, parentLabel }: { o: DonBaoHanhOdooRow; onOpen?: () => void; parentLabel?: string }) {
  const st = donBhTrangThai(o.trang_thai);
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className={`focus-ring w-full text-left rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 transition-colors ${
        onOpen ? "hover:border-[var(--ocean-500)] hover:bg-[var(--ocean-100)]/20 cursor-pointer" : ""
      } ${o.con_hieu_luc === 0 ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs font-bold text-[var(--ink-900)]">{o.ma_don ?? `#${o.odoo_id}`}</span>
          <Badge tone={st.tone}>{st.label}</Badge>
          {scTrangThai(o.sc_trang_thai) && <Badge tone={scTrangThai(o.sc_trang_thai)!.tone}>{scTrangThai(o.sc_trang_thai)!.label}</Badge>}
          {o.con_hieu_luc === 0 && <Badge tone="gray">Đã lưu trữ</Badge>}
        </div>
        <span className="text-xs text-[var(--ink-500)]">
          SL {o.so_luong ?? "—"}
          {o.thanh_tien ? ` · ${fmtVND(o.thanh_tien)}` : ""}
          {onOpen && <span className="ml-2 text-[var(--ocean-600)] font-semibold">Chi tiết ›</span>}
        </span>
      </div>
      {parentLabel && <div className="text-xs text-[var(--ink-600)] mt-1">{parentLabel}</div>}
      {o.tinh_trang_loi && <div className="text-xs text-[var(--ink-700)] mt-1">Tình trạng lỗi: {o.tinh_trang_loi}</div>}
      <div className="text-[11px] text-[var(--ink-400)] mt-1">
        Tạo {fmtDateTime(o.ngay_tao)}
        {o.nguoi_tao ? ` bởi ${o.nguoi_tao}` : ""}
        {o.ngay_hoan_thanh ? ` · Hoàn thành ${fmtDateTime(o.ngay_hoan_thanh)}` : ""}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// Modal chi tiet don bao hanh
// ---------------------------------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 border-b border-[var(--line)] last:border-0 text-sm">
      <div className="w-36 shrink-0 text-[var(--ink-400)] text-xs font-semibold uppercase tracking-wide pt-0.5">{label}</div>
      <div className="flex-1 min-w-0 text-[var(--ink-900)] break-words">{value ?? "—"}</div>
    </div>
  );
}

function StatusFlow({ code }: { code: string | null }) {
  const closedBad = code === "cancelled" || code === "rejected";
  const idx = FLOW.indexOf((code ?? "") as (typeof FLOW)[number]);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {FLOW.map((s, i) => {
        const reached = !closedBad && idx >= i;
        return (
          <div key={s} className="flex items-center gap-1">
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                reached
                  ? i === idx
                    ? "bg-[var(--ocean-500)] border-[var(--ocean-500)] text-white"
                    : "bg-[var(--ocean-100)] border-[var(--ocean-100)] text-[var(--ocean-800)]"
                  : "border-[var(--line)] text-[var(--ink-400)]"
              }`}
            >
              {DON_BH_TRANG_THAI[s].label}
            </span>
            {i < FLOW.length - 1 && <span className="text-[var(--ink-400)] text-xs">›</span>}
          </div>
        );
      })}
      {closedBad && <Badge tone="coral">{donBhTrangThai(code).label}</Badge>}
    </div>
  );
}

export function DonBaoHanhOdooModal({
  order,
  parts,
  orders,
  onClose,
  onOpenOrder,
}: {
  order: DonBaoHanhOdooRow | null;
  parts: LinhKienLoiItem[];
  orders: DonBaoHanhOdooRow[];
  onClose: () => void;
  onOpenOrder: (o: DonBaoHanhOdooRow) => void;
}) {
  const { parentOf } = useMemo(() => matchDonBaoHanh(parts, orders), [parts, orders]);
  if (!order) return null;
  const o = order;
  const parent = parentOf.get(o.odoo_id) ?? null;
  // Don "anh em": cung linh kien cha (hoac cung ma neu don khong khop linh kien bao loi nao)
  const siblings = orders.filter((x) =>
    x.odoo_id !== o.odoo_id &&
    (parent ? parentOf.get(x.odoo_id)?.stt === parent.stt : !!x.ma_linh_kien && x.ma_linh_kien === o.ma_linh_kien),
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={`Đơn bảo hành ${o.ma_don ?? `#${o.odoo_id}`}`}
      width="max-w-2xl"
      headerExtra={
        <a
          href={`${ODOO_WARRANTY_URL}${o.odoo_id}`}
          target="_blank"
          rel="noreferrer"
          className="focus-ring text-xs font-semibold text-[var(--ocean-600)] hover:underline px-2 py-1 rounded"
        >
          Mở trên Odoo ↗
        </a>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge tone={donBhTrangThai(o.trang_thai).tone} solid>
              {donBhTrangThai(o.trang_thai).label}
            </Badge>
            {o.con_hieu_luc === 0 && <Badge tone="gray">Đã lưu trữ trên Odoo</Badge>}
            <span className="text-xs text-[var(--ink-400)]">Ca {o.case_id ?? "—"}</span>
          </div>
          {scTrangThai(o.sc_trang_thai) && (
            <div className="mb-2 flex items-center gap-2 flex-wrap text-xs text-[var(--ink-500)]">
              <Badge tone={scTrangThai(o.sc_trang_thai)!.tone}>{scTrangThai(o.sc_trang_thai)!.label}</Badge>
              {o.sc_ma_phieu && <span className="font-mono">{o.sc_ma_phieu}</span>}
              {o.sc_chi_tiet && <span>· {o.sc_chi_tiet}</span>}
              {o.sc_cap_nhat && <span>· cập nhật {fmtDateTime(o.sc_cap_nhat)}</span>}
            </div>
          )}
          <StatusFlow code={o.trang_thai} />
        </div>

        <Card className="p-4">
          <div className="font-display font-bold text-sm mb-2">Thông tin bảo hành</div>
          <InfoRow
            label="Linh kiện"
            value={
              <span>
                {o.ten_linh_kien ?? "—"} {o.ma_linh_kien && <span className="font-mono text-xs text-[var(--ink-400)]">(<MaLinhKienLink ma={o.ma_linh_kien} ten={o.ten_linh_kien} />)</span>}
              </span>
            }
          />
          <InfoRow label="Số lượng" value={o.so_luong ?? "—"} />
          <InfoRow label="Đơn giá" value={o.don_gia ? fmtVND(o.don_gia) : "—"} />
          <InfoRow label="Thành tiền" value={o.thanh_tien ? fmtVND(o.thanh_tien) : "—"} />
          <InfoRow label="Tình trạng lỗi" value={o.tinh_trang_loi} />
          <InfoRow label="Ghi chú" value={o.ghi_chu} />
        </Card>

        <Card className="p-4">
          <div className="font-display font-bold text-sm mb-2">Thông tin cập nhật</div>
          <InfoRow label="Người tạo" value={o.nguoi_tao} />
          <InfoRow label="Ngày tạo" value={fmtDateTime(o.ngay_tao)} />
          <InfoRow label="Ngày hoàn thành" value={fmtDateTime(o.ngay_hoan_thanh)} />
          <InfoRow label="Cập nhật trên Odoo" value={fmtDateTime(o.ngay_cap_nhat_odoo)} />
          <InfoRow label="Đồng bộ về dvbh" value={fmtDateTime(o.ngay_dong_bo)} />
        </Card>

        <Card className="p-4">
          <div className="font-display font-bold text-sm mb-2">Linh kiện báo lỗi (cha)</div>
          {parent ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-[var(--ocean-500)] text-white text-xs font-bold flex items-center justify-center">{parent.stt}</span>
                <span className="font-semibold text-sm">{parent.ten_linh_kien}</span>
                {parent.nguon_goc_loi && <Badge tone={nguonGocTone(parent.nguon_goc_loi)}>{parent.nguon_goc_loi}</Badge>}
              </div>
              <InfoRow label="Hiện tượng lỗi" value={[parent.hien_tuong_loi, parent.mo_ta_hien_tuong].filter(Boolean).join(" — ")} />
              <InfoRow label="Nhóm lỗi — Nguyên nhân" value={[parent.nhom_loi, parent.nguyen_nhan_loi, parent.mo_ta_nguyen_nhan].filter(Boolean).join(" — ")} />
              {parent.nhom_linh_kien && <InfoRow label="Nhóm linh kiện" value={parent.nhom_linh_kien} />}
              <InfoRow label="Cách thức xử lý" value={[parent.cach_thuc_xu_ly, parent.mo_ta_cach_xu_ly].filter(Boolean).join(" — ")} />
              {parent.ghi_chu && <InfoRow label="Ghi chú" value={parent.ghi_chu} />}
            </>
          ) : (
            <div className="text-sm italic text-[var(--ink-400)]">
              Không tìm thấy linh kiện báo lỗi cùng mã trong ca này (đơn tạo cho linh kiện chưa được khai báo lỗi).
            </div>
          )}
        </Card>

        {siblings.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-[var(--ink-500)] mb-1.5">Đơn bảo hành khác của cùng linh kiện ({siblings.length})</div>
            <div className="space-y-1.5">
              {siblings.map((s) => (
                <DonBaoHanhOdooItem key={s.odoo_id} o={s} onOpen={() => onOpenOrder(s)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// Danh sach don Odoo phang (tab "Bao hanh") - kem nhan "thuoc linh kien (n)" + modal chi tiet.
export function DonBaoHanhOdooList({ parts, orders }: { parts: LinhKienLoiItem[]; orders: DonBaoHanhOdooRow[] }) {
  const [open, setOpen] = useState<DonBaoHanhOdooRow | null>(null);
  const { parentOf } = useMemo(() => matchDonBaoHanh(parts, orders), [parts, orders]);
  return (
    <>
      <div className="space-y-1.5">
        {orders.map((o) => {
          const p = parentOf.get(o.odoo_id);
          const label = p
            ? `Thuộc linh kiện lỗi (${p.stt}) ${p.ten_linh_kien}`
            : `${o.ten_linh_kien ?? "(chưa rõ linh kiện)"} — không khớp linh kiện báo lỗi`;
          return <DonBaoHanhOdooItem key={o.odoo_id} o={o} parentLabel={label} onOpen={() => setOpen(o)} />;
        })}
      </div>
      <DonBaoHanhOdooModal order={open} parts={parts} orders={orders} onClose={() => setOpen(null)} onOpenOrder={setOpen} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// The linh kien bao loi + cay don bao hanh con
// ---------------------------------------------------------------------------------------------

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

function PartCard({ p, orders, onOpen }: { p: LinhKienLoiItem; orders: DonBaoHanhOdooRow[]; onOpen: (o: DonBaoHanhOdooRow) => void }) {
  const nguyenNhan = [p.nhom_loi, p.nguyen_nhan_loi].filter(Boolean).join(" — ");
  const coDon = orders.length > 0;
  return (
    <Card className={`p-4 border-l-4 ${coDon ? "border-l-[var(--teal-500)]" : "border-l-slate-300"}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="shrink-0 w-7 h-7 rounded-full bg-[var(--ocean-500)] text-white text-sm font-bold flex items-center justify-center">
            {p.stt}
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-[var(--ink-900)] leading-snug">{p.ten_linh_kien || "(chưa rõ tên linh kiện)"}</div>
            {(p.ma_linh_kien || p.nhom_linh_kien) && (
              <div className="text-xs text-[var(--ink-400)]">
                {p.ma_linh_kien && <MaLinhKienLink ma={p.ma_linh_kien} ten={p.ten_linh_kien} className="font-mono" />}
                {p.ma_linh_kien && p.nhom_linh_kien && " · "}
                {p.nhom_linh_kien && <span>Nhóm LK: {p.nhom_linh_kien}</span>}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {coDon ? <Badge tone="teal">✓ Đã tạo đơn BH ({orders.length})</Badge> : <Badge tone="gray">Không tạo đơn BH</Badge>}
          {p.nguon_goc_loi && <Badge tone={nguonGocTone(p.nguon_goc_loi)}>{p.nguon_goc_loi}</Badge>}
        </div>
      </div>

      <div className="space-y-2.5 border-l-2 border-[var(--line)] ml-3 pl-2">
        <Step label="Hiện tượng lỗi" main={p.hien_tuong_loi} desc={p.mo_ta_hien_tuong} tone="bg-[var(--coral-500)]" />
        <Step label="Nhóm lỗi — Nguyên nhân" main={nguyenNhan} desc={p.mo_ta_nguyen_nhan} tone="bg-[var(--amber-500)]" />
        <Step label="Cách thức xử lý" main={p.cach_thuc_xu_ly} desc={p.mo_ta_cach_xu_ly} tone="bg-[var(--teal-500)]" />
      </div>
      {p.ghi_chu && <div className="text-xs text-[var(--ink-500)] mt-2 ml-3">Ghi chú: {p.ghi_chu}</div>}

      <div className="mt-3 pt-3 border-t border-[var(--line)]">
        <div className="text-xs font-semibold text-[var(--ink-500)] mb-1.5">Đơn bảo hành linh kiện ({orders.length})</div>
        {coDon ? (
          // Cay con: duong noi doc + nhanh ngang toi tung don
          <div className="ml-2 border-l-2 border-[var(--teal-500)]/40 space-y-1.5">
            {orders.map((o) => (
              <div key={o.odoo_id} className="relative pl-4">
                <span className="absolute left-0 top-4 w-3 border-t-2 border-[var(--teal-500)]/40" />
                <DonBaoHanhOdooItem o={o} onOpen={() => onOpen(o)} />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs italic text-[var(--ink-400)]">Linh kiện này không tạo đơn bảo hành.</div>
        )}
      </div>
    </Card>
  );
}

type Filter = "all" | "co-don" | "khong-don" | number;

export function LoiLinhKienPanel({ parts, orders }: { parts: LinhKienLoiItem[]; orders: DonBaoHanhOdooRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<DonBaoHanhOdooRow | null>(null);
  const { byStt, unmatched } = useMemo(() => matchDonBaoHanh(parts, orders), [parts, orders]);
  const ordersOf = (p: LinhKienLoiItem) => byStt.get(p.stt) ?? [];
  const coDon = parts.filter((p) => ordersOf(p).length > 0);
  const khongDon = parts.filter((p) => ordersOf(p).length === 0);
  const shown =
    filter === "all" ? parts : filter === "co-don" ? coDon : filter === "khong-don" ? khongDon : parts.filter((p) => p.stt === filter);

  if (parts.length === 0 && orders.length === 0) {
    return <div className="text-sm text-[var(--ink-400)] italic">Ca này chưa có linh kiện lỗi được báo (nguồn Odoo).</div>;
  }

  const chip = (key: Filter, content: ReactNode, title?: string) => {
    const active = filter === key;
    return (
      <button
        key={String(key)}
        type="button"
        title={title}
        onClick={() => setFilter(key)}
        className={`focus-ring inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
          active
            ? "bg-[var(--ocean-500)] border-[var(--ocean-500)] text-white"
            : "bg-[var(--surface)] border-[var(--line)] text-[var(--ink-700)] hover:border-[var(--ocean-500)]"
        }`}
      >
        {content}
      </button>
    );
  };

  return (
    <div>
      {/* Chi giu 1 bo loc dang chip (2026-10-04) - truoc day con 1 luoi 4 the so dem bam duoc ngay tren,
          trung chuc nang voi hang chip nay. */}
      {parts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {chip("all", `Tất cả (${parts.length})`)}
          {chip("co-don", <>✓ Đã tạo đơn ({coDon.length})</>)}
          {chip("khong-don", <>○ Không tạo đơn ({khongDon.length})</>)}
          {parts.length > 1 && <span className="w-px bg-[var(--line)] mx-1" />}
          {parts.length > 1 &&
            parts.map((p) =>
              chip(
                p.stt,
                <>
                  ({p.stt}) <span className="max-w-[140px] truncate">{p.ten_linh_kien || p.ma_linh_kien}</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      ordersOf(p).length > 0 ? (filter === p.stt ? "bg-white" : "bg-[var(--teal-500)]") : "bg-slate-300"
                    }`}
                  />
                </>,
                `${p.ten_linh_kien} — ${ordersOf(p).length > 0 ? `${ordersOf(p).length} đơn bảo hành` : "không tạo đơn bảo hành"}`,
              ),
            )}
        </div>
      )}

      <div className="space-y-3">
        {shown.map((p) => (
          <PartCard key={p.stt} p={p} orders={ordersOf(p)} onOpen={setOpen} />
        ))}
        {shown.length === 0 && <div className="text-sm italic text-[var(--ink-400)]">Không có linh kiện nào trong nhóm này.</div>}
      </div>

      {unmatched.length > 0 && filter === "all" && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-[var(--ink-500)] mb-1.5">
            Đơn bảo hành không khớp linh kiện báo lỗi ({unmatched.length})
          </div>
          <div className="space-y-1.5">
            {unmatched.map((o) => (
              <DonBaoHanhOdooItem
                key={o.odoo_id}
                o={o}
                parentLabel={`${o.ten_linh_kien ?? "(chưa rõ linh kiện)"}${o.ma_linh_kien ? ` · ${o.ma_linh_kien}` : ""}`}
                onOpen={() => setOpen(o)}
              />
            ))}
          </div>
        </div>
      )}

      <DonBaoHanhOdooModal order={open} parts={parts} orders={orders} onClose={() => setOpen(null)} onOpenOrder={setOpen} />
    </div>
  );
}
