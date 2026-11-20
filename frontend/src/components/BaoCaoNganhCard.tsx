// "Báo cáo đúng hạn theo ngành" (2026-11-20, chu he thong - bao cao dung han hang tuan) o Tong quat: theo Ngành, ky = Tuần / Tháng
// dang chon o dau man, bo loc Ngành + Hãng (chon nhieu). Chi so: tỷ lệ 24h đối tác KRF / Hãng khác, tỷ lệ SLA, RTAT, tồn bình quân.
// 1 request / ky (GET /dashboard/bao-cao-nganh, server gop san theo Ngành x Hãng x nhom KRF); loc + cong + chuyen SLA cu / moi tren may.
// Nhom KRF = Đối tác KAROFI / KORIHOME / LIVOTEC / NSKX / PURASTAR / SIMPLE HOME (backend DOI_TAC_KRF_EXPR); con lai = Hãng khác.
// Ton binh quan = tong so ca ton luc 08:00 cac ngay trong ky / so ngay co so chot (tuan = 7 ngay; thang hien tai = so ngay da chot).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "./ui/Card";
import { Btn } from "./ui/Btn";
import { MultiSelectFilter } from "./MultiSelectFilter";
import { api, buildQuery } from "../api/client";
import { exportRowsToExcel } from "../lib/exportExcel";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { soSanhNhom } from "../lib/khuVucShortLabel";
import type { SlaCheDo } from "./SlaCheDoToggle";
import { tr } from "../i18n/tr";

interface Nhom {
  nganh: string;
  hang: string;
  krf: number;
  ca_dong: number;
  d24_cu: number;
  m24_cu: number;
  d24_moi: number;
  m24_moi: number;
  sla_ok: number;
  sla_tinh: number;
  sla_ok_moi: number;
  sla_tinh_moi: number;
  tong_gio: number;
  co_gio: number;
  tong_gio_moi: number;
  co_gio_moi: number;
}
interface Payload {
  nhom: Nhom[];
  ton: { gia_tri: string; so_ca: number }[] | null;
  so_ngay_ton: number;
}
interface Dong {
  nganh: string;
  caDong: number;
  d24Krf: number;
  m24Krf: number;
  d24Khac: number;
  m24Khac: number;
  slaOk: number;
  slaTinh: number;
  tongGio: number;
  coGio: number;
  tonTong: number;
}

const DELIM = "|";
const TRONG = "(Trống)";
const tyLe = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
const pt = (v: number | null) => (v === null ? "—" : `${v}%`);
const so1 = (v: number | null) => (v === null ? "—" : String(Math.round(v * 10) / 10));
const dongRong = (nganh: string): Dong => ({ nganh, caDong: 0, d24Krf: 0, m24Krf: 0, d24Khac: 0, m24Khac: 0, slaOk: 0, slaTinh: 0, tongGio: 0, coGio: 0, tonTong: 0 });

export function BaoCaoNganhCard({ tuNgay, denNgay, kyLabel, sla }: { tuNgay: string; denNgay: string; kyLabel: string; sla: SlaCheDo }) {
  const [locNganh, setLocNganh] = useLocalStorageState("filters:bao-cao-nganh-nganh", "");
  const [locHang, setLocHang] = useLocalStorageState("filters:bao-cao-nganh-hang", "");
  const q = useQuery({
    queryKey: ["dashboard-bao-cao-nganh", tuNgay, denNgay],
    queryFn: () => api.get<Payload>(`/dashboard/bao-cao-nganh${buildQuery({ tu: tuNgay, den: denNgay })}`),
    placeholderData: (prev) => prev,
  });
  // Hãng: server tra nguyen goc ("Karofi" / "KAROFI") -> viet hoa o day cho khop so chot ton (backend giaTriNganhHang).
  const data = useMemo(() => (q.data ? { ...q.data, nhom: q.data.nhom.map((n) => ({ ...n, hang: n.hang.trim().toUpperCase() })) } : undefined), [q.data]);
  const moi = sla === "moi";

  const tonDong = useMemo(
    () =>
      (data?.ton ?? []).map((t) => {
        const [nganh, hang] = t.gia_tri.split("\u001f");
        return { nganh: nganh ?? "", hang: hang ?? "", so_ca: Number(t.so_ca) || 0 };
      }),
    [data],
  );
  const nhanNganh = (v: string) => v || TRONG;
  const dsNganh = useMemo(() => [...new Set([...(data?.nhom ?? []).map((n) => n.nganh), ...tonDong.map((t) => t.nganh)])].sort(soSanhNhom), [data, tonDong]);
  const dsHang = useMemo(() => [...new Set([...(data?.nhom ?? []).map((n) => n.hang), ...tonDong.map((t) => t.hang)])].sort(soSanhNhom), [data, tonDong]);

  const { dongs, tong } = useMemo(() => {
    const chonN = new Set(locNganh ? locNganh.split(DELIM) : []);
    const chonH = new Set(locHang ? locHang.split(DELIM) : []);
    const qua = (nganh: string, hang: string) => (!chonN.size || chonN.has(nganh)) && (!chonH.size || chonH.has(hang));
    const theo = new Map<string, Dong>();
    const lay = (nganh: string) => theo.get(nganh) ?? (theo.set(nganh, dongRong(nganh)), theo.get(nganh)!);
    for (const n of data?.nhom ?? []) {
      if (!qua(n.nganh, n.hang)) continue;
      const d = lay(n.nganh);
      d.caDong += Number(n.ca_dong) || 0;
      const d24 = Number(moi ? n.d24_moi : n.d24_cu) || 0;
      const m24 = Number(moi ? n.m24_moi : n.m24_cu) || 0;
      if (n.krf) {
        d.d24Krf += d24;
        d.m24Krf += m24;
      } else {
        d.d24Khac += d24;
        d.m24Khac += m24;
      }
      d.slaOk += Number(moi ? n.sla_ok_moi : n.sla_ok) || 0;
      d.slaTinh += Number(moi ? n.sla_tinh_moi : n.sla_tinh) || 0;
      d.tongGio += Number(moi ? n.tong_gio_moi : n.tong_gio) || 0;
      d.coGio += Number(moi ? n.co_gio_moi : n.co_gio) || 0;
    }
    for (const t of tonDong) if (qua(t.nganh, t.hang)) lay(t.nganh).tonTong += t.so_ca;
    const ds = [...theo.values()].sort((a, b) => soSanhNhom(a.nganh, b.nganh));
    const t = dongRong(tr("Tổng cộng"));
    for (const d of ds) for (const k of Object.keys(t) as (keyof Dong)[]) if (k !== "nganh") (t[k] as number) += d[k] as number;
    return { dongs: ds, tong: t };
  }, [data, tonDong, locNganh, locHang, moi]);

  const coTon = data?.ton != null;
  const soNgay = data?.so_ngay_ton ?? 0;
  const tonBq = (d: Dong) => (coTon && soNgay ? d.tonTong / soNgay : null);
  const cot = (d: Dong) => ({
    ca: d.caDong,
    krf: tyLe(d.d24Krf, d.m24Krf),
    khac: tyLe(d.d24Khac, d.m24Khac),
    sla: tyLe(d.slaOk, d.slaTinh),
    rtat: d.coGio ? d.tongGio / d.coGio : null,
    ton: tonBq(d),
  });

  async function xuat() {
    await exportRowsToExcel(
      [tong, ...dongs].map((d, i) => {
        const v = cot(d);
        return {
          nganh: i === 0 ? "Tổng cộng" : nhanNganh(d.nganh),
          ca: v.ca,
          krf: pt(v.krf),
          khac: pt(v.khac),
          sla: pt(v.sla),
          rtat: so1(v.rtat),
          ton: so1(v.ton),
        };
      }),
      `bao_cao_dung_han_nganh_${tuNgay}${moi ? "_sla_moi" : ""}.xlsx`,
      "Data",
      {
        nganh: "Ngành",
        ca: "Số ca đóng (tính KPI)",
        krf: "Tỷ lệ 24h đối tác KRF",
        khac: "Tỷ lệ 24h Hãng khác",
        sla: moi ? "Tỷ lệ SLA mới (không loại trừ)" : "Tỷ lệ SLA",
        rtat: "RTAT (giờ)",
        ton: "Tồn bình quân / ngày",
      },
      { skipColumnPicker: true },
    );
  }

  const o = (d: Dong, dam = false) => {
    const v = cot(d);
    return (
      <tr key={d.nganh} className={`border-b border-[var(--line)] last:border-0 ${dam ? "bg-slate-50 font-bold" : "hover:bg-slate-50"}`}>
        <td className={`py-2 pr-3 ${dam ? "" : "font-semibold"}`}>{dam ? d.nganh : nhanNganh(d.nganh)}</td>
        <td className="py-2 pr-3 font-mono">{v.ca}</td>
        <td className="py-2 pr-3 font-mono" title={tr("{0} / {1} ca", d.d24Krf, d.m24Krf)}>{pt(v.krf)}</td>
        <td className="py-2 pr-3 font-mono" title={tr("{0} / {1} ca", d.d24Khac, d.m24Khac)}>{pt(v.khac)}</td>
        <td className="py-2 pr-3 font-mono" title={tr("{0} / {1} ca", d.slaOk, d.slaTinh)}>{pt(v.sla)}</td>
        <td className="py-2 pr-3 font-mono">{so1(v.rtat)}</td>
        <td className="py-2 pr-3 font-mono">{so1(v.ton)}</td>
      </tr>
    );
  };

  return (
    <Card className="p-4 mt-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="font-display font-bold text-sm">
          {tr("Báo cáo đúng hạn theo ngành")} <span className="font-normal text-xs text-[var(--ink-400)]">— {kyLabel}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MultiSelectFilter label={tr("Ngành")} value={locNganh} onChange={setLocNganh} options={dsNganh.map((v) => ({ value: v, label: nhanNganh(v) }))} />
          <MultiSelectFilter label={tr("Hãng")} value={locHang} onChange={setLocHang} options={dsHang.map((v) => ({ value: v, label: v || TRONG }))} />
          <Btn variant="ghost" size="sm" disabled={q.isFetching} onClick={xuat}>
            {tr("⬇ Xuất Excel")}
          </Btn>
        </div>
      </div>
      <p className="text-xs text-[var(--ink-400)] mb-2">
        {tr("Ca đóng trong kỳ (theo ngày hoàn thành), tính KPI. 24h KRF = đối tác Karofi, Korihome, Livotec, NSKX, Purastar, Simple Home; còn lại là Hãng khác. RTAT = giờ xử lý trung bình. Tồn bình quân = số ca tồn lúc 08:00 trung bình mỗi ngày.")}{" "}
        {moi ? tr("Đang xem SLA mới (không loại trừ).") : tr("Đang xem SLA cũ (có loại trừ).")}{" "}
        {coTon ? tr("Tồn tính trên {0} ngày có số chốt.", soNgay) : tr("Tồn bình quân chỉ hiện với vai trò xem toàn hệ thống.")}
      </p>
      {q.isError ? (
        <div className="text-sm text-[var(--coral-600)]">{tr("Không tải được dữ liệu")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="dense w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                <th className="py-2 pr-3">{tr("Ngành")}</th>
                <th className="py-2 pr-3">{tr("Số ca đóng (tính KPI)")}</th>
                <th className="py-2 pr-3">{tr("Tỷ lệ 24h đối tác KRF")}</th>
                <th className="py-2 pr-3">{tr("Tỷ lệ 24h Hãng khác")}</th>
                <th className="py-2 pr-3">{moi ? tr("Tỷ lệ SLA mới") : tr("Tỷ lệ SLA")}</th>
                <th className="py-2 pr-3">{tr("RTAT (giờ)")}</th>
                <th className="py-2 pr-3">{tr("Tồn bình quân / ngày")}</th>
              </tr>
            </thead>
            <tbody>
              {dongs.length > 0 && o(tong, true)}
              {dongs.map((d) => o(d))}
              {dongs.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--ink-400)] text-sm">
                    {q.isLoading ? tr("Đang tải…") : tr("Không có dữ liệu.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
