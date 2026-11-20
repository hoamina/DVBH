import { coNhomDvbh, useKhuVucHieuLuc } from "../lib/phamVi";
import { useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select } from "../components/ui/Select";
import { KhuVucFilterControl } from "./KhuVucFilterControl";
import { MultiSelectFilter } from "./MultiSelectFilter";
import { Btn } from "../components/ui/Btn";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { QLDVBH_FILTER_VALUE, CURRENT_MONTH_VALUE } from "../constants";
import { tr } from "../i18n/tr";

export interface DashboardFilters {
  khu_vuc: string;
  hang: string;
  thang: string;
}

export const ALL_KHU_VUC = "Tất cả khu vực";
export const ALL_HANG = "Tất cả hãng";

export function FilterBar({
  filters,
  setFilters,
  onExport,
  renderThang,
  compact = false,
  children,
}: {
  filters: DashboardFilters;
  setFilters: (f: DashboardFilters) => void;
  onExport?: () => void;
  /** Thay o chon thang (Tong quat: cong tac Thang/Tuan bao quanh, che do Tuan an o thang). */
  renderThang?: (oThang: ReactNode) => ReactNode;
  /** Kieu gon (Tong quat, 2026-11-20): 1 dong dinh tren dau khi cuon (desktop), o thang ghi "Tháng MM/YYYY (hiện tại)"
   * thay cho o "Đang xem" rieng, ky xem day sang phai. Man khac (Doanh thu) giu kieu cu. */
  compact?: boolean;
  /** Bo loc phu nam CUNG DONG sau o Hang (vd Model, Ngành cua Tong quat). */
  children?: ReactNode;
}) {
  const auth = useAuth();
  const myAreas = auth.status === "authenticated" ? auth.user.khu_vuc_phu_trach : [];

  const { data } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ khuVuc: string[]; hang: string[] }>("/dashboard/filters"),
  });
  const { data: monthsData } = useQuery({
    queryKey: ["dashboard-months"],
    queryFn: () => api.get<{ months: string[] }>("/dashboard/months"),
  });

  // Nuoc khac VN: "Tất cả DVBH" hien nhu "Tất cả khu vực" (request da bo khu_vuc nay o api/client.ts).
  const khuVucHienThi = useKhuVucHieuLuc(filters.khu_vuc, ALL_KHU_VUC);
  const khuVucOptions = [
    ALL_KHU_VUC,
    ...(coNhomDvbh() ? [{ value: QLDVBH_FILTER_VALUE, label: tr("Tất cả QLDVBH (MB/MN...)") }] : []),
    ...(data?.khuVuc ?? []).map((k) => ({ value: k, label: k })),
  ];
  // Chot 2026-07-24: chi cho chon 1 thang co dinh, khong con tuy chon "Tat ca cac thang" (lap he
  // thong quet toan bo lich su moi lan chon) - mac dinh luon la thang hien tai (xem filters.thang
  // khoi tao CURRENT_MONTH_VALUE o DashboardModule.tsx/RevenueModule.tsx).
  const thangNay = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
  const nhanThang = (v: string) => (/^\d{4}-\d{2}$/.test(v) ? tr("Tháng {0}", `${v.slice(5, 7)}/${v.slice(0, 4)}`) : v);
  const thangOptions = compact
    ? [
        { value: CURRENT_MONTH_VALUE, label: `${nhanThang(thangNay)} ${tr("(hiện tại)")}` },
        ...(monthsData?.months ?? []).map((m) => ({ value: m, label: nhanThang(m) })),
      ]
    : [{ value: CURRENT_MONTH_VALUE, label: tr("Tháng hiện tại") }, ...(monthsData?.months ?? [])];

  // 2026-11-16: bo loc luu localStorage dung chung moi quoc gia -> sang PH van giu thang/hang cua VN (vd 2026-10, PH chua co
  // du lieu). <select> khong co gia tri do nen HIEN "Tháng hiện tại" nhung van gui thang cu -> bao cao trong. Gia tri da luu
  // khong con trong danh sach cua nuoc dang xem -> ve mac dinh.
  useEffect(() => {
    if (!monthsData || !data) return;
    const thangHopLe = filters.thang === CURRENT_MONTH_VALUE || monthsData.months.includes(filters.thang);
    // Hang chon nhieu (v1.645, gia tri noi "|"): giu cac hang con co, bo hang khong con; khong con hang nao -> "Tất cả hãng".
    const hangDaChon = filters.hang === ALL_HANG ? [] : filters.hang.split("|").filter(Boolean);
    const hangConCo = hangDaChon.filter((h) => data.hang.includes(h));
    const hangHopLe = hangConCo.length === hangDaChon.length && (filters.hang === ALL_HANG || hangDaChon.length > 0);
    if (!thangHopLe || !hangHopLe) {
      setFilters({ ...filters, thang: thangHopLe ? filters.thang : CURRENT_MONTH_VALUE, hang: hangHopLe ? filters.hang : hangConCo.join("|") || ALL_HANG });
    }
  }, [monthsData, data, filters, setFilters]);

  // Hang: o chon nhieu (quy tac chung "bo loc mac dinh chon nhieu", 2026-11-20). filters.hang giu dinh dang cu: "Tất cả hãng"
  // hoac cac hang noi "|" (backend multiValueAdHocClause) -> cac man dang dung filters.hang khong phai doi.
  const oHang = (
    <MultiSelectFilter
      label={tr("Hãng")}
      value={filters.hang === ALL_HANG ? "" : filters.hang}
      onChange={(v) => setFilters({ ...filters, hang: v || ALL_HANG })}
      options={(data?.hang ?? []).filter(Boolean)}
    />
  );
  const oThang = <Select value={filters.thang} onChange={(v) => setFilters({ ...filters, thang: v })} options={thangOptions} />;
  const oKy = renderThang ? renderThang(oThang) : oThang;
  if (compact)
    return (
      <div className="flex flex-wrap items-center gap-2 mb-3 py-1.5 md:sticky md:top-16 md:z-20 bg-[var(--bg)]">
        <KhuVucFilterControl value={khuVucHienThi} onChange={(v) => setFilters({ ...filters, khu_vuc: v })} options={khuVucOptions} myAreas={myAreas} />
        {oHang}
        {children}
        <div className="ml-auto">{oKy}</div>
      </div>
    );
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <KhuVucFilterControl value={khuVucHienThi} onChange={(v) => setFilters({ ...filters, khu_vuc: v })} options={khuVucOptions} myAreas={myAreas} />
      {oHang}
      {children}
      {oKy}
      {onExport && (
        <div className="ml-auto">
          <Btn variant="ghost" size="sm" onClick={onExport}>
            {tr("⬇ Xuất Excel")}</Btn>
        </div>
      )}
    </div>
  );
}
