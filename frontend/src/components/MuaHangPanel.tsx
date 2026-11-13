// Tab "Mua hàng" cua CaseDetail - thiet ke lai 2026-11-13 (chu he thong):
//  1. Moi don = 1 LUONG QUY TRINH NGANG (dung lai LuongNgang/Luong cua tab "Bảo hành") gom 2 chang: DAT HANG (tao don -> duyet ->
//     cho hang neu thieu LK) va GIAO HANG cho KTV (tao phieu xuat -> ke toan chot -> kho gui KTV -> KTV nhan). Don tra hang co luong
//     rieng (tao phieu tra -> KT duyet -> kho -> QC -> TN duyet tong).
//  2. Don huy / tu choi THU GON 1 dong (bam de mo), xep cuoi.
//  3. Hien ro thong tin giao hang: trang thai gui hang, ngay gui KTV, ngay KTV nhan, phieu xuat kho.
// Nguon: linh-kien-app GET /v1/case-timeline (timeline su kien ISO +07:00, enum on dinh - backend lib/linhKienTimeline.ts).
import { useState } from "react";
import { Badge, type BadgeTone } from "./ui/Badge";
import { Card } from "./ui/Card";
import { Field } from "./ui/Field";
import { MaLinhKienLink } from "./HoSoLinhKienProvider";
import { MoAppLink, LINHKIEN_URL } from "./MoAppLink";
import { Luong, LuongNgang } from "./SuaChuaPanel";
import { fmtDateTime } from "../types";
import { dl } from "../lib/banDichDuLieu";
import { tr } from "../i18n/tr";
import type { SuaChuaMoc } from "../lib/suaChuaTimeline";
import {
  linhKienActorDisplay,
  linhKienEventLabel,
  linhKienIsoToVnLocal,
  linhKienLoaiDonLabel,
  linhKienSlThucXuat,
  linhKienTrangThaiLabel,
  type LinhKienOrder,
  type LinhKienTimelineEvent,
} from "../lib/linhKienTimeline";

const HUY_EVENTS = new Set(["da_huy", "tn_tu_choi", "tra_hang_tu_choi", "tra_hang_da_huy"]);
const HUY_TRANG_THAI = new Set(["Da huy", "TN tu choi", "Tu choi"]);
const CHO_DUYET = new Set(["cho_tram_duyet", "cho_tbp_xac_nhan", "cho_tn_duyet", "cho_gs_duyet", "cho_thanh_toan"]);

export function donBiHuy(o: LinhKienOrder): boolean {
  if (HUY_TRANG_THAI.has(o.trang_thai_hien_tai ?? "")) return true;
  const last = [...o.timeline].reverse().find((e) => e.source === "mua_hang" || e.source === "tra_hang");
  return !!last && HUY_EVENTS.has(last.event);
}

export const vn = (iso: string | null | undefined) => (iso ? linhKienIsoToVnLocal(iso) : null);
export const dauTien = (tl: LinhKienTimelineEvent[], ev: string | string[]) => {
  const ds = Array.isArray(ev) ? ev : [ev];
  return tl.find((e) => ds.includes(e.event)) ?? null;
};
export const cuoiCung = (tl: LinhKienTimelineEvent[], ev: string | string[]) => {
  const ds = Array.isArray(ev) ? ev : [ev];
  return [...tl].reverse().find((e) => ds.includes(e.event)) ?? null;
};
export const moc = (key: string, label: string, e: LinhKienTimelineEvent | null, trangThai: SuaChuaMoc["trang_thai"] = e ? "xong" : "chua"): SuaChuaMoc => ({
  key,
  label,
  trang_thai: trangThai,
  at: vn(e?.at),
  nguoi: e ? linhKienActorDisplay(e) : null,
  ghi_chu: e?.note ?? null,
});

/** Danh sach moc cua 1 don (dat -> giao, hoac luong tra hang). Buoc dau tien chua toi = "dang" (to noi); don huy = "loi" o buoc do. */
export function mocCuaDon(o: LinhKienOrder): SuaChuaMoc[] {
  const tl = o.timeline;
  const huy = donBiHuy(o);
  const eHuy = huy ? cuoiCung(tl, [...HUY_EVENTS]) : null;
  let ds: SuaChuaMoc[];

  if (o.loai_don === "tra_hang") {
    ds = [
      { key: "tao_phieu_tra", label: "Tạo phiếu trả", trang_thai: "xong", at: vn(o.ngay_tao), nguoi: o.nguoi_tao_ten ?? o.nguoi_tao, ghi_chu: null },
      moc("ke_toan", "KT duyệt", dauTien(tl, "tra_hang_cho_kho_xac_nhan")),
      moc("kho_nhan", "Kho xác nhận", dauTien(tl, "tra_hang_cho_qc_xac_nhan")),
      moc("qc", "QC xác nhận", dauTien(tl, "tra_hang_cho_tn_duyet_tong")),
      moc("tn_duyet", "TN duyệt tổng", dauTien(tl, "tra_hang_tn_da_duyet")),
    ];
  } else {
    const duyet = dauTien(tl, "tn_da_duyet");
    const choHang = dauTien(tl, ["cho_hang", "thieu_lk_cho_kho_xu_ly"]);
    const hangVe = cuoiCung(tl, "thieu_lk_kho_xac_nhan_hang_ve");
    const taoPhieu = dauTien(tl, ["pxk_dang_tao_phieu", "pxk_cho_ke_toan", "pxk_da_chot_don_xuat"]);
    const chot = dauTien(tl, "pxk_da_chot_don_xuat");
    const gui = dauTien(tl, "pxk_dang_gui_ktv");
    const nhan = dauTien(tl, ["pxk_ktv_da_nhan", "pxk_hang_tru_kho", "pxk_kho_da_ket_thuc"]);
    ds = [
      { key: "tao_don", label: "Tạo đơn", trang_thai: "xong", at: vn(o.ngay_tao), nguoi: o.nguoi_tao_ten ?? o.nguoi_tao, ghi_chu: null },
      moc("duyet", "Duyệt", duyet),
      // Chang "cho hang" chi hien khi don tung thieu hang.
      ...(choHang || hangVe ? [moc("hang_ve", "Hàng về", hangVe)] : []),
      moc("phieu_xuat", "Phiếu xuất", taoPhieu),
      moc("kt_chot", "KT chốt", chot),
      moc("kho_gui", "Kho gửi KTV", gui),
      moc("ktv_nhan", nhan?.event === "pxk_ktv_da_nhan" || !nhan ? "KTV nhận" : linhKienEventLabel(nhan.event), nhan),
    ];
    // Mot buoc sau da xong thi cac buoc truoc coi nhu xong (vd don khong qua TN duyet ma vao thang phieu xuat).
    let sauXong = false;
    for (let i = ds.length - 1; i >= 0; i--) {
      if (ds[i].trang_thai === "xong") sauXong = true;
      else if (sauXong) ds[i] = { ...ds[i], trang_thai: "xong" };
    }
  }

  const iDang = ds.findIndex((m) => m.trang_thai === "chua");
  if (iDang >= 0) {
    if (huy) {
      ds[iDang] = { ...ds[iDang], trang_thai: "loi", label: eHuy ? linhKienEventLabel(eHuy.event) : "Đã hủy", at: vn(eHuy?.at), nguoi: eHuy ? linhKienActorDisplay(eHuy) : null, ghi_chu: eHuy?.note ?? null };
      ds = ds.slice(0, iDang + 1);
    } else {
      // Nhan buoc dang cho = trang thai chi tiet hien tai (vd "Chờ TN duyệt", "Chờ Kế toán duyệt").
      const cuoi = [...tl].reverse()[0];
      const chiTiet = cuoi && (CHO_DUYET.has(cuoi.event) || cuoi.event.startsWith("pxk_") || cuoi.event.startsWith("thieu_lk_")) && iDang > 0 ? linhKienEventLabel(cuoi.event) : null;
      ds[iDang] = { ...ds[iDang], trang_thai: "dang", ghi_chu: ds[iDang].ghi_chu ?? (chiTiet && chiTiet !== ds[iDang].label ? chiTiet : null) };
    }
  }
  return ds;
}

function trangThaiTone(o: LinhKienOrder, ds: SuaChuaMoc[]): BadgeTone {
  if (donBiHuy(o)) return "coral";
  if (ds.every((m) => m.trang_thai === "xong")) return "teal";
  return "amber";
}

/** Thong tin GIAO HANG (chang cuoi) - hien ngoai, khong giau trong phan xem chi tiet. */
function GiaoHangInfo({ o }: { o: LinhKienOrder }) {
  if (o.loai_don === "tra_hang") return null;
  const tl = o.timeline;
  const gui = dauTien(tl, "pxk_dang_gui_ktv");
  const nhan = dauTien(tl, ["pxk_ktv_da_nhan", "pxk_hang_tru_kho", "pxk_kho_da_ket_thuc"]);
  const lastPxk = [...tl].reverse().find((e) => e.source === "phieu_xuat_kho");
  const trangThaiGui = nhan ? linhKienEventLabel(nhan.event) : lastPxk ? linhKienEventLabel(lastPxk.event) : tr("Chưa vào phiếu xuất");
  return (
    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 text-xs text-[var(--ink-600)] rounded-lg bg-[var(--surface-100)] px-3 py-2">
      <Field label={tr("Trạng thái gửi hàng")} value={<span className="font-semibold text-[var(--ink-900)]">{trangThaiGui}</span>} />
      <Field label={tr("Ngày gửi KTV")} value={gui ? fmtDateTime(vn(gui.at)) : "—"} />
      <Field label={tr("Ngày KTV nhận")} value={nhan ? fmtDateTime(vn(nhan.at)) : "—"} />
      <Field
        label={tr("Phiếu xuất kho")}
        value={
          o.phieu_xuat_kho.length
            ? o.phieu_xuat_kho.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <MoAppLink base={LINHKIEN_URL} id={p.id}>{p.ma_xuat_kho}</MoAppLink>
                </span>
              ))
            : "—"
        }
      />
    </div>
  );
}

/** Ticket THIEU HANG gan voi don (2026-11-13, yeu cau 4): hien ngay trong the don de tra cuu / danh gia nhanh. */
function ThieuHangBox({ o }: { o: LinhKienOrder }) {
  const ds = o.thieu_lk ?? [];
  if (!ds.length) return null;
  const lastThieu = [...o.timeline].reverse().find((e) => e.source === "thieu_lk");
  return (
    <div className="mt-2 rounded-lg border-l-4 border-[var(--orange-500)] bg-[var(--orange-100)]/50 px-3 py-2 text-xs">
      <div className="font-semibold text-[var(--orange-600)] mb-1">
        ⚠ {tr("Thiếu hàng ({0} ticket)", ds.length)}
        {lastThieu && <span className="font-normal text-[var(--ink-600)]"> · {tr("gần nhất: {0}", linhKienEventLabel(lastThieu.event))}</span>}
      </div>
      <div className="space-y-1">
        {ds.map((t) => {
          const daVe = !!t.ngay_hang_ve_thuc_te;
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[var(--ink-700)]">
              <MoAppLink base={LINHKIEN_URL} id={t.id} />
              <Badge tone={daVe ? "teal" : "amber"}>{daVe ? tr("Hàng đã về") : tr("Đang chờ hàng")}</Badge>
              <span className="font-medium">{dl(t.ly_do) || tr("(chưa rõ lý do)")}</span>
              <span className="text-[var(--ink-500)]">· {tr("tạo {0}", fmtDateTime(vn(t.ngay_tao)))}</span>
              <span className="text-[var(--ink-500)]">· {tr("dự kiến {0}", t.ngay_du_kien_co_hang ? fmtDateTime(vn(t.ngay_du_kien_co_hang)) : "—")}</span>
              {daVe && <span className="text-[var(--teal-600)]">· {tr("về {0}", fmtDateTime(vn(t.ngay_hang_ve_thuc_te)))}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DonCard({ o, moSan = false }: { o: LinhKienOrder; moSan?: boolean }) {
  const [chiTiet, setChiTiet] = useState(false);
  const ds = mocCuaDon(o);
  const huy = donBiHuy(o);
  const nhanTrangThai = linhKienTrangThaiLabel(o.trang_thai_hien_tai);
  const nguoiNhan = o.nguoi_nhan_hang ? (o.nguoi_nhan_hang_ten ?? o.nguoi_nhan_hang) : null;
  const [mo, setMo] = useState(moSan || !huy);

  if (!mo)
    return (
      <button
        type="button"
        onClick={() => setMo(true)}
        className="focus-ring w-full text-left rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface-100)] px-3 py-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-500)] hover:bg-[var(--surface)]"
        title={tr("Bấm để xem đơn")}
      >
        <span className="text-[var(--ink-400)]">▸</span>
        <Badge tone="coral">{nhanTrangThai}</Badge>
        <span className="font-mono">{o.order_id}</span>
        <span className="truncate max-w-[40ch] line-through decoration-[var(--ink-300)]">{o.ten_lk || o.ma_lk}</span>
        <span>· {fmtDateTime(vn(o.ngay_tao))}</span>
      </button>
    );

  return (
    <Card className={`p-3 ${huy ? "opacity-80" : ""}`}>
      <div className="flex items-start justify-between flex-wrap gap-1.5">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{o.ten_lk || o.ma_lk}</div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--ink-500)] mt-0.5">
            <MoAppLink base={LINHKIEN_URL} id={o.order_id} title={tr("Mở đơn trên app Đặt mua linh kiện")} />
            <MaLinhKienLink ma={o.ma_lk} ten={o.ten_lk} />
            <span>· {tr("SL {0} / xuất {1}", o.so_luong_de_xuat ?? "—", linhKienSlThucXuat(o) ?? "—")}</span>
            {nguoiNhan && <span>· {tr("Nhận: {0}", nguoiNhan)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {(o.thieu_lk ?? []).length > 0 && <Badge tone="orange">{tr("Thiếu hàng")}</Badge>}
          <Badge tone="gray">{linhKienLoaiDonLabel(o.loai_don)}</Badge>
          <Badge tone={trangThaiTone(o, ds)}>{nhanTrangThai}</Badge>
          {huy && (
            <button type="button" onClick={() => setMo(false)} className="text-xs text-[var(--ink-400)] hover:text-[var(--ink-700)]" title={tr("Thu gọn")}>
              ▴
            </button>
          )}
        </div>
      </div>
      <div className="mt-2">
        <LuongNgang moc={ds} />
      </div>
      <ThieuHangBox o={o} />
      {!huy && <GiaoHangInfo o={o} />}
      {o.ly_do_cham && (
        <div className="mt-2 text-xs">
          <span className="font-semibold text-[var(--amber-600)]">{tr("Lý do chậm:")}</span> {dl(o.ly_do_cham)}
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
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[var(--ink-600)]">
              <Field label={tr("Loại đề xuất")} value={dl(o.loai_de_xuat) || "—"} />
              <Field label={tr("Ngày tạo")} value={fmtDateTime(vn(o.ngay_tao))} />
              <Field label={tr("Người tạo")} value={o.nguoi_tao_ten ? `${o.nguoi_tao_ten} (${o.nguoi_tao})` : o.nguoi_tao} />
              <Field label={tr("Người nhận hàng")} value={o.nguoi_nhan_hang ? (o.nguoi_nhan_hang_ten ? `${o.nguoi_nhan_hang_ten} (${o.nguoi_nhan_hang})` : o.nguoi_nhan_hang) : "—"} />
            </div>
            <div className="text-xs">
              <div className="font-semibold text-[var(--ink-500)] mb-1">{tr("Nhật ký ({0})", o.timeline.length)}</div>
              <ol className="space-y-0.5 max-h-56 overflow-auto">
                {o.timeline.map((e, i) => (
                  <li key={i} className="text-[var(--ink-600)]">
                    <span className="text-[var(--ink-400)]">{fmtDateTime(vn(e.at))}</span> · <span className="font-medium">{linhKienEventLabel(e.event)}</span>
                    {linhKienActorDisplay(e) && <span className="text-[var(--ink-400)]"> · {linhKienActorDisplay(e)}</span>}
                    {e.note && <span className="italic"> — {e.note}</span>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Danh sach don: dang xu ly tren, da xong giua, huy / tu choi (thu gon) cuoi. */
export function MuaHangDonList({ orders }: { orders: LinhKienOrder[] }) {
  const hang = (o: LinhKienOrder) => (donBiHuy(o) ? 2 : mocCuaDon(o).every((m) => m.trang_thai === "xong") ? 1 : 0);
  const ds = [...orders].sort((a, b) => hang(a) - hang(b) || (b.ngay_tao ?? "").localeCompare(a.ngay_tao ?? ""));
  const soHuy = ds.filter(donBiHuy).length;
  return (
    <div className="space-y-2.5">
      {ds.map((o) => (
        <DonCard key={o.order_id} o={o} />
      ))}
      {soHuy > 0 && <div className="text-[11px] text-[var(--ink-400)]">{tr("{0} đơn hủy / từ chối đã thu gọn — bấm để xem.", soHuy)}</div>}
    </div>
  );
}
