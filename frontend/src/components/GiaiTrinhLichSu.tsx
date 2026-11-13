// Tab "GT tồn" cua CaseDetail - thiet ke lai 2026-11-13 (chu he thong):
//  1. Cac giai trinh LIEN TIEP cung ly do (+ cung ma linh kien thieu) GOP thanh 1 khoi: hien giai trinh moi nhat day du +
//     "×N lan", khoang ngay, ngay yeu cau co hang da lui bao nhieu lan; cac lan truoc thu gon (bam de mo).
//  2. Co ma linh kien thieu -> khoi "Linh kiện liên quan" DAY LEN DAU: moi ma 1 the tom tat (so lan bao thieu, tu ngay nao,
//     ngay YC co hang + so lan lui, ma xuat hang da neu, ly do) + tinh trang song tu don Mua hang / ticket Thieu hang / PO cua
//     dung ma do (bam de mo tab tuong ung).
import { useMemo, useState } from "react";
import { Badge } from "./ui/Badge";
import { MaLinhKienLink } from "./HoSoLinhKienProvider";
import { fmtDate, fmtDateTime, type GiaiTrinhRow } from "../types";
import { dl } from "../lib/banDichDuLieu";
import { tr } from "../i18n/tr";
import type { SheetRow } from "../lib/purchaseWarrantySync";
import { linhKienIsoToVnLocal, linhKienTrangThaiLabel, type LinhKienOrder } from "../lib/linhKienTimeline";
import { donBiHuy } from "./MuaHangPanel";
import { poTone, sheetNgayVeDb } from "./PoDatHangPanel";

const homNay = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
const ngay = (s: string | null | undefined) => (s ? s.slice(0, 10) : "");
/** So ngay giua 2 ngay "YYYY-MM-DD" (b - a). */
const soNgay = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
/** "YYYY-MM-DD..." -> "dd/mm". */
const ddmm = (s: string | null | undefined) => {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : (s ?? "");
};

/** Day ngay YC co hang theo thu tu thoi gian (bo trung lien tiep) -> so lan lui = so lan doi. */
function dayNgayYeuCau(dsCuToiMoi: GiaiTrinhRow[]): string[] {
  const out: string[] = [];
  for (const g of dsCuToiMoi) {
    const d = ngay(g.ngay_yeu_cau_co_hang);
    if (d && out[out.length - 1] !== d) out.push(d);
  }
  return out;
}

function NgayYeuCauText({ day, daXong }: { day: string[]; daXong: boolean }) {
  if (!day.length) return null;
  const cuoi = day[day.length - 1];
  const quaHen = !daXong && cuoi < homNay();
  return (
    <span>
      {tr("YC có hàng:")} <span className={`font-semibold ${quaHen ? "text-[var(--coral-600)]" : "text-[var(--ink-800)]"}`}>{fmtDate(cuoi)}</span>
      {quaHen && <span className="text-[var(--coral-600)]"> · {tr("quá hẹn")}</span>}
      {day.length > 1 && (
        <span className="text-[var(--amber-600)]" title={day.map(ddmm).join(" → ")}>
          {" "}
          · {tr("đã lùi {0} lần", day.length - 1)} ({day.map(ddmm).join(" → ")})
        </span>
      )}
    </span>
  );
}

interface Nhom {
  key: string;
  ly_do: string;
  lk: string | null;
  ds: GiaiTrinhRow[]; // moi -> cu
}

function gopLienTiep(dsMoiToiCu: GiaiTrinhRow[]): Nhom[] {
  const out: Nhom[] = [];
  for (const g of dsMoiToiCu) {
    const lk = g.linh_kien_thieu?.trim() || null;
    const cuoi = out[out.length - 1];
    if (cuoi && cuoi.ly_do === g.ly_do_cham && cuoi.lk === lk) cuoi.ds.push(g);
    else out.push({ key: g.id, ly_do: g.ly_do_cham, lk, ds: [g] });
  }
  return out;
}

function NhomCard({ n, tenNguoi, daXong }: { n: Nhom; tenNguoi: (e: string) => string; daXong: boolean }) {
  const [mo, setMo] = useState(false);
  const moiNhat = n.ds[0];
  const cuNhat = n.ds[n.ds.length - 1];
  const nhieu = n.ds.length > 1;
  const dayYc = dayNgayYeuCau([...n.ds].reverse());
  const maXuat = [...new Set(n.ds.map((g) => g.ma_xuat_hang_lien_quan?.trim()).filter(Boolean))] as string[];
  const nguoi = [...new Set(n.ds.map((g) => tenNguoi(g.nguoi_giai_trinh)))];
  return (
    <div className="relative pl-4 border-l-2 border-[var(--ocean-100)]">
      <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-[var(--ocean-500)]"></div>
      <div className="text-xs text-[var(--ink-400)] mb-0.5">
        {fmtDateTime(moiNhat.ngay_giai_trinh)}
        {nhieu && <span> ← {fmtDateTime(cuNhat.ngay_giai_trinh)}</span>} · {nguoi.join(", ")}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold">{dl(n.ly_do)}</span>
        {nhieu && (
          <Badge tone="ocean">
            ×{n.ds.length} {tr("lần")}
          </Badge>
        )}
        {n.lk && (
          <span className="text-xs text-[var(--amber-600)] font-semibold">
            🔧 <MaLinhKienLink ma={n.lk} ten={moiNhat.ten_linh_kien_thieu} />
            {moiNhat.ten_linh_kien_thieu && <span className="font-normal text-[var(--ink-600)]"> — {moiNhat.ten_linh_kien_thieu}</span>}
          </span>
        )}
      </div>
      {moiNhat.noi_dung && <div className="text-sm text-[var(--ink-600)] whitespace-pre-line">{moiNhat.noi_dung}</div>}
      {(dayYc.length > 0 || maXuat.length > 0) && (
        <div className="text-xs text-[var(--ink-500)] mt-0.5 flex flex-wrap gap-x-2">
          <NgayYeuCauText day={dayYc} daXong={daXong} />
          {maXuat.length > 0 && (
            <span>
              {dayYc.length > 0 && "· "}
              {tr("Mã xuất hàng:")} {maXuat.join(", ")}
            </span>
          )}
        </div>
      )}
      {nhieu && (
        <button type="button" onClick={() => setMo((v) => !v)} className="mt-1 text-xs font-semibold text-[var(--ocean-600)] hover:underline">
          {mo ? tr("▴ Thu gọn") : tr("▸ Xem {0} giải trình trước", n.ds.length - 1)}
        </button>
      )}
      {mo && (
        <ol className="mt-1 space-y-1 border-l border-dashed border-[var(--line)] pl-3">
          {n.ds.slice(1).map((g) => (
            <li key={g.id} className="text-xs text-[var(--ink-600)]">
              <span className="text-[var(--ink-400)]">{fmtDateTime(g.ngay_giai_trinh)}</span> · {tenNguoi(g.nguoi_giai_trinh)}
              {g.noi_dung && <span className="text-[var(--ink-800)]"> — {g.noi_dung}</span>}
              {g.ngay_yeu_cau_co_hang && <span className="text-[var(--ink-400)]"> · {tr("YC có hàng {0}", fmtDate(g.ngay_yeu_cau_co_hang))}</span>}
              {g.ma_xuat_hang_lien_quan && <span className="text-[var(--ink-400)]"> · {g.ma_xuat_hang_lien_quan}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const CHIP = "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] hover:bg-[var(--surface)]";

function LinhKienTomTat({
  ma,
  ds,
  lkOrders,
  poRows,
  onMoTab,
  daXong,
}: {
  ma: string;
  ds: GiaiTrinhRow[]; // moi -> cu
  lkOrders: LinhKienOrder[];
  poRows: SheetRow[];
  onMoTab?: (tab: string) => void;
  daXong: boolean;
}) {
  const moiNhat = ds[0];
  const cuNhat = ds[ds.length - 1];
  const ten = ds.find((g) => g.ten_linh_kien_thieu)?.ten_linh_kien_thieu ?? null;
  const dayYc = dayNgayYeuCau([...ds].reverse());
  const maXuat = new Set(ds.map((g) => g.ma_xuat_hang_lien_quan?.trim()).filter(Boolean) as string[]);
  const lyDo = new Map<string, number>();
  for (const g of ds) lyDo.set(g.ly_do_cham, (lyDo.get(g.ly_do_cham) ?? 0) + 1);
  const tuNgay = ngay(cuNhat.ngay_giai_trinh);
  const keoDai = tuNgay ? soNgay(tuNgay, homNay()) : 0;

  const don = lkOrders.filter((o) => o.ma_lk === ma || maXuat.has(o.order_id));
  const ticket = don.flatMap((o) => (o.ma_lk === ma ? (o.thieu_lk ?? []) : []));
  const po = poRows.filter((r) => r.maLinhKienDeXuat === ma || r.maLinhKienGoc === ma);
  // Ma xuat hang neu trong giai trinh nhung khong thay don tuong ung tren app -> van liet ke (co the la don sheet cu).
  const maXuatKhongThay = [...maXuat].filter((m) => !don.some((o) => o.order_id === m));

  return (
    <div className="rounded-lg border border-[var(--amber-500)]/40 bg-[var(--amber-100)]/40 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="text-sm font-semibold min-w-0">
          🔧 <MaLinhKienLink ma={ma} ten={ten} />
          {ten && <span className="font-normal text-[var(--ink-700)]"> — {ten}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone="amber">{tr("{0} giải trình", ds.length)}</Badge>
          {!daXong && keoDai > 0 && <Badge tone={keoDai >= 7 ? "coral" : "gray"}>{tr("báo thiếu {0} ngày", keoDai)}</Badge>}
        </div>
      </div>
      <div className="mt-1 text-xs text-[var(--ink-600)] flex flex-wrap gap-x-2 gap-y-0.5">
        <span>
          {tr("Báo thiếu từ {0}", fmtDate(cuNhat.ngay_giai_trinh))}
          {ds.length > 1 && ` · ${tr("gần nhất {0}", fmtDateTime(moiNhat.ngay_giai_trinh))}`}
        </span>
        {dayYc.length > 0 && (
          <>
            <span>·</span>
            <NgayYeuCauText day={dayYc} daXong={daXong} />
          </>
        )}
      </div>
      {lyDo.size > 1 && (
        <div className="mt-0.5 text-xs text-[var(--ink-500)]">
          {tr("Lý do:")} {[...lyDo].map(([l, n]) => `${dl(l)} (${n})`).join(" · ")}
        </div>
      )}
      {moiNhat.noi_dung && (
        <div className="mt-0.5 text-xs text-[var(--ink-700)]">
          <span className="text-[var(--ink-500)]">{tr("Gần nhất:")}</span> {moiNhat.noi_dung}
        </div>
      )}
      {(don.length > 0 || ticket.length > 0 || po.length > 0 || maXuatKhongThay.length > 0) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {don.map((o) => {
            const huy = donBiHuy(o);
            return (
              <button
                key={o.order_id}
                type="button"
                onClick={() => onMoTab?.("mua-hang")}
                className={`${CHIP} ${huy ? "border-[var(--coral-500)]/40 text-[var(--coral-600)]" : "border-[var(--line)] text-[var(--ink-700)]"}`}
                title={tr("Mở tab Mua hàng")}
              >
                🛒 <span className={`font-mono ${huy ? "line-through" : ""}`}>{o.order_id}</span>
                <span className="text-[var(--ink-500)]">· {linhKienTrangThaiLabel(o.trang_thai_hien_tai)}</span>
              </button>
            );
          })}
          {ticket.map((t) => {
            const daVe = !!t.ngay_hang_ve_thuc_te;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onMoTab?.("thieu-hang")}
                className={`${CHIP} border-[var(--line)] text-[var(--ink-700)]`}
                title={tr("Mở tab Thiếu hàng")}
              >
                ⚠ <span className="font-mono">{t.id}</span>
                <span className={daVe ? "text-[var(--teal-600)]" : "text-[var(--orange-600)]"}>
                  ·{" "}
                  {daVe
                    ? tr("hàng về {0}", ddmm(linhKienIsoToVnLocal(t.ngay_hang_ve_thuc_te!)))
                    : t.ngay_du_kien_co_hang
                      ? tr("dự kiến {0}", ddmm(linhKienIsoToVnLocal(t.ngay_du_kien_co_hang)))
                      : tr("chờ hàng")}
                </span>
              </button>
            );
          })}
          {po.slice(0, 3).map((r, i) => {
            const dk = sheetNgayVeDb(r.ngayDuKienGanNhat);
            return (
              <button
                key={`${r.id}-${i}`}
                type="button"
                onClick={() => onMoTab?.("po-dat-hang")}
                className={`${CHIP} border-[var(--line)] text-[var(--ink-700)]`}
                title={tr("Mở tab PO đặt hàng")}
              >
                📦 <span className="font-mono">{r.id}</span>
                {r.trangThai && <span className={poTone(r.trangThai) === "teal" ? "text-[var(--teal-600)]" : "text-[var(--ink-500)]"}>· {r.trangThai}</span>}
                {dk && !r.ngayVeThucTe && <span className="text-[var(--ink-500)]">· {tr("DK {0}", ddmm(dk))}</span>}
                {r.ngayVeThucTe && <span className="text-[var(--teal-600)]">· {tr("về {0}", r.ngayVeThucTe)}</span>}
              </button>
            );
          })}
          {po.length > 3 && (
            <button type="button" onClick={() => onMoTab?.("po-dat-hang")} className="text-[11px] text-[var(--ocean-600)] hover:underline">
              +{po.length - 3} PO
            </button>
          )}
          {maXuatKhongThay.map((m) => (
            <span key={m} className={`${CHIP} border-dashed border-[var(--line)] text-[var(--ink-500)]`} title={tr("Mã xuất hàng nêu trong giải trình, chưa thấy đơn trên app")}>
              <span className="font-mono">{m}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function GiaiTrinhLichSu({
  list,
  tenNguoi,
  lkOrders,
  poRows,
  onMoTab,
  daXong,
}: {
  list: GiaiTrinhRow[];
  tenNguoi: (email: string) => string;
  lkOrders: LinhKienOrder[];
  poRows: SheetRow[];
  onMoTab?: (tab: string) => void;
  /** Ca da hoan thanh -> khong canh bao qua hen / so ngay bao thieu. */
  daXong: boolean;
}) {
  const [hienTungDong, setHienTungDong] = useState(false);
  const ds = useMemo(() => [...list].sort((a, b) => (b.ngay_giai_trinh ?? "").localeCompare(a.ngay_giai_trinh ?? "")), [list]);
  const nhom = useMemo(() => gopLienTiep(ds), [ds]);
  const theoLk = useMemo(() => {
    const m = new Map<string, GiaiTrinhRow[]>();
    for (const g of ds) {
      const lk = g.linh_kien_thieu?.trim();
      if (!lk) continue;
      if (!m.has(lk)) m.set(lk, []);
      m.get(lk)!.push(g);
    }
    return [...m]; // thu tu = ma co giai trinh moi nhat truoc
  }, [ds]);

  if (!ds.length) return <div className="text-sm text-[var(--ink-400)] italic">{tr("Chưa có giải trình nào cho ca này.")}</div>;

  const hienThi: Nhom[] = hienTungDong ? ds.map((g) => ({ key: g.id, ly_do: g.ly_do_cham, lk: g.linh_kien_thieu?.trim() || null, ds: [g] })) : nhom;

  return (
    <div className="space-y-4">
      {theoLk.length > 0 && (
        <div>
          <div className="font-display font-bold text-sm mb-2">{tr("Linh kiện liên quan ({0})", theoLk.length)}</div>
          <div className="space-y-2">
            {theoLk.map(([ma, g]) => (
              <LinhKienTomTat key={ma} ma={ma} ds={g} lkOrders={lkOrders} poRows={poRows} onMoTab={onMoTab} daXong={daXong} />
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="font-display font-bold text-sm">
            {tr("Lịch sử giải trình")}
            {nhom.length < ds.length && !hienTungDong && (
              <span className="ml-1.5 text-xs font-normal text-[var(--ink-400)]">{tr("({0} giải trình, gộp còn {1} nhóm)", ds.length, nhom.length)}</span>
            )}
          </div>
          {nhom.length < ds.length && (
            <button type="button" onClick={() => setHienTungDong((v) => !v)} className="text-xs font-semibold text-[var(--ocean-600)] hover:underline">
              {hienTungDong ? tr("Gộp lý do giống nhau") : tr("Hiện từng giải trình")}
            </button>
          )}
        </div>
        <div className="space-y-3">
          {hienThi.map((n) => (
            <NhomCard key={n.key} n={n} tenNguoi={tenNguoi} daXong={daXong} />
          ))}
        </div>
      </div>
    </div>
  );
}
