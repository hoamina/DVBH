import { dl } from "../lib/banDichDuLieu";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { fmtDate, fmtDateTime, type Paged } from "../types";
import { Badge, type BadgeTone } from "./ui/Badge";
import { LoadingInline } from "./ui/LoadingInline";
import { StatCard } from "./ui/StatCard";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { linhKienLoaiDonLabel, linhKienTrangThaiLabel, linhKienSlThucXuat } from "../lib/linhKienTimeline";
import { fmtSl, TonKhoCapNhatLine } from "./TonKhoLk";
import { usePurchaseWarrantyData } from "../hooks/usePurchaseWarrantyData";
import { matchPoDatHangByLinhKien } from "../lib/purchaseWarrantyMatch";
import type { SheetRow } from "../lib/purchaseWarrantySync";
import { poSortKey } from "../lib/poDatHangEo";
import { soNguyen, poBiHuy, poDangCho, poNgayVe } from "../lib/ngayHangVeTheoKv";
import { MaAppLink, MoAppLink, LINHKIEN_URL } from "./MoAppLink";
import { tr } from "../i18n/tr";
import { LkTuongDuongView, TuongDuongBanner, useLkTuongDuong } from "./LkTuongDuong";


// "Ho so linh kien" (GD2 ton kho linh kien, 2026-10-08) - bam 1 ma LK o tab "Linh kiện thiếu": tra loi nhanh
// "dang ton o kho nao, SL bao nhieu, KTV nao dang giu, ca nao dang cho, kho xu ly thieu hang chua, don/PO the nao".
//   - Ton tung kho / KTV: ton_kho_lk (keo tu linh-kien-app, /api/ton-kho-lk/ma/:ma).
//   - Ca dang bao thieu: /api/missing-parts?ma_lk= (dung scope khu vuc cua nguoi xem).
//   - Lich su dat hang + ticket thieu hang: linh-kien-app, goi luc mo (/api/ton-kho-lk/ma/:ma/lich-su, khong luu).
//   - PO (app EO Mua hang, usePurchaseWarrantyData). Muc mua hang / bao hanh tu Google Sheet da bo 2026-11-14.
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
  "Cho kho xu ly": { label: tr("Chờ kho xử lý"), tone: "coral", mo: true },
  "Kho da tiep nhan": { label: tr("Kho đã tiếp nhận"), tone: "amber", mo: true },
  "Kho xac nhan hang da ve": { label: tr("Kho xác nhận hàng đã về"), tone: "teal", mo: false },
  "Kho tu choi sai TT": { label: tr("Kho từ chối (sai thông tin)"), tone: "gray", mo: false },
  "Da huy bo": { label: tr("Đã hủy bỏ"), tone: "gray", mo: false },
  "Da ket thuc": { label: tr("Đã kết thúc"), tone: "gray", mo: false },
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
  return <Badge tone={tone}>{ngay}  {tr("ngày")}</Badge>;
}

// ---- PO dat hang (lam lai 2026-11-07, phan hoi chu he thong): bo PO huy / SL dat = 0; cot "Về thực tế" theo tung PO;
// PO dang cho hang tren dau + to nen vang, PO da xong mo di; moi kho 1 mau chip; ID PO bam mo thang app PO mua hang;
// PO co gan ID ca -> hien ma ca (bam mo ca). Ngay trong SheetRow deu dang 'dd/mm/yyyy[ HH:MM:SS]' (poDatHangEo.ts).
const ngayNgan = (s: string | undefined) => (s ? s.split(" ")[0] : "");

// Mau chip kho - gan theo thu tu ten kho (on dinh trong 1 lan xem), du phan biet nhanh 7 kho.
const KHO_MAU = [
  { bg: "#dbeafe", fg: "#1e40af" },
  { bg: "#ede9fe", fg: "#5b21b6" },
  { bg: "#ccfbf1", fg: "#0f766e" },
  { bg: "#fce7f3", fg: "#9d174d" },
  { bg: "#fef3c7", fg: "#92400e" },
  { bg: "#e0f2fe", fg: "#075985" },
  { bg: "#ecfccb", fg: "#3f6212" },
];
function KhoChip({ kho, mau }: { kho: string; mau: { bg: string; fg: string } | undefined }) {
  if (!kho) return <span className="text-[var(--ink-400)]">—</span>;
  return (
    <span className="inline-block rounded-md px-1.5 py-[1px] font-semibold whitespace-nowrap" style={{ background: mau?.bg, color: mau?.fg }}>
      {kho}
    </span>
  );
}

function PoTable({ rows, khoMau, openCase }: { rows: SheetRow[]; khoMau: Map<string, { bg: string; fg: string }>; openCase?: (id: string, tab?: string) => void }) {
  return (
    <div className="overflow-auto max-h-80">
      <table className="dense w-full text-xs">
        <thead className={THEAD}>
          <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
            <th className={TH}>{tr("ID PO")}</th>
            <th className={TH}>{tr("Trạng thái")}</th>
            <th className={TH}>{tr("Kho cần đặt")}</th>
            <th className={TH}>{tr("Cho ca")}</th>
            <th className={`${TH} text-right`}>{tr("Đặt / về / thiếu")}</th>
            <th className={TH}>{tr("Ban hành")}</th>
            <th className={TH}>{tr("Dự kiến về")}</th>
            <th className={TH}>{tr("Về thực tế")}</th>
            <th className={TH}>{tr("Cảnh báo")}</th>
            <th className={TH}>{tr("NM cam kết")}</th>
            <th className={TH}>{tr("Đối tác")}</th>
            <th className={TH}>{tr("Ghi chú")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const cho = poDangCho(r);
            const ve = poNgayVe(r);
            return (
              <tr
                key={r.id || i}
                className="border-b border-[var(--line)] last:border-0"
                style={cho ? { background: "color-mix(in srgb, var(--amber-100) 60%, transparent)" } : { color: "var(--ink-500)" }}
              >
                <td className={`${TH} whitespace-nowrap`} style={{ borderLeft: `3px solid ${cho ? "var(--amber-500)" : "var(--teal-500)"}` }}>
                  <MaAppLink id={r.id} title={tr("Mở PO trên app PO mua hàng")} />
                </td>
                <td className={TH}>{cho ? <Badge tone="amber">{tr("Chờ hàng")}</Badge> : <Badge tone="teal">{tr("Đã xong")}</Badge>}</td>
                <td className={TH}>
                  <KhoChip kho={r.khoCanDat ?? ""} mau={khoMau.get(r.khoCanDat ?? "")} />
                </td>
                <td className={TH}>
                  {r.idCrm ? (
                    <button type="button" className="font-mono font-semibold text-[var(--ocean-600)] hover:underline" onClick={() => openCase?.(r.idCrm)}>
                      {r.idCrm}
                    </button>
                  ) : (
                    <span className="text-[var(--ink-400)]">—</span>
                  )}
                </td>
                <td className={`${TH} text-right tabular-nums whitespace-nowrap`}>
                  {r.soLuongDat || "—"} / {r.slNhapTheoAmis || "0"} / <span className={cho ? "font-bold text-[var(--coral-600)]" : ""}>{r.soLuongConThieu || "0"}</span>
                </td>
                <td className={`${TH} whitespace-nowrap`}>{ngayNgan(r.ngayBanHanh) || ngayNgan(r.ngayTao) || "—"}</td>
                <td className={`${TH} whitespace-nowrap ${cho ? "font-semibold text-[var(--ink-900)]" : ""}`}>{cho ? r.ngayDuKienGanNhat || tr("Chưa có") : r.ngayDuKienGanNhat || "—"}</td>
                <td
                  className={`${TH} whitespace-nowrap ${ve ? "font-semibold text-[var(--teal-600)]" : ""} ${r.phieuNhap ? "cursor-help" : ""}`}
                  title={r.phieuNhap ? tr("Phiếu nhập: {0}", r.phieuNhap) : undefined}
                >
                  {ve || "—"}
                </td>
                <td className={TH}>{r.canhBao ? <span className={cho ? "text-[var(--coral-600)] font-semibold" : ""}>{r.canhBao}</span> : "—"}</td>
                <td className={`${TH} whitespace-nowrap`}>{r.nmCamKet || "—"}</td>
                <td className={TH}>{r.doiTac || "—"}</td>
                <td className={`${TH} max-w-[260px] truncate`} title={r.ghiChu || undefined}>
                  {r.ghiChu || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const TH = "py-1.5 px-2";
const THEAD = "sticky top-0 z-[1] bg-[var(--surface)]";
const TR = "border-b border-[var(--line)] last:border-0 even:bg-[var(--surface-100)]/60";

// 2 view (2026-11-12): "Hồ sơ mã này" (mac dinh) | "Linh kiện tương đương" - onMoMa = mo ho so 1 ma tuong duong (Provider giu lich su).
export function HoSoLinhKien({ maLk, openCase, onMoMa }: { maLk: string; openCase?: (id: string, tab?: string) => void; onMoMa?: (ma: string, ten: string | null) => void }) {
  const [view, setView] = useState<"ho-so" | "tuong-duong">("ho-so");
  const td = useLkTuongDuong(maLk);
  const tabs = (
    <div className="flex items-center gap-1 border-b border-[var(--line)]">
      {(
        [
          ["ho-so", tr("Hồ sơ mã này")],
          ["tuong-duong", td.khac.length ? tr("Linh kiện tương đương ({0} · {1} còn hàng)", td.khac.length, td.conHang.length) : tr("Linh kiện tương đương")],
        ] as const
      ).map(([k, nhan]) => (
        <button
          key={k}
          type="button"
          onClick={() => setView(k)}
          className={`focus-ring px-3 py-2 text-sm font-semibold -mb-px border-b-2 ${view === k ? "border-[var(--ocean-500)] text-[var(--ocean-600)]" : "border-transparent text-[var(--ink-500)] hover:text-[var(--ink-900)]"}`}
        >
          {nhan}
        </button>
      ))}
    </div>
  );
  if (view === "tuong-duong")
    return (
      <div className="space-y-4">
        {tabs}
        <LkTuongDuongView maLk={maLk} onMoMa={onMoMa} />
      </div>
    );
  return <HoSoChinh maLk={maLk} openCase={openCase} tabs={tabs} onXemTuongDuong={() => setView("tuong-duong")} />;
}

function HoSoChinh({ maLk, openCase, tabs, onXemTuongDuong }: { maLk: string; openCase?: (id: string, tab?: string) => void; tabs: ReactNode; onXemTuongDuong: () => void }) {
  const { poDatHang } = usePurchaseWarrantyData();
  const poTatCa = useMemo(() => matchPoDatHangByLinhKien(maLk, poDatHang), [maLk, poDatHang]);
  // Bo PO huy / SL dat = 0; PO dang cho hang len dau, trong moi nhom moi ban hanh truoc.
  const po = useMemo(() => {
    const k = (r: SheetRow) => poSortKey(r.ngayBanHanh) || poSortKey(r.ngayTao);
    return poTatCa
      .filter((r) => !poBiHuy(r))
      .sort((a, b) => Number(poDangCho(b)) - Number(poDangCho(a)) || (k(a) < k(b) ? 1 : k(a) > k(b) ? -1 : 0));
  }, [poTatCa]);
  const poAn = poTatCa.length - po.length;
  const poCho = po.filter(poDangCho);
  const khoMau = useMemo(() => {
    const m = new Map<string, { bg: string; fg: string }>();
    [...new Set(po.map((r) => r.khoCanDat ?? "").filter(Boolean))].sort().forEach((k, i) => m.set(k, KHO_MAU[i % KHO_MAU.length]));
    return m;
  }, [po]);
  // Ca -> PO dat rieng cho ca do (PO co gan ID CRM)
  const poTheoCa = useMemo(() => {
    const m = new Map<string, SheetRow[]>();
    for (const r of po) if (r.idCrm) m.set(r.idCrm, [...(m.get(r.idCrm) ?? []), r]);
    return m;
  }, [po]);
  const tonQ = useQuery({ queryKey: ["ton-kho-lk-ma", maLk], queryFn: () => api.get<{ rows: TonRow[]; ten?: string | null }>(`/ton-kho-lk/ma/${encodeURIComponent(maLk)}`) });
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
  const lsLoi = lsQ.isError ? tr("Không tải được dữ liệu từ hệ Đặt mua linh kiện.") : null;

  // Nhan dinh nhanh - thu tu uu tien xu ly: kho MB/MN co hang -> KTV cung khu vuc -> KTV noi khac -> het.
  const nhanDinh: { tone: BadgeTone; icon: string; title: string; text: string } | null = tonQ.isLoading
    ? null
    : tonMb + tonMn > 0
      ? { tone: "teal", icon: "✅", title: tr("Có thể xử lý ngay"), text: tr("Kho đang có hàng (MB {0} · MN {1}) — điều chuyển cho ca đang thiếu.", fmtSl(tonMb), fmtSl(tonMn)) }
      : ktvCungKv.length > 0
        ? { tone: "teal", icon: "🔁", title: tr("Điều chuyển từ KTV"), text: tr("Kho MB/MN hết, nhưng {0} KTV cùng khu vực với ca thiếu đang giữ hàng ({1}).", ktvCungKv.length, fmtSl(sum(ktvCungKv))) }
        : ktv.length > 0
          ? { tone: "amber", icon: "⚠️", title: tr("Chỉ còn ở KTV khu vực khác"), text: tr("Kho MB/MN hết; {0} KTV khu vực khác đang giữ ({1}).", ktv.length, fmtSl(tonKtv)) }
          : { tone: "coral", icon: "⛔", title: tr("Hết hàng toàn hệ thống"), text: tr("Kho + KTV đều hết — cần đặt PO / theo dõi hàng về.") };
  const nd = nhanDinh ? TONE_VAR[nhanDinh.tone] : null;

  // "Tinh hinh cung ung" (2026-11-07): tra loi trong vai giay - dang co PO cho hang khong, bao gio ve, lan dat gan nhat,
  // lan ve gan nhat, don dat / ticket / bao hanh lien quan.
  const maxBy = <T,>(xs: T[], key: (x: T) => string, min = false): T | undefined =>
    xs.filter((x) => key(x)).sort((a, b) => (key(a) < key(b) ? (min ? -1 : 1) : key(a) > key(b) ? (min ? 1 : -1) : 0))[0];
  const slThieuCho = poCho.reduce((s, r) => s + (soNguyen(r.soLuongConThieu) ?? 0), 0);
  const duKienSomNhat = maxBy(poCho, (r) => poSortKey(r.ngayDuKienGanNhat), true);
  const poMoiNhat = po[0] && maxBy(po, (r) => poSortKey(r.ngayBanHanh) || poSortKey(r.ngayTao));
  const veGanNhat = maxBy(po, (r) => poSortKey(poNgayVe(r)));
  const donMoiNhat = maxBy(orders, (o) => o.ngay_tao);
  const ticketDuKien = maxBy(ticketMo, (t) => t.ngay_du_kien_co_hang ?? "", true);
  const caCoPo = cases.filter((c) => poTheoCa.has(c.id)).length;
  const cungUng: { label: string; value: ReactNode; sub?: ReactNode; tone: BadgeTone }[] = [
    {
      label: tr("PO đang chờ hàng"),
      value: poCho.length,
      sub: poCho.length ? tr("còn thiếu {0}", fmtSl(slThieuCho)) : tr("không có PO nào đang chờ"),
      tone: poCho.length ? "amber" : "gray",
    },
    {
      label: tr("Dự kiến có hàng sớm nhất"),
      value: duKienSomNhat ? ngayNgan(duKienSomNhat.ngayDuKienGanNhat) : poCho.length ? tr("Chưa có ngày") : "—",
      sub: duKienSomNhat ? <KhoChip kho={duKienSomNhat.khoCanDat ?? ""} mau={khoMau.get(duKienSomNhat.khoCanDat ?? "")} /> : undefined,
      tone: duKienSomNhat ? "ocean" : poCho.length ? "coral" : "gray",
    },
    {
      label: tr("PO đặt gần nhất"),
      value: poMoiNhat ? ngayNgan(poMoiNhat.ngayBanHanh) || ngayNgan(poMoiNhat.ngayTao) || "—" : "—",
      sub: poMoiNhat ? <MaAppLink id={poMoiNhat.id} /> : tr("chưa có PO"),
      tone: poMoiNhat ? "ocean" : "gray",
    },
    {
      label: tr("Hàng về gần nhất (PO)"),
      value: veGanNhat ? poNgayVe(veGanNhat) : "—",
      sub: veGanNhat ? <KhoChip kho={veGanNhat.khoCanDat ?? ""} mau={khoMau.get(veGanNhat.khoCanDat ?? "")} /> : undefined,
      tone: veGanNhat ? "teal" : "gray",
    },
    {
      label: tr("Đơn đặt LK gần nhất"),
      value: donMoiNhat ? fmtDate(donMoiNhat.ngay_tao) : lsQ.isLoading ? "…" : "—",
      sub: donMoiNhat ? (
        <span>
          <MoAppLink base={LINHKIEN_URL} id={donMoiNhat.id} /> {linhKienTrangThaiLabel(donMoiNhat.trang_thai_hien_tai)}
        </span>
      ) : undefined,
      tone: donMoiNhat ? "ocean" : "gray",
    },
    {
      label: tr("Ticket thiếu hàng mở"),
      value: ticketMo.length,
      sub: ticketDuKien?.ngay_du_kien_co_hang ? tr("kho hẹn {0}", fmtDate(ticketDuKien.ngay_du_kien_co_hang)) : undefined,
      tone: ticketMo.length ? "amber" : "gray",
    },
    {
      label: tr("Ca thiếu đã có PO riêng"),
      value: cases.length ? `${caCoPo}/${cases.length}` : "—",
      sub: cases.length ? tr("PO gắn đúng ID ca") : undefined,
      tone: cases.length && caCoPo < cases.length ? "coral" : "gray",
    },
  ];

  return (
    <div className="space-y-6">
      {tabs}
      {/* Diem nhan: the so lieu chinh + nhan dinh */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <StatCard label={tr("Tồn kho MB")} value={fmtSl(tonMb)} tone="ocean" muted={tonMb <= 0} sub={tr("kho tính vào MB")} />
          <StatCard label={tr("Tồn kho MN")} value={fmtSl(tonMn)} tone="ocean" muted={tonMn <= 0} sub={tr("kho tính vào MN")} />
          <StatCard
            label={tr("KTV đang giữ")}
            value={fmtSl(tonKtv)}
            tone="teal"
            muted={tonKtv <= 0}
            sub={tr("{0} người{1}", ktv.length, ktvCungKv.length ? " " + tr("· {0} cùng KV ca thiếu", ktvCungKv.length) : "")}
          />
          <StatCard label={tr("Ca đang thiếu")} value={cases.length} tone="coral" muted={cases.length === 0} sub={tuoiMax !== null ? tr("lâu nhất {0} ngày", tuoiMax) : tr("trong phạm vi bạn xem")} />
          <StatCard label={tr("Ticket thiếu hàng mở")} value={ticketMo.length} tone="amber" muted={ticketMo.length === 0} sub={tr("{0} ticket tổng", thieuLk.length)} />
          <StatCard label={tr("PO liên quan")} value={po.length} tone="gray" muted={po.length === 0} sub={tr("{0} đang chờ hàng", poCho.length)} />
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
        <TuongDuongBanner maLk={maLk} onXem={onXemTuongDuong} />
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
          <div className="text-xs font-bold uppercase tracking-wide text-[var(--ink-500)] mb-2">{tr("Tình hình cung ứng")}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
            {cungUng.map((x) => {
              const c = TONE_VAR[x.tone];
              return (
                <div key={x.label} className="rounded-lg px-2.5 py-2 min-w-0" style={{ background: `color-mix(in srgb, ${c.tint} 60%, transparent)`, borderTop: `3px solid ${c.solid}` }}>
                  <div className="text-[11px] text-[var(--ink-500)] leading-tight">{x.label}</div>
                  <div className="font-display font-bold text-base tabular-nums" style={{ color: c.text }}>
                    {x.value}
                  </div>
                  {x.sub && <div className="text-[11px] text-[var(--ink-600)] truncate">{x.sub}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <Zone n={1} title={tr("Nhu cầu")} hint={tr("ca đang chờ linh kiện này, lâu nhất trên đầu")}>
        <Section
          title={tr("Ca đang báo thiếu")}
          icon="🧾"
          tone="coral"
          count={caQ.isLoading ? undefined : cases.length}
          emptyText={!caQ.isLoading && cases.length === 0 ? tr("Không có ca nào trong phạm vi bạn xem.") : null}
        >
          {caQ.isLoading ? (
            <LoadingInline />
          ) : (
            <div className="overflow-auto max-h-64">
              <table className="dense w-full text-xs">
                <thead className={THEAD}>
                  <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
                    <th className={TH}>{tr("Mã ca")}</th>
                    <th className={TH}>{tr("Khu vực")}</th>
                    <th className={TH}>KTV</th>
                    <th className={TH}>{tr("Khách hàng")}</th>
                    <th className={`${TH} text-right`}>{tr("Tuổi tồn")}</th>
                    <th className={TH}>{tr("Ngày cần hàng")}</th>
                    <th className={TH}>{tr("PO cho ca này")}</th>
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
                          {treHen && " " + tr("· quá hẹn")}
                        </td>
                        <td className={TH}>
                          {(poTheoCa.get(c.id) ?? []).map((p) => (
                            <span key={p.id} className="inline-flex items-center gap-1 mr-1.5 whitespace-nowrap">
                              <MaAppLink id={p.id} title={tr("Đã có PO đặt cho ca này")} />
                              <span className={poDangCho(p) ? "text-[var(--amber-600)]" : "text-[var(--teal-600)]"}>
                                {poDangCho(p) ? (p.ngayDuKienGanNhat ? tr("DK {0}", p.ngayDuKienGanNhat) : tr("chờ hàng")) : (poNgayVe(p) ? tr("đã về {0}", poNgayVe(p)) : tr("đã xong"))}
                              </span>
                            </span>
                          ))}
                          {!poTheoCa.has(c.id) && <span className="text-[var(--ink-400)]">—</span>}
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

      <Zone n={2} title={tr("Nguồn hàng hiện có")} hint={tr("tồn MISA cuối kỳ")} right={<TonKhoCapNhatLine />}>
        <div className="grid md:grid-cols-2 gap-3 [&>*]:min-w-0">
          <Section
            title={tr("Tồn theo kho công ty")}
            icon="🏬"
            tone="ocean"
            count={tonQ.isLoading ? undefined : kho.filter((r) => (r.cuoi_ky ?? 0) > 0).length}
            emptyText={!tonQ.isLoading && kho.length === 0 ? tr("Không kho công ty nào có mã này.") : null}
          >
            {tonQ.isLoading ? (
              <LoadingInline />
            ) : (
              <div className="overflow-auto max-h-64">
                <table className="dense w-full text-xs">
                  <thead className={THEAD}>
                    <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
                      <th className={TH}>Kho</th>
                      <th className={TH}>{tr("Tính vào")}</th>
                      <th className={`${TH} text-right`}>{tr("SL tồn")}</th>
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
                          <td className={TH}>{r.nhom ? <Badge tone="ocean">{r.nhom}</Badge> : <span className="text-[var(--ink-400)]">{tr("Không tính")}</span>}</td>
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
            title={tr("KTV đang giữ hàng")}
            icon="🧰"
            tone="teal"
            count={tonQ.isLoading ? undefined : ktv.length}
            emptyText={!tonQ.isLoading && ktvSorted.length === 0 ? tr("Không KTV nào đang giữ mã này.") : null}
            right={ktvCungKv.length > 0 ? <Badge tone="teal">{ktvCungKv.length}  {tr("cùng KV ca thiếu")}</Badge> : undefined}
          >
            {tonQ.isLoading ? (
              <LoadingInline />
            ) : (
              <div className="max-h-64 overflow-auto">
                <table className="dense w-full text-xs">
                  <thead className={THEAD}>
                    <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
                      <th className={TH}>KTV / kho</th>
                      <th className={TH}>{tr("Khu vực")}</th>
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
                            {!r.ma_ktv && <span className="text-[var(--amber-600)]">  {tr("(chưa khớp KTV)")}</span>}
                          </td>
                          <td className={TH}>
                            {r.khu_vuc_ma ?? "—"}
                            {cungKv && <span className="ml-1 text-[var(--teal-600)] font-semibold">{tr("● cùng KV")}</span>}
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

      <Zone n={3} title={tr("Xử lý & cung ứng")} hint={tr("kho xử lý thiếu hàng, đơn đặt, PO")}>
        <Section
          title={tr("Ticket thiếu hàng — kho xử lý")}
          icon="📦"
          tone="amber"
          count={lsQ.isLoading || lsQ.isError ? undefined : ticketMo.length}
          right={!lsQ.isLoading && !lsQ.isError && thieuLk.length > 0 ? <span className="text-[var(--ink-400)]">{thieuLk.length - ticketMo.length}  {tr("đã đóng")}</span> : undefined}
          emptyText={lsQ.isLoading ? null : lsLoi ?? (thieuLk.length === 0 ? tr("Chưa có ticket thiếu hàng nào cho mã này.") : null)}
        >
          {lsQ.isLoading ? (
            <LoadingInline />
          ) : (
            <div className="overflow-auto max-h-56">
              <table className="dense w-full text-xs">
                <thead className={THEAD}>
                  <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
                    <th className={TH}>Ticket</th>
                    <th className={TH}>{tr("Trạng thái")}</th>
                    <th className={TH}>{tr("Lý do")}</th>
                    <th className={TH}>{tr("Tạo lúc")}</th>
                    <th className={TH}>{tr("Dự kiến có hàng")}</th>
                    <th className={TH}>{tr("Hàng về thực tế")}</th>
                  </tr>
                </thead>
                <tbody>
                  {thieuLkSorted.map((t) => {
                    const tt = THIEU_LK_TRANG_THAI[t.trang_thai ?? ""];
                    return (
                      <tr key={t.id} className={`border-b border-[var(--line)] last:border-0 ${tt?.mo ? "" : "opacity-60"}`} style={tt?.mo ? { background: "color-mix(in srgb, var(--amber-100) 55%, transparent)" } : undefined}>
                        <td className={`${TH} font-mono`}>
                          <MoAppLink base={LINHKIEN_URL} id={t.id} />
                          <div className="mt-0.5"><MoAppLink base={LINHKIEN_URL} id={t.dat_don_hang_id} /></div>
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
          title={tr("Lịch sử đặt hàng — hệ Đặt mua linh kiện")}
          icon="🛒"
          tone="ocean"
          count={lsQ.isLoading || lsQ.isError ? undefined : orders.length}
          right={orders.length > 0 ? <span className="text-[var(--ink-400)]">{tr("đơn gần nhất")}</span> : undefined}
          emptyText={lsQ.isLoading ? null : lsLoi ?? (orders.length === 0 ? tr("Chưa có đơn đặt hàng nào cho mã này.") : null)}
        >
          {lsQ.isLoading ? (
            <LoadingInline />
          ) : (
            <div className="overflow-auto max-h-64">
              <table className="dense w-full text-xs">
                <thead className={THEAD}>
                  <tr className="text-left text-[var(--ink-400)] uppercase border-b border-[var(--line)]">
                    <th className={TH}>{tr("Đơn")}</th>
                    <th className={TH}>{tr("Loại")}</th>
                    <th className={TH}>{tr("Trạng thái")}</th>
                    <th className={`${TH} text-right`}>{tr("SL đề xuất / thực xuất")}</th>
                    <th className={TH}>{tr("Người nhận")}</th>
                    <th className={TH}>KV</th>
                    <th className={TH}>{tr("Ngày tạo")}</th>
                    <th className={TH}>Ca</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className={TR}>
                      <td className={`${TH} font-mono whitespace-nowrap`}><MoAppLink base={LINHKIEN_URL} id={o.id} title={tr("Mở đơn trên app Đặt mua linh kiện")} /></td>
                      <td className={TH}>
                        {linhKienLoaiDonLabel(o.loai_don)}
                        {o.loai_de_xuat && <div className="text-[var(--ink-400)]">{dl(o.loai_de_xuat)}</div>}
                      </td>
                      <td className={`${TH} font-semibold`}>{linhKienTrangThaiLabel(o.trang_thai_hien_tai)}</td>
                      <td className={`${TH} text-right tabular-nums`}>
                        <span className="font-semibold">{fmtSl(o.so_luong_de_xuat)}</span> / {(() => { const sl = linhKienSlThucXuat(o); return sl === null ? "—" : fmtSl(sl); })()}
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

        <Section
          title={tr("PO đặt hàng liên quan")}
          icon="📑"
          tone="orange"
          count={po.length}
          emptyText={po.length === 0 ? (poAn > 0 ? tr("Chỉ có {0} PO đã hủy / SL đặt = 0 (đã ẩn).", poAn) : tr("Không có PO liên quan.")) : null}
          right={
            <span className="flex items-center gap-2 text-[var(--ink-500)]">
              <span><span className="inline-block w-2.5 h-2.5 rounded-sm align-middle mr-1" style={{ background: "var(--amber-500)" }} />{tr("{0} chờ hàng", poCho.length)}</span>
              <span><span className="inline-block w-2.5 h-2.5 rounded-sm align-middle mr-1" style={{ background: "var(--teal-500)" }} />{tr("{0} đã xong", po.length - poCho.length)}</span>
              {poAn > 0 && <span className="text-[var(--ink-400)]">· {tr("ẩn {0} PO hủy / SL 0", poAn)}</span>}
            </span>
          }
        >
          <PoTable rows={po} khoMau={khoMau} openCase={openCase} />
        </Section>
      </Zone>

    </div>
  );
}
