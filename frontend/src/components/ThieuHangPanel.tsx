// Tab "Thiếu hàng" cua CaseDetail - thiet ke lai 2026-11-13 (chu he thong), cung nguyen tac tab "Mua hàng" (MuaHangPanel.tsx):
// moi ticket thieu hang = 1 the co LUONG NGANG Tao yeu cau -> Kho tiep nhan -> (Mua hang dat, khi kho chuyen mua) -> Hang ve -> Kho gui
// KTV -> KTV nhan (2 buoc cuoi lay tu phieu xuat kho cua DON sau luc hang ve, de thay ca chang giao lai cho KTV). Thong tin chinh hien
// ngoai: du kien co hang (qua hen to do), hang ve thuc te, so ngay cho, don lien quan. Ticket huy / kho tu choi / mua hang tu choi thu
// gon 1 dong (bam mo). Su kien thieu_lk trong timeline gan theo DON (khong co ma ticket) -> don nhieu ticket: chia theo ngay_tao ticket.
import { useState } from "react";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { Field } from "./ui/Field";
import { MaLinhKienLink } from "./HoSoLinhKienProvider";
import { MoAppLink, LINHKIEN_URL } from "./MoAppLink";
import { Luong, LuongNgang } from "./SuaChuaPanel";
import { cuoiCung, dauTien, moc, vn } from "./MuaHangPanel";
import { fmtDateTime } from "../types";
import { dl } from "../lib/banDichDuLieu";
import { tr } from "../i18n/tr";
import type { SuaChuaMoc } from "../lib/suaChuaTimeline";
import {
  linhKienActorDisplay,
  linhKienEventLabel,
  linhKienTrangThaiLabel,
  type LinhKienOrder,
  type LinhKienThieuLk,
  type LinhKienTimelineEvent,
} from "../lib/linhKienTimeline";

const THIEU_HUY = new Set(["thieu_lk_huy_bo", "thieu_lk_kho_tu_choi", "thieu_lk_mua_hang_tu_choi"]);

/** Moc thoi gian (ms) tu ISO co offset hoac gio VN "YYYY-MM-DD[ HH:MM:SS]". */
const ms = (s: string) => new Date(s.includes("T") ? s : `${s.length <= 10 ? `${s}T00:00:00` : s.replace(" ", "T")}+07:00`).getTime();

function suKienCuaTicket(o: LinhKienOrder, t: LinhKienThieuLk): LinhKienTimelineEvent[] {
  const ds = [...(o.thieu_lk ?? [])].sort((a, b) => ms(a.ngay_tao) - ms(b.ngay_tao));
  const i = ds.findIndex((x) => x.id === t.id);
  const tu = ms(t.ngay_tao) - 60_000;
  const den = ds[i + 1] ? ms(ds[i + 1].ngay_tao) - 60_000 : Infinity;
  return o.timeline.filter((e) => e.source === "thieu_lk" && ms(e.at) >= tu && ms(e.at) < den);
}

export function ticketBiHuy(o: LinhKienOrder, t: LinhKienThieuLk): boolean {
  const ev = suKienCuaTicket(o, t);
  const cuoi = ev[ev.length - 1];
  return !!cuoi && THIEU_HUY.has(cuoi.event) && !t.ngay_hang_ve_thuc_te;
}

export function mocCuaTicket(o: LinhKienOrder, t: LinhKienThieuLk): SuaChuaMoc[] {
  const ev = suKienCuaTicket(o, t);
  const tao = dauTien(ev, "thieu_lk_cho_kho_xu_ly");
  const tiepNhan = dauTien(ev, ["thieu_lk_kho_da_tiep_nhan", "thieu_lk_kho_da_cap_nhat"]);
  const choMua = dauTien(ev, "thieu_lk_cho_mua_hang");
  const daDat = dauTien(ev, "thieu_lk_mua_hang_da_dat");
  const hangVeEv = cuoiCung(ev, "thieu_lk_kho_xac_nhan_hang_ve");
  const hangVeAt = hangVeEv?.at ?? (t.ngay_hang_ve_thuc_te || null);
  const pxkSau = hangVeAt ? o.timeline.filter((e) => e.source === "phieu_xuat_kho" && ms(e.at) >= ms(hangVeAt) - 60_000) : [];
  const gui = dauTien(pxkSau, "pxk_dang_gui_ktv");
  const nhan = dauTien(pxkSau, ["pxk_ktv_da_nhan", "pxk_hang_tru_kho", "pxk_kho_da_ket_thuc"]);

  let ds: SuaChuaMoc[] = [
    { key: "tao_yc", label: "Tạo yêu cầu", trang_thai: "xong", at: vn(t.ngay_tao), nguoi: tao ? linhKienActorDisplay(tao) : null, ghi_chu: null },
    moc("kho_tiep_nhan", "Kho tiếp nhận", tiepNhan),
    ...(choMua || daDat ? [moc("mua_dat", "Mua hàng đặt", daDat)] : []),
    hangVeEv
      ? moc("hang_ve", "Hàng về", hangVeEv)
      : { key: "hang_ve", label: "Hàng về", trang_thai: hangVeAt ? "xong" : "chua", at: vn(hangVeAt), nguoi: null, ghi_chu: null },
    moc("kho_gui", "Kho gửi KTV", gui),
    moc("ktv_nhan", "KTV nhận", nhan),
  ];
  let sauXong = false;
  for (let i = ds.length - 1; i >= 0; i--) {
    if (ds[i].trang_thai === "xong") sauXong = true;
    else if (sauXong) ds[i] = { ...ds[i], trang_thai: "xong" };
  }
  const iDang = ds.findIndex((m) => m.trang_thai === "chua");
  if (iDang >= 0) {
    if (ticketBiHuy(o, t)) {
      const e = ev[ev.length - 1];
      ds[iDang] = { ...ds[iDang], trang_thai: "loi", label: linhKienEventLabel(e.event), at: vn(e.at), nguoi: linhKienActorDisplay(e), ghi_chu: e.note ?? null };
      ds = ds.slice(0, iDang + 1);
    } else {
      const ghiChu =
        ds[iDang].key === "hang_ve" && t.ngay_du_kien_co_hang ? tr("dự kiến {0}", fmtDateTime(vn(t.ngay_du_kien_co_hang))) : (ev[ev.length - 1]?.note ?? null);
      ds[iDang] = { ...ds[iDang], trang_thai: "dang", ghi_chu: ghiChu };
    }
  }
  return ds;
}

function TicketCard({ o, t }: { o: LinhKienOrder; t: LinhKienThieuLk }) {
  const huy = ticketBiHuy(o, t);
  const [mo, setMo] = useState(!huy);
  const [chiTiet, setChiTiet] = useState(false);
  const ds = mocCuaTicket(o, t);
  const ev = suKienCuaTicket(o, t);
  const daVe = ds.find((m) => m.key === "hang_ve")?.trang_thai === "xong";
  const xong = ds.every((m) => m.trang_thai === "xong");
  const now = Date.now();
  const hangVeAt = ds.find((m) => m.key === "hang_ve")?.at;
  const choNgay = Math.max(0, Math.floor(((daVe && hangVeAt ? ms(hangVeAt) : now) - ms(t.ngay_tao)) / 86_400_000));
  const duKien = t.ngay_du_kien_co_hang;
  const quaHen = !daVe && !huy && !!duKien && ms(duKien) + (duKien.length <= 10 ? 86_400_000 : 0) < now;
  const nhanHuy = linhKienEventLabel(ev[ev.length - 1]?.event ?? "thieu_lk_huy_bo");

  if (!mo)
    return (
      <button
        type="button"
        onClick={() => setMo(true)}
        className="focus-ring w-full text-left rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface-100)] px-3 py-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-500)] hover:bg-[var(--surface)]"
        title={tr("Bấm để xem ticket")}
      >
        <span className="text-[var(--ink-400)]">▸</span>
        <Badge tone="coral">{nhanHuy}</Badge>
        <span className="font-mono">{t.id}</span>
        <span className="truncate max-w-[40ch] line-through decoration-[var(--ink-300)]">{o.ten_lk || o.ma_lk}</span>
        <span>· {fmtDateTime(vn(t.ngay_tao))}</span>
      </button>
    );

  return (
    <Card
      className={`p-3 ${huy ? "opacity-80" : ""}`}
      style={!huy && !xong ? { borderLeft: `4px solid ${quaHen ? "var(--coral-500)" : daVe ? "var(--ocean-500)" : "var(--orange-500)"}` } : undefined}
    >
      <div className="flex items-start justify-between flex-wrap gap-1.5">
        <div className="min-w-0">
          <div className="font-semibold text-sm">
            <MaLinhKienLink ma={o.ma_lk} ten={o.ten_lk}>{`${o.ma_lk}${o.ten_lk ? ` – ${o.ten_lk}` : ""}`}</MaLinhKienLink>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--ink-500)] mt-0.5">
            <MoAppLink base={LINHKIEN_URL} id={t.id} title={tr("Mở ticket trên app Đặt mua linh kiện")} />
            <span>· {tr("Lý do:")} <span className="font-medium text-[var(--ink-700)]">{dl(t.ly_do) || tr("(chưa rõ lý do)")}</span></span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {huy ? (
            <>
              <Badge tone="coral">{nhanHuy}</Badge>
              <button type="button" onClick={() => setMo(false)} className="text-xs text-[var(--ink-400)] hover:text-[var(--ink-700)]" title={tr("Thu gọn")}>
                ▴
              </button>
            </>
          ) : xong ? (
            <Badge tone="teal">{tr("Đã giao KTV")}</Badge>
          ) : daVe ? (
            <Badge tone="ocean">{tr("Hàng đã về – chờ giao KTV")}</Badge>
          ) : (
            <Badge tone={quaHen ? "coral" : "amber"}>{quaHen ? tr("Quá hẹn có hàng") : tr("Đang chờ hàng")}</Badge>
          )}
        </div>
      </div>
      <div className="mt-2">
        <LuongNgang moc={ds} />
      </div>
      {!huy && (
        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 text-xs text-[var(--ink-600)] rounded-lg bg-[var(--surface-100)] px-3 py-2">
          <Field
            label={tr("Dự kiến có hàng")}
            value={
              <span className={quaHen ? "font-semibold text-[var(--coral-600)]" : "font-semibold text-[var(--ink-900)]"}>
                {duKien ? fmtDateTime(vn(duKien)) : tr("Chưa có")}
                {quaHen && ` · ${tr("quá hẹn")}`}
              </span>
            }
          />
          <Field label={tr("Hàng về thực tế")} value={hangVeAt ? fmtDateTime(hangVeAt) : "—"} />
          <Field label={daVe ? tr("Thời gian chờ hàng") : tr("Đã chờ")} value={tr("{0} ngày", choNgay)} />
          <Field
            label={tr("Đơn liên quan")}
            value={
              <span>
                <MoAppLink base={LINHKIEN_URL} id={o.order_id} /> · {linhKienTrangThaiLabel(o.trang_thai_hien_tai)}
              </span>
            }
          />
        </div>
      )}
      <button type="button" onClick={() => setChiTiet((v) => !v)} className="mt-2 text-xs font-semibold text-[var(--ocean-600)] hover:underline">
        {chiTiet ? tr("▴ Thu gọn") : tr("▾ Xem chi tiết")}
      </button>
      {chiTiet && (
        <div className="mt-2 grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-[var(--ink-500)] mb-1.5">{tr("Các mốc")}</div>
            <Luong moc={ds} />
          </div>
          <div className="text-xs">
            <div className="font-semibold text-[var(--ink-500)] mb-1">{tr("Nhật ký ticket ({0})", ev.length)}</div>
            <ol className="space-y-0.5 max-h-56 overflow-auto">
              {ev.map((e, i) => (
                <li key={i} className="text-[var(--ink-600)]">
                  <span className="text-[var(--ink-400)]">{fmtDateTime(vn(e.at))}</span> · <span className="font-medium">{linhKienEventLabel(e.event)}</span>
                  {linhKienActorDisplay(e) && <span className="text-[var(--ink-400)]"> · {linhKienActorDisplay(e)}</span>}
                  {e.note && <span className="italic"> — {e.note}</span>}
                </li>
              ))}
            </ol>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[var(--ink-600)]">
              <Field label={tr("Loại đề xuất")} value={dl(o.loai_de_xuat) || "—"} />
              <Field label={tr("Người nhận hàng")} value={o.nguoi_nhan_hang ? (o.nguoi_nhan_hang_ten ?? o.nguoi_nhan_hang) : "—"} />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Danh sach ticket: dang cho (qua hen / hen som truoc) -> hang da ve chua giao -> da giao KTV -> huy (thu gon). */
export function ThieuHangTicketList({ items }: { items: { order: LinhKienOrder; ticket: LinhKienThieuLk }[] }) {
  const hang = ({ order: o, ticket: t }: { order: LinhKienOrder; ticket: LinhKienThieuLk }) => {
    if (ticketBiHuy(o, t)) return 3;
    const ds = mocCuaTicket(o, t);
    if (ds.every((m) => m.trang_thai === "xong")) return 2;
    return ds.find((m) => m.key === "hang_ve")?.trang_thai === "xong" ? 1 : 0;
  };
  const ds = [...items].sort((a, b) => hang(a) - hang(b) || (a.ticket.ngay_du_kien_co_hang ?? "9").localeCompare(b.ticket.ngay_du_kien_co_hang ?? "9"));
  const soHuy = ds.filter((x) => ticketBiHuy(x.order, x.ticket)).length;
  return (
    <div className="space-y-2.5">
      {ds.map((x) => (
        <TicketCard key={x.ticket.id} o={x.order} t={x.ticket} />
      ))}
      {soHuy > 0 && <div className="text-[11px] text-[var(--ink-400)]">{tr("{0} ticket hủy / từ chối đã thu gọn — bấm để xem.", soHuy)}</div>}
    </div>
  );
}
