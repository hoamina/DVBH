import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { fmtDate, fmtDateTime, type Paged } from "../types";
import { Badge, type BadgeTone } from "./ui/Badge";
import { LoadingInline } from "./ui/LoadingInline";
import { StatCard } from "./ui/StatCard";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { linhKienLoaiDonLabel, linhKienTrangThaiLabel } from "../lib/linhKienTimeline";
import { fmtSl, TonKhoCapNhatLine } from "./TonKhoLk";
import { usePurchaseWarrantyData } from "../hooks/usePurchaseWarrantyData";
import { matchPoDatHangByLinhKien, matchMuaHangByLinhKien, matchBaoHanhByLinhKien } from "../lib/purchaseWarrantyMatch";
import type { SheetRow } from "../lib/purchaseWarrantySync";

// "Ho so linh kien" (GD2 ton kho linh kien, 2026-10-08) - bam 1 ma LK o tab "Linh kiện thiếu": tra loi nhanh
// "dang ton o kho nao, SL bao nhieu, KTV nao dang giu, ca nao dang cho, kho xu ly thieu hang chua, don/PO the nao".
//   - Ton tung kho / KTV: ton_kho_lk (keo tu linh-kien-app, /api/ton-kho-lk/ma/:ma).
//   - Ca dang bao thieu: /api/missing-parts?ma_lk= (dung scope khu vuc cua nguoi xem).
//   - Lich su dat hang + ticket thieu hang: linh-kien-app, goi luc mo (/api/ton-kho-lk/ma/:ma/lich-su, khong luu).
//   - PO / mua hang / bao hanh (Google Sheet, usePurchaseWarrantyData - cache IndexedDB san co).
// Mo tu BAT KY dau qua HoSoLinhKienProvider / <MaLinhKienLink> (2026-10-08).

interface TonRow {
  nguon: "kho" | "ktv";
  ma_kho: string;
  ten_kho: string | null;
  ma_ktv: string | null;
  ten_ktv: string | null;
  khu_vuc_ma: string | null;
  cuoi_ky: number | null;
  nhom: "MB" | "MN" | null;
}

interface CaThieu {
  id: string;
  khach_hang: string | null;
  khu_vuc: string | null;
  ky_thuat_vien: string | null;
  tuoi_ton: number | null;
  nhom_kh: string | null;
  last_ngay_yeu_cau_co_hang: string | null;
}

interface LichSuOrder {
  id: string;
  loai_don: string;
  loai_de_xuat: string | null;
  trang_thai_hien_tai: string | null;
  so_luong_de_xuat: number | null;
  so_luong_thuc_xuat: number | null;
  ngay_tao: string;
  khu_vuc_ma: string | null;
  nguoi_nhan_hang_ten: string | null;
  case_ids: string | null;
}

interface LichSuThieuLk {
  id: string;
  dat_don_hang_id: string;
  ly_do: string | null;
  ngay_tao: string;
  ngay_du_kien_co_hang: string | null;
  ngay_hang_ve_thuc_te: string | null;
  trang_thai: string | null;
  ngay_cap_nhat: string | null;
}

const THIEU_LK_TRANG_THAI: Record<string, { label: string; tone: BadgeTone; mo: boolean }> = {
  "Cho kho xu ly": { label: "Chờ kho xử lý", tone: "coral", mo: true },
  "Kho da tiep nhan": { label: "Kho đã tiếp nhận", tone: "amber", mo: true },
  "Kho xac nhan hang da ve": { label: "Kho xác nhận hàng đã về", tone: "teal", mo: false },
  "Kho tu choi sai TT": { label: "Kho từ chối (sai thông tin)", tone: "gray", mo: false },
  "Da huy bo": { label: "Đã hủy bỏ", tone: "gray", mo: false },
  "Da ket thuc": { label: "Đã kết thúc", tone: "gray", mo: false },
};

// Bo cuc 2026-10-09 (phan hoi "khong co diem nhan va phan tach"): moi phan la 1 the co vach mau ben trai + so dem,
// gom thanh cac VUNG danh so theo luong xu ly (Nhu cau -> Nguon hang -> Cung ung -> Tham khao). Phan rong chi con
// 1 dong tieu de mo (khong chiem cho), de mat tap trung vao phan co du lieu.
const TONE_VAR: Record<BadgeTone, { solid: string; tint: string; text: string }> = {
  ocean: { solid: "var(--ocean-500)", tint: "var(--ocean-100)", text: "var(--ocean-600)" },
  teal: { solid: "var(--teal-500)", tint: "var(--teal-100)", text: "var(--teal-600)" },
  amber: { solid: "var(--amber-500)", tint: "var(--amber-100)", text: "var(--amber-600)" },
  coral: { solid: "var(--coral-500)", tint: "var(--coral-100)", text: "var(--coral-600)" },
  orange: { solid: "var(--orange-500)", tint: "var(--orange-100)", text: "var(--orange-600)" },
  gray: { solid: "var(--ink-400)", tint: "var(--bg)", text: "var(--ink-600)" },
};

function Zone({ n, title, hint, right, children }: { n: number; title: string; hint?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 min-w-0">
      <div className="flex items-center gap-2.5">
        <span className="w-6 h-6 rounded-full bg-[var(--ink-900)] text-white text-xs font-bold flex items-center justify-center shrink-0">{n}</span>
        <h4 className="font-display font-bold text-[var(--ink-900)] text-sm uppercase tracking-wide whitespace-nowrap">{title}</h4>
        {hint && <span className="text-xs text-[var(--ink-400)] hidden lg:inline whitespace-nowrap">— {hint}</span>}
        <div className="flex-1 h-px bg-[var(--line)]" />
        {right}
      </div>
      {children}
    </section>
  );
}

function Section({
  title,
  icon,
  tone,
  count,
  emptyText,
  right,
  children,
}: {
  title: string;
  icon: string;
  tone: BadgeTone;
  /** undefined = dang tai / khong dem */
  count?: number;
  /** co gia tri = phan nay rong -> chi hien 1 dong tieu de mo kem ly do, khong render than */
  emptyText?: string | null;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const c = TONE_VAR[tone];
  const rong = !!emptyText;
  return (
    <div
      className={`min-w-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] overflow-hidden ${rong ? "opacity-70" : "shadow-[0_1px_3px_rgba(15,37,54,0.06)]"}`}
      style={{ borderLeft: `4px solid ${rong ? "var(--line)" : c.solid}` }}
    >
      <div className={`flex items-center gap-2 px-3 py-2 ${rong ? "" : "border-b border-[var(--line)]"}`} style={rong ? undefined : { background: `color-mix(in srgb, ${c.tint} 55%, transparent)` }}>
        <span className="text-sm leading-none">{icon}</span>
        <span className="font-semibold text-sm" style={{ color: rong ? "var(--ink-500)" : c.text }}>
          {title}
        </span>
        {count !== undefined && (
          <span
            className="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-bold"
            style={count > 0 ? { background: c.solid, color: "white" } : { background: "var(--bg)", color: "var(--ink-400)" }}
          >
            {count}
          </span>
        )}
        {rong && <span className="text-xs text-[var(--ink-400)] italic truncate">· {emptyText}</span>}
        {right && <span className="ml-auto text-xs">{right}</span>}
      </div>
      {!rong && <div className="p-2">{children}</div>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-xs text-[var(--ink-400)] italic py-1.5 px-1">{text}</div>;
}

function TuoiBadge({ ngay }: { ngay: number | null }) {
  if (ngay === null || ngay === undefined) return <span className="text-[var(--ink-400)]">—</span>;
  const tone: BadgeTone = ngay >= 15 ? "coral" : ngay >= 7 ? "amber" : "gray";
  return <Badge tone={tone}>{ngay} ngày</Badge>;
}

const PO_DAT_HANG_COLS: { key: string; label: string }[] = [
  { key: "id", label: "ID đặt LK" },
  { key: "doiTac", label: "Đối tác" },
  { key: "khoCanDat", label: "Kho cần đặt" },
  { key: "soLuongDat", label: "SL đặt" },
  { key: "slNhapTheoAmis", label: "SL nhập Amis" },
  { key: "soLuongConThieu", label: "SL còn thiếu" },
  { key: "trangThai", label: "Trạng thái" },
  { key: "tocDoHangVe", label: "Tốc độ về" },
  { key: "canhBao", label: "Cảnh báo" },
  { key: "ngayDuKienGanNhat", label: "Ngày dự kiến hàng về" },
  { key: "ngayVeGanNhatToanQuoc", label: "Ngày về gần nhất toàn quốc" },
  { key: "ngayCapNhat", label: "Cập nhật" },
];

const MUA_HANG_COLS: { key: string; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "loaiDeXuat", label: "Loại đề xuất" },
  { key: "soLuongDeXuat", label: "SL đề xuất" },
  { key: "trangThaiDuyet", label: "Trạng thái duyệt" },
  { key: "soLuongThucXuat", label: "SL thực xuất" },
  { key: "trangThaiGuiHang", label: "Trạng thái gửi hàng" },
  { key: "ngayKtvNhanHang", label: "Ngày KTV nhận" },
  { key: "giaDeXuat", label: "Giá đề xuất" },
];

const BAO_HANH_COLS: { key: string; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "trangThai", label: "Trạng thái" },
  { key: "modelSanPham", label: "Model" },
  { key: "serial", label: "Serial" },
  { key: "phuongAnXuLy", label: "Phương án xử lý" },
  { key: "ngayGui", label: "Ngày gửi" },
  { key: "ngayGioTraXong", label: "Ngày trả xong" },
  { key: "nguoiSua", label: "Người sửa" },
];

function SheetRowsTable({ rows, columns }: { rows: SheetRow[]; columns: { key: string; label: string }[] }) {
  if (rows.length === 0) return <Empty text="Không có dữ liệu liên quan." />;
  return (
    <div className="overflow-auto max-h-72">
      <table className="dense w-full text-xs">
        <thead className={THEAD}>
          <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
            {columns.map((c) => (
              <th key={c.key} className="py-1.5 px-2 whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[var(--line)] last:border-0 even:bg-[var(--surface-100)]/60">
              {columns.map((c) => (
                <td key={c.key} className="py-1.5 px-2">
                  {r[c.key] || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TH = "py-1.5 px-2";
const THEAD = "sticky top-0 z-[1] bg-[var(--surface)]";
const TR = "border-b border-[var(--line)] last:border-0 even:bg-[var(--surface-100)]/60";

export function HoSoLinhKien({ maLk, openCase }: { maLk: string; openCase?: (id: string, tab?: string) => void }) {
  const { poDatHang, muaHang, baoHanh } = usePurchaseWarrantyData();
  const po = useMemo(() => matchPoDatHangByLinhKien(maLk, poDatHang), [maLk, poDatHang]);
  const muaHangRows = useMemo(() => matchMuaHangByLinhKien(maLk, muaHang), [maLk, muaHang]);
  const baoHanhRows = useMemo(() => matchBaoHanhByLinhKien(maLk, baoHanh), [maLk, baoHanh]);
  const tonQ = useQuery({ queryKey: ["ton-kho-lk-ma", maLk], queryFn: () => api.get<{ rows: TonRow[] }>(`/ton-kho-lk/ma/${encodeURIComponent(maLk)}`) });
  const caQ = useQuery({
    queryKey: ["missing-parts-ma-lk", maLk],
    queryFn: () => api.get<Paged<CaThieu>>(`/missing-parts?ma_lk=${encodeURIComponent(maLk)}&pageSize=200`),
  });
  const lsQ = useQuery({
    queryKey: ["ton-kho-lk-lich-su", maLk],
    queryFn: () => api.get<{ orders: LichSuOrder[]; thieu_lk: LichSuThieuLk[] }>(`/ton-kho-lk/ma/${encodeURIComponent(maLk)}/lich-su`),
    retry: false,
  });

  const ton = tonQ.data?.rows ?? [];
  const kho = ton.filter((r) => r.nguon === "kho" || !!r.nhom);
  const ktv = ton.filter((r) => r.nguon === "ktv" && !r.nhom && (r.cuoi_ky ?? 0) > 0);
  const cases = caQ.data?.rows ?? [];
  const khuVucCa = useMemo(() => new Set(cases.map((c) => shortKhuVuc(c.khu_vuc))), [cases]);
  const ktvSorted = useMemo(
    () => [...ktv].sort((a, b) => Number(khuVucCa.has(b.khu_vuc_ma ?? "")) - Number(khuVucCa.has(a.khu_vuc_ma ?? "")) || (b.cuoi_ky ?? 0) - (a.cuoi_ky ?? 0)),
    [ktv, khuVucCa],
  );

  const sum = (rows: TonRow[]) => rows.reduce((s, r) => s + (r.cuoi_ky ?? 0), 0);
  const tonMb = sum(ton.filter((r) => r.nhom === "MB"));
  const tonMn = sum(ton.filter((r) => r.nhom === "MN"));
  const tonKtv = sum(ktv);
  const ktvCungKv = ktv.filter((r) => khuVucCa.has(r.khu_vuc_ma ?? ""));
  const thieuLk = lsQ.data?.thieu_lk ?? [];
  const ticketMo = thieuLk.filter((t) => THIEU_LK_TRANG_THAI[t.trang_thai ?? ""]?.mo);

  const caSorted = useMemo(() => [...cases].sort((a, b) => (b.tuoi_ton ?? -1) - (a.tuoi_ton ?? -1)), [cases]);
  const tuoiMax = caSorted[0]?.tuoi_ton ?? null;
  const thieuLkSorted = useMemo(
    () => [...thieuLk].sort((a, b) => Number(!!THIEU_LK_TRANG_THAI[b.trang_thai ?? ""]?.mo) - Number(!!THIEU_LK_TRANG_THAI[a.trang_thai ?? ""]?.mo)),
    [thieuLk],
  );
  const homNay = new Date().toISOString().slice(0, 10);
  const orders = lsQ.data?.orders ?? [];
  const lsLoi = lsQ.isError ? "Không tải được dữ liệu từ hệ Đặt mua linh kiện." : null;

  // Nhan dinh nhanh - thu tu uu tien xu ly: kho MB/MN co hang -> KTV cung khu vuc -> KTV noi khac -> het.
  const nhanDinh: { tone: BadgeTone; icon: string; title: string; text: string } | null = tonQ.isLoading
    ? null
    : tonMb + tonMn > 0
      ? { tone: "teal", icon: "✅", title: "Có thể xử lý ngay", text: `Kho đang có hàng (MB ${fmtSl(tonMb)} · MN ${fmtSl(tonMn)}) — điều chuyển cho ca đang thiếu.` }
      : ktvCungKv.length > 0
        ? { tone: "teal", icon: "🔁", title: "Điều chuyển từ KTV", text: `Kho MB/MN hết, nhưng ${ktvCungKv.length} KTV cùng khu vực với ca thiếu đang giữ hàng (${fmtSl(sum(ktvCungKv))}).` }
        : ktv.length > 0
          ? { tone: "amber", icon: "⚠️", title: "Chỉ còn ở KTV khu vực khác", text: `Kho MB/MN hết; ${ktv.length} KTV khu vực khác đang giữ (${fmtSl(tonKtv)}).` }
          : { tone: "coral", icon: "⛔", title: "Hết hàng toàn hệ thống", text: "Kho + KTV đều hết — cần đặt PO / theo dõi hàng về." };
  const nd = nhanDinh ? TONE_VAR[nhanDinh.tone] : null;

  return (
    <div className="space-y-6">
      {/* Diem nhan: the so lieu chinh + nhan dinh */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <StatCard label="Tồn kho MB" value={fmtSl(tonMb)} tone="ocean" muted={tonMb <= 0} sub="kho tính vào MB" />
          <StatCard label="Tồn kho MN" value={fmtSl(tonMn)} tone="ocean" muted={tonMn <= 0} sub="kho tính vào MN" />
          <StatCard
            label="KTV đang giữ"
            value={fmtSl(tonKtv)}
            tone="teal"
            muted={tonKtv <= 0}
            sub={`${ktv.length} người${ktvCungKv.length ? ` · ${ktvCungKv.length} cùng KV ca thiếu` : ""}`}
          />
          <StatCard label="Ca đang thiếu" value={cases.length} tone="coral" muted={cases.length === 0} sub={tuoiMax !== null ? `lâu nhất ${tuoiMax} ngày` : "trong phạm vi bạn xem"} />
          <StatCard label="Ticket thiếu hàng mở" value={ticketMo.length} tone="amber" muted={ticketMo.length === 0} sub={`${thieuLk.length} ticket tổng`} />
          <StatCard label="PO liên quan" value={po.length} tone="gray" muted={po.length === 0} sub="Google Sheet PO" />
        </div>
        {nhanDinh && nd && (
          <div className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ background: nd.tint, borderLeft: `5px solid ${nd.solid}` }}>
            <span className="text-xl leading-none mt-0.5">{nhanDinh.icon}</span>
            <div>
              <div className="font-display font-bold text-sm" style={{ color: nd.text }}>
                {nhanDinh.title}
              </div>
              <div className="text-sm text-[var(--ink-700)]">{nhanDinh.text}</div>
            </div>
          </div>
        )}
      </div>

      <Zone n={1} title="Nhu cầu" hint="ca đang chờ linh kiện này, lâu nhất trên đầu">
        <Section
          title="Ca đang báo thiếu"
          icon="🧾"
          tone="coral"
          count={caQ.isLoading ? undefined : cases.length}
          emptyText={!caQ.isLoading && cases.length === 0 ? "Không có ca nào trong phạm vi bạn xem." : null}
        >
          {caQ.isLoading ? (
            <LoadingInline />
          ) : (
            <div className="overflow-auto max-h-64">
              <table className="dense w-full text-xs">
                <thead className={THEAD}>
                  <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
                    <th className={TH}>Mã ca</th>
                    <th className={TH}>Khu vực</th>
                    <th className={TH}>KTV</th>
                    <th className={TH}>Khách hàng</th>
                    <th className={`${TH} text-right`}>Tuổi tồn</th>
                    <th className={TH}>Ngày cần hàng</th>
                  </tr>
                </thead>
                <tbody>
                  {caSorted.map((c) => {
                    const treHen = !!c.last_ngay_yeu_cau_co_hang && c.last_ngay_yeu_cau_co_hang.slice(0, 10) < homNay;
                    return (
                      <tr key={c.id} className={`${TR} ${openCase ? "cursor-pointer hover:bg-slate-50" : ""}`} onClick={() => openCase?.(c.id, "giai-trinh")}>
                        <td className={`${TH} font-mono font-semibold text-[var(--ocean-600)]`}>{c.id}</td>
                        <td className={TH}>
                          <Badge tone="gray">{shortKhuVuc(c.khu_vuc)}</Badge>
                        </td>
                        <td className={TH}>{c.ky_thuat_vien ?? "—"}</td>
                        <td className={TH}>{c.khach_hang ?? "—"}</td>
                        <td className={`${TH} text-right`}>
                          <TuoiBadge ngay={c.tuoi_ton} />
                        </td>
                        <td className={`${TH} ${treHen ? "text-[var(--coral-600)] font-semibold" : ""}`}>
                          {c.last_ngay_yeu_cau_co_hang ? fmtDate(c.last_ngay_yeu_cau_co_hang) : "—"}
                          {treHen && " · quá hẹn"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </Zone>

      <Zone n={2} title="Nguồn hàng hiện có" hint="tồn MISA cuối kỳ" right={<TonKhoCapNhatLine />}>
        <div className="grid md:grid-cols-2 gap-3 [&>*]:min-w-0">
          <Section
            title="Tồn theo kho công ty"
            icon="🏬"
            tone="ocean"
            count={tonQ.isLoading ? undefined : kho.filter((r) => (r.cuoi_ky ?? 0) > 0).length}
            emptyText={!tonQ.isLoading && kho.length === 0 ? "Không kho công ty nào có mã này." : null}
          >
            {tonQ.isLoading ? (
              <LoadingInline />
            ) : (
              <div className="overflow-auto max-h-64">
                <table className="dense w-full text-xs">
                  <thead className={THEAD}>
                    <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
                      <th className={TH}>Kho</th>
                      <th className={TH}>Tính vào</th>
                      <th className={`${TH} text-right`}>SL tồn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kho.map((r) => {
                      const coHang = !!r.nhom && (r.cuoi_ky ?? 0) > 0;
                      return (
                        <tr key={r.ma_kho} className={`border-b border-[var(--line)] last:border-0 ${r.nhom ? "" : "opacity-60"}`} style={coHang ? { background: "color-mix(in srgb, var(--teal-100) 60%, transparent)" } : undefined}>
                          <td className={TH}>
                            <span className="font-mono font-semibold">{r.ma_kho}</span>
                            {r.ten_kho && <span className="text-[var(--ink-400)]"> · {r.ten_kho}</span>}
                          </td>
                          <td className={TH}>{r.nhom ? <Badge tone="ocean">{r.nhom}</Badge> : <span className="text-[var(--ink-400)]">Không tính</span>}</td>
                          <td className={`${TH} text-right font-bold tabular-nums text-sm ${coHang ? "text-[var(--teal-600)]" : ""}`}>{fmtSl(r.cuoi_ky)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            title="KTV đang giữ hàng"
            icon="🧰"
            tone="teal"
            count={tonQ.isLoading ? undefined : ktv.length}
            emptyText={!tonQ.isLoading && ktvSorted.length === 0 ? "Không KTV nào đang giữ mã này." : null}
            right={ktvCungKv.length > 0 ? <Badge tone="teal">{ktvCungKv.length} cùng KV ca thiếu</Badge> : undefined}
          >
            {tonQ.isLoading ? (
              <LoadingInline />
            ) : (
              <div className="max-h-64 overflow-auto">
                <table className="dense w-full text-xs">
                  <thead className={THEAD}>
                    <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
                      <th className={TH}>KTV / kho</th>
                      <th className={TH}>Khu vực</th>
                      <th className={`${TH} text-right`}>SL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ktvSorted.map((r) => {
                      const cungKv = khuVucCa.has(r.khu_vuc_ma ?? "");
                      return (
                        <tr key={r.ma_kho} className="border-b border-[var(--line)] last:border-0" style={cungKv ? { background: "color-mix(in srgb, var(--teal-100) 60%, transparent)" } : undefined}>
                          <td className={TH}>
                            <span className={cungKv ? "font-semibold" : ""}>{r.ten_ktv ?? r.ten_kho ?? r.ma_kho}</span>
                            <span className="text-[var(--ink-400)] font-mono"> · {r.ma_kho}</span>
                            {!r.ma_ktv && <span className="text-[var(--amber-600)]"> (chưa khớp KTV)</span>}
                          </td>
                          <td className={TH}>
                            {r.khu_vuc_ma ?? "—"}
                            {cungKv && <span className="ml-1 text-[var(--teal-600)] font-semibold">● cùng KV</span>}
                          </td>
                          <td className={`${TH} text-right font-bold tabular-nums text-sm`}>{fmtSl(r.cuoi_ky)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      </Zone>

      <Zone n={3} title="Xử lý & cung ứng" hint="kho xử lý thiếu hàng, đơn đặt, PO">
        <Section
          title="Ticket thiếu hàng — kho xử lý"
          icon="📦"
          tone="amber"
          count={lsQ.isLoading || lsQ.isError ? undefined : ticketMo.length}
          right={!lsQ.isLoading && !lsQ.isError && thieuLk.length > 0 ? <span className="text-[var(--ink-400)]">{thieuLk.length - ticketMo.length} đã đóng</span> : undefined}
          emptyText={lsQ.isLoading ? null : lsLoi ?? (thieuLk.length === 0 ? "Chưa có ticket thiếu hàng nào cho mã này." : null)}
        >
          {lsQ.isLoading ? (
            <LoadingInline />
          ) : (
            <div className="overflow-auto max-h-56">
              <table className="dense w-full text-xs">
                <thead className={THEAD}>
                  <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
                    <th className={TH}>Ticket</th>
                    <th className={TH}>Trạng thái</th>
                    <th className={TH}>Lý do</th>
                    <th className={TH}>Tạo lúc</th>
                    <th className={TH}>Dự kiến có hàng</th>
                    <th className={TH}>Hàng về thực tế</th>
                  </tr>
                </thead>
                <tbody>
                  {thieuLkSorted.map((t) => {
                    const tt = THIEU_LK_TRANG_THAI[t.trang_thai ?? ""];
                    return (
                      <tr key={t.id} className={`border-b border-[var(--line)] last:border-0 ${tt?.mo ? "" : "opacity-60"}`} style={tt?.mo ? { background: "color-mix(in srgb, var(--amber-100) 55%, transparent)" } : undefined}>
                        <td className={`${TH} font-mono`}>
                          {t.id}
                          <div className="text-[var(--ink-400)]">{t.dat_don_hang_id}</div>
                        </td>
                        <td className={TH}>{tt ? <Badge tone={tt.tone}>{tt.label}</Badge> : (t.trang_thai ?? "—")}</td>
                        <td className={TH}>{t.ly_do ?? "—"}</td>
                        <td className={TH}>{fmtDateTime(t.ngay_tao)}</td>
                        <td className={`${TH} ${tt?.mo ? "font-semibold" : ""}`}>{t.ngay_du_kien_co_hang ? fmtDate(t.ngay_du_kien_co_hang) : "—"}</td>
                        <td className={TH}>{t.ngay_hang_ve_thuc_te ? fmtDate(t.ngay_hang_ve_thuc_te) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section
          title="Lịch sử đặt hàng — hệ Đặt mua linh kiện"
          icon="🛒"
          tone="ocean"
          count={lsQ.isLoading || lsQ.isError ? undefined : orders.length}
          right={orders.length > 0 ? <span className="text-[var(--ink-400)]">đơn gần nhất</span> : undefined}
          emptyText={lsQ.isLoading ? null : lsLoi ?? (orders.length === 0 ? "Chưa có đơn đặt hàng nào cho mã này." : null)}
        >
          {lsQ.isLoading ? (
            <LoadingInline />
          ) : (
            <div className="overflow-auto max-h-64">
              <table className="dense w-full text-xs">
                <thead className={THEAD}>
                  <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
                    <th className={TH}>Đơn</th>
                    <th className={TH}>Loại</th>
                    <th className={TH}>Trạng thái</th>
                    <th className={`${TH} text-right`}>SL đề xuất / thực xuất</th>
                    <th className={TH}>Người nhận</th>
                    <th className={TH}>KV</th>
                    <th className={TH}>Ngày tạo</th>
                    <th className={TH}>Ca</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className={TR}>
                      <td className={`${TH} font-mono`}>{o.id}</td>
                      <td className={TH}>
                        {linhKienLoaiDonLabel(o.loai_don)}
                        {o.loai_de_xuat && <div className="text-[var(--ink-400)]">{o.loai_de_xuat}</div>}
                      </td>
                      <td className={`${TH} font-semibold`}>{linhKienTrangThaiLabel(o.trang_thai_hien_tai)}</td>
                      <td className={`${TH} text-right tabular-nums`}>
                        <span className="font-semibold">{fmtSl(o.so_luong_de_xuat)}</span> / {o.so_luong_thuc_xuat === null ? "—" : fmtSl(o.so_luong_thuc_xuat)}
                      </td>
                      <td className={TH}>{o.nguoi_nhan_hang_ten ?? "—"}</td>
                      <td className={TH}>{o.khu_vuc_ma ?? "—"}</td>
                      <td className={`${TH} whitespace-nowrap`}>{fmtDateTime(o.ngay_tao)}</td>
                      <td className={TH}>
                        {(o.case_ids ?? "")
                          .split(",")
                          .filter(Boolean)
                          .map((id) => (
                            <button key={id} type="button" className="font-mono text-[var(--ocean-600)] hover:underline mr-1" onClick={() => openCase?.(id)}>
                              {id}
                            </button>
                          ))}
                        {!o.case_ids && "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="PO đặt hàng liên quan" icon="📑" tone="orange" count={po.length} emptyText={po.length === 0 ? "Không có PO liên quan." : null}>
          <SheetRowsTable rows={po} columns={PO_DAT_HANG_COLS} />
        </Section>
      </Zone>

      <Zone n={4} title="Tham khảo" hint="dữ liệu AppSheet / Google Sheet">
        <div className="grid xl:grid-cols-2 gap-3 [&>*]:min-w-0">
          <Section title="Đơn mua hàng — Google Sheet" icon="🧮" tone="gray" count={muaHangRows.length} emptyText={muaHangRows.length === 0 ? "Không có." : null}>
            <SheetRowsTable rows={muaHangRows} columns={MUA_HANG_COLS} />
          </Section>
          <Section title="Bảo hành liên quan" icon="🛠️" tone="gray" count={baoHanhRows.length} emptyText={baoHanhRows.length === 0 ? "Không có." : null}>
            <SheetRowsTable rows={baoHanhRows} columns={BAO_HANH_COLS} />
          </Section>
        </div>
      </Zone>
    </div>
  );
}
