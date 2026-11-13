// Tab "PO đặt hàng" cua CaseDetail - thiet ke lai 2026-11-13 (chu he thong, cung khuon tab Mua hang / Bao hanh / Thieu hang):
//  - Mac dinh: ten LK + trang thai + 1 LUONG NGANG (Tao de xuat -> Ban hanh PO -> NM cam ket -> Hang ve -> Du hang) + 1 dai so
//    lieu chinh (SL dat/ve/con thieu, du kien gan nhat, hang ve thuc te). Canh bao / ghi chu / ke hoach THU GON.
//  - "▾ Xem chi tiet" xo toan bo luoi thong tin cu. Nut thao tac (Mo EO, Xem day du) van de ngoai.
// Nguon: dataset "po-dat-hang" (Google Sheet cu + app EO Mua hang, lib/poDatHangEo.ts) - ngay dang "dd/mm/yyyy[ hh:mm:ss]".
import { useState } from "react";
import { Badge, type BadgeTone } from "./ui/Badge";
import { Btn } from "./ui/Btn";
import { Card } from "./ui/Card";
import { Field } from "./ui/Field";
import { MaLinhKienLink } from "./HoSoLinhKienProvider";
import { LuongNgang, Luong } from "./SuaChuaPanel";
import { tr } from "../i18n/tr";
import { parseRawRow, type SheetRow } from "../lib/purchaseWarrantySync";
import type { SuaChuaMoc } from "../lib/suaChuaTimeline";

/** "dd/mm/yyyy[ hh:mm[:ss]]" -> "yyyy-mm-dd[ hh:mm:ss]" (gio VN local, khong doi mui gio). Khong khop -> null. */
export function sheetNgayVeDb(s: string | undefined | null): string | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const d = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return m[4] ? `${d} ${m[4].padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}` : d;
}

const so = (v: string | undefined) => {
  if (!v) return NaN;
  const n = Number(v.replace(/[.,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

export function poTone(text: string): BadgeTone {
  const t = text.toLowerCase();
  if (t.includes("hoàn thành") || t.includes("xong") || t.includes("đã xử lý") || t.includes("đủ")) return "teal";
  if (t.includes("từ chối") || t.includes("hủy") || t.includes("huỷ")) return "coral";
  if (t.includes("đang") || t.includes("chờ")) return "amber";
  return "gray";
}

const homNay = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });

/** Tinh trang 1 PO tu cac cot san co. */
function tinhTrangPo(r: SheetRow) {
  const dat = so(r.soLuongDat);
  const nhap = so(r.slNhapTheoAmis);
  const conThieu = so(r.soLuongConThieu);
  const huy = poTone(r.trangThai ?? "") === "coral";
  const coHang = !!r.ngayVeThucTe || nhap > 0;
  const du = !huy && ((conThieu === 0 && coHang) || (dat > 0 && nhap >= dat) || poTone(r.trangThai ?? "") === "teal");
  const duKien = sheetNgayVeDb(r.ngayDuKienGanNhat);
  const quaHen = !du && !huy && !!duKien && duKien.slice(0, 10) < homNay();
  return { dat, nhap, conThieu, huy, coHang, du, duKien, quaHen };
}

function mocCuaPo(r: SheetRow): SuaChuaMoc[] {
  const t = tinhTrangPo(r);
  const banHanh = sheetNgayVeDb(r.ngayBanHanh);
  const camKet = sheetNgayVeDb(r.nmCamKet);
  const hangVe = sheetNgayVeDb(r.ngayVeThucTe);
  const m = (key: string, label: string, at: string | null, xong: boolean, ghi_chu: string | null = null): SuaChuaMoc => ({
    key,
    label,
    trang_thai: xong ? "xong" : "chua",
    at,
    nguoi: null,
    ghi_chu,
  });
  let ds: SuaChuaMoc[] = [
    m("tao_po", "Tạo đề xuất", sheetNgayVeDb(r.ngayTao), true),
    m("ban_hanh", "Ban hành PO", banHanh, !!banHanh),
    m("nm_cam_ket", "NM cam kết", camKet, !!camKet),
    m(
      "hang_ve",
      t.coHang && !t.du ? "Về một phần" : "Hàng về",
      hangVe,
      t.coHang,
      t.coHang && !t.du && Number.isFinite(t.conThieu) ? tr("Còn thiếu {0}", t.conThieu) : null,
    ),
    m("du_hang", "Đủ hàng", t.du ? hangVe : null, t.du),
  ];
  // Buoc sau da xong -> buoc truoc coi nhu xong (vd sheet cu khong co ngay ban hanh / NM cam ket).
  let sauXong = false;
  for (let i = ds.length - 1; i >= 0; i--) {
    if (ds[i].trang_thai === "xong") sauXong = true;
    else if (sauXong) ds[i] = { ...ds[i], trang_thai: "xong" };
  }
  const iDang = ds.findIndex((x) => x.trang_thai === "chua");
  if (iDang >= 0) {
    if (t.huy) {
      ds[iDang] = { ...ds[iDang], trang_thai: "loi", label: r.trangThai || "Đã hủy" };
      ds = ds.slice(0, iDang + 1);
    } else {
      const ghi = t.quaHen ? tr("Quá ngày dự kiến {0}", r.ngayDuKienGanNhat) : t.duKien ? tr("Dự kiến {0}", r.ngayDuKienGanNhat) : null;
      ds[iDang] = { ...ds[iDang], trang_thai: t.quaHen ? "loi" : "dang", ghi_chu: [ds[iDang].ghi_chu, ghi].filter(Boolean).join(" · ") || null };
    }
  }
  return ds;
}

function PoCard({ r, onXemDayDu }: { r: SheetRow; onXemDayDu: (title: string, raw: Record<string, string>) => void }) {
  const [chiTiet, setChiTiet] = useState(false);
  const [moGhiChu, setMoGhiChu] = useState(false);
  const t = tinhTrangPo(r);
  const ds = mocCuaPo(r);
  const luuY = [
    r.canhBao && { nhan: tr("Cảnh báo"), text: r.canhBao, mau: "coral" },
    r.capCeo && { nhan: tr("Cấp CEO"), text: r.capCeo, mau: "coral" },
    r.keHoachHangVe && { nhan: tr("Kế hoạch hàng về"), text: r.keHoachHangVe, mau: "amber" },
    r.ghiChu && { nhan: tr("Ghi chú"), text: r.ghiChu, mau: "amber" },
  ].filter(Boolean) as { nhan: string; text: string; mau: "coral" | "amber" }[];

  return (
    <Card
      className={`p-3 ${t.huy ? "opacity-80" : ""}`}
      style={!t.huy && !t.du ? { borderLeft: `4px solid ${t.quaHen ? "var(--coral-500)" : t.coHang ? "var(--ocean-500)" : "var(--orange-500)"}` } : undefined}
    >
      <div className="flex items-start justify-between flex-wrap gap-1.5">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{r.tenLinhKien || tr("(chưa rõ linh kiện)")}</div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--ink-500)] mt-0.5">
            <span className="font-mono">{r.id}</span>
            {r.maLinhKienDeXuat && <MaLinhKienLink ma={r.maLinhKienDeXuat} ten={r.tenLinhKien} />}
            {r.maPheDuyet && <span>· {r.maPheDuyet}</span>}
            {r.khoCanDat && <span>· {tr("Kho:")} {r.khoCanDat}</span>}
            {r.doiTac && <span>· {r.doiTac}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {r.capCeo && <Badge tone="coral">{tr("Cấp CEO")}</Badge>}
          {t.quaHen && <Badge tone="coral">{tr("Quá ngày dự kiến")}</Badge>}
          {r._nguon === "app" ? <Badge tone="ocean">App EO</Badge> : r._nguon === "sheet" ? <Badge tone="gray">Google Sheet</Badge> : null}
          {r.trangThai && <Badge tone={poTone(r.trangThai)}>{r.trangThai}</Badge>}
        </div>
      </div>

      <div className="mt-2">
        <LuongNgang moc={ds} anGhiChu />
      </div>

      {!t.huy && (
        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 text-xs text-[var(--ink-600)] rounded-lg bg-[var(--surface-100)] px-3 py-2">
          <Field
            label={tr("SL đặt / về / còn thiếu")}
            value={
              <span className="font-semibold text-[var(--ink-900)]">
                {r.soLuongDat || "—"} / {r.slNhapTheoAmis || "—"} /{" "}
                <span className={t.conThieu > 0 ? "text-[var(--coral-600)]" : ""}>{r.soLuongConThieu || "—"}</span>
              </span>
            }
          />
          <Field
            label={tr("Dự kiến gần nhất")}
            value={<span className={t.quaHen ? "font-semibold text-[var(--coral-600)]" : "font-semibold text-[var(--ink-900)]"}>{r.ngayDuKienGanNhat || "—"}</span>}
          />
          <Field label={tr("Hàng về thực tế (PO)")} value={r.ngayVeThucTe ? <span title={r.phieuNhap ? tr("Phiếu nhập: {0}", r.phieuNhap) : undefined}>{r.ngayVeThucTe}</span> : "—"} />
          <Field label={tr("Tốc độ hàng về")} value={r.tocDoHangVe || "—"} />
        </div>
      )}

      {luuY.length > 0 &&
        (moGhiChu ? (
          <div className="mt-1.5">
            <button type="button" onClick={() => setMoGhiChu(false)} className="mb-1 px-1.5 text-xs font-semibold text-[var(--amber-600)] hover:underline">
              ▾ 📝 {tr("{0} ghi chú", luuY.length)} · {tr("Thu gọn")}
            </button>
            <div className="flex flex-col gap-1">
              {luuY.map((g, i) => (
                <div
                  key={i}
                  className={`rounded-md border-l-4 px-2 py-0.5 text-[13px] text-[var(--ink-900)] whitespace-pre-line ${g.mau === "coral" ? "border-[var(--coral-500)] bg-[var(--coral-100)]" : "border-[var(--amber-500)] bg-[var(--amber-100)]"}`}
                >
                  <span className="font-semibold">{g.nhan}:</span> {g.text}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setMoGhiChu(true)}
            className="focus-ring mt-1.5 flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-xs text-[var(--ink-500)] hover:bg-[var(--surface-100)]"
          >
            <span className="shrink-0 text-[var(--ink-400)]">▸</span>
            <span className={`shrink-0 font-semibold ${luuY[0].mau === "coral" ? "text-[var(--coral-600)]" : "text-[var(--amber-600)]"}`}>📝 {tr("{0} ghi chú", luuY.length)}</span>
            <span className="min-w-0 truncate">
              · <span className="font-medium">{luuY[0].nhan}:</span> {luuY[0].text}
            </span>
          </button>
        ))}

      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
        <button type="button" onClick={() => setChiTiet((v) => !v)} className="text-xs font-semibold text-[var(--ocean-600)] hover:underline">
          {chiTiet ? tr("▴ Thu gọn") : tr("▾ Xem chi tiết")}
        </button>
        <div className="flex items-center gap-1.5">
          {r.linkEo && (
            <a href={r.linkEo} target="_blank" rel="noopener noreferrer" className="text-xs underline text-[var(--ink-500)]">
              {tr("Mở EO ↗")}
            </a>
          )}
          <Btn size="sm" variant="ghost" onClick={() => onXemDayDu(tr("PO đặt hàng {0}", r.id), parseRawRow(r))}>
            {tr("🔍 Xem đầy đủ")}
          </Btn>
        </div>
      </div>

      {chiTiet && (
        <div className="mt-2 grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-semibold text-[var(--ink-500)] mb-1.5">{tr("Các mốc")}</div>
            <Luong moc={ds} />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[var(--ink-600)] content-start">
            <Field label={tr("Mã linh kiện đề xuất")} value={r.maLinhKienDeXuat ? <MaLinhKienLink ma={r.maLinhKienDeXuat} /> : "—"} />
            {r.maLinhKienGoc && <Field label={tr("Thay từ mã")} value={r.maLinhKienGoc} />}
            <Field label={tr("Đối tác")} value={r.doiTac || "—"} />
            <Field label={tr("Kho cần đặt hàng")} value={r.khoCanDat || "—"} />
            <Field label={tr("Trạng thái EO")} value={r.trangThaiEo || "—"} />
            <Field label={tr("Ngày tạo")} value={r.ngayTao || "—"} />
            <Field label={tr("Ngày ban hành PO")} value={r.ngayBanHanh || "—"} />
            <Field label={tr("NM cam kết")} value={r.nmCamKet || "—"} />
            <Field label={tr("Ngày về gần nhất toàn quốc")} value={r.ngayVeGanNhatToanQuoc || "—"} />
            {r.phieuNhap && <Field label={tr("Phiếu nhập AMIS")} value={r.phieuNhap} />}
            {r.soLoiTheoDoi && <Field label={tr("Lỗi theo dõi")} value={r.soLoiTheoDoi} />}
          </div>
        </div>
      )}
    </Card>
  );
}

/** Danh sach PO: dang cho (qua hen truoc) -> ve mot phan -> du hang -> huy. */
export function PoDatHangList({ rows, onXemDayDu }: { rows: SheetRow[]; onXemDayDu: (title: string, raw: Record<string, string>) => void }) {
  const hang = (r: SheetRow) => {
    const t = tinhTrangPo(r);
    return t.huy ? 4 : t.du ? 3 : t.coHang ? 2 : t.quaHen ? 0 : 1;
  };
  const ds = rows.map((r, i) => ({ r, i })).sort((a, b) => hang(a.r) - hang(b.r) || a.i - b.i);
  return (
    <div className="space-y-2.5">
      {ds.map(({ r, i }) => (
        <PoCard key={`${r.id}-${i}`} r={r} onXemDayDu={onXemDayDu} />
      ))}
    </div>
  );
}
