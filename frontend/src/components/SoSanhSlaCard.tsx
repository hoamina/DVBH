// Bao cao "So sánh SLA cũ / SLA mới" (2026-11-20, chu he thong) - Tong quat, cung nhom (khu vuc / tinh / doi tac / hang / nhom yeu
// cau / KTV) + cung bo loc voi bang pivot; dung so goc cua computeDashboardPivot (khong qua cong tac). Chi hien tu 11/2026.
// SLA cu = dung_han; SLA moi = COALESCE(dung_han_klt, dung_han) (xem components/SlaCheDoToggle.tsx). Cung mau so (ca tinh KPI).
import { useMemo, useState } from "react";
import { Card } from "./ui/Card";
import { Btn } from "./ui/Btn";
import { exportRowsToExcel } from "../lib/exportExcel";
import { tr } from "../i18n/tr";

export interface SoSanhSlaRow {
  nhom: string;
  dung_han_tinh: number;
  sla_ok: number;
  duoi_24h_count: number;
  co_tinh_24h: number;
  co_tinh_gio: number;
  dung_han_tinh_moi?: number;
  sla_ok_moi?: number;
  duoi_24h_moi?: number;
  co_tinh_gio_moi?: number;
  co_moc_odoo?: number;
  cu_dh_moi_qh?: number;
  cu_qh_moi_dh?: number;
  tong_gio?: number;
  tong_gio_moi?: number;
}

interface Dong {
  khoa: string;
  nhom: string;
  caTinh: number;
  slaCu: number | null;
  slaMoi: number | null;
  chenh: number | null;
  mocOdoo: number;
  tyMocOdoo: number | null;
  dhThanhQh: number;
  qhThanhDh: number;
  ty24hCu: number | null;
  ty24hMoi: number | null;
  gioTbCu: number | null;
  gioTbMoi: number | null;
}

type Cot = keyof Dong;

const ty = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
const tb = (a: number, b: number) => (b ? Math.round((a / b) * 10) / 10 : null);
const n = (v: number | undefined) => Number(v) || 0;
const boDau = (v: string) => v.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").toLowerCase();

function tinhDong(nhom: string, r: SoSanhSlaRow): Dong {
  const khoa = r.nhom;
  const slaCu = ty(n(r.sla_ok), n(r.dung_han_tinh));
  const slaMoi = ty(n(r.sla_ok_moi), n(r.dung_han_tinh_moi));
  return {
    khoa,
    nhom,
    caTinh: n(r.dung_han_tinh_moi),
    slaCu,
    slaMoi,
    chenh: slaCu !== null && slaMoi !== null ? Math.round((slaMoi - slaCu) * 10) / 10 : null,
    mocOdoo: n(r.co_moc_odoo),
    tyMocOdoo: ty(n(r.co_moc_odoo), n(r.dung_han_tinh_moi)),
    dhThanhQh: n(r.cu_dh_moi_qh),
    qhThanhDh: n(r.cu_qh_moi_dh),
    ty24hCu: ty(n(r.duoi_24h_count), n(r.co_tinh_24h)),
    ty24hMoi: ty(n(r.duoi_24h_moi), n(r.co_tinh_gio_moi)),
    gioTbCu: tb(n(r.tong_gio), n(r.co_tinh_gio)),
    gioTbMoi: tb(n(r.tong_gio_moi), n(r.co_tinh_gio_moi)),
  };
}

const COTS: { cot: Exclude<Cot, "khoa">; label: string; title?: string }[] = [
  { cot: "nhom", label: tr("Nhóm") },
  { cot: "caTinh", label: tr("Số ca tính SLA"), title: tr("Ca tính KPI đã đóng, có kết quả SLA") },
  { cot: "slaCu", label: tr("SLA cũ") },
  { cot: "slaMoi", label: tr("SLA mới") },
  { cot: "chenh", label: tr("Chênh lệch"), title: tr("SLA mới − SLA cũ (điểm %)") },
  { cot: "mocOdoo", label: tr("Ca có mốc SLA Odoo"), title: tr("Ca tính SLA mới theo mốc Odoo; còn lại dùng SLA cũ") },
  { cot: "dhThanhQh", label: tr("Cũ ĐH → Mới QH"), title: tr("Đúng hạn theo SLA cũ nhưng quá hạn theo SLA mới") },
  { cot: "qhThanhDh", label: tr("Cũ QH → Mới ĐH"), title: tr("Quá hạn theo SLA cũ nhưng đúng hạn theo SLA mới") },
  { cot: "ty24hCu", label: tr("≤24h cũ") },
  { cot: "ty24hMoi", label: tr("≤24h mới") },
  { cot: "gioTbCu", label: tr("Giờ xử lý TB cũ") },
  { cot: "gioTbMoi", label: tr("Giờ xử lý TB mới") },
];

const phanTram = (v: number | null) => (v === null ? "—" : `${v}%`);
const so = (v: number | null) => (v === null ? "—" : String(v));

export function SoSanhSlaCard({ rows, nhanNhom, tenFile }: { rows: SoSanhSlaRow[]; nhanNhom: (nhom: string) => string; tenFile: string }) {
  const [sapXep, setSapXep] = useState<{ cot: Cot; chieu: "asc" | "desc" }>({ cot: "chenh", chieu: "asc" });
  const [tim, setTim] = useState("");

  const { dongs, tong } = useMemo(() => {
    const q = boDau(tim.trim());
    const ds = rows.map((r) => tinhDong(nhanNhom(r.nhom), r)).filter((d) => !q || boDau(d.nhom).includes(q));
    ds.sort((a, b) => {
      const x = a[sapXep.cot];
      const y = b[sapXep.cot];
      if (x === null && y === null) return 0;
      if (x === null) return 1; // trong luon xuong cuoi
      if (y === null) return -1;
      const s = typeof x === "string" ? x.localeCompare(String(y), "vi") : (x as number) - (y as number);
      return sapXep.chieu === "asc" ? s : -s;
    });
    const loc = rows.filter((r) => !q || boDau(nhanNhom(r.nhom)).includes(q));
    const cong = (k: keyof SoSanhSlaRow) => loc.reduce((acc, r) => acc + n(r[k] as number | undefined), 0);
    const tongRow: SoSanhSlaRow = {
      nhom: tr("Tổng cộng"),
      dung_han_tinh: cong("dung_han_tinh"), sla_ok: cong("sla_ok"), duoi_24h_count: cong("duoi_24h_count"), co_tinh_24h: cong("co_tinh_24h"),
      co_tinh_gio: cong("co_tinh_gio"), dung_han_tinh_moi: cong("dung_han_tinh_moi"), sla_ok_moi: cong("sla_ok_moi"),
      duoi_24h_moi: cong("duoi_24h_moi"), co_tinh_gio_moi: cong("co_tinh_gio_moi"), co_moc_odoo: cong("co_moc_odoo"),
      cu_dh_moi_qh: cong("cu_dh_moi_qh"), cu_qh_moi_dh: cong("cu_qh_moi_dh"), tong_gio: cong("tong_gio"), tong_gio_moi: cong("tong_gio_moi"),
    };
    return { dongs: ds, tong: tinhDong(tr("Tổng cộng"), tongRow) };
  }, [rows, nhanNhom, tim, sapXep]);

  const bamSapXep = (cot: Cot) => setSapXep((s) => ({ cot, chieu: s.cot === cot && s.chieu === "asc" ? "desc" : "asc" }));
  const muiTen = (cot: Cot) => (sapXep.cot === cot ? (sapXep.chieu === "asc" ? " ▲" : " ▼") : "");

  const o = (d: Dong, cot: Cot) => {
    const v = d[cot];
    if (cot === "nhom") return v as string;
    if (cot === "chenh") {
      const c = v as number | null;
      if (c === null) return "—";
      const mau = c < 0 ? "text-[var(--coral-600)]" : c > 0 ? "text-[var(--teal-600)]" : "";
      return <span className={mau}>{`${c > 0 ? "+" : ""}${c}`}</span>;
    }
    if (cot === "mocOdoo") return `${d.mocOdoo}${d.tyMocOdoo !== null ? ` (${d.tyMocOdoo}%)` : ""}`;
    if (cot === "slaCu" || cot === "slaMoi" || cot === "ty24hCu" || cot === "ty24hMoi") return phanTram(v as number | null);
    return so(v as number | null);
  };

  async function xuat() {
    await exportRowsToExcel(
      [tong, ...dongs].map((d) => ({
        nhom: d.nhom, ca_tinh: d.caTinh, sla_cu: phanTram(d.slaCu), sla_moi: phanTram(d.slaMoi), chenh: d.chenh ?? "",
        moc_odoo: d.mocOdoo, dh_qh: d.dhThanhQh, qh_dh: d.qhThanhDh, ty24h_cu: phanTram(d.ty24hCu), ty24h_moi: phanTram(d.ty24hMoi),
        gio_cu: d.gioTbCu ?? "", gio_moi: d.gioTbMoi ?? "",
      })),
      `${tenFile}.xlsx`,
      "Data",
      {
        nhom: "Nhóm", ca_tinh: "Số ca tính SLA", sla_cu: "SLA cũ (có loại trừ)", sla_moi: "SLA mới (không loại trừ)", chenh: "Chênh lệch (điểm %)",
        moc_odoo: "Ca có mốc SLA Odoo", dh_qh: "Cũ ĐH → Mới QH", qh_dh: "Cũ QH → Mới ĐH", ty24h_cu: "≤24h cũ", ty24h_moi: "≤24h mới",
        gio_cu: "Giờ xử lý TB cũ", gio_moi: "Giờ xử lý TB mới",
      },
      { skipColumnPicker: true },
    );
  }

  return (
    <Card className="p-4 mt-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="font-display font-bold text-sm">{tr("So sánh SLA cũ (có loại trừ) / SLA mới (không loại trừ)")}</div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={tim}
            onChange={(e) => setTim(e.target.value)}
            placeholder={tr("Lọc nhóm…")}
            className="focus-ring w-40 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
          />
          {tim && (
            <button type="button" className="text-xs text-[var(--coral-600)] hover:underline" onClick={() => setTim("")}>
              × {tr("Xoá lọc")}
            </button>
          )}
          <Btn variant="ghost" size="sm" onClick={xuat}>
            {tr("⬇ Xuất Excel")}
          </Btn>
        </div>
      </div>
      <p className="text-xs text-[var(--ink-400)] mb-2">
        {tr("Cùng nhóm và bộ lọc với bảng pivot. SLA mới: giờ từ lúc tiếp nhận đến đóng ca, Đúng hạn khi giờ < mốc SLA Odoo (18/30/42/90h); ca không có mốc dùng SLA cũ. Cùng mẫu số: ca tính KPI đã đóng.")}{" "}
        {tr("{0} / {1} dòng", dongs.length, rows.length)}
      </p>
      <div className="overflow-x-auto">
        <table className="dense w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
              {COTS.map((c) => (
                <th key={c.cot} className="py-2 pr-3 cursor-pointer select-none whitespace-nowrap" title={c.title} onClick={() => bamSapXep(c.cot)}>
                  {c.label}
                  {muiTen(c.cot)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dongs.length > 0 && (
              <tr className="border-b border-[var(--line)] bg-slate-50 font-bold">
                {COTS.map((c) => (
                  <td key={c.cot} className={`py-2 pr-3 ${c.cot === "nhom" ? "" : "font-mono"}`}>{o(tong, c.cot)}</td>
                ))}
              </tr>
            )}
            {dongs.map((d) => (
              <tr key={d.khoa} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                {COTS.map((c) => (
                  <td key={c.cot} className={`py-2 pr-3 ${c.cot === "nhom" ? "font-semibold" : "font-mono"}`}>{o(d, c.cot)}</td>
                ))}
              </tr>
            ))}
            {dongs.length === 0 && (
              <tr>
                <td colSpan={COTS.length} className="py-8 text-center text-[var(--ink-400)] text-sm">
                  {tr("Không có dữ liệu.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
