import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StatCard } from "../components/ui/StatCard";
import { Card } from "../components/ui/Card";
import { Btn } from "../components/ui/Btn";
import { ChartCanvas } from "../components/chart/ChartCanvas";
import { FilterBar, ALL_KHU_VUC, ALL_HANG, type DashboardFilters } from "../components/FilterBar";
import { CURRENT_MONTH_VALUE } from "../constants";
import { api, buildQuery } from "../api/client";
import { fmtVND } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { MultiSelectFilter } from "../components/MultiSelectFilter";

// Ten tinh giua 2 nguon lech nhau (CRM "Cần Thơ" / Odoo "Thành phố Cần Thơ", "Tỉnh Hoà Bình", Huế 2 cach ghi) - gom ve
// 1 ten de loc. Ca 2 nguon deu dung 63 tinh cu (do thuc te 2026-10-09).
function chuanHoaTinh(t: string | null): string {
  let s = (t ?? "").normalize("NFC").trim().replace(/^(Tỉnh|Thành phố|TP\.?)\s+/i, "").replace(/Hoà/g, "Hòa");
  if (s === "Thừa Thiên Huế") s = "Huế";
  return s || "(Không rõ tỉnh)";
}

interface RevenueKtvTinhRow {
  nhom: string;
  tinh: string | null;
  so_ca: number;
  so_ca_co_dt: number;
  doanh_thu: number;
}

// "% Upsale" = ca phat sinh doanh thu / tong ca hoan thanh XLSC (so_ca da chi gom ca Hoan thanh XLSC tinh KPI);
// "Gia tri TB don" = doanh thu / ca phat sinh doanh thu (2026-10-09).
type DongDt = { so_ca: number; so_ca_co_dt: number; doanh_thu: number };
function pctUpsale(r: DongDt): string {
  return r.so_ca ? `${((r.so_ca_co_dt / r.so_ca) * 100).toFixed(1)}%` : "0%";
}
function tbDon(r: DongDt): number {
  return r.so_ca_co_dt ? Math.round(r.doanh_thu / r.so_ca_co_dt) : 0;
}
function cotUpsale(r: DongDt) {
  return { so_ca_co_dt: r.so_ca_co_dt, upsale: pctUpsale(r), dt_tb: r.so_ca ? Math.round(r.doanh_thu / r.so_ca) : 0, tb_don: tbDon(r) };
}
const NHAN_UPSALE = { so_ca_co_dt: "Ca phát sinh DT", upsale: "% Upsale", dt_tb: "DT trung bình / ca", tb_don: "Giá trị TB đơn" };

interface RevenueByDim {
  totals: { tong: number; dt_san_pham: number; dt_linh_kien: number; dt_dich_vu: number };
  byDim: { nhom: string; so_ca: number; so_ca_co_dt?: number; doanh_thu: number }[];
}

export function RevenueModule() {
  const [filters, setFilters] = useLocalStorageState<DashboardFilters>("filters:revenue", { khu_vuc: ALL_KHU_VUC, hang: ALL_HANG, thang: CURRENT_MONTH_VALUE });
  const filterParams = {
    khu_vuc: filters.khu_vuc !== ALL_KHU_VUC ? filters.khu_vuc : undefined,
    hang: filters.hang !== ALL_HANG ? filters.hang : undefined,
    thang: filters.thang,
  };

  const { data: byKhuVuc } = useQuery({
    queryKey: ["revenue-khuvuc", filterParams],
    queryFn: () => api.get<RevenueByDim>(`/revenue${buildQuery({ ...filterParams, dim: "khu_vuc" })}`),
  });
  const { data: byHang } = useQuery({
    queryKey: ["revenue-hang", filterParams],
    queryFn: () => api.get<RevenueByDim>(`/revenue${buildQuery({ ...filterParams, dim: "hang" })}`),
  });
  const { data: byKtv } = useQuery({
    queryKey: ["revenue-ktv", filterParams],
    queryFn: () => api.get<RevenueByDim>(`/revenue${buildQuery({ ...filterParams, dim: "ky_thuat_vien" })}`),
  });

  // Bo loc Tinh rieng cho bang KTV (2026-10-09). Chua chon tinh -> giu nguyen so lieu cu (dim ky_thuat_vien, dong bo
  // bao cao 08:00); chon tinh -> cong tu dim "ky_thuat_vien_tinh" (KTV x tinh) da chuan hoa ten tinh.
  const [tinhFilter, setTinhFilter] = useState("");
  const { data: byKtvTinh } = useQuery({
    queryKey: ["revenue-ktv-tinh", filterParams],
    queryFn: () => api.get<{ byDim: RevenueKtvTinhRow[] }>(`/revenue${buildQuery({ ...filterParams, dim: "ky_thuat_vien_tinh" })}`),
  });
  const tinhOptions = useMemo(
    () => [...new Set((byKtvTinh?.byDim ?? []).map((r) => chuanHoaTinh(r.tinh)))].sort((a, b) => a.localeCompare(b, "vi")),
    [byKtvTinh],
  );
  const tinhChon = useMemo(() => new Set(tinhFilter.split("|").filter(Boolean)), [tinhFilter]);
  const ktvRows = useMemo((): ({ nhom: string } & DongDt)[] => {
    // Chua loc tinh + du lieu (snapshot 08:00 / cache) da co so_ca_co_dt -> dung thang; snapshot tao truoc 2026-10-09
    // chua co cot nay -> gom tu KTV x tinh (song) de cot Upsale khong bi trong.
    const snap = byKtv?.byDim ?? [];
    if (tinhChon.size === 0 && (snap.length === 0 || snap[0].so_ca_co_dt !== undefined)) {
      return snap.map((r) => ({ ...r, so_ca_co_dt: r.so_ca_co_dt ?? 0 }));
    }
    const gom = new Map<string, { nhom: string } & DongDt>();
    for (const r of byKtvTinh?.byDim ?? []) {
      if (tinhChon.size > 0 && !tinhChon.has(chuanHoaTinh(r.tinh))) continue;
      const g = gom.get(r.nhom) ?? { nhom: r.nhom, so_ca: 0, so_ca_co_dt: 0, doanh_thu: 0 };
      g.so_ca += r.so_ca;
      g.so_ca_co_dt += r.so_ca_co_dt ?? 0;
      g.doanh_thu += r.doanh_thu ?? 0;
      gom.set(r.nhom, g);
    }
    return [...gom.values()];
  }, [tinhChon, byKtv, byKtvTinh]);

  // Bao cao "Doanh thu theo tinh" (2026-10-09): moi ca (ke ca chua gan KTV), gop theo ten tinh da chuan hoa; bam 1 dong
  // -> them/bo tinh do vao bo loc Tinh cua bang KTV ben duoi.
  const { data: byTinh } = useQuery({
    queryKey: ["revenue-tinh", filterParams],
    queryFn: () => api.get<{ byDim: { nhom: string | null; so_ca: number; so_ca_co_dt: number; doanh_thu: number }[] }>(`/revenue${buildQuery({ ...filterParams, dim: "tinh" })}`),
  });
  const tinhRows = useMemo(() => {
    const gom = new Map<string, { tinh: string } & DongDt>();
    for (const r of byTinh?.byDim ?? []) {
      const t = chuanHoaTinh(r.nhom);
      const g = gom.get(t) ?? { tinh: t, so_ca: 0, so_ca_co_dt: 0, doanh_thu: 0 };
      g.so_ca += r.so_ca;
      g.so_ca_co_dt += r.so_ca_co_dt ?? 0;
      g.doanh_thu += r.doanh_thu ?? 0;
      gom.set(t, g);
    }
    return [...gom.values()].sort((a, b) => b.doanh_thu - a.doanh_thu);
  }, [byTinh]);
  const tinhTong = useMemo(
    () =>
      tinhRows.reduce(
        (acc, r) => ({ so_ca: acc.so_ca + r.so_ca, so_ca_co_dt: acc.so_ca_co_dt + r.so_ca_co_dt, doanh_thu: acc.doanh_thu + r.doanh_thu }),
        { so_ca: 0, so_ca_co_dt: 0, doanh_thu: 0 },
      ),
    [tinhRows],
  );
  const tinhMax = tinhRows[0]?.doanh_thu ?? 0;
  const toggleTinh = (t: string) => {
    const next = new Set(tinhChon);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setTinhFilter([...next].join("|"));
  };

  const totals = byKhuVuc?.totals;

  // Dong "Tong cong" dau bang KTV - cong so_ca/doanh_thu tren cac dong dang hien, tinh lai "DT trung
  // binh/ca" tu tong (khong cong trung binh cua trung binh tung dong).
  const ktvTotal = useMemo(
    (): DongDt => ({
      so_ca: ktvRows.reduce((acc, r) => acc + r.so_ca, 0),
      so_ca_co_dt: ktvRows.reduce((acc, r) => acc + r.so_ca_co_dt, 0),
      doanh_thu: ktvRows.reduce((acc, r) => acc + r.doanh_thu, 0),
    }),
    [ktvRows],
  );

  // Cot dau tien (Ky thuat vien) sap A-Z.
  const sortedKtvRows = [...ktvRows].sort((a, b) => a.nhom.localeCompare(b.nhom, "vi"));

  return (
    <div className="anim-in">
      <FilterBar filters={filters} setFilters={setFilters} />
      <div className="flex flex-wrap gap-3 mb-4">
        <StatCard label="Tổng doanh thu" value={fmtVND(totals?.tong)} tone="ocean" />
        <StatCard label="DT sản phẩm" value={fmtVND(totals?.dt_san_pham)} tone="teal" />
        <StatCard label="DT linh kiện" value={fmtVND(totals?.dt_linh_kien)} tone="amber" />
        <StatCard label="DT dịch vụ" value={fmtVND(totals?.dt_dich_vu)} tone="coral" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card className="p-4">
          <div className="font-display font-bold text-sm mb-3">Doanh thu theo khu vực</div>
          <ChartCanvas
            type="bar"
            data={{ labels: (byKhuVuc?.byDim ?? []).map((x) => shortKhuVuc(x.nhom)), datasets: [{ label: "Doanh thu", data: (byKhuVuc?.byDim ?? []).map((x) => x.doanh_thu), backgroundColor: "#1591C9", borderRadius: 6 }] }}
          />
        </Card>
        <Card className="p-4">
          <div className="font-display font-bold text-sm mb-3">Doanh thu theo hãng</div>
          <ChartCanvas
            type="bar"
            data={{ labels: (byHang?.byDim ?? []).map((x) => x.nhom), datasets: [{ label: "Doanh thu", data: (byHang?.byDim ?? []).map((x) => x.doanh_thu), backgroundColor: "#159C93", borderRadius: 6 }] }}
          />
        </Card>
      </div>
      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div>
            <div className="font-display font-bold text-sm">Doanh thu theo tỉnh</div>
            <div className="text-xs text-[var(--ink-400)] mt-0.5">Tất cả ca tính KPI (kể cả chưa gán KTV), sắp theo doanh thu · bấm 1 tỉnh để lọc bảng KTV bên dưới</div>
          </div>
          <Btn
            variant="ghost"
            size="sm"
            onClick={() =>
              exportRowsToExcel(
                tinhRows.map((r) => ({
                  tinh: r.tinh,
                  so_ca: r.so_ca,
                  ...cotUpsale(r),
                  doanh_thu: r.doanh_thu,
                  ty_trong: tinhTong.doanh_thu ? `${((r.doanh_thu / tinhTong.doanh_thu) * 100).toFixed(1)}%` : "0%",
                })),
                "doanh_thu_theo_tinh.xlsx",
                "Data",
                { tinh: "Tỉnh", so_ca: "Số ca HT XLSC", doanh_thu: "Doanh thu", ty_trong: "Tỷ trọng", ...NHAN_UPSALE },
              )
            }
          >
            ⬇ Xuất Excel
          </Btn>
        </div>
        <div className="overflow-auto max-h-[420px]">
          <table className="dense w-full text-sm">
            <thead className="sticky top-0 z-[1] bg-[var(--surface)]">
              <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                <th className="py-2 pr-3 w-10">#</th>
                <th className="py-2 pr-3">Tỉnh</th>
                <th className="py-2 pr-3 text-right">Số ca HT XLSC</th>
                <th className="py-2 pr-3 text-right">Ca phát sinh DT</th>
                <th className="py-2 pr-3 text-right">% Upsale</th>
                <th className="py-2 pr-3 text-right">Doanh thu</th>
                <th className="py-2 pr-3 text-right">DT trung bình / ca</th>
                <th className="py-2 pr-3 text-right">Giá trị TB đơn</th>
                <th className="py-2 pr-3 w-[22%]">Tỷ trọng</th>
              </tr>
            </thead>
            <tbody>
              {tinhRows.length > 0 && (
                <tr className="border-b border-[var(--line)] bg-slate-50 font-bold">
                  <td className="py-2 pr-3" />
                  <td className="py-2 pr-3">Tổng cộng ({tinhRows.length} tỉnh)</td>
                  <td className="py-2 pr-3 font-mono text-right">{tinhTong.so_ca}</td>
                  <td className="py-2 pr-3 font-mono text-right">{tinhTong.so_ca_co_dt}</td>
                  <td className="py-2 pr-3 font-mono text-right">{pctUpsale(tinhTong)}</td>
                  <td className="py-2 pr-3 font-mono text-right">{fmtVND(tinhTong.doanh_thu)}</td>
                  <td className="py-2 pr-3 font-mono text-right">{tinhTong.so_ca ? fmtVND(Math.round(tinhTong.doanh_thu / tinhTong.so_ca)) : fmtVND(0)}</td>
                  <td className="py-2 pr-3 font-mono text-right">{fmtVND(tbDon(tinhTong))}</td>
                  <td className="py-2 pr-3 text-xs text-[var(--ink-400)]">100%</td>
                </tr>
              )}
              {tinhRows.map((r, i) => {
                const pct = tinhTong.doanh_thu ? (r.doanh_thu / tinhTong.doanh_thu) * 100 : 0;
                const dangLoc = tinhChon.has(r.tinh);
                return (
                  <tr
                    key={r.tinh}
                    onClick={() => toggleTinh(r.tinh)}
                    title={dangLoc ? "Bỏ tỉnh này khỏi bộ lọc bảng KTV" : "Lọc bảng KTV theo tỉnh này"}
                    className={`border-b border-[var(--line)] last:border-0 cursor-pointer ${dangLoc ? "bg-[var(--ocean-100)]" : "hover:bg-slate-50"}`}
                  >
                    <td className="py-2 pr-3 text-xs text-[var(--ink-400)]">{i + 1}</td>
                    <td className="py-2 pr-3 font-semibold">
                      {dangLoc && <span className="text-[var(--ocean-600)]">✓ </span>}
                      {r.tinh}
                    </td>
                    <td className="py-2 pr-3 font-mono text-right">{r.so_ca}</td>
                    <td className="py-2 pr-3 font-mono text-right">{r.so_ca_co_dt}</td>
                    <td className="py-2 pr-3 font-mono text-right font-semibold">{pctUpsale(r)}</td>
                    <td className="py-2 pr-3 font-mono text-right">{fmtVND(r.doanh_thu)}</td>
                    <td className="py-2 pr-3 font-mono text-right">{r.so_ca ? fmtVND(Math.round(r.doanh_thu / r.so_ca)) : fmtVND(0)}</td>
                    <td className="py-2 pr-3 font-mono text-right">{fmtVND(tbDon(r))}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full bg-[var(--ocean-500)]" style={{ width: `${tinhMax ? (r.doanh_thu / tinhMax) * 100 : 0}%` }} />
                        </div>
                        <span className="text-xs font-mono w-12 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {tinhRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[var(--ink-400)] text-sm">
                    Không có dữ liệu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-display font-bold text-sm">
            Doanh thu theo kỹ thuật viên
            {tinhChon.size > 0 && <span className="ml-2 text-xs font-semibold text-[var(--ocean-600)]">· {[...tinhChon].join(", ")}</span>}
          </div>
          <div className="flex items-center gap-2">
            <MultiSelectFilter label="Tỉnh" value={tinhFilter} onChange={setTinhFilter} options={tinhOptions} />
            <Btn
              variant="ghost"
              size="sm"
              onClick={() =>
                exportRowsToExcel(
                  sortedKtvRows.map((r) => ({
                    nhom: r.nhom,
                    so_ca: r.so_ca,
                    ...cotUpsale(r),
                    doanh_thu: r.doanh_thu,
                    ...(tinhChon.size > 0 ? { tinh: [...tinhChon].join(", ") } : {}),
                  })),
                  tinhChon.size > 0 ? "doanh_thu_ky_thuat_vien_theo_tinh.xlsx" : "doanh_thu_ky_thuat_vien.xlsx",
                  "Data",
                  { nhom: "Kỹ thuật viên", so_ca: "Số ca HT XLSC", doanh_thu: "Doanh thu", tinh: "Tỉnh (bộ lọc)", ...NHAN_UPSALE },
                )
              }
            >
              ⬇ Xuất Excel
            </Btn>
          </div>
        </div>
        <table className="dense w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
              <th className="py-2 pr-3">Kỹ thuật viên</th>
              <th className="py-2 pr-3 text-right">Số ca HT XLSC</th>
              <th className="py-2 pr-3 text-right">Ca phát sinh DT</th>
              <th className="py-2 pr-3 text-right">% Upsale</th>
              <th className="py-2 pr-3 text-right">Doanh thu</th>
              <th className="py-2 pr-3 text-right">DT trung bình / ca</th>
              <th className="py-2 pr-3 text-right">Giá trị TB đơn</th>
            </tr>
          </thead>
          <tbody>
            {sortedKtvRows.length > 0 && (
              <tr className="border-b border-[var(--line)] bg-slate-50 font-bold">
                <td className="py-2 pr-3">Tổng cộng</td>
                <td className="py-2 pr-3 font-mono text-right">{ktvTotal.so_ca}</td>
                <td className="py-2 pr-3 font-mono text-right">{ktvTotal.so_ca_co_dt}</td>
                <td className="py-2 pr-3 font-mono text-right">{pctUpsale(ktvTotal)}</td>
                <td className="py-2 pr-3 font-mono text-right">{fmtVND(ktvTotal.doanh_thu)}</td>
                <td className="py-2 pr-3 font-mono text-right">{ktvTotal.so_ca ? fmtVND(Math.round(ktvTotal.doanh_thu / ktvTotal.so_ca)) : fmtVND(0)}</td>
                <td className="py-2 pr-3 font-mono text-right">{fmtVND(tbDon(ktvTotal))}</td>
              </tr>
            )}
            {sortedKtvRows.map((r) => (
              <tr key={r.nhom} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                <td className="py-2 pr-3 font-semibold">{r.nhom}</td>
                <td className="py-2 pr-3 font-mono text-right">{r.so_ca}</td>
                <td className="py-2 pr-3 font-mono text-right">{r.so_ca_co_dt}</td>
                <td className="py-2 pr-3 font-mono text-right font-semibold">{pctUpsale(r)}</td>
                <td className="py-2 pr-3 font-mono text-right">{fmtVND(r.doanh_thu)}</td>
                <td className="py-2 pr-3 font-mono text-right">{r.so_ca ? fmtVND(Math.round(r.doanh_thu / r.so_ca)) : fmtVND(0)}</td>
                <td className="py-2 pr-3 font-mono text-right">{fmtVND(tbDon(r))}</td>
              </tr>
            ))}
            {sortedKtvRows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[var(--ink-400)] text-sm">
                  Không có dữ liệu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
