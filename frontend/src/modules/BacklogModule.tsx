import { coNhomDvbh, useKhuVucHieuLuc } from "../lib/phamVi";
import { useEffect, useMemo, useState } from "react";
import { nhanTheoMoc, useMocTonGiaiTrinh } from "../lib/quocGia";
import { dl } from "../lib/banDichDuLieu";
import { createPortal } from "react-dom";
import { MaLinhKienLink } from "../components/HoSoLinhKienProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "../components/ui/Tabs";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { mucDoBadge } from "../components/ui/MucDoBadge";
import { Card } from "../components/ui/Card";
import { Select } from "../components/ui/Select";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { LocCotPopover, locCotDangBat, tomTatLoc, GIA_TRI_TRONG, type GiaTriLoc, type KieuLocCot, type LocCot } from "../components/ui/LocCotPopover";
import { StatCard } from "../components/ui/StatCard";
import { HeroStat } from "../components/ui/HeroStat";
import { Pill } from "../components/ui/Pill";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { useDaDongChunked } from "../hooks/useDaDongChunked";
import { useBacklogAgeReport } from "../hooks/useBacklogAgeReport";
import { api, buildQuery } from "../api/client";
import { fmtDateTime, fmtVND, type CaseRow, type Paged, type LinhKienRow } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { useExportRunner } from "../hooks/useExportRunner";
import { CASE_FIELD_LABELS } from "../lib/caseFieldLabels";
import { useAuth } from "../auth/AuthContext";
import { QLDVBH_FILTER_VALUE, KHU_VUC_AN_KHOI_BAO_CAO } from "../constants";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { fmtGeneratedAt } from "../lib/formatSnapshotTime";
import { fetchWithHashCache } from "../lib/staticListCache";
import { usePurchaseWarrantyData } from "../hooks/usePurchaseWarrantyData";
import { indexPoTheoMaLk, ngayHangVeTheoKv } from "../lib/ngayHangVeTheoKv";
import { useTonKhoTongHop, useLayTonKhoTongHop, fmtSl } from "../components/TonKhoLk";
import { matchMuaHang, matchBaoHanh } from "../lib/purchaseWarrantyMatch";
import { isVipKh, vipRowClassName, VipBadge } from "../lib/vipHighlight";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { IdSerialSearchInput } from "../components/IdSerialSearchInput";
import { TonTheoKtvCard } from "./TonTheoKtvCard";
import { TRANG_THAI_LABELS, TRANG_THAI_TONE, TRANG_THAI_DONG } from "../lib/tranhChapShared";
import { useDiaGioiIndex, useDiaGioiLoc, gopBangTheoTinh, soSanhTen, tachNhomDiaGioi, nhanTinh, NHAN_CAP_1, NHAN_CAP_2 } from "../lib/diaGioi";
import { tr } from "../i18n/tr";


function pct(a: number, b: number) {
  return b ? Math.round((a / b) * 1000) / 10 : 0;
}

function deltaSub(bucket: DeltaBucket): string {
  return tr("Đầu ngày: {0} · Đã xử lý: {1} ({2}%)", bucket.baseline, bucket.resolved, pct(bucket.resolved, bucket.baseline));
}

// Tab "Ca da dong" trong Backlog: chon 1 thang, dung useDaDongChunked (snapshot R2 tung ngay, xem
// hooks/useDaDongChunked.ts) roi loc khu_vuc + phan trang thuan phia client - thay the ClosedCasesTab
// (cache theo request cu, da doi sang co che chunk R2 khong con dinh kem filter vao request nua).
function DaDongMonthList({
  columns,
  khuVucFilter,
  onRowClick,
}: {
  columns: Column<CaseRow>[];
  khuVucFilter: string;
  onRowClick: (c: CaseRow) => void;
}) {
  const { data: monthsData } = useQuery({
    queryKey: ["dashboard-months"],
    queryFn: () => api.get<{ months: string[] }>("/dashboard/months"),
  });
  const currentMonth = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
  const [thang, setThang] = useState(currentMonth);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { rows: allRows, isLoading, isError, refetch, throttled } = useDaDongChunked(thang);
  const [idSearch, setIdSearch] = useState("");

  // khuVucFilter la prop (doi khong remount component nay) - neu khong reset, dang o trang cuoi
  // roi thu hep bo loc khu vuc co the de "page" tro qua het so trang moi, hien bang rong sai (xem
  // BUG report: Codex).
  useEffect(() => {
    setPage(1);
  }, [khuVucFilter]);

  const rows = useMemo(() => {
    // CHOT 2026-08-01: R2 day-chunk (useDaDongChunked) doc THANG data, khong qua endpoint co loc san
    // KHU_VUC_AN_KHOI_BAO_CAO (endpoint do dung chung voi DanhSachTongModule - noi DUY NHAT van hien
    // 2 khu_vuc nay) - phai tu loc o day.
    let r = allRows.filter((row) => !row.khu_vuc || !KHU_VUC_AN_KHOI_BAO_CAO.includes(row.khu_vuc));
    if (khuVucFilter === QLDVBH_FILTER_VALUE) {
      r = r.filter((row) => (row.khu_vuc ?? "").includes("qldvbh"));
    } else if (khuVucFilter) {
      const set = new Set(
        khuVucFilter
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      );
      r = r.filter((row) => row.khu_vuc && set.has(row.khu_vuc));
    }
    // CHOT 2026-08-12: du lieu thang da tai het ve client (useDaDongChunked) nen loc ID/Serial thuan
    // phia client, khong can them request server.
    const q = idSearch.trim().toLowerCase();
    if (q) r = r.filter((row) => row.id.toLowerCase().includes(q) || (row.seri_san_pham ?? "").toLowerCase().includes(q));
    return r;
  }, [allRows, khuVucFilter, idSearch]);

  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  const monthOptions = (monthsData?.months ?? []).map((m) => ({ value: m, label: m }));
  if (!monthOptions.some((o) => o.value === currentMonth)) {
    monthOptions.unshift({ value: currentMonth, label: tr("{0} (hiện tại)", currentMonth) });
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-semibold text-[var(--ink-400)]">{tr("Tháng:")}</span>
        <Select
          value={thang}
          onChange={(v) => {
            setThang(v);
            setPage(1);
          }}
          options={monthOptions}
        />
        <IdSerialSearchInput
          value={idSearch}
          onChange={(v) => {
            setIdSearch(v);
            setPage(1);
          }}
        />
      </div>
      {throttled.length > 0 && (
        <div className="text-xs text-[var(--ink-400)] italic mb-2">
          {throttled.length}  {tr("ngày đang chờ đồng bộ (đã đạt giới hạn tải, tự thử lại sau ít phút) — vẫn hiển thị dữ liệu đã lưu gần nhất.")}</div>
      )}
      <PaginatedTable
        columns={columns}
        rows={pagedRows}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        page={page}
        pageSize={pageSize}
        total={rows.length}
        onPageChange={setPage}
        onRowClick={onRowClick}
        rowKey={(c) => c.id}
        emptyText={tr("Không có ca nào trong tháng này.")}
        storageKey="backlog-closed"
      />
    </div>
  );
}

// Tab "Tuoi ton TB" - bao cao trung binh (tong tuoi ton / tong ca ton) chot moc 08:00 moi ngay (xem
// backend/src/lib/backlogAgeSnapshot.ts). Tai NGUYEN 1 thang qua useBacklogAgeReport (cache
// IndexedDB, chi tai lai khi hash server doi) roi gop/sap xep HOAN TOAN o client - khong goi lai
// server khi doi "Xem theo"/trang/sap xep. "Lay cac ngay trong thang chia trung binh" (yeu cau chu he
// thong) = tong tong_tuoi cua TAT CA ngay trong thang / tong so_ca cung ky - trung binh CONG DON
// (weighted), khong phai trung binh cua cac trung binh ngay.
const AGE_REPORT_DIM_OPTIONS = [
  { value: "khu_vuc", label: tr("Khu vực") },
  { value: "nhom_kh", label: tr("Nhóm KH") },
  { value: "ky_thuat_vien", label: "KTV" },
  { value: "hang", label: tr("Hãng") },
  { value: "tinh", label: tr("Tỉnh") },
  { value: "doi_tac", label: tr("Đối tác") },
];

interface AgeReportAggRow {
  gia_tri: string;
  so_ca: number;
  tong_tuoi: number;
}

function avgTuoiTon(r: { so_ca: number; tong_tuoi: number }): number {
  return r.so_ca > 0 ? r.tong_tuoi / r.so_ca : 0;
}

function BacklogAgeReportTab() {
  const currentMonth = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7);
  const [thang, setThang] = useState(currentMonth);
  const [dim, setDim] = useState("khu_vuc");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("avg");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const pageSize = 15;

  const { rows, months, isLoading, isError, refetch } = useBacklogAgeReport(thang);
  // Dim "tinh" (2026-10-10): gia_tri = cap tho (tinh, tinh_moi) tu snapshot moi / chi tinh cu o snapshot cu - gom theo
  // che do "Dia gioi cu / moi".
  const { mode: dgMode, idx: dgIdx } = useDiaGioiIndex();

  useEffect(() => {
    setPage(1);
  }, [dim, thang]);

  const tongCard = useMemo(() => {
    let so_ca = 0;
    let tong_tuoi = 0;
    for (const r of rows) {
      if (r.dim !== "tong" || r.gia_tri !== "tat_ca") continue;
      so_ca += r.so_ca;
      tong_tuoi += r.tong_tuoi;
    }
    return { so_ca, tong_tuoi };
  }, [rows]);

  const qldvbhCard = useMemo(() => {
    let so_ca = 0;
    let tong_tuoi = 0;
    for (const r of rows) {
      if (r.dim !== "khu_vuc" || r.gia_tri !== "__nhom_qldvbh__") continue;
      so_ca += r.so_ca;
      tong_tuoi += r.tong_tuoi;
    }
    return { so_ca, tong_tuoi };
  }, [rows]);

  const aggRows = useMemo(() => {
    const map = new Map<string, AgeReportAggRow>();
    for (const r of rows) {
      if (r.dim !== dim || r.gia_tri === "__nhom_qldvbh__") continue;
      const giaTri = dim === "tinh" ? nhanTinh(dgMode, dgIdx.tinh(dgMode, tachNhomDiaGioi(r.gia_tri))) : r.gia_tri;
      const cur = map.get(giaTri) ?? { gia_tri: giaTri, so_ca: 0, tong_tuoi: 0 };
      cur.so_ca += r.so_ca;
      cur.tong_tuoi += r.tong_tuoi;
      map.set(giaTri, cur);
    }
    const list = [...map.values()];
    list.sort((a, b) => {
      if (sortBy === "gia_tri") {
        const c = dim === "tinh" ? soSanhTen(a.gia_tri, b.gia_tri) : a.gia_tri.localeCompare(b.gia_tri);
        return sortDir === "asc" ? c : -c;
      }
      const av = sortBy === "so_ca" ? a.so_ca : sortBy === "tong_tuoi" ? a.tong_tuoi : avgTuoiTon(a);
      const bv = sortBy === "so_ca" ? b.so_ca : sortBy === "tong_tuoi" ? b.tong_tuoi : avgTuoiTon(b);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [rows, dim, sortBy, sortDir, dgMode, dgIdx]);

  const pagedRows = aggRows.slice((page - 1) * pageSize, page * pageSize);
  const dimLabel = AGE_REPORT_DIM_OPTIONS.find((o) => o.value === dim)?.label ?? tr("Giá trị");

  const columns: Column<AgeReportAggRow>[] = [
    {
      key: "gia_tri",
      header: dimLabel,
      sortKey: "gia_tri",
      render: (r) => (dim === "khu_vuc" ? shortKhuVuc(r.gia_tri) : r.gia_tri),
    },
    {
      key: "so_ca",
      header: tr("Số ca (lượt/ngày)"),
      sortKey: "so_ca",
      className: "text-right",
      render: (r) => r.so_ca.toLocaleString("vi-VN"),
    },
    {
      key: "tong_tuoi",
      header: tr("Tổng tuổi tồn (ngày)"),
      sortKey: "tong_tuoi",
      className: "text-right",
      render: (r) => r.tong_tuoi.toLocaleString("vi-VN"),
    },
    {
      key: "avg",
      header: tr("TB tuổi tồn (ngày)"),
      sortKey: "avg",
      className: "text-right font-semibold",
      render: (r) => avgTuoiTon(r).toFixed(1),
    },
  ];

  const monthOptions = months.map((m) => ({ value: m, label: m }));
  if (!monthOptions.some((o) => o.value === currentMonth)) {
    monthOptions.unshift({ value: currentMonth, label: tr("{0} (hiện tại)", currentMonth) });
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-semibold text-[var(--ink-400)]">{tr("Tháng:")}</span>
        <Select value={thang} onChange={setThang} options={monthOptions} />
        <span className="text-xs font-semibold text-[var(--ink-400)] ml-2">Xem theo:</span>
        <Select value={dim} onChange={setDim} options={AGE_REPORT_DIM_OPTIONS} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard
          label={tr("Tất cả (TB lũy kế tháng)")}
          value={tr("{0} ngày", avgTuoiTon(tongCard).toFixed(1))}
          sub={tr("{0} lượt ca-ngày", tongCard.so_ca.toLocaleString("vi-VN"))}
          tone="ocean"
        />
        <StatCard
          label={tr("Nhóm DVBH (QLDVBH)")}
          value={tr("{0} ngày", avgTuoiTon(qldvbhCard).toFixed(1))}
          sub={tr("{0} lượt ca-ngày", qldvbhCard.so_ca.toLocaleString("vi-VN"))}
          tone="teal"
        />
      </div>
      <PaginatedTable
        columns={columns}
        rows={pagedRows}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        page={page}
        pageSize={pageSize}
        total={aggRows.length}
        onPageChange={setPage}
        rowKey={(r) => r.gia_tri}
        emptyText={tr("Chưa có dữ liệu cho tháng này.")}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={(k, d) => {
          setSortBy(k);
          setSortDir(d);
        }}
        storageKey="backlog-age-report"
      />
    </div>
  );
}

interface TongTonStats {
  tong: number;
  tren1: number;
  tren3: number;
  tren5: number;
  tren7: number;
  tren14: number;
  daGiaiTrinh: number;
  vipTon: number;
}

interface BacklogStats {
  tongTon: TongTonStats;
  aging: { duoi1: number; tu1den3: number; tu3den7: number; tu7den14: number; tren14: number };
  byReason: { ly_do: string; n: number }[];
}

interface CanGiaiTrinhCounts {
  can_giai_trinh_tong: number;
  lo_ke_hoach: number;
  tai_giai_trinh: number;
  chua_gt_3_ngay: number;
  chua_gt_5_ngay: number;
  dieu_hoa: number;
  b2b: number;
  nskx: number;
  loc_tong_bcn: number;
  vip_24h: number;
  da_giai_trinh: number;
  dmx_3_ngay: number;
  dmx_chua_gt_3_ngay: number;
  dmx_tai_giai_trinh: number;
  dmx_lo_ke_hoach: number;
}

interface KhuVucRow {
  nhom: string;
  tong_ton: number;
  tren_3: number;
  tren_5: number;
  tren_7: number;
  tren_14: number;
  da_giai_trinh: number;
  can_giai_trinh_tong: number;
  lo_ke_hoach: number;
  cho_giai_trinh_lai: number;
  dmx_chua_gt_3_ngay: number;
  chua_gt_5_ngay: number;
  dieu_hoa_1_ngay: number;
  b2b_1_ngay: number;
  nskx_2_ngay: number;
  thieu_linh_kien: number;
}

interface DeltaBucket {
  baseline: number;
  resolved: number;
  remaining: number;
}

// Khop dung shape KhuVucReportRow cua backend/src/lib/dailySnapshot.ts - cot TINH (khong delta) cua
// bang "Bao cao ton theo khu vuc" khi nhom theo Khu vuc va co dong bang.
interface KhuVucReportRow {
  tong_ton: number;
  tren_3: number;
  tren_5: number;
  tren_7: number;
  tren_14: number;
  da_giai_trinh: number;
  lo_ke_hoach: number;
  cho_giai_trinh_lai: number;
  dmx_chua_gt_3_ngay: number;
  chua_gt_5_ngay: number;
  dieu_hoa_1_ngay: number;
  b2b_1_ngay: number;
  nskx_2_ngay: number;
  thieu_linh_kien: number;
}

// Khop dung shape BacklogDailyPayload cua backend/src/lib/dailySnapshot.ts (getBacklogDailyWithDelta
// / getBacklogDailyForKhuVuc) - "Bao cao ngay 08:00" cho Quan ly ton, chi co y nghia khi khong co bo
// loc phu nao HOAC loc dung 1 khu_vuc (xem isFrozenEligible trong component ben duoi).
interface BacklogDailyPayload {
  generatedAt: string;
  generatedBy: string;
  tongTon: DeltaBucket;
  tren3: number;
  tren5: number;
  tren7: number;
  tren14: number;
  canGiaiTrinh: {
    tong: DeltaBucket;
    loKeHoach: DeltaBucket;
    taiGiaiTrinh: DeltaBucket;
    chuaGt3NgayDmx: DeltaBucket;
    chuaGt5Ngay: DeltaBucket;
    dieuHoa: DeltaBucket;
    loKeHoachDmx5: DeltaBucket;
    loKeHoach14: DeltaBucket;
    taiGiaiTrinhDmx5: DeltaBucket;
    taiGiaiTrinh14: DeltaBucket;
    b2b: DeltaBucket;
    nskx: DeltaBucket;
    locTongBcn: DeltaBucket;
    vip24h: DeltaBucket;
    // 2026-10-21: ca Canh bao ton cap 2 (CEO) - da gop vao "tong", giai trinh moi ngay (backend lib/canhBaoCap2GiaiTrinh.ts).
    ceo?: DeltaBucket;
  };
  byKhuVuc: Record<string, DeltaBucket>;
  khuVucRows: Record<string, KhuVucReportRow>;
  // "Can giai trinh (tong luy ke)" / "Da giai trinh (trong thang)" - cong don SUM tu ngay 01 thang
  // nay den hom nay, tu giai_trinh_daily_log (chot 17h30) - xem giai thich chi tiet trong
  // backend/src/lib/dailySnapshot.ts computeBacklogDeltaPayload.
  byKhuVucMonthly: Record<string, { canGiaiTrinhLuyKe: number; daGiaiTrinhThang: number }>;
}

interface GiaiTrinhTrendDay {
  ngay: string;
  can_giai_trinh: number;
  da_giai_trinh: number;
}
interface GiaiTrinhTrendRow {
  khu_vuc: string;
  days: GiaiTrinhTrendDay[];
}
// Ngay/khu_vuc bi loai tru khoi luy ke/ty le thang (settings_giai_trinh_exclude_ngay, migration
// 0046) - khu_vuc = "__ALL__" nghia la loai tru CA HE THONG ngay do. Chu nhat KHONG nam trong danh
// sach nay (quy tac cung, tu tinh o isNgayExcluded ben duoi), server chi tra ve phan THEM tay.
// "Canh bao ton danh cho QL" (xem backend/src/lib/canhBaoTon.ts) - 8 chi tieu co dinh, Cap 1 (TP
// DVBH) + Cap 2 (CEO). CANH_BAO_TON_METRICS la nguon duy nhat cho ca card tong quan lan 8 bang lich
// su theo ngay (tranh khai bao lap 2 noi).
// luongDoiTra7/10 (2026-10-12): luong doi tra (he theodoidoimay) ton >=7 / >=10 ngay - xem backend lib/luongDoiTraTon.ts.
type CanhBaoTonMetricKey =
  | "ton14" | "vipSvip5" | "locTong3" | "tranhChap3" | "luongDoiTra7"
  | "ton20" | "vipSvip7" | "locTong5" | "tranhChap5" | "luongDoiTra10";
const CANH_BAO_TON_METRICS: { cap: 1 | 2; key: CanhBaoTonMetricKey; label: string; trendCol: string }[] = [
  { cap: 1, key: "ton14", label: tr("Tồn ≥14 ngày"), trendCol: "ton_14_ngay" },
  { cap: 1, key: "vipSvip5", label: tr("VIP/S.VIP tồn ≥3 ngày"), trendCol: "vip_svip_5_ngay" },
  { cap: 1, key: "locTong3", label: tr("Lọc tổng tồn ≥3 ngày"), trendCol: "loc_tong_3_ngay" },
  { cap: 1, key: "tranhChap3", label: tr("Tranh chấp/KN ≥3 ngày"), trendCol: "tranh_chap_3_ngay" },
  { cap: 1, key: "luongDoiTra7", label: tr("Luồng đổi trả ≥7 ngày"), trendCol: "luong_doi_tra_7_ngay" },
  { cap: 2, key: "ton20", label: tr("Tồn >20 ngày"), trendCol: "ton_20_ngay" },
  { cap: 2, key: "vipSvip7", label: tr("VIP/S.VIP tồn ≥4 ngày"), trendCol: "vip_svip_7_ngay" },
  { cap: 2, key: "locTong5", label: tr("Lọc tổng tồn ≥5 ngày"), trendCol: "loc_tong_5_ngay" },
  { cap: 2, key: "tranhChap5", label: tr("Tranh chấp/KN ≥5 ngày"), trendCol: "tranh_chap_5_ngay" },
  { cap: 2, key: "luongDoiTra10", label: tr("Luồng đổi trả ≥10 ngày"), trendCol: "luong_doi_tra_10_ngay" },
];
interface CanhBaoTonTrendPoint {
  yesterday: number | null;
  weekAgo: number | null;
  monthAgo: number | null;
}
interface CanhBaoTonProgressToday {
  daGtHomNay: number;
  daKetThuc: number;
  hienTaiCon: number;
}
interface CanhBaoTonCountsPayload {
  generatedAt: string;
  counts: Record<CanhBaoTonMetricKey, number>;
  trend: Record<CanhBaoTonMetricKey, CanhBaoTonTrendPoint>;
  progress: Record<CanhBaoTonMetricKey, CanhBaoTonProgressToday>;
  // Chi tieu nguon ngoai D1 (luong doi tra) chua lay duoc luc chot - cron moi gio tu thu lai.
  loi?: Partial<Record<CanhBaoTonMetricKey, string>>;
}
const CANH_BAO_TON_METRIC_KEY = "backlog.canhBaoTon.selectedMetric";

// Dong chu "so sanh nhanh" duoi 1 StatCard - CHI so voi hom qua (Q2 da chot voi nguoi dung), mau
// coral khi TANG (xau di, can chu y) / teal khi GIAM (tot len) / ink khi khong doi hoac chua co du lieu.
function canhBaoTonYesterdaySub(current: number, yesterday: number | null): { text: string; className: string } {
  if (yesterday === null) return { text: tr("chưa có dữ liệu hôm qua"), className: "text-[var(--ink-400)]" };
  const diff = current - yesterday;
  if (diff === 0) return { text: tr("không đổi so hôm qua"), className: "text-[var(--ink-400)]" };
  return diff > 0
    ? { text: tr("▲ +{0} so hôm qua", diff), className: "text-[var(--coral-500)] font-semibold" }
    : { text: tr("▼ {0} so hôm qua", diff), className: "text-[var(--teal-500)] font-semibold" };
}

// Dong tom tat 3 moc so sanh (hom qua/7 ngay/30 ngay truoc) cho khu vuc chon trong bo loc gop - CHOT
// 2026-08-16 thay the hoan toan 8 bang khu_vuc x 14 ngay liet ke day du (phan hoi "90% thua thai").
function canhBaoTonTrendParts(current: number, trend: CanhBaoTonTrendPoint): { text: string; className: string }[] {
  const parts: [string, number | null][] = [
    [tr("hôm qua"), trend.yesterday],
    [tr("tuần trước"), trend.weekAgo],
    [tr("tháng trước"), trend.monthAgo],
  ];
  return parts.map(([label, prior]) => {
    if (prior === null) return { text: tr("{0}: chưa có dữ liệu", label), className: "text-[var(--ink-400)]" };
    const diff = current - prior;
    if (diff === 0) return { text: tr("{0}: không đổi", label), className: "text-[var(--ink-400)]" };
    return diff > 0
      ? { text: tr("{0}: tăng {1}", label, diff), className: "text-[var(--coral-500)] font-semibold" }
      : { text: tr("{0}: giảm {1}", label, Math.abs(diff)), className: "text-[var(--teal-500)] font-semibold" };
  });
}
interface CanhBaoTonTrendDay {
  ngay: string;
  ton_14_ngay: number;
  vip_svip_5_ngay: number;
  loc_tong_3_ngay: number;
  tranh_chap_3_ngay: number;
  ton_20_ngay: number;
  vip_svip_7_ngay: number;
  loc_tong_5_ngay: number;
  tranh_chap_5_ngay: number;
}
interface CanhBaoTonTrendRow {
  khu_vuc: string;
  days: CanhBaoTonTrendDay[];
}

interface ExcludedNgayRow {
  ngay: string;
  khu_vuc: string;
}

// "So ca ton theo moc thoi gian" (cuoi tab Bao cao) - 1 dong/ngay, doc thang tu snapshot dong bang
// 08:00 (GET /cases/ton-trend, xem backend/src/routes/cases.ts) - KHONG tinh song.
interface TonTrendRow {
  ngay: string;
  tong: number;
  tren_3: number;
  tren_5: number;
  tren_7: number;
  tren_14: number;
}

interface FiltersData {
  khuVuc: string[];
  hang: string[];
  tinh: string[];
  doiTac: string[];
  nhomSanPham: string[];
  nhomKh: string[];
  nganh: string[];
  kyThuatVien: string[];
}

// Nhan hien thi ngan gon cho badge "Nhom ton" trong Danh sach chi tiet - khop dung 7 cot need_*
// server tra ve (xem backend/src/routes/cases.ts GET / + lib/needGiaiTrinh.ts).
const NHOM_TON_BADGES: { key: keyof CaseRow; label: string }[] = [
  { key: "need_lo_ke_hoach", label: tr("Lỡ kế hoạch") },
  { key: "need_tai_giai_trinh", label: tr("Tái giải trình") },
  { key: "need_chua_gt_3_ngay", label: tr("Chưa GT >3 ngày") },
  { key: "need_chua_gt_5_ngay", label: tr("Chưa GT >5 ngày") },
  { key: "need_dieu_hoa", label: tr("Điều hòa") },
  { key: "need_b2b", label: "B2B" },
  { key: "need_nskx", label: "NSKX" },
  { key: "need_loc_tong_bcn", label: tr("Lọc tổng") },
  { key: "need_vip_24h", label: "VIP/SVIP >=24h" },
];

const REPORT_DIM_OPTIONS = [
  { value: "khu_vuc", label: tr("Khu vực") },
  { value: "tinh", label: tr("Tỉnh") },
  { value: "doi_tac", label: tr("Đối tác") },
  { value: "hang", label: tr("Hãng") },
  { value: "nhom_san_pham", label: "Model" },
  { value: "nhom_kh", label: tr("Nhóm KH") },
  { value: "nganh", label: tr("Ngành") },
];

// CHOT 2026-08-16: tach "Bao cao ton cho QL" thanh 2 tab rieng (Cap 1 / Cap 2) thay vi 1 tab gop 2
// dong - theo phan hoi khong muon 2 cap "lan" vao chung 1 man hinh.
const VIEWS = [
  { key: "bao-cao", label: tr("Báo cáo") },
  { key: "tuoi-ton-tb", label: tr("Tuổi tồn TB") },
  { key: "canh-bao-ton-cap1", label: tr("Cảnh báo tồn · Cấp 1 (TP DVBH)") },
  { key: "canh-bao-ton-cap2", label: tr("Cảnh báo tồn · Cấp 2 (CEO)") },
  { key: "danh-sach", label: tr("Danh sách chi tiết") },
];

// "Nhom" thay the ca TABS (tab don) lan AGE_BUCKETS (loc tuoi) truoc day - 1 dieu khien duy nhat
// cho danh sach chi tiet, dung chung dinh nghia voi cac tile bao cao (needGiaiTrinh.ts o backend).
const NHOM_OPTIONS = [
  { value: "ton-hien-tai", label: tr("Tổng tồn hiện tại") },
  { value: "can-giai-trinh:tong", label: tr("Cần giải trình (tổng)") },
  { value: "can-giai-trinh:ceo", label: tr("— CEO cần giải trình (cảnh báo cấp 2)") },
  { value: "can-giai-trinh:lo_ke_hoach", label: tr("— Lỡ kế hoạch") },
  { value: "can-giai-trinh:tai_giai_trinh", label: tr("— Cần tái giải trình") },
  { value: "can-giai-trinh:dmx_3_ngay", label: tr("— Chưa giải trình >3 (ĐMX)") },
  { value: "can-giai-trinh:dmx_chua_gt_3_ngay", label: tr("—— Chưa GT >3 ngày (ĐMX)") },
  { value: "can-giai-trinh:dmx_tai_giai_trinh", label: tr("—— Tái giải trình (ĐMX)") },
  { value: "can-giai-trinh:dmx_lo_ke_hoach", label: tr("—— Lỡ kế hoạch (ĐMX)") },
  { value: "can-giai-trinh:chua_gt_5_ngay", label: tr("— Chưa giải trình >5 ngày (ưu tiên xử lý)") },
  { value: "can-giai-trinh:dieu_hoa", label: tr("— Điều hòa >1 ngày") },
  { value: "can-giai-trinh:b2b", label: tr("— B2B >1 ngày") },
  { value: "can-giai-trinh:nskx", label: tr("— NSKX >=2 ngày") },
  { value: "can-giai-trinh:loc_tong_bcn", label: tr("— Lọc tổng >1 ngày") },
  { value: "can-giai-trinh:vip_24h", label: tr("— VIP/S.VIP chưa GT >=24h") },
  { value: "can-giai-trinh:lo_ke_hoach_dmx_5", label: tr("—— Lỡ kế hoạch, ĐMX >5 ngày") },
  { value: "can-giai-trinh:lo_ke_hoach_14", label: tr("—— Lỡ kế hoạch >14 ngày") },
  { value: "can-giai-trinh:tai_giai_trinh_dmx_5", label: tr("—— Tái giải trình, ĐMX >5 ngày") },
  { value: "can-giai-trinh:tai_giai_trinh_14", label: tr("—— Tái giải trình >14 ngày") },
  { value: "da-giai-trinh", label: tr("Đã giải trình") },
  { value: "da-giai-trinh-trong-ngay", label: tr("Đã giải trình trong ngày") },
  { value: "da-dong", label: tr("Ca đã đóng") },
  { value: "canh-bao-ton:ton14", label: tr("Cảnh báo tồn — Cấp 1: Tồn ≥14 ngày") },
  { value: "canh-bao-ton:vipSvip5", label: tr("Cảnh báo tồn — Cấp 1: VIP/S.VIP tồn ≥3 ngày") },
  { value: "canh-bao-ton:locTong3", label: tr("Cảnh báo tồn — Cấp 1: Lọc tổng tồn ≥3 ngày") },
  { value: "canh-bao-ton:tranhChap3", label: tr("Cảnh báo tồn — Cấp 1: Tranh chấp/KN ≥3 ngày") },
  { value: "canh-bao-ton:ton20", label: tr("Cảnh báo tồn — Cấp 2: Tồn >20 ngày") },
  { value: "canh-bao-ton:vipSvip7", label: tr("Cảnh báo tồn — Cấp 2: VIP/S.VIP tồn ≥4 ngày") },
  { value: "canh-bao-ton:locTong5", label: tr("Cảnh báo tồn — Cấp 2: Lọc tổng tồn ≥5 ngày") },
  { value: "canh-bao-ton:tranhChap5", label: tr("Cảnh báo tồn — Cấp 2: Tranh chấp/KN ≥5 ngày") },
];

const TON_TUOI_OPTIONS = [
  { value: "", label: tr("Tất cả tuổi tồn") },
  { value: "1", label: tr("Trên 1 ngày") },
  { value: "3", label: tr("Trên 3 ngày") },
  { value: "5", label: tr("Trên 5 ngày") },
  { value: "7", label: tr("Trên 7 ngày") },
  { value: "14", label: tr("Trên 14 ngày") },
];

// CHOT 2026-07-31: thay the StatCard don "Chua giai trinh >3 ngay (canh bao som)" - so ĐMX gio la
// TONG cua 3 nhom van de (chua giai trinh >3 ngay + tai giai trinh + lo ke hoach, cung loc dieu kien
// "KH DMX", xem needGiaiTrinh.ts backend) nen luon hien SAN chi tiet 3 dong ben duoi (khong an sau 1
// buoc bam nua) - dung tinh than "minh bach" chu he thong yeu cau, dong thoi van giu dung ngon ngu
// hinh anh cua StatCard (label + cham mau + so lon) de nhat quan voi cac the con lai.
function DmxBreakdownCard({
  total,
  chuaGt3,
  taiGiaiTrinh,
  loKeHoach,
  onClickTotal,
  onClickChuaGt3,
  onClickTaiGiaiTrinh,
  onClickLoKeHoach,
}: {
  total: number;
  chuaGt3: number;
  taiGiaiTrinh: number;
  loKeHoach: number;
  onClickTotal: () => void;
  onClickChuaGt3: () => void;
  onClickTaiGiaiTrinh: () => void;
  onClickLoKeHoach: () => void;
}) {
  const rows = [
    { label: tr("— Chưa GT >3 ngày"), value: chuaGt3, onClick: onClickChuaGt3 },
    { label: tr("— Tái giải trình"), value: taiGiaiTrinh, onClick: onClickTaiGiaiTrinh },
    { label: tr("— Lỡ kế hoạch"), value: loKeHoach, onClick: onClickLoKeHoach },
  ];
  // "Long lanh, sac so" (2026-08-20, dua len dau danh sach cung VIP/Loc tong) - cung 1 gradient +
  // vien phat sang nhu StatCard spotlight (xem StatCard.tsx) de dong bo mau sac giua 2 the "dap vao
  // mat" dung o dau luoi "Can giai trinh".
  return (
    <Card
      className="group relative p-1.5 flex-1 min-w-[110px]"
      style={{
        background: "linear-gradient(135deg, var(--indigo-100), color-mix(in srgb, var(--violet-500) 25%, white) 55%, var(--indigo-100))",
        boxShadow: "0 0 0 1.5px var(--violet-600), 0 6px 16px -4px color-mix(in srgb, var(--violet-600) 60%, transparent)",
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[10px] font-semibold text-[var(--indigo-700)] uppercase tracking-wide leading-tight">{tr("✦ Chưa giải trình >3 (ĐMX)")}</span>
        <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-0.5" style={{ background: total > 0 ? "var(--violet-600)" : "var(--ink-400)" }}></span>
      </div>
      <button
        type="button"
        className={`font-display text-base sm:text-lg font-extrabold leading-tight mt-0.5 hover:underline text-left block ${total > 0 ? "text-[var(--indigo-700)]" : "text-[var(--ink-400)]"}`}
        onClick={onClickTotal}
      >
        {total}
      </button>
      {/* CHOT 2026-08-16 "Phuong an A": chi tiet 3 dong con chuyen sang hien khi hover (thu gon mac
       * dinh de tiet kiem dien tich) - van "di chuyen vao doc them duoc" dung yeu cau, khong xoa han. */}
      <div className="hidden group-hover:block absolute z-30 top-full left-0 mt-1 w-56 max-w-[80vw] bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-lg p-2 space-y-1">
        {rows.map((r) => (
          <button key={r.label} type="button" className="flex items-center justify-between w-full text-xs text-[var(--ink-600)] hover:text-[var(--ocean-600)]" onClick={r.onClick}>
            <span className={r.value > 0 ? "" : "text-[var(--ink-400)]"}>{r.label}</span>
            <span className={`font-mono font-semibold ${r.value > 0 ? "px-1.5 rounded bg-[var(--amber-100)] text-[var(--amber-500)]" : "text-[var(--ink-400)]"}`}>{r.value}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

// CHOT 2026-08-01: "Bao cao ngay 08:00" cho Quan ly ton (dong bang + delta trong ngay, xem
// lib/dailySnapshot.ts getBacklogDailyWithDelta o backend) - the tong quat hoa DmxBreakdownCard o
// tren de dung chung cho "Tong ton hien tai"/"Lo ke hoach"/"Tai giai trinh" (co breakdown con) LAN
// cac the don ("Chua GT >5 ngay", "Dieu hoa >1 ngay"...) qua "rows" rong. Moi dong con la 1 DeltaBucket
// day du (khong chi 1 so) - dung cho yeu cau "xxx ca DMX >5 ngay (da giai trinh 4 con 2)".
// primaryValue/primarySub tach rieng (khong nhan thang 1 DeltaBucket cho so lon) vi 2 ngu canh dung
// component nay co ngu nghia so lon KHAC nhau: "Can giai trinh" (con lai la so chinh, giong Tong
// quat) vs "Tong ton" (baseline la so chinh - giai trinh KHONG lam case roi khoi "ton", chi la thao
// tac trong ngay tren backlog, xem Context trong plan).
function DeltaBreakdownCard({
  label,
  tone,
  primaryValue,
  primarySub,
  onClickPrimary,
  rows,
  // "Cần giải trình" (Lỡ kế hoạch/Cần tái giải trình) la so viec CAN LAM - lam mo khi = 0, to sang
  // khi > 0. "Tổng tồn hiện tại" chi la so lieu tong quan, KHONG bat theo quy tac nay (mac dinh false).
  mutable = false,
}: {
  label: string;
  tone: "ocean" | "teal" | "amber" | "coral";
  primaryValue: number;
  primarySub?: string;
  onClickPrimary: () => void;
  rows: { label: string; bucket: DeltaBucket; onClick: () => void }[];
  mutable?: boolean;
}) {
  const dotColor = { ocean: "var(--ocean-500)", teal: "var(--teal-500)", amber: "var(--amber-500)", coral: "var(--coral-500)" }[tone];
  const textColor = { ocean: "text-[var(--ocean-500)]", teal: "text-[var(--teal-500)]", amber: "text-[var(--amber-500)]", coral: "text-[var(--coral-500)]" }[tone];
  const chipBg = { ocean: "bg-[var(--ocean-100)] text-[var(--ocean-500)]", teal: "bg-[var(--teal-100)] text-[var(--teal-500)]", amber: "bg-[var(--amber-100)] text-[var(--amber-500)]", coral: "bg-[var(--coral-100)] text-[var(--coral-500)]" }[
    tone
  ];
  const primaryMuted = mutable && primaryValue === 0;
  const hasExtra = rows.length > 0 || !!primarySub;
  return (
    <Card className="group relative p-1.5 flex-1 min-w-[110px]">
      <div className="flex items-start justify-between gap-1">
        <span className="text-[10px] font-semibold text-[var(--ink-400)] uppercase tracking-wide leading-tight">{label}</span>
        <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-0.5" style={{ background: primaryMuted ? "var(--ink-400)" : dotColor }}></span>
      </div>
      <button
        type="button"
        className={`font-display text-base sm:text-lg font-extrabold leading-tight mt-0.5 hover:underline text-left block ${primaryMuted ? "text-[var(--ink-400)]" : textColor}`}
        onClick={onClickPrimary}
      >
        {primaryValue}
      </button>
      {/* CHOT 2026-08-16 "Phuong an A": primarySub + cac dong con chuyen sang popover hien khi hover,
       * thu gon mac dinh de tiet kiem dien tich nhung van "di chuyen vao doc them duoc". */}
      {hasExtra && (
        <div className="hidden group-hover:block absolute z-30 top-full left-0 mt-1 w-60 max-w-[80vw] bg-[var(--surface)] border border-[var(--line)] rounded-lg shadow-lg p-2 space-y-1">
          {primarySub && <div className="text-[11px] text-[var(--ink-400)]">{primarySub}</div>}
          {rows.map((r) => {
            const rowMuted = mutable && r.bucket.remaining === 0;
            return (
              <button key={r.label} type="button" className="flex items-center justify-between w-full text-xs text-[var(--ink-600)] hover:text-[var(--ocean-600)]" onClick={r.onClick}>
                <span className={rowMuted ? "text-[var(--ink-400)]" : ""}>{r.label}</span>
                <span className={`font-mono font-semibold ${rowMuted ? "text-[var(--ink-400)]" : `px-1.5 rounded ${chipBg}`}`}>
                  {r.bucket.remaining}
                  <span className={rowMuted ? "font-normal" : "font-normal opacity-80"}>  {tr("(đã GT")} {r.bucket.resolved}/{r.bucket.baseline})</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// O so trong bang "Bao cao ton theo..." cho nhom cot "Can giai trinh" - CHOT 2026-08-03: gia tri >0
// (con viec can xu ly) duoc to chip mau coral noi bat, gia tri 0 hien mo/xam - giup nguoi dung quet
// nhanh bang nhieu cot/nhieu dong ma khong bi "loang" giua so 0 va so co y nghia.
function NumCell({ value, onClick }: { value: number; onClick?: () => void; bold?: boolean }) {
  return (
    <Pill tone={value > 0 ? "coral" : "gray"} onClick={onClick}>
      {value}
    </Pill>
  );
}

// 14 ngay gan nhat (ke ca hom nay), "YYYY-MM-DD" gio VN - dung lam cot co dinh cho bang "Ty le giai
// trinh theo ngay" (moi khu vuc co the thieu du lieu 1 vai ngay, van giu du 14 cot de so sanh).
function last14Days(): string[] {
  const days: string[] = [];
  const nowVN = new Date(Date.now() + 7 * 60 * 60 * 1000);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(nowVN);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function fmtDayShort(ngay: string): string {
  const [, m, d] = ngay.split("-");
  return `${d}/${m}`;
}

// Tat ca ngay (01 den ngay cuoi) cua 1 thang "YYYY-MM", dang "YYYY-MM-DD" - dung cho nut "Tai ca
// thang" cua bang "Ty le giai trinh theo ngay".
function daysInMonthList(thang: string): string[] {
  const [y, m] = thang.split("-").map(Number);
  const soNgay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: soNgay }, (_, i) => `${thang}-${String(i + 1).padStart(2, "0")}`);
}

// Xuat Excel bang "Ty le giai trinh theo ngay" - moi ngay tach rieng 2 cot SO (khong gop chuoi
// "da/can") de dung thang lam bao cao/cong thuc tiep, giu dong "Tong cong" o dau giong hien thi tren
// man hinh. Dung chung cho ca bang 14-ngay-gan-nhat (tu cache giaiTrinhTrend) lan nut "Tai ca thang"
// (tu 1 lan goi API rieng theo tu_ngay/den_ngay).
function buildTrendExportRows(rows: GiaiTrinhTrendRow[], days: string[]): Record<string, string | number>[] {
  const sorted = [...rows].sort((a, b) => a.khu_vuc.localeCompare(b.khu_vuc, "vi"));
  const totalByDay: Record<string, { can: number; da: number }> = {};
  for (const day of days) {
    let can = 0;
    let da = 0;
    for (const row of sorted) {
      const found = row.days.find((d) => d.ngay === day);
      if (found) {
        can += found.can_giai_trinh;
        da += found.da_giai_trinh;
      }
    }
    totalByDay[day] = { can, da };
  }
  const rowToExport = (khuVuc: string, dayLookup: (day: string) => { can: number; da: number } | undefined) => {
    const out: Record<string, string | number> = { "Khu vực": khuVuc };
    for (const day of days) {
      const found = dayLookup(day);
      out[`${fmtDayShort(day)} - Đã GT`] = found?.da ?? 0;
      out[`${fmtDayShort(day)} - Cần GT`] = found?.can ?? 0;
    }
    return out;
  };
  const exportRows: Record<string, string | number>[] = [];
  if (sorted.length > 0) exportRows.push(rowToExport("Tong cong", (day) => totalByDay[day]));
  for (const row of sorted) {
    exportRows.push(
      rowToExport(shortKhuVuc(row.khu_vuc), (day) => {
        const found = row.days.find((d) => d.ngay === day);
        return found ? { can: found.can_giai_trinh, da: found.da_giai_trinh } : undefined;
      }),
    );
  }
  return exportRows;
}

// "YYYY-MM-DD" theo gio VN, lui N ngay - dung cho mac dinh bo loc "So ca ton theo moc thoi gian".
function vnDateOffsetStr(daysAgo: number): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000 - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Bang lich su 1 chi tieu cua "Canh bao ton danh cho QL" (khu_vuc x 14 ngay, chi hien so dem thuan -
// KHONG ty le/phan so nhu "Ty le giai trinh theo ngay", vi day khong phai cap "da xu ly/tong" ma la
// so ca dat nguong tuoi). Dung chung cho ca 8 chi tieu, tranh lap JSX 8 lan.
function DailyCountTrendTable({ title, metricCol, rows, trendDays }: { title: string; metricCol: string; rows: CanhBaoTonTrendRow[]; trendDays: string[] }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => a.khu_vuc.localeCompare(b.khu_vuc, "vi")), [rows]);
  const valueOf = (day: CanhBaoTonTrendDay | undefined): number | undefined => (day ? (day as unknown as Record<string, number>)[metricCol] : undefined);
  const totalByDay: Record<string, number> = {};
  for (const day of trendDays) {
    totalByDay[day] = sorted.reduce((sum, row) => sum + (valueOf(row.days.find((d) => d.ngay === day)) ?? 0), 0);
  }
  return (
    <div className="mb-4">
      <div className="font-display font-bold text-xs mb-2">{title}</div>
      <div className="overflow-x-auto">
        <table className="dense w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
              <th className="py-2 pr-3 sticky left-0 bg-[var(--surface)] z-10">{tr("Khu vực")}</th>
              {trendDays.map((day) => (
                <th key={day} className="py-2 px-2 text-center">
                  {fmtDayShort(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length > 0 && (
              <tr className="border-b border-[var(--line)] bg-slate-50 font-bold">
                <td className="py-2 pr-3 sticky left-0 bg-slate-50 z-10">{tr("Tổng cộng")}</td>
                {trendDays.map((day) => (
                  <td key={day} className="py-2 px-2 text-center font-mono">
                    {totalByDay[day] || <span className="text-[var(--ink-400)] font-normal">—</span>}
                  </td>
                ))}
              </tr>
            )}
            {sorted.map((row) => (
              <tr key={row.khu_vuc} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50 group">
                <td className="py-2 pr-3 font-semibold sticky left-0 bg-[var(--surface)] group-hover:bg-slate-50 z-10">{shortKhuVuc(row.khu_vuc)}</td>
                {trendDays.map((day) => {
                  const val = valueOf(row.days.find((d) => d.ngay === day));
                  return (
                    <td key={day} className="py-2 px-2 text-center font-mono">
                      {val != null ? val : <span className="text-[var(--ink-400)]">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={1 + trendDays.length} className="py-6 text-center text-[var(--ink-400)] text-sm">
                  {tr("Chưa có dữ liệu lịch sử (bắt đầu ghi nhận từ khi tính năng này triển khai).")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// The rieng cho 4 o so "Canh bao ton cho QL" - CHOT 2026-08-16 theo yeu cau "to mau khac biet LONG
// LANH, SAC SO nham thu hut mat nguoi": khac voi StatCard thuong (nen nhat + cham mau nho), o nay
// dung han NGUYEN mau --amber-500/--coral-500 lam nen full-bleed (gradient + glow shadow, van 100%
// tai dung token mau san co, KHONG them mau moi - dung quy uoc "dung lai token" da ghi trong
// DatMuaLinhKienModule/TranhChapModule) khi gia tri >0 - de dap ngay vao mat quan ly luc luot 2 giay.
// Khi =0 (khong co viec can lam) van giu trang thai lang/mo nhu StatCard thuong, tranh "keu la" moi
// ngay gay chai mat canh bao that.
function CanhBaoTonStatCard({
  label,
  value,
  sub,
  tone,
  progress,
  onClick,
}: {
  label: string;
  value: number;
  sub?: { text: string; className: string };
  tone: "amber" | "coral";
  // CHOT 2026-08-20 (item 4): 3 con so phu "hom nay" - dien gon o goc phai tren, xem
  // computeCanhBaoTonProgressToday() phia backend cho dinh nghia chinh xac tung con so.
  progress?: CanhBaoTonProgressToday;
  onClick: () => void;
}) {
  const active = value > 0;
  const colorVar = tone === "amber" ? "--amber-500" : "--coral-500";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex-1 min-w-[150px] rounded-xl p-3 sm:p-4 text-left cursor-pointer transition-transform hover:-translate-y-0.5 hover:shadow-lg ${
        active ? "" : "bg-[var(--surface)] border border-[var(--line)]"
      }`}
      style={
        active
          ? {
              background: `linear-gradient(135deg, var(${colorVar}), color-mix(in srgb, var(${colorVar}) 60%, black))`,
              boxShadow: `0 6px 20px -4px color-mix(in srgb, var(${colorVar}) 55%, transparent), 0 0 0 1px color-mix(in srgb, var(${colorVar}) 45%, transparent)`,
            }
          : undefined
      }
    >
      {progress && (
        <div
          className={`absolute top-2 right-2.5 text-right text-[10px] leading-tight font-semibold ${active ? "text-white/80" : "text-[var(--ink-400)]"}`}
          title={tr("Đã GT hôm nay: {0} · Đã kết thúc: {1} · Hiện tại còn: {2}", progress.daGtHomNay, progress.daKetThuc, progress.hienTaiCon)}
        >
          <div>GT: {progress.daGtHomNay}</div>
          <div>KT: {progress.daKetThuc}</div>
          <div>{tr("Còn:")} {progress.hienTaiCon}</div>
        </div>
      )}
      <div className={`text-xs font-semibold uppercase tracking-wide mb-1.5 sm:mb-2 pr-11 ${active ? "text-white/85" : "text-[var(--ink-400)]"}`}>{label}</div>
      <div className={`font-display text-2xl sm:text-3xl font-extrabold ${active ? "text-white drop-shadow-sm" : "text-[var(--ink-400)]"}`}>{value}</div>
      {sub && <div className={`text-xs mt-1 font-semibold ${active ? "text-white/90" : sub.className}`}>{sub.text}</div>}
    </button>
  );
}

// 1 tab "Canh bao ton" (Cap 1 hoac Cap 2) - 4 StatCard (bam vao xem dung danh sach dong bang 08:00)
// + 1 khoi "theo ngay" gon (bo loc 1 trong 4 chi tieu, dong so sanh nhanh hom qua/tuan/thang, 1 bang
// khu_vuc x 14 ngay CHI cua chi tieu dang chon) - CHOT 2026-08-16: tach rieng Cap 1/Cap 2 thanh 2 tab
// doc lap, moi tab dung chung component nay de khong lap code.
function CanhBaoTonCapView({
  cap,
  canhBaoTon,
  canhBaoTonTrend,
  trendDays,
  metric,
  setMetric,
  goToDanhSach,
}: {
  cap: 1 | 2;
  canhBaoTon: CanhBaoTonCountsPayload | undefined;
  canhBaoTonTrend: { rows: CanhBaoTonTrendRow[] } | undefined;
  trendDays: string[];
  metric: CanhBaoTonMetricKey;
  setMetric: (v: CanhBaoTonMetricKey) => void;
  goToDanhSach: (nhom: string) => void;
}) {
  const metrics = CANH_BAO_TON_METRICS.filter((m) => m.cap === cap);
  const selected = metrics.find((m) => m.key === metric) ?? metrics[0];
  const value = canhBaoTon?.counts[selected.key] ?? 0;
  const trendParts = canhBaoTon ? canhBaoTonTrendParts(value, canhBaoTon.trend[selected.key]) : [];
  return (
    <>
      <div
        className="mb-2 mt-2 flex items-center gap-2 flex-wrap"
        title={tr("Số liệu đông băng theo mốc 8h sáng — bấm vào 1 ô số để xem đúng danh sách ca tồn đã lưu tại mốc đó (không phải danh sách 'cần giải trình' tính sống)")}
      >
        <span
          className={`text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded ${cap === 1 ? "bg-[var(--amber-100)] text-[var(--amber-700)]" : "bg-[var(--coral-100)] text-[var(--coral-600)]"}`}
        >
          {cap === 1 ? "🔶" : "🔴"}  {tr("Cấp")} {cap} · {cap === 1 ? "TP DVBH" : "CEO"}
        </span>
        {canhBaoTon && <span className="text-[11px] text-[var(--ink-400)]">{tr("chốt")} {fmtGeneratedAt(canhBaoTon.generatedAt)}</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-2">
        {metrics.map((m) => {
          const v = canhBaoTon?.counts[m.key] ?? 0;
          const sub = canhBaoTon?.loi?.[m.key]
            ? { text: tr("Chưa lấy được số liệu — tự thử lại mỗi giờ"), className: "text-[var(--ink-400)]" }
            : canhBaoTon && canhBaoTon.trend[m.key]
              ? canhBaoTonYesterdaySub(v, canhBaoTon.trend[m.key].yesterday)
              : undefined;
          return (
            <CanhBaoTonStatCard
              key={m.key}
              label={m.label}
              value={v}
              sub={sub}
              tone={cap === 1 ? "amber" : "coral"}
              progress={canhBaoTon?.progress[m.key]}
              onClick={() => goToDanhSach(`canh-bao-ton:${m.key}`)}
            />
          );
        })}
      </div>

      <Card className="p-3 mt-2">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <div className="font-display font-bold text-sm">{tr("Cảnh báo tồn theo ngày")}</div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--ink-400)]">{tr("Chỉ tiêu:")}</span>
            <Select value={selected.key} onChange={(v) => setMetric(v as CanhBaoTonMetricKey)} options={metrics.map((m) => ({ value: m.key, label: m.label }))} />
          </div>
        </div>
        <div className="text-xs text-[var(--ink-400)] mb-2">{tr("Chốt lúc 8h00 mỗi ngày, theo khu vực — 14 ngày gần nhất.")}</div>
        <div className="flex items-center gap-3 flex-wrap mb-2 text-xs">
          {trendParts.map((p, i) => (
            <span key={i} className={p.className}>
              {p.text}
            </span>
          ))}
        </div>
        <DailyCountTrendTable title={selected.label} metricCol={selected.trendCol} rows={canhBaoTonTrend?.rows ?? []} trendDays={trendDays} />
      </Card>
    </>
  );
}

export function BacklogModule({
  openCase,
  headerExtra,
}: {
  openCase: (id: string, tab?: string) => void;
  /** Node DOM cua slot canh tieu de trang (App.tsx) - co thi "portal" bo loc khu vuc len do thay vi
   * render 1 hang rieng ben duoi (CHOT 2026-08-16, theo yeu cau gop chung len dong tieu de). */
  headerExtra?: HTMLElement | null;
}) {
  const auth = useAuth();
  const myAreas = auth.status === "authenticated" ? auth.user.khu_vuc_phu_trach : [];
  // "Mốc tồn cần giải trình" theo nuoc dang xem (2026-11-13, migration 0167: VN 5, PH 1) - nhan "Chưa GT >N ngày".
  const moc = useMocTonGiaiTrinh();
  const nhomTonBadges = useMemo(() => NHOM_TON_BADGES.map((b) => (b.key === "need_chua_gt_5_ngay" ? { ...b, label: nhanTheoMoc(b.label, moc) } : b)), [moc]);
  const nhomOptions = useMemo(() => NHOM_OPTIONS.map((o) => (o.value === "can-giai-trinh:chua_gt_5_ngay" ? { ...o, label: nhanTheoMoc(o.label, moc) } : o)), [moc]);
  const [view, setView] = useLocalStorageState("filters:backlog-view", "bao-cao");
  const [page, setPage] = useState(1);
  // Drill-down tu bao cao 08:00 phai giu ca da dong trong ngay trong danh sach can giai trinh.
  const [listFromSnapshot0800, setListFromSnapshot0800] = useState(false);
  const [reportDim, setReportDim] = useLocalStorageState("filters:backlog-report-dim", "khu_vuc");
  // Nhom theo "Tinh" (2026-10-10): server tra cap tho (tinh, tinh_moi), gom theo che do "Dia gioi cu / moi" (lib/diaGioi.ts).
  const { mode: dgMode, idx: dgIdx } = useDiaGioiIndex();
  const [nhomKey, setNhomKey] = useLocalStorageState("filters:backlog-nhom-key", "can-giai-trinh:tong");
  // Chi tieu dang xem trong khoi "Canh bao ton theo ngay" - luu cache phien xem truoc theo yeu cau
  // nguoi dung (CHOT 2026-08-16), rieng cho tung tab Cap 1/Cap 2 (2 tab doc lap sau khi tach).
  const [canhBaoTonMetricCap1, setCanhBaoTonMetricCap1] = useLocalStorageState<CanhBaoTonMetricKey>(`${CANH_BAO_TON_METRIC_KEY}.cap1`, "ton14");
  const [canhBaoTonMetricCap2, setCanhBaoTonMetricCap2] = useLocalStorageState<CanhBaoTonMetricKey>(`${CANH_BAO_TON_METRIC_KEY}.cap2`, "ton20");
  const [dsTuoiTu, setDsTuoiTu] = useState("");
  const [idSearch, setIdSearch] = useState("");
  const [sortBy, setSortBy] = useState("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // CHOT 2026-08-01: bo het bo loc phu (tinh/doi tac/hang/model/nhom KH/nganh/KTV) khoi thanh loc
  // chung (sharedFilterParams) theo yeu cau - chi con giu lai khu_vuc o do.
  const [khuVucFilterLuu, setKhuVucFilter] = useLocalStorageState("filters:backlog-khu-vuc", "");
  // Nuoc khac VN: "Tất cả DVBH" = "Tất cả khu vực" (lib/phamVi.ts khuVucHieuLuc), gia tri da luu giu nguyen.
  const khuVucFilter = useKhuVucHieuLuc(khuVucFilterLuu);
  // CHOT 2026-08-01: rieng KTV duoc them LAI nhung CHI cho tab "Danh sach chi tiet" (khong dua vao
  // sharedFilterParams - khong anh huong isDefaultBacklogFilter/isFrozenEligible cua khoi Bao cao).
  // 2026-11-10: loc kieu Excel tren tieu de cot + thanh "Bộ lọc" (thay cho 2 o KTV / Nhom KH cu) - gui len server qua "loc_cot"
  // (backend lib/locCot.ts). Khong luu localStorage: bam the so / o bao cao se dat lai cho khop con so vua bam.
  const [locCot, setLocCotState] = useState<Record<string, LocCot>>({});
  const setLocCot = (next: Record<string, LocCot>) => {
    setLocCotState(next);
    setPage(1);
  };
  const diaGioiLoc = useDiaGioiLoc();
  // Nhom KH - them cung nguyen tac voi KTV o tren (rieng cho "Danh sach chi tiet", khong vao
  // sharedFilterParams). Backend /api/cases da doc san query "nhom_kh" qua sharedReportFilters()
  // (REPORT_DIMS co san nhom_kh) nen chi can gui them tham so, khong can sua backend.
  const pageSize = 10;

  const sharedFilterParams = { khu_vuc: khuVucFilter };

  const [dsTab, dsCategory] = nhomKey.split(":");

  const { data: filtersData } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<FiltersData>("/dashboard/filters"),
  });
  // CHOT 2026-08-06: du lieu cho 4 cot tuy chon moi cua "Danh sach chi tiet" (Ma/Ten linh kien thieu
  // gan nhat, SL don mua, SL don bao hanh) - "settings-linh-kien" dung CHUNG queryKey voi
  // SettingsModule.tsx/CaseDetail.tsx (khong fetch lai neu da co san trong cache), usePurchaseWarrantyData()
  // cung la hook dung chung toan app (mount san o App.tsx), khong ton chi phi fetch them.
  const { data: linhKienData } = useQuery({
    queryKey: ["settings-linh-kien"],
    queryFn: () => fetchWithHashCache<{ rows: LinhKienRow[] }>("settings-linh-kien", "/settings/linh-kien/version", "/settings/linh-kien"),
  });
  const linhKienTenMap = useMemo(() => new Map((linhKienData?.rows ?? []).map((r) => [r.ma_linh_kien, r.ten_linh_kien])), [linhKienData]);
  const { muaHang, baoHanh, poDatHang, isSyncing: poDangTai, refreshSome, lastSyncedAt: pwSyncedAt } = usePurchaseWarrantyData();
  const queryClient = useQueryClient();
  // 2026-11-14: nut "Đồng bộ trước khi tải" - cac cot PO / don mua / don BH / ton kho / don LK gan nhat lay tu 5 nguon khac nhau,
  // moi nguon tu lam moi theo chu ky rieng (2h / 5 phut / 5 phut / moi gio). Bam 1 lan = lam moi dung cac nguon man nay dung,
  // roi moi xuat Excel - thay vi phai doi het chu ky hoac F5 (F5 keo lai ca 5 tap Google Sheet ~39MB).
  const [dongBo, setDongBo] = useState<{ dang: boolean; luc: string | null; loi: string | null }>({ dang: false, luc: null, loi: null });
  async function dongBoTruocKhiTai() {
    setDongBo((s) => ({ ...s, dang: true, loi: null }));
    const loi: string[] = [];
    await Promise.all([
      refreshSome(["po-dat-hang", "mua-hang", "bao-hanh"]).catch(() => loi.push(tr("PO / đơn mua / đơn BH"))),
      queryClient.invalidateQueries({ queryKey: ["ton-kho-lk-tong-hop"] }).catch(() => loi.push(tr("tồn kho"))),
      api.post("/cases/don-lk-gan-nhat/dong-bo", {}).catch(() => loi.push(tr("đơn LK gần nhất"))),
    ]);
    await refetch();
    setDongBo({ dang: false, luc: new Date().toISOString(), loi: loi.length ? loi.join(", ") : null });
  }
  // 2026-11-13: ton kho MB/MN cua "Mã linh kiện thiếu" - cung nguon cot "Tồn kho MB/MN" menu Thiếu linh kiện (/ton-kho-lk/tong-hop).
  const { map: tonKhoMap } = useTonKhoTongHop();
  const layTonKhoTongHop = useLayTonKhoTongHop();
  // 2026-11-11: 3 cot ngay hang ve theo KV cho ca co "Mã linh kiện thiếu" - doi chieu PO dat hang (cung nguon menu Thiếu linh kiện).
  const poTheoMaLk = useMemo(() => indexPoTheoMaLk(poDatHang), [poDatHang]);
  const ngayHangVe = (c: CaseRow) => ngayHangVeTheoKv(c.last_ma_linh_kien_thieu, c.khu_vuc, poTheoMaLk);
  // "ID đặt hàng gần nhất" (2026-11-12): nguon chinh = don linh-kien-app da luu server (don_lk_*, cap nhat moi gio + khi mo ca).
  // Ca chua co don tren app ma "Mã xuất hàng liên quan" cua giai trinh trung 1 ID tren Google Sheet mua hang cu (AppSheet) -> hien
  // tam tu sheet (chi o trinh duyet, khong loc/sap xep server duoc).
  const muaHangTheoId = useMemo(() => new Map(muaHang.map((r) => [r.id, r])), [muaHang]);
  const donLk = (c: CaseRow) => {
    if (!c.last_ma_linh_kien_thieu) return null;
    if (c.don_lk_id) {
      const nguon = c.don_lk_nguon === "giai_trinh" ? tr("mã ghi trong giải trình") : c.don_lk_nguon === "lada" ? tr("khớp ID Lada") : tr("đơn ghi mã ca");
      return {
        id: c.don_lk_id,
        trangThai: c.don_lk_trang_thai ?? "",
        ngayDat: fmtDateTime(c.don_lk_ngay_dat),
        ngayDuyet: c.don_lk_ngay_duyet ? fmtDateTime(c.don_lk_ngay_duyet) : "",
        ngayXuat: c.don_lk_ngay_xuat ? fmtDateTime(c.don_lk_ngay_xuat) : "",
        sheet: false,
        title: [
          tr("Nguồn: {0}", nguon),
          tr("Mã LK của đơn: {0}", c.don_lk_ma_lk ?? "") + (c.don_lk_khop_ma_lk ? "" : " " + tr("(khác mã LK thiếu {0})", c.last_ma_linh_kien_thieu)),
          tr("Số đơn của ca: {0}", String(c.don_lk_so_don ?? 0)),
          c.don_lk_ngay_ktv_nhan ? tr("KTV nhận: {0}", fmtDateTime(c.don_lk_ngay_ktv_nhan)) : "",
          tr("Cập nhật: {0}", fmtDateTime(c.don_lk_cap_nhat_luc)),
        ].filter(Boolean).join("\n"),
      };
    }
    const ma = (c.last_ma_xuat_hang_lien_quan ?? "").trim();
    const r = ma ? muaHangTheoId.get(ma) : undefined;
    if (!r) return null;
    return {
      id: r.id,
      trangThai: r.trangThaiGuiHang || r.trangThaiDuyet || "",
      ngayDat: r.ngayTao ?? "",
      ngayDuyet: r.ngayXacNhan ?? "",
      ngayXuat: r.ngayKhoXacNhan ?? "",
      sheet: true,
      title: tr("Nguồn: Google Sheet mua hàng cũ (mã ghi trong giải trình)"),
    };
  };
  // CHOT 2026-08-11: cac the so o tab "Bao cao" (vd "Tong can giai trinh") co the doi CHI VI thoi
  // gian troi qua (1 ca vuot moc tuoi ton 3/5/7/14 ngay) hoac do NGUOI KHAC thao tac (giai trinh 1 ca,
  // import CRM...) - khong co mutation cuc bo nao de invalidateQueries khi do, nen neu nguoi dung cu
  // mo tab nay lien tuc (khong unmount/remount lai) so lieu se dung yen mai cho toi khi F5 lai trang
  // (bug chu he thong bao "phai load lai web moi cap nhat"). Them refetchInterval rieng cho 4 query
  // nuoi cac the/bang o day (staleTime mac dinh 2 phut o main.tsx khong tu kich hoat refetch neu
  // khong remount/focus) - backend da co cachedReport()/tinh delta re (xem dailySnapshot.ts), polling
  // vai phut/lan khong dang ke so voi ngan sach doc D1.
  const BACKLOG_REPORT_REFETCH_MS = 3 * 60_000;
  // 2026-11-07: man Quan ly ton KEO 1 LAN - 1 request GET /cases/man-quan-ly-ton thay cho 4 request rieng (backlog-stats, counts,
  // backlog-daily, giai-trinh-daily-trend); server gom doc cache cua ca 4 phan vao 1 luot D1. queryKey bat dau bang "backlog-stats"
  // de cac cho dang invalidateQueries(["backlog-stats"]) (CaseDetail, ImportModule) van lam moi duoc man nay. Bang tỷ lệ giải trình
  // chi kem khi dang o tab Bao cao (giong enabled cu). "Theo nhom" (dim) va "ton theo moc" van query rieng (bo loc tuong tac).
  const { data: manQlt } = useQuery({
    queryKey: ["backlog-stats", "man-quan-ly-ton", khuVucFilter || null, view === "bao-cao"],
    queryFn: () =>
      api.get<{
        stats: BacklogStats;
        counts: CanGiaiTrinhCounts;
        backlogDaily: BacklogDailyPayload | null;
        giaiTrinhTrend: { rows: GiaiTrinhTrendRow[]; excludedNgay: ExcludedNgayRow[] } | null;
      }>(`/cases/man-quan-ly-ton${buildQuery({ khu_vuc: khuVucFilter, xu_huong: view === "bao-cao" ? "1" : undefined, days: view === "bao-cao" ? "14" : undefined })}`),
    refetchInterval: BACKLOG_REPORT_REFETCH_MS,
    placeholderData: (prev) => prev,
  });
  const stats = manQlt?.stats;
  const counts = manQlt?.counts;
  // CHOT 2026-08-01: "Bao cao ngay 08:00" (dong bang + delta trong ngay, xem lib/dailySnapshot.ts)
  // CHI co y nghia khi khong bat bo loc phu nao (khong the dong bang truoc moi to hop filter) -
  // giong het isDefaultReportParams() da dung cho Dashboard/Revenue, ap dung rieng cho Quan ly ton
  // vi bo loc phu (tinh/doi tac/hang/model/nhom KH/nganh/KTV) da bi go bo, chi con khu_vuc.
  const isDefaultBacklogFilter = !khuVucFilter;
  // CHOT 2026-08-01 (mo rong theo yeu cau): khi nguoi dung loc DUNG 1 khu_vuc cu the (khong phai gia
  // tri ao QLDVBH_FILTER_VALUE gop nhieu khu_vuc, khong phai danh sach nhieu khu_vuc cach dau phay)
  // van co the doc dong bang - backend tinh san 1 snapshot rieng cho TUNG khu_vuc co that (xem
  // generateKhuVucBacklogSnapshots), khong chi ban "tat ca".
  const isSingleKhuVucOnly = !!khuVucFilter && khuVucFilter !== QLDVBH_FILTER_VALUE && !khuVucFilter.includes(",");
  // CHOT 2026-08-01 (chu he thong phat hien "Tat ca DVBH" bi roi ve so song): gia tri ao
  // QLDVBH_FILTER_VALUE van doc dong bang duoc - backend cong don san cac snapshot rieng cua TUNG
  // khu_vuc thuc te co chua "qldvbh" (xem getBacklogDailyForKhuVucGroup), khong can tinh song.
  const isQldvbhGroup = khuVucFilter === QLDVBH_FILTER_VALUE;
  // CHOT 2026-10-20 (huong 1): chon NHIEU khu vuc le cung doc dong bang - backend cong snapshot rieng tung khu vuc
  // (GET /cases/backlog-daily?khu_vuc=a,b). Truoc day roi ve so song nen 2 nguoi cung pham vi (vd "Tat ca DVBH" vs bam
  // chon 6 khu vuc MB/MN) thay 2 so khac nhau.
  const isMultiKhuVuc = !!khuVucFilter && khuVucFilter !== QLDVBH_FILTER_VALUE && khuVucFilter.includes(",");
  const isFrozenEligible = isDefaultBacklogFilter || isSingleKhuVucOnly || isQldvbhGroup || isMultiKhuVuc;
  // Bo qua khi dang xem bang dong bang (nhom Khu vuc + du dieu kien dong bang) - da co du lieu tu
  // backlogDaily.khuVucRows, khong can doc song them qua route nay (do rows_read).
  const { data: khuVucStats } = useQuery({
    queryKey: ["backlog-by-khu-vuc", reportDim, sharedFilterParams],
    queryFn: () => api.get<{ rows: KhuVucRow[] }>(`/cases/backlog-by-khu-vuc${buildQuery({ dim: reportDim, ...sharedFilterParams })}`),
    enabled: !(reportDim === "khu_vuc" && isFrozenEligible),
    refetchInterval: BACKLOG_REPORT_REFETCH_MS,
  });
  // Lay tu request gop o tren (truoc la query rieng, enabled: isFrozenEligible - khong du dieu kien thi coi nhu khong co).
  const backlogDaily = isFrozenEligible ? manQlt?.backlogDaily : undefined;
  // Bang lich su "Ty le giai trinh theo ngay" (chot 17h30, xem giai_trinh_daily_log) - KHONG phu
  // thuoc bo loc phu (chi loc theo pham vi khu_vuc cua nguoi xem o backend), nen luon fetch khi dang
  // xem tab Bao cao, khong gate theo isFrozenEligible.
  const giaiTrinhTrend = view === "bao-cao" ? (manQlt?.giaiTrinhTrend ?? undefined) : undefined;
  // "So ca ton theo moc thoi gian" (cuoi tab Bao cao) - bo loc tu ngay/den ngay, mac dinh 30 ngay gan
  // nhat. Doc thang tu daily_snapshot (GET /cases/ton-trend) - khong tinh song, xem chu thich route.
  const [tonTrendFrom, setTonTrendFrom] = useState(() => vnDateOffsetStr(30));
  const [tonTrendTo, setTonTrendTo] = useState(() => vnDateOffsetStr(0));
  // Nhan hien thi dung 1 bo loc khu_vuc chung cua ca module (khuVucFilter) - mirror dung nhan cua
  // KhuVucFilterControl (xem options o render duoi) de nguoi dung khong nham "bang nay dang xem
  // pham vi nao" khi bam qua lai giua nhieu khu_vuc.
  const tonTrendFilterLabel = !khuVucFilter
    ? tr("Tất cả khu vực")
    : khuVucFilter === QLDVBH_FILTER_VALUE
      ? tr("Tất cả DVBH (MB/MN...)")
      : khuVucFilter
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
          .join(", ");
  const { data: tonTrend } = useQuery({
    queryKey: ["ton-trend", tonTrendFrom, tonTrendTo, khuVucFilter],
    queryFn: () =>
      api.get<{ rows: TonTrendRow[] }>(`/cases/ton-trend${buildQuery({ tu_ngay: tonTrendFrom, den_ngay: tonTrendTo, khu_vuc: khuVucFilter })}`),
    enabled: view === "bao-cao",
  });
  // "Canh bao ton danh cho QL" - card tong quan (dong bang 08:00) + bang lich su theo ngay (khu_vuc x
  // 14 ngay, xem lib/canhBaoTon.ts). CHOT 2026-08-20: ca 2 GIO loc theo khuVucFilter (bo loc khu_vuc
  // chung cua module, o dau trang) - truoc day co dinh toan he thong bat ke bo loc, gay lech voi ky
  // vong "bam filter khu vuc thi danh sach chi tiet cung phai loc theo" cua nguoi dung.
  const isCanhBaoTonView = view === "canh-bao-ton-cap1" || view === "canh-bao-ton-cap2";
  const { data: canhBaoTon } = useQuery({
    queryKey: ["canh-bao-ton", khuVucFilter],
    queryFn: () => api.get<CanhBaoTonCountsPayload>(`/cases/canh-bao-ton${buildQuery({ khu_vuc: khuVucFilter })}`),
    enabled: isCanhBaoTonView,
    refetchInterval: BACKLOG_REPORT_REFETCH_MS,
  });
  const { data: canhBaoTonTrend } = useQuery({
    queryKey: ["canh-bao-ton-daily-trend", khuVucFilter],
    queryFn: () => api.get<{ rows: CanhBaoTonTrendRow[] }>(`/cases/canh-bao-ton-daily-trend${buildQuery({ days: 14, khu_vuc: khuVucFilter })}`),
    enabled: isCanhBaoTonView,
  });
  // "Ngay loai tru" khoi luy ke/ty le thang - Chu nhat (quy tac cung) HOAC co trong danh sach Admin
  // them tay (khu_vuc "__ALL__" ap dung ca he thong) - dung de to mau khac trong bang "Ty le giai
  // trinh theo ngay", KHOP DUNG logic backend (buildNgayExcludedChecker trong dailySnapshot.ts).
  const isNgayExcluded = useMemo(() => {
    const rows = giaiTrinhTrend?.excludedNgay ?? [];
    const manualSet = new Set(rows.map((r) => `${r.ngay}|${r.khu_vuc}`));
    const allSet = new Set(rows.filter((r) => r.khu_vuc === "__ALL__").map((r) => r.ngay));
    return (ngay: string, khuVuc: string) => {
      const isSunday = new Date(`${ngay}T00:00:00Z`).getUTCDay() === 0;
      return isSunday || allSet.has(ngay) || manualSet.has(`${ngay}|${khuVuc}`);
    };
  }, [giaiTrinhTrend]);
  const trendDays = last14Days();
  // Cot dau tien (Khu vuc) sap A-Z.
  const sortedTrendRows: GiaiTrinhTrendRow[] = [...(giaiTrinhTrend?.rows ?? [])].sort((a, b) => a.khu_vuc.localeCompare(b.khu_vuc, "vi"));
  // Dong "Tong cong" cho bang "Ty le giai trinh theo ngay" - MOI cot ngay cong rieng can_giai_trinh/
  // da_giai_trinh cua tat ca khu vuc co du lieu ngay do, roi tinh % tu tong (khong cong trung binh
  // % tung dong).
  const trendTotalByDay = useMemo(() => {
    const rows = giaiTrinhTrend?.rows ?? [];
    const result: Record<string, { can: number; da: number }> = {};
    for (const day of trendDays) {
      let can = 0;
      let da = 0;
      for (const row of rows) {
        const found = row.days.find((d) => d.ngay === day);
        if (found) {
          can += found.can_giai_trinh;
          da += found.da_giai_trinh;
        }
      }
      result[day] = { can, da };
    }
    return result;
  }, [giaiTrinhTrend, trendDays]);
  // Trang thai loai tru cua dong "Tong cong" cho 1 ngay: "full" = TAT CA khu vuc co du lieu ngay do
  // deu bi loai tru (to giong cac o khu vuc rieng le), "partial" = CHI MOT SO khu vuc bi loai tru (to
  // mau RIENG, khac han - canh bao "Tong cong" ngay nay khong dai dien du 100% khu vuc"), "none" =
  // khong khu vuc nao bi loai tru.
  const trendDayExclusionStatus = useMemo(() => {
    const result: Record<string, "none" | "partial" | "full"> = {};
    for (const day of trendDays) {
      let total = 0;
      let excluded = 0;
      for (const row of sortedTrendRows) {
        if (row.days.find((d) => d.ngay === day)) {
          total++;
          if (isNgayExcluded(day, row.khu_vuc)) excluded++;
        }
      }
      result[day] = total === 0 || excluded === 0 ? "none" : excluded === total ? "full" : "partial";
    }
    return result;
  }, [sortedTrendRows, trendDays, isNgayExcluded]);
  // Xuat Excel bang "Ty le giai trinh theo ngay" (14 ngay gan nhat, tu cache giaiTrinhTrend) - xem
  // buildTrendExportRows() o dau file, dung chung voi nut "Tai ca thang".
  const trendExportRows = useMemo(() => buildTrendExportRows(giaiTrinhTrend?.rows ?? [], trendDays), [giaiTrinhTrend, trendDays]);
  // Nut "Tai ca thang" - chon 1 thang bat ky (khong gioi han 14 ngay gan nhat nhu bang hien thi tren
  // man hinh), goi rieng 1 lan API voi tu_ngay/den_ngay = ngay 01/ngay cuoi thang do (backend them
  // 2026-08-28, xem routes/cases.ts) roi xuat Excel ngay, khong luu vao state hien thi.
  const [trendMonth, setTrendMonth] = useState(() => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7));
  const [trendMonthDownloading, setTrendMonthDownloading] = useState(false);
  async function downloadTrendMonth() {
    const monthDays = daysInMonthList(trendMonth);
    setTrendMonthDownloading(true);
    try {
      const res = await api.get<{ rows: GiaiTrinhTrendRow[] }>(
        `/cases/giai-trinh-daily-trend${buildQuery({ tu_ngay: monthDays[0], den_ngay: monthDays[monthDays.length - 1] })}`,
      );
      exportRowsToExcel(buildTrendExportRows(res.rows, monthDays), `ty_le_giai_trinh_thang_${trendMonth}.xlsx`);
    } finally {
      setTrendMonthDownloading(false);
    }
  }
  // 3 cot moi cua bang "Bao cao ton theo khu vuc" (Can giai trinh trong ngay/Da giai trinh/Ty le) -
  // CHI khi dang nhom theo Khu vuc (yeu cau goc "chi can ty le theo Khu vuc") VA co dong bang (mac
  // dinh hoac loc dung 1 khu_vuc).
  const showDailyCols = reportDim === "khu_vuc" && isFrozenEligible && !!backlogDaily;
  // CHOT 2026-08-03: khi co dong bang (showDailyCols), toan bo cac cot con lai cua bang "Bao cao ton
  // theo khu vuc" (Tong ton/Tren 3-14/Da giai trinh/Can giai trinh (tong)/Lo ke hoach/...) CUNG phai
  // chot cung tu backlogDaily thay vi doc song qua khuVucStats. "da_giai_trinh" va "can_giai_trinh_tong"
  // gio la 2 chi tieu LUY KE THANG (khong con la so tinh/tuc thoi nhu truoc) - lay tu
  // byKhuVucMonthly.daGiaiTrinhThang / canGiaiTrinhLuyKe (cong don SUM tu giai_trinh_daily_log,
  // xem chu thich BacklogDailyPayload.byKhuVucMonthly) - khong con dung r.da_giai_trinh (khuVucRows,
  // so tinh tuc thoi) hay byKhuVuc.baseline (so cua rieng hom nay) nua.
  const frozenKhuVucRows: KhuVucRow[] = useMemo(() => {
    if (!showDailyCols || !backlogDaily) return [];
    return Object.entries(backlogDaily.khuVucRows)
      .map(([nhom, r]) => ({
        nhom,
        tong_ton: r.tong_ton,
        tren_3: r.tren_3,
        tren_5: r.tren_5,
        tren_7: r.tren_7,
        tren_14: r.tren_14,
        da_giai_trinh: backlogDaily.byKhuVucMonthly[nhom]?.daGiaiTrinhThang ?? 0,
        can_giai_trinh_tong: backlogDaily.byKhuVucMonthly[nhom]?.canGiaiTrinhLuyKe ?? 0,
        lo_ke_hoach: r.lo_ke_hoach,
        cho_giai_trinh_lai: r.cho_giai_trinh_lai,
        dmx_chua_gt_3_ngay: r.dmx_chua_gt_3_ngay,
        chua_gt_5_ngay: r.chua_gt_5_ngay,
        dieu_hoa_1_ngay: r.dieu_hoa_1_ngay,
        b2b_1_ngay: r.b2b_1_ngay,
        nskx_2_ngay: r.nskx_2_ngay,
        thieu_linh_kien: r.thieu_linh_kien,
      }))
      .sort((a, b) => a.nhom.localeCompare(b.nhom, "vi"));
  }, [showDailyCols, backlogDaily]);
  // CHOT 2026-08-01: cot dau tien (nhom) sap A-Z - ap dung du nguon la dong bang hay song.
  const liveKhuVucRows = khuVucStats?.rows ?? [];
  const displayKhuVucRows: KhuVucRow[] =
    reportDim === "tinh" && !showDailyCols
      ? gopBangTheoTinh(liveKhuVucRows, dgMode, dgIdx).sort((a, b) => soSanhTen(a.nhom, b.nhom))
      : [...(showDailyCols ? frozenKhuVucRows : liveKhuVucRows)].sort((a, b) => a.nhom.localeCompare(b.nhom, "vi"));

  // CHOT 2026-08-06: khi showDailyCols, bang hien THEM 4 cot "trong ngay" (Ty le GT thang/Can GT
  // ngay/Da GT ngay/Ty le GT ngay - tinh tu backlogDaily.byKhuVuc, KHONG nam trong KhuVucRow) - truoc
  // "Xuat Excel" chi xuat nguyen displayKhuVucRows nen file tai ve THIEU dung 4 cot nay so voi man
  // hinh dang xem (chu he thong bao cao). Bo sung rieng cho file xuat, khong dung lam kieu hien thi
  // (component hien thi van doc thang tu backlogDaily.byKhuVuc[r.nhom] nhu cu).
  const exportKhuVucRowsBody = displayKhuVucRows.map((r) => {
    if (!showDailyCols || !backlogDaily) return reportDim === "khu_vuc" ? { ...r, nhom: shortKhuVuc(r.nhom) } : r;
    const bucket = backlogDaily.byKhuVuc[r.nhom];
    return {
      ...r,
      nhom: reportDim === "khu_vuc" ? shortKhuVuc(r.nhom) : r.nhom,
      ty_le_gt_thang: r.can_giai_trinh_tong ? `${pct(r.da_giai_trinh, r.can_giai_trinh_tong)}%` : "—",
      can_giai_trinh_ngay: bucket?.baseline ?? 0,
      da_giai_trinh_ngay: bucket?.resolved ?? 0,
      ty_le_gt_ngay: bucket ? `${pct(bucket.resolved, bucket.baseline)}%` : "—",
    };
  });

  // Dong "Tong cong" o dau bang "Bao cao ton theo ..." - cong don tat ca cot so tren CHINH cac dong
  // dang hien (displayKhuVucRows), nen tu doi theo bo loc/nhom hien tai khong can logic rieng. Cot
  // "trong ngay" (khi showDailyCols) cong rieng tu backlogDaily.byKhuVuc roi tinh lai % tu tong da
  // giai trinh/tong can giai trinh (khong cong trung binh cac % dong), giong dung nguyen tac ap
  // dung cho moi bang bao cao khac trong app.
  const khuVucTotal = useMemo(() => {
    const sum = (key: keyof KhuVucRow) => displayKhuVucRows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
    let trongNgayBaseline = 0;
    let trongNgayResolved = 0;
    if (showDailyCols && backlogDaily) {
      for (const r of displayKhuVucRows) {
        const bucket = backlogDaily.byKhuVuc[r.nhom];
        if (bucket) {
          trongNgayBaseline += bucket.baseline;
          trongNgayResolved += bucket.resolved;
        }
      }
    }
    return {
      tong_ton: sum("tong_ton"),
      tren_3: sum("tren_3"),
      tren_5: sum("tren_5"),
      tren_7: sum("tren_7"),
      tren_14: sum("tren_14"),
      da_giai_trinh: sum("da_giai_trinh"),
      can_giai_trinh_tong: sum("can_giai_trinh_tong"),
      trongNgayBaseline,
      trongNgayResolved,
      lo_ke_hoach: sum("lo_ke_hoach"),
      cho_giai_trinh_lai: sum("cho_giai_trinh_lai"),
      dmx_chua_gt_3_ngay: sum("dmx_chua_gt_3_ngay"),
      chua_gt_5_ngay: sum("chua_gt_5_ngay"),
      dieu_hoa_1_ngay: sum("dieu_hoa_1_ngay"),
      b2b_1_ngay: sum("b2b_1_ngay"),
      nskx_2_ngay: sum("nskx_2_ngay"),
      thieu_linh_kien: sum("thieu_linh_kien"),
    };
  }, [displayKhuVucRows, showDailyCols, backlogDaily]);

  // CHOT 2026-08-12: file xuat Excel truoc day THIEU dong "Tong cong" (dong dau tien tren man hinh,
  // xem <tr> "Tong cong" ngay truoc vong lap displayKhuVucRows ben duoi) - them lai bang cach ghep
  // dong nay (tinh tu khuVucTotal, cung cong thuc % nhu hien thi tren man hinh) vao DAU mang xuat.
  const exportKhuVucRows =
    displayKhuVucRows.length === 0
      ? exportKhuVucRowsBody
      : [
          {
            ...khuVucTotal,
            nhom: "Tổng cộng",
            ...(showDailyCols
              ? {
                  ty_le_gt_thang: khuVucTotal.can_giai_trinh_tong ? `${pct(khuVucTotal.da_giai_trinh, khuVucTotal.can_giai_trinh_tong)}%` : "—",
                  can_giai_trinh_ngay: khuVucTotal.trongNgayBaseline,
                  da_giai_trinh_ngay: khuVucTotal.trongNgayResolved,
                  ty_le_gt_ngay: khuVucTotal.trongNgayBaseline ? `${pct(khuVucTotal.trongNgayResolved, khuVucTotal.trongNgayBaseline)}%` : "—",
                }
              : {}),
          },
          ...exportKhuVucRowsBody,
        ];

  // Tinh: popup chon ten tinh (theo che do Dia gioi cu/moi) -> dich sang dg_loc tho cho server. null = chua san sang.
  const locCotGui: string | undefined | null = (() => {
    const out: Record<string, unknown> = {};
    for (const [k, f] of Object.entries(locCot)) {
      if (!locCotDangBat(f)) continue;
      if (k === "tinh") {
        const ten = (f.in ?? []).filter((v) => v !== GIA_TRI_TRONG);
        const dg = diaGioiLoc.buildDgLoc(ten);
        if (dg === null) return null;
        if (dg) out.tinh = { dg };
        continue;
      }
      out[k] = f;
    }
    return Object.keys(out).length ? JSON.stringify(out) : undefined;
  })();
  const listParams = {
    tab: dsTab,
    category: dsTab === "can-giai-trinh" || dsTab === "canh-bao-ton" ? dsCategory : undefined,
    tuoi_tu: dsTab === "ton-hien-tai" ? dsTuoiTu || undefined : undefined,
    id: idSearch || undefined,
    page,
    pageSize,
    sortBy,
    sortDir,
    // Nhom CEO luon doc snapshot (ke ca khi nhomKey duoc khoi phuc tu localStorage sau khi tai lai trang, luc
    // listFromSnapshot0800 con mac dinh false).
    snapshot_0800:
      (listFromSnapshot0800 || nhomKey === "can-giai-trinh:ceo") && (dsTab === "can-giai-trinh" || dsTab === "canh-bao-ton") ? true : undefined,
    ...sharedFilterParams,
    loc_cot: locCotGui === undefined ? undefined : locCotGui ?? undefined,
  };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["backlog-list", listParams],
    queryFn: () => api.get<Paged<CaseRow> & { total_chua_loc?: number }>(`/cases${buildQuery(listParams)}`),
    // locCotGui === null: dang cho bang quy doi dia gioi de dich loc Tinh -> tam hoan.
    enabled: view === "danh-sach" && dsTab !== "da-dong" && locCotGui !== null,
  });
  // Danh sach gia tri (+ so ca) cua 1 cot cho popup loc - ap moi bo loc KHAC cot do (backend bo qua chinh cot do).
  async function layGiaTriCot(cot: string): Promise<GiaTriLoc[]> {
    const { rows } = await api.get<{ rows: (GiaTriLoc & { tinh?: string | null; tinh_moi?: string | null })[] }>(
      `/cases${buildQuery({ ...listParams, page: undefined, pageSize: undefined, gia_tri_cot: cot })}`,
    );
    if (cot !== "tinh") return rows;
    const gom = new Map<string, number>();
    for (const r of rows) {
      const ten = dgIdx.tinh(dgMode, { tinh: r.tinh ?? null, tinh_moi: r.tinh_moi ?? null }) || GIA_TRI_TRONG;
      gom.set(ten, (gom.get(ten) ?? 0) + r.n);
    }
    return [...gom.entries()].map(([v, n]) => ({ v, n }));
  }

  function goToDanhSach(nhom: string, tuoiTu?: string) {
    setNhomKey(nhom);
    // Tap ID snapshot theo vai tro (khong co bo loc) la nguon duy nhat co the drill-down khop 100%
    // voi so 08:00. Bo loc khu vuc rieng tam thoi dung nhanh bao gom ca dong sau 08:00 o backend.
    // "canh-bao-ton:" luon dong bang toan he thong (khong phu thuoc backlogDaily/isFrozenEligible -
    // khai niem do chi ap dung cho snapshot giai_trinh, khac bucket rieng cua Canh bao ton).
    setListFromSnapshot0800(
      nhom.startsWith("canh-bao-ton:") || (!!backlogDaily && isFrozenEligible && (nhom.startsWith("can-giai-trinh:") || nhom === "da-giai-trinh-trong-ngay")),
    );
    setDsTuoiTu(tuoiTu ?? "");
    setIdSearch("");
    setLocCotState({});
    setPage(1);
    setView("danh-sach");
  }

  // Drill-down tu 1 dong bang pivot: gan gia tri dong do vao dung bo loc chung ung voi cot dang
  // nhom (vd dang nhom theo "tinh" -> bam dong "Ha Noi" se set bo loc Tinh = "Ha Noi"), roi chuyen
  // sang Danh sach chi tiet voi nhom/tuoi tuong ung.
  // 2026-11-10: dim khac khu vuc (Tinh/Doi tac/Hang/Model/Nhom KH/Nganh) truoc day KHONG loc gi -> danh sach ra ca toan bo, khong khop
  // so vua bam. Gio dat loc cot cung dim (value null = dong "Tong cong" -> khong loc dim). Bang theo dim khac khu vuc la so TINH SONG
  // nen danh sach cung doc song (khong doc tap ID chot 08:00).
  function drillDown(value: string | null, nhom: string, tuoiTu?: string) {
    if (reportDim === "khu_vuc" && value !== null) {
      setKhuVucFilter(value);
    }
    goToDanhSach(nhom, tuoiTu);
    if (reportDim !== "khu_vuc") {
      setListFromSnapshot0800(false);
      if (value !== null) setLocCotState({ [reportDim]: { in: [value === "" ? GIA_TRI_TRONG : value] } });
    }
  }

  // Nhan cot khop dung voi cot hien tren PaginatedTable ben duoi (mang "columns") - "tiep_nhan"/
  // "du_kien"/"ly_do" la key hien thi noi bo, doi lai dung ten field goc cua CaseRow lam key Excel.
  const DANH_SACH_EXPORT_LABELS: Record<string, string> = {
    ...CASE_FIELD_LABELS,
    thoi_gian_cskh_tiep_nhan: "Thời gian tiếp nhận",
    last_ngay_du_kien_hoan_thanh: "Dự kiến HT",
    last_ly_do_cham: "Lý do tồn gần nhất",
    need_lo_ke_hoach: "Lỡ kế hoạch",
    need_tai_giai_trinh: "Tái giải trình",
    need_chua_gt_3_ngay: "Chưa GT >3 ngày",
    need_chua_gt_5_ngay: nhanTheoMoc("Chưa GT >5 ngày", moc),
    need_dieu_hoa: "Điều hòa",
    need_b2b: "B2B",
    need_nskx: "NSKX",
    need_loc_tong_bcn: "Lọc tổng",
    need_vip_24h: "VIP/SVIP >=24h",
    tuoi_ton: "Tuổi tồn",
    // CHOT 2026-08-06: cac cot tinh rieng o frontend (khong co san tren CaseRow tu API) - xem enrichForExport().
    last_ten_linh_kien_thieu: "Tên linh kiện thiếu gần nhất",
    sl_don_mua: "SL đơn mua",
    sl_don_bao_hanh: "SL đơn bảo hành",
    khoang_ton: "Khoảng tồn",
    ngay_hang_ve_du_kien_kv: "Ngày hàng về dự kiến theo KV",
    so_lan_lui_dk: "Số lần lùi ngày DK",
    ngay_ve_gan_nhat_kv: "Ngày về gần nhất theo KV",
    ngay_nm_cam_ket: "Ngày NM cam kết có hàng",
    ton_kho_mb: "Tồn kho MB",
    ton_kho_mn: "Tồn kho MN",
    don_lk_id: "ID đặt hàng gần nhất",
    don_lk_trang_thai: "Trạng thái đơn hàng",
    don_lk_ngay_dat: "Ngày đặt hàng",
    don_lk_ngay_duyet: "Ngày duyệt đơn",
    don_lk_ngay_xuat: "Ngày xuất hàng",
  };

  // Nhan cot cho bang pivot "Bao cao ton theo ..." - khop dung thead cua bang o duoi (cot "nhom" doi
  // ten theo dim dang chon, vd "Khu vuc"/"Tinh"...).
  function pivotExportLabels(): Record<string, string> {
    return {
      nhom: REPORT_DIM_OPTIONS.find((d) => d.value === reportDim)?.label ?? "Nhóm",
      tong_ton: "Tổng tồn",
      tren_3: "Trên 3 ngày",
      tren_5: "Trên 5 ngày",
      tren_7: "Trên 7 ngày",
      tren_14: "Trên 14 ngày",
      da_giai_trinh: showDailyCols ? "Đã giải trình (tháng)" : "Đã giải trình",
      can_giai_trinh_tong: showDailyCols ? "Cần giải trình (lũy kế)" : "Cần giải trình (tổng)",
      ty_le_gt_thang: "Tỷ lệ GT tháng",
      can_giai_trinh_ngay: "Cần giải trình (ngày)",
      da_giai_trinh_ngay: "Đã giải trình (ngày)",
      ty_le_gt_ngay: "Tỷ lệ GT ngày",
      lo_ke_hoach: "Lỡ kế hoạch",
      cho_giai_trinh_lai: "Tái giải trình",
      dmx_chua_gt_3_ngay: "ĐMX chưa GT >3 ngày",
      chua_gt_5_ngay: nhanTheoMoc("Chưa GT >5 ngày", moc),
      dieu_hoa_1_ngay: "Điều hòa >1 ngày",
      b2b_1_ngay: "B2B >1 ngày",
      nskx_2_ngay: "NSKX >=2 ngày",
      thieu_linh_kien: "Thiếu linh kiện",
    };
  }

  const exportRunner = useExportRunner();
  async function handleExport() {
    // Cot ngay hang ve / so lan lui tinh tu du lieu PO o trinh duyet - con dang tai thi file se trong cac cot do.
    if (poDangTai) throw new Error(tr("dữ liệu PO đặt hàng đang tải, thử lại sau vài giây"));
    const [all, tonKho] = await Promise.all([
      api.get<{ rows: CaseRow[] }>(`/cases${buildQuery({ ...listParams, page: undefined, pageSize: undefined, export: true })}`),
      layTonKhoTongHop(),
    ]);
    // Cot "Ten linh kien thieu gan nhat"/"SL don mua"/"SL don bao hanh" chi co tren frontend (tra
    // cuu qua linhKienTenMap/matchMuaHang/matchBaoHanh da cache san) - ghi de vao TUNG dong truoc khi
    // xuat, giu nguyen cac cot con lai tu API.
    const enriched = all.rows.map((r) => {
      const nv = ngayHangVe(r);
      const dl = donLk(r);
      return {
      ...r,
      don_lk_id: dl?.id ?? null,
      don_lk_trang_thai: dl?.trangThai || null,
      don_lk_ngay_dat: dl?.sheet ? dl.ngayDat : (r.last_ma_linh_kien_thieu ? r.don_lk_ngay_dat : null) ?? null,
      don_lk_ngay_duyet: dl?.sheet ? dl.ngayDuyet : (r.last_ma_linh_kien_thieu ? r.don_lk_ngay_duyet : null) ?? null,
      don_lk_ngay_xuat: dl?.sheet ? dl.ngayXuat : (r.last_ma_linh_kien_thieu ? r.don_lk_ngay_xuat : null) ?? null,
      ngay_hang_ve_du_kien_kv: nv.duKien,
      so_lan_lui_dk: nv.soLanLuiDk === "" ? null : Number(nv.soLanLuiDk),
      ngay_ve_gan_nhat_kv: nv.veGanNhat,
      ngay_nm_cam_ket: nv.nmCamKet,
      ton_kho_mb: r.last_ma_linh_kien_thieu ? (tonKho.get(r.last_ma_linh_kien_thieu)?.ton_mb ?? 0) : null,
      ton_kho_mn: r.last_ma_linh_kien_thieu ? (tonKho.get(r.last_ma_linh_kien_thieu)?.ton_mn ?? 0) : null,
      khu_vuc: shortKhuVuc(r.khu_vuc),
      last_ten_linh_kien_thieu: r.last_ma_linh_kien_thieu ? (linhKienTenMap.get(r.last_ma_linh_kien_thieu) ?? r.last_ma_linh_kien_thieu) : null,
      sl_don_mua: slDonMua(r),
      sl_don_bao_hanh: slDonBaoHanh(r),
      khoang_ton: khoangTon(r),
      };
    });
    await exportRowsToExcel(enriched, "quan_ly_ton.xlsx", "Data", DANH_SACH_EXPORT_LABELS);
  }

  // Uu tien mo the "Tranh chap" khi bam vao 1 don dang co tranh chap TON DONG (khac "Chua xu ly" - ca
  // chua tung co tien trinh nao - va khac 4 trang thai dong TRANH_CHAP_TRANG_THAI_DONG/TRANG_THAI_DONG)
  // - dung lai dung field da co san tu GET /cases (last_tranh_chap_trang_thai), khong goi them API.
  // Them 2026-08-22, sua lai cung ngay sau khi chu he thong xac nhan lai thu tu uu tien: ca DA DONG
  // (thoi_gian_hoan_thanh khac null) LUON mo "Tien trinh chung" truoc tien, KE CA khi con tranh chap
  // ton dong - nguoi dung tu bam sang tab Tranh chap neu can, khong con uu tien tranh chap truoc nua.
  function preferredCaseTab(c: CaseRow): string {
    if (c.thoi_gian_hoan_thanh) return "tien-trinh-chung";
    const st = c.last_tranh_chap_trang_thai;
    if (st && st !== "Chua xu ly" && !TRANG_THAI_DONG.includes(st)) return "tranh-chap";
    return "giai-trinh";
  }

  // Thanh "Bộ lọc" tren bang - gom ca cac cot dang AN (Tinh, Model, Hang...) de loc khong can bat cot. Cung gia tri voi loc tren tieu de.
  const LOC_NHANH: { key: string; label: string; kieu: KieuLocCot; nhanGiaTri?: (v: string) => string }[] = [
    { key: "tinh", label: NHAN_CAP_1[dgMode], kieu: "list" },
    { key: "nhom_san_pham", label: "Model", kieu: "list" },
    { key: "hang", label: tr("Hãng"), kieu: "list" },
    { key: "doi_tac", label: tr("Đối tác"), kieu: "list" },
    { key: "nganh", label: tr("Ngành"), kieu: "list" },
    { key: "nhom_kh", label: tr("Nhóm KH"), kieu: "list" },
    { key: "nhom_yeu_cau", label: tr("Nhóm yêu cầu"), kieu: "list" },
    { key: "loai_yeu_cau", label: tr("Loại yêu cầu"), kieu: "list" },
    { key: "ky_thuat_vien", label: "KTV", kieu: "list" },
    { key: "tuoi_ton", label: tr("Tuổi tồn (ngày)"), kieu: "number" },
    { key: "tiep_nhan", label: tr("Ngày tiếp nhận"), kieu: "date" },
    {
      key: "cap_ton",
      label: tr("Cấp tồn"),
      kieu: "list",
      nhanGiaTri: (v) => (v === "cap2" ? tr("Cấp 2 — CEO") : v === "cap1" ? tr("Cấp 1 — TBP/TP DVBH") : v),
    },
    { key: "nhom_ton", label: tr("Nhóm tồn"), kieu: "list", nhanGiaTri: (v) => nhomTonBadges.find((b) => b.key === v)?.label ?? v },
  ];

  const columns: Column<CaseRow>[] = [
    {
      key: "id",
      header: "ID",
      sortKey: "id",
      filter: "text",
      // Ca huy bo sau 08:00 van nam trong danh sach Canh bao ton da chot (khop so) - gan nhan de nguoi giai trinh biet
      render: (c) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono text-[var(--ocean-600)] font-semibold">{c.id}</span>
          {c.huy_bo_at && (
            <span title={c.huy_bo_ly_do ? tr("Đã hủy: {0}", c.huy_bo_ly_do) : tr("Ca đã hủy bỏ sau giờ chốt 08:00")}>
              <Badge tone="gray">{tr("🚫 Đã hủy")}</Badge>
            </span>
          )}
        </span>
      ),
    },
    {
      key: "khach_hang",
      header: tr("Khách hàng"),
      sortKey: "khach_hang",
      filter: "text",
      render: (c) => (
        <>
          {isVipKh(c.nhom_kh) && <VipBadge />}
          {c.khach_hang ?? "—"}
        </>
      ),
    },
    {
      key: "ky_thuat_vien",
      header: tr("Trạm / KTV triển khai"),
      sortKey: "ky_thuat_vien",
      filter: "list",
      render: (c) => (
        <span className="text-xs">
          {c.ky_thuat_vien ?? "—"}
          {c.ktv_trien_khai && c.ktv_trien_khai !== c.ky_thuat_vien && (
            <span className="block text-[var(--ocean-600)]" title={tr("KTV triển khai (khác tài khoản trạm)")}>
              ↳ {c.ktv_trien_khai}
            </span>
          )}
        </span>
      ),
    },
    { key: "tiep_nhan", header: tr("Tiếp nhận"), sortKey: "thoi_gian_cskh_tiep_nhan", filter: "date", render: (c) => <span className="text-xs">{fmtDateTime(c.thoi_gian_cskh_tiep_nhan)}</span> },
    { key: "du_kien", header: tr("Dự kiến HT"), sortKey: "last_ngay_du_kien_hoan_thanh", filter: "date", render: (c) => <span className="text-xs">{fmtDateTime(c.last_ngay_du_kien_hoan_thanh)}</span> },
    {
      key: "ly_do",
      header: tr("Lý do tồn gần nhất"),
      sortKey: "last_ly_do_cham",
      filter: "list",
      filterValueLabel: (v) => (v === GIA_TRI_TRONG ? tr("Chưa giải trình") : (dl(v) ?? v)),
      render: (c) => (c.last_ly_do_cham ? <Badge tone="ocean">{dl(c.last_ly_do_cham)}</Badge> : <span className="text-[var(--ink-400)] text-xs italic">{tr("Chưa giải trình")}</span>),
    },
    {
      key: "last_tranh_chap_trang_thai",
      header: tr("Tiến độ TC"),
      sortKey: "last_tranh_chap_trang_thai",
      filter: "list",
      filterValueLabel: (v) => (v === "Chua xu ly" ? tr("Không tranh chấp") : (TRANG_THAI_LABELS[v] ?? v)),
      render: (c) =>
        c.last_tranh_chap_trang_thai && c.last_tranh_chap_trang_thai !== "Chua xu ly" ? (
          <div className="space-y-0.5">
            {c.last_phan_loai_tranh_chap && <div className="text-[11px] text-[var(--ink-400)] truncate">{dl(c.last_phan_loai_tranh_chap)}</div>}
            <Badge tone={TRANG_THAI_TONE[c.last_tranh_chap_trang_thai] ?? "gray"}>{TRANG_THAI_LABELS[c.last_tranh_chap_trang_thai] ?? c.last_tranh_chap_trang_thai}</Badge>
          </div>
        ) : (
          <span className="text-[var(--ink-400)] text-xs italic">{tr("Không tranh chấp")}</span>
        ),
    },
    {
      key: "tranh_chap_so_ngay_ton",
      header: tr("Tuổi TC"),
      sortKey: "tranh_chap_so_ngay_ton",
      filter: "number",
      render: (c) =>
        c.tranh_chap_so_ngay_ton != null ? (
          <Pill tone={c.tranh_chap_so_ngay_ton > 5 ? "coral" : c.tranh_chap_so_ngay_ton > 3 ? "amber" : "gray"}>{c.tranh_chap_so_ngay_ton}  {tr("ngày")}</Pill>
        ) : (
          <span className="text-[var(--ink-400)] text-xs">—</span>
        ),
    },
    {
      key: "nhom_ton",
      header: tr("Nhóm tồn"),
      filter: "list",
      filterValueLabel: (v) => nhomTonBadges.find((b) => b.key === v)?.label ?? v,
      render: (c) => {
        const active = nhomTonBadges.filter((b) => c[b.key]);
        return active.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {active.map((b) => (
              <Badge key={b.key} tone="amber">
                {b.label}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-[var(--ink-400)] text-xs">—</span>
        );
      },
    },
    {
      key: "tuoi_ton",
      header: tr("Tuổi tồn"),
      sortKey: "tuoi_ton",
      filter: "number",
      render: (c) =>
        c.tuoi_ton != null ? (
          <Pill tone={c.tuoi_ton > 14 ? "coral" : c.tuoi_ton > 3 ? "amber" : "gray"}>{c.tuoi_ton}  {tr("ngày")}</Pill>
        ) : (
          <span className="text-[var(--ink-400)] text-xs">—</span>
        ),
    },
    { key: "khu_vuc", header: tr("Khu vực"), sortKey: "khu_vuc", filter: "list", filterValueLabel: (v) => (v === GIA_TRI_TRONG ? tr("(Trống)") : shortKhuVuc(v)), render: (c) => shortKhuVuc(c.khu_vuc) },
    // 2026-11-11 (chu he thong): ngay hang ve cua "Mã linh kiện thiếu" gan nhat, chi PO cua kho cung mien voi khu vuc ca
    // (lib/ngayHangVeTheoKv.ts). Tinh o trinh duyet tu du lieu PO da cache (khong co tren server) nen khong loc/sap xep
    // theo cot duoc - giong cac cot "SL đơn mua"/"SL đơn bảo hành". Cot THUONG (khong optional) de tu hien ca voi nguoi da
    // tung tuy chinh cot (PaginatedTable chi tu noi cot thuong moi vao cuoi).
    ...(
      [
        ["ngay_hang_ve_du_kien_kv", tr("Ngày hàng về dự kiến theo KV"), "duKien"],
        ["so_lan_lui_dk", tr("Số lần lùi ngày DK"), "soLanLuiDk"],
        ["ngay_ve_gan_nhat_kv", tr("Ngày về gần nhất theo KV"), "veGanNhat"],
        ["ngay_nm_cam_ket", tr("Ngày NM cam kết có hàng"), "nmCamKet"],
      ] as const
    ).map(
      ([key, header, f]): Column<CaseRow> => ({
        key,
        header,
        render: (c) => {
          const v = c.last_ma_linh_kien_thieu ? ngayHangVe(c)[f] : "";
          return v ? (
            <span className="text-xs whitespace-nowrap" title={tr("Mã linh kiện thiếu: {0}", c.last_ma_linh_kien_thieu ?? "")}>{v}</span>
          ) : (
            <span className="text-[var(--ink-400)] text-xs">—</span>
          );
        },
      }),
    ),
    // 2026-11-13: ton kho MB/MN cua "Mã linh kiện thiếu" (cung so voi menu Thiếu linh kiện). Ma khong co trong ton kho = 0.
    ...(
      [
        ["ton_kho_mb", tr("Tồn kho MB"), "ton_mb"],
        ["ton_kho_mn", tr("Tồn kho MN"), "ton_mn"],
      ] as const
    ).map(
      ([key, header, f]): Column<CaseRow> => ({
        key,
        header,
        render: (c) => {
          if (!c.last_ma_linh_kien_thieu || !tonKhoMap) return <span className="text-[var(--ink-400)] text-xs">—</span>;
          const v = tonKhoMap.get(c.last_ma_linh_kien_thieu)?.[f] ?? 0;
          return (
            <span className={`text-xs tabular-nums ${v > 0 ? "font-semibold text-[var(--ocean-600)]" : "text-[var(--coral-500)]"}`} title={tr("Mã linh kiện thiếu: {0}", c.last_ma_linh_kien_thieu)}>
              {fmtSl(v)}
            </span>
          );
        },
      }),
    ),
    // 2026-11-12 (chu he thong): "ID đặt hàng gần nhất" + trang thai / ngay dat / duyet / xuat cua don do (backend lib/donLkGanNhat.ts).
    // Loc + sap xep tren server (COT_LOC don_lk_*). Dong lay tu Google Sheet cu (chu xam, nghieng) chi hien, khong loc duoc.
    ...(
      [
        ["don_lk_id", tr("ID đặt hàng gần nhất"), "id", "text"],
        ["don_lk_trang_thai", tr("Trạng thái đơn hàng"), "trangThai", "list"],
        ["don_lk_ngay_dat", tr("Ngày đặt hàng"), "ngayDat", "date"],
        ["don_lk_ngay_duyet", tr("Ngày duyệt đơn"), "ngayDuyet", "date"],
        ["don_lk_ngay_xuat", tr("Ngày xuất hàng"), "ngayXuat", "date"],
      ] as const
    ).map(
      ([key, header, f, filter]): Column<CaseRow> => ({
        key,
        header,
        sortKey: key,
        filter,
        render: (c) => {
          const d = donLk(c);
          const v = d?.[f];
          if (!d || !v || v === "—") return <span className="text-[var(--ink-400)] text-xs">—</span>;
          return (
            <span
              className={`text-xs whitespace-nowrap ${f === "id" ? "font-mono" : ""} ${d.sheet ? "italic text-[var(--ink-400)]" : ""}`}
              title={d.title}
            >
              {v}
            </span>
          );
        },
      }),
    ),
    { key: "action", header: "", render: () => <span className="text-[var(--ocean-500)] text-xs font-semibold">{tr("Xem / giải trình →")}</span> },
  ];

  // Cot bo sung cho bang "Danh sach chi tiet" - AN mac dinh, nguoi dung tu bat qua nut "⚙" canh cot
  // ID (xem PaginatedTable.tsx storageKey/optionalColumns). Nhan lay tu CASE_FIELD_LABELS (dung 1
  // nguon nhan tieng Viet voi Excel export) de khong lech chu voi cho khac trong app.
  const textCol = (key: keyof CaseRow, header: string, filter: KieuLocCot = "list"): Column<CaseRow> => ({
    key,
    header,
    sortKey: key,
    filter,
    filterValueLabel: (v) => (v === GIA_TRI_TRONG ? tr("(Trống)") : (dl(v) ?? v)),
    // dl(): gia tri trung lua chon Cai dat (loai yeu cau, ly do ton tranh chap...) hien ban dich theo ngon ngu (Q3).
    render: (c) => <span className="text-xs">{dl((c[key] as unknown as string | null)) ?? "—"}</span>,
  });
  const dateCol = (key: keyof CaseRow, header: string): Column<CaseRow> => ({
    key,
    header,
    sortKey: key,
    filter: "date",
    render: (c) => <span className="text-xs">{fmtDateTime(c[key] as unknown as string | null)}</span>,
  });
  const moneyCol = (key: keyof CaseRow, header: string): Column<CaseRow> => ({
    key,
    header,
    sortKey: key,
    filter: "number",
    render: (c) => <span className="text-xs font-mono">{fmtVND(c[key] as unknown as number | null)}</span>,
  });
  // "SL don mua"/"SL don bao hanh" - dung LAI matchMuaHang/matchBaoHanh (lib/purchaseWarrantyMatch.ts,
  // dang dung o CaseDetail.tsx) tren 2 tap Google Sheet da cache o trinh duyet - xem chu thich uoc
  // luong o cot "sl_don_mua" ben duoi ve gioi han cua "last_ma_xuat_hang_lien_quan".
  function slDonMua(c: CaseRow): number {
    return matchMuaHang(c.id, c.last_ma_xuat_hang_lien_quan ? [{ ma_xuat_hang_lien_quan: c.last_ma_xuat_hang_lien_quan }] : [], muaHang).length;
  }
  function slDonBaoHanh(c: CaseRow): number {
    return matchBaoHanh(c.id, baoHanh).length;
  }
  // "Khoang ton" (CHOT 2026-08-06) - nhom tu cot "Tuoi ton" (c.tuoi_ton, da tinh san server-side, xem
  // AGE_EXPR trong backend/src/routes/cases.ts) thanh dai, hoan toan frontend - khong doi gi backend.
  // Moc duoi cua moi dai la ">=" (khop quy uoc "Cho >=X ngay" da dung o TranhChapModule.tsx), moc
  // tren la "<" - vd tuoi_ton = 3 roi vao dai "3-5 ngay", khong phai "1-3 ngay".
  const KHOANG_TON_BUCKETS: { label: string; min: number; max: number | null }[] = [
    { label: tr("Dưới 1 ngày"), min: 0, max: 1 },
    { label: tr("1-3 ngày"), min: 1, max: 3 },
    { label: tr("3-5 ngày"), min: 3, max: 5 },
    { label: tr("5-7 ngày"), min: 5, max: 7 },
    { label: tr("7-10 ngày"), min: 7, max: 10 },
    { label: tr("10-14 ngày"), min: 10, max: 14 },
    { label: tr("Trên 14 ngày"), min: 14, max: null },
  ];
  function khoangTon(c: CaseRow): string {
    if (c.tuoi_ton == null) return "—";
    const bucket = KHOANG_TON_BUCKETS.find((b) => c.tuoi_ton! >= b.min && (b.max === null || c.tuoi_ton! < b.max));
    return bucket?.label ?? "—";
  }
  const optionalCaseColumns: Column<CaseRow>[] = [
    textCol("seri_san_pham", CASE_FIELD_LABELS.seri_san_pham, "text"),
    // Tinh / cap 2 theo che do "Dia gioi cu / moi" (2026-10-10): cu = tinh + quan/huyen, moi = tinh moi (ca cu quy doi
    // theo bang) + xa/phuong moi.
    { key: "tinh", header: NHAN_CAP_1[dgMode], filter: "list", render: (c) => <span className="text-xs">{dgIdx.tinh(dgMode, c) || "—"}</span> },
    { key: "quan_huyen", header: NHAN_CAP_2[dgMode], render: (c) => <span className="text-xs">{(dgMode === "moi" ? c.xa_moi : c.quan_huyen) || "—"}</span> },
    textCol("hang", CASE_FIELD_LABELS.hang),
    textCol("nhom_san_pham", CASE_FIELD_LABELS.nhom_san_pham),
    textCol("nganh", CASE_FIELD_LABELS.nganh),
    textCol("doi_tac", CASE_FIELD_LABELS.doi_tac),
    textCol("nhom_kh", CASE_FIELD_LABELS.nhom_kh),
    textCol("mo_ta_loi", CASE_FIELD_LABELS.mo_ta_loi, "text"),
    dateCol("thoi_gian_hen_xu_ly", CASE_FIELD_LABELS.thoi_gian_hen_xu_ly),
    textCol("nhom_yeu_cau", CASE_FIELD_LABELS.nhom_yeu_cau),
    textCol("loai_yeu_cau", CASE_FIELD_LABELS.loai_yeu_cau),
    { key: "muc_do", header: CASE_FIELD_LABELS.muc_do, sortKey: "muc_do", filter: "list", render: (c) => mucDoBadge(c.muc_do) ?? <span className="text-xs">—</span> },
    textCol("hinh_thuc_bao_hanh", CASE_FIELD_LABELS.hinh_thuc_bao_hanh),
    textCol("ghi_chu_loai_dv", CASE_FIELD_LABELS.ghi_chu_loai_dv, "text"),
    textCol("tien_do_hoan_thanh", CASE_FIELD_LABELS.tien_do_hoan_thanh),
    textCol("noi_dung_xu_ly", CASE_FIELD_LABELS.noi_dung_xu_ly, "text"),
    textCol("ly_do_ton_tranh_chap_gan_nhat", CASE_FIELD_LABELS.ly_do_ton_tranh_chap_gan_nhat),
    moneyCol("dt_san_pham", CASE_FIELD_LABELS.dt_san_pham),
    moneyCol("dt_linh_kien", CASE_FIELD_LABELS.dt_linh_kien),
    moneyCol("dt_dich_vu", CASE_FIELD_LABELS.dt_dich_vu),
    dateCol("ngay_mua", CASE_FIELD_LABELS.ngay_mua),
    dateCol("ngay_san_xuat", CASE_FIELD_LABELS.ngay_san_xuat),
    dateCol("last_ngay_giai_trinh", CASE_FIELD_LABELS.last_ngay_giai_trinh),
    textCol("last_noi_dung_giai_trinh", CASE_FIELD_LABELS.last_noi_dung_giai_trinh, "text"),
    {
      key: "khoang_ton",
      header: tr("Khoảng tồn"),
      render: (c) => <span className="text-xs">{khoangTon(c)}</span>,
    },
    {
      key: "last_ma_linh_kien_thieu",
      header: CASE_FIELD_LABELS.last_ma_linh_kien_thieu,
      render: (c) =>
        c.last_ma_linh_kien_thieu ? (
          <MaLinhKienLink ma={c.last_ma_linh_kien_thieu} ten={linhKienTenMap.get(c.last_ma_linh_kien_thieu)} className="text-xs" />
        ) : (
          <span className="text-xs">—</span>
        ),
    },
    {
      // "Ten linh kien" khong co san tren CaseRow (chi co ma) - tra cuu qua danh muc linh_kien da
      // cache o linhKienTenMap (settings-linh-kien), thuan frontend, khong goi them API rieng.
      key: "last_ten_linh_kien_thieu",
      header: tr("Tên linh kiện thiếu gần nhất"),
      render: (c) => <span className="text-xs">{c.last_ma_linh_kien_thieu ? (linhKienTenMap.get(c.last_ma_linh_kien_thieu) ?? c.last_ma_linh_kien_thieu) : "—"}</span>,
    },
    {
      // Dem tren 2 tap du lieu Google Sheet (mua hang/bao hanh) da cache san o trinh duyet qua
      // usePurchaseWarrantyData() - dung LAI y het logic doi chieu cua CaseDetail.tsx
      // (matchMuaHang/matchBaoHanh, lib/purchaseWarrantyMatch.ts), khong tinh toan rieng o day de
      // khong lech ket qua giua 2 man hinh. matchMuaHang can du lieu giai_trinh cua ca de doi chieu
      // ma xuat hang - "Danh sach chi tiet" chi co giai trinh GAN NHAT (last_ma_xuat_hang_lien_quan,
      // tu lg.* co san) chu khong co ca lich su, nen SL don mua o day la UOC LUONG (co the thap hon
      // so voi xem chi tiet 1 ca neu ma xuat hang gan voi 1 lan giai trinh CU hon lan gan nhat).
      key: "sl_don_mua",
      header: tr("SL đơn mua"),
      render: (c) => <span className="text-xs font-mono">{slDonMua(c)}</span>,
    },
    {
      key: "sl_don_bao_hanh",
      header: tr("SL đơn bảo hành"),
      render: (c) => <span className="text-xs font-mono">{slDonBaoHanh(c)}</span>,
    },
    {
      key: "link_crm",
      header: CASE_FIELD_LABELS.link_crm,
      render: (c) =>
        c.link_crm ? (
          <a href={c.link_crm} target="_blank" rel="noreferrer" className="text-[var(--ocean-600)] underline text-xs" onClick={(e) => e.stopPropagation()}>
            {tr("Mở CRM")}</a>
        ) : (
          <span className="text-[var(--ink-400)] text-xs">—</span>
        ),
    },
  ];

  const closedColumns: Column<CaseRow>[] = [
    { key: "id", header: "ID", render: (c) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{c.id}</span> },
    { key: "khach_hang", header: tr("Khách hàng"), render: (c) => c.khach_hang ?? "—" },
    { key: "hoan_thanh", header: tr("Hoàn thành"), render: (c) => <span className="text-xs">{fmtDateTime(c.thoi_gian_hoan_thanh)}</span> },
    {
      key: "ly_do",
      header: tr("Lý do tồn gần nhất"),
      render: (c) => (c.last_ly_do_cham ? <Badge tone="ocean">{dl(c.last_ly_do_cham)}</Badge> : <span className="text-[var(--ink-400)] text-xs italic">{tr("Chưa giải trình")}</span>),
    },
    { key: "khu_vuc", header: tr("Khu vực"), render: (c) => shortKhuVuc(c.khu_vuc) },
    { key: "action", header: "", render: () => <span className="text-[var(--ocean-500)] text-xs font-semibold">Xem →</span> },
  ];

  const tongTon = stats?.tongTon;

  return (
    <div className="anim-in">
      {(() => {
        const filterControl = (
          <KhuVucFilterControl
            value={khuVucFilter}
            onChange={setKhuVucFilter}
            options={[
              { value: "", label: tr("Tất cả khu vực") },
              ...(coNhomDvbh() ? [{ value: QLDVBH_FILTER_VALUE, label: tr("Tất cả DVBH (MB/MN...)") }] : []),
              ...(filtersData?.khuVuc.map((k) => ({ value: k, label: k })) ?? []),
            ]}
            myAreas={myAreas}
          />
        );
        return headerExtra ? (
          createPortal(filterControl, headerExtra)
        ) : (
          <div className="flex items-center gap-2 flex-wrap mb-2">{filterControl}</div>
        );
      })()}

      <Tabs active={view} onChange={setView} tabs={VIEWS} />

      {view === "tuoi-ton-tb" ? (
        <BacklogAgeReportTab />
      ) : view === "bao-cao" ? (
        <>
          <div className="mb-1 mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-[var(--ink-400)] uppercase tracking-wide">{tr("Tồn hiện tại")}</span>
            {isFrozenEligible && backlogDaily && (
              <span className="text-[11px] text-[var(--ink-400)]">
                {tr("· chốt")} {fmtGeneratedAt(backlogDaily.generatedAt)} ({backlogDaily.generatedBy === "auto" ? tr("tự động") : backlogDaily.generatedBy})
              </span>
            )}
          </div>
          {isFrozenEligible && backlogDaily ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-2">
              <DeltaBreakdownCard
                label={tr("Tổng tồn hiện tại")}
                tone="ocean"
                primaryValue={backlogDaily.tongTon.baseline}
                onClickPrimary={() => goToDanhSach("ton-hien-tai")}
                rows={[{ label: tr("Đã giải trình hôm nay"), bucket: backlogDaily.tongTon, onClick: () => goToDanhSach("da-giai-trinh-trong-ngay") }]}
              />
              <StatCard size="sm" label={tr("Tồn trên 3 ngày")} value={backlogDaily.tren3} tone="amber" onClick={() => goToDanhSach("ton-hien-tai", "3")} />
              <StatCard size="sm" label={tr("Tồn trên 5 ngày")} value={backlogDaily.tren5} tone="amber" onClick={() => goToDanhSach("ton-hien-tai", "5")} />
              <StatCard size="sm" label={tr("Tồn trên 7 ngày")} value={backlogDaily.tren7} tone="amber" onClick={() => goToDanhSach("ton-hien-tai", "7")} />
              <HeroStat label={tr("Tồn trên 14 ngày")} value={backlogDaily.tren14} tone="coral" onClick={() => goToDanhSach("ton-hien-tai", "14")} />
              <StatCard size="sm" label={tr("KH VIP tồn")} value={tongTon?.vipTon ?? 0} tone="amber" muted={!tongTon?.vipTon} onClick={() => goToDanhSach("ton-hien-tai")} />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-2 mb-2">
              <StatCard size="sm" label={tr("Tổng tồn hiện tại")} value={tongTon?.tong ?? 0} tone="ocean" onClick={() => goToDanhSach("ton-hien-tai")} />
              <StatCard size="sm" label={tr("Tồn trên 1 ngày")} value={tongTon?.tren1 ?? 0} tone="teal" onClick={() => goToDanhSach("ton-hien-tai", "1")} />
              <StatCard size="sm" label={tr("Tồn trên 3 ngày")} value={tongTon?.tren3 ?? 0} tone="amber" onClick={() => goToDanhSach("ton-hien-tai", "3")} />
              <StatCard size="sm" label={tr("Tồn >=5 ngày")} value={tongTon?.tren5 ?? 0} tone="amber" onClick={() => goToDanhSach("ton-hien-tai", "5")} />
              <StatCard size="sm" label={tr("Tồn trên 7 ngày")} value={tongTon?.tren7 ?? 0} tone="amber" onClick={() => goToDanhSach("ton-hien-tai", "7")} />
              <HeroStat label={tr("Tồn trên 14 ngày")} value={tongTon?.tren14 ?? 0} tone="coral" onClick={() => goToDanhSach("ton-hien-tai", "14")} />
              <StatCard size="sm" label={tr("Đã giải trình")} value={tongTon?.daGiaiTrinh ?? 0} tone="teal" onClick={() => goToDanhSach("da-giai-trinh")} />
              <StatCard size="sm" label={tr("KH VIP tồn")} value={tongTon?.vipTon ?? 0} tone="amber" muted={!tongTon?.vipTon} onClick={() => goToDanhSach("ton-hien-tai")} />
            </div>
          )}

          <div className="mb-1 text-xs font-semibold text-[var(--ink-400)] uppercase tracking-wide flex items-center gap-2 flex-wrap">
            <span>{tr("Cần giải trình")}</span>
            {!isFrozenEligible && (
              <span className="normal-case font-normal text-[var(--amber-600)]" title={tr("Nhiều bộ lọc phụ (tỉnh/đối tác/hãng/model/nhóm KH/ngành/KTV) hoặc nhiều khu vực đang bật")}>
                {tr("— số liệu trực tiếp (nhiều bộ lọc đang bật, không đóng băng 08:00)")}</span>
            )}
          </div>
          {isFrozenEligible && backlogDaily ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-2">
              <HeroStat
                label={tr("Tổng cần giải trình")}
                value={backlogDaily.canGiaiTrinh.tong.remaining}
                sub={deltaSub(backlogDaily.canGiaiTrinh.tong)}
                tone="coral"
                onClick={() => goToDanhSach("can-giai-trinh:tong")}
              />
              {/* 2026-10-21: "CEO cần giải trình" - ca Canh bao ton cap 2, Giam sat giai trinh MOI NGAY (log giai trinh ton
               * hoac log tranh chap trong ngay deu tinh). Da gom trong "Tong can giai trinh" ben canh. */}
              {backlogDaily.canGiaiTrinh.ceo && (
                <StatCard
                  size="sm"
                  spotlight
                  label={tr("CEO cần giải trình (cảnh báo cấp 2)")}
                  value={backlogDaily.canGiaiTrinh.ceo.remaining}
                  sub={deltaSub(backlogDaily.canGiaiTrinh.ceo)}
                  tone="coral"
                  muted={backlogDaily.canGiaiTrinh.ceo.remaining === 0}
                  onClick={() => goToDanhSach("can-giai-trinh:ceo")}
                />
              )}
              {/* CHOT 2026-08-20: VIP/DMX/Loc tong dua len dau (ngay sau "Tong"), style "spotlight" -
               * dap vao mat truoc theo yeu cau, xem StatCard.tsx prop spotlight + DmxBreakdownCard. */}
              <StatCard
                size="sm"
                spotlight
                label={tr("VIP/S.VIP chưa GT >=24h")}
                value={backlogDaily.canGiaiTrinh.vip24h.remaining}
                sub={deltaSub(backlogDaily.canGiaiTrinh.vip24h)}
                tone="coral"
                muted={backlogDaily.canGiaiTrinh.vip24h.remaining === 0}
                onClick={() => goToDanhSach("can-giai-trinh:vip_24h")}
              />
              <DmxBreakdownCard
                total={counts?.dmx_3_ngay ?? 0}
                chuaGt3={counts?.dmx_chua_gt_3_ngay ?? 0}
                taiGiaiTrinh={counts?.dmx_tai_giai_trinh ?? 0}
                loKeHoach={counts?.dmx_lo_ke_hoach ?? 0}
                onClickTotal={() => goToDanhSach("can-giai-trinh:dmx_3_ngay")}
                onClickChuaGt3={() => goToDanhSach("can-giai-trinh:dmx_chua_gt_3_ngay")}
                onClickTaiGiaiTrinh={() => goToDanhSach("can-giai-trinh:dmx_tai_giai_trinh")}
                onClickLoKeHoach={() => goToDanhSach("can-giai-trinh:dmx_lo_ke_hoach")}
              />
              <StatCard
                size="sm"
                spotlight
                label={tr("Lọc tổng >1 ngày")}
                value={backlogDaily.canGiaiTrinh.locTongBcn.remaining}
                sub={deltaSub(backlogDaily.canGiaiTrinh.locTongBcn)}
                tone="amber"
                muted={backlogDaily.canGiaiTrinh.locTongBcn.remaining === 0}
                onClick={() => goToDanhSach("can-giai-trinh:loc_tong_bcn")}
              />
              <DeltaBreakdownCard
                label={tr("Lỡ kế hoạch")}
                tone="coral"
                mutable
                primaryValue={backlogDaily.canGiaiTrinh.loKeHoach.remaining}
                primarySub={deltaSub(backlogDaily.canGiaiTrinh.loKeHoach)}
                onClickPrimary={() => goToDanhSach("can-giai-trinh:lo_ke_hoach")}
                rows={[
                  { label: tr("ĐMX >5 ngày"), bucket: backlogDaily.canGiaiTrinh.loKeHoachDmx5, onClick: () => goToDanhSach("can-giai-trinh:lo_ke_hoach_dmx_5") },
                  { label: tr(">14 ngày"), bucket: backlogDaily.canGiaiTrinh.loKeHoach14, onClick: () => goToDanhSach("can-giai-trinh:lo_ke_hoach_14") },
                ]}
              />
              <DeltaBreakdownCard
                label={tr("Cần tái giải trình")}
                tone="amber"
                mutable
                primaryValue={backlogDaily.canGiaiTrinh.taiGiaiTrinh.remaining}
                primarySub={deltaSub(backlogDaily.canGiaiTrinh.taiGiaiTrinh)}
                onClickPrimary={() => goToDanhSach("can-giai-trinh:tai_giai_trinh")}
                rows={[
                  { label: tr("ĐMX >5 ngày"), bucket: backlogDaily.canGiaiTrinh.taiGiaiTrinhDmx5, onClick: () => goToDanhSach("can-giai-trinh:tai_giai_trinh_dmx_5") },
                  { label: tr(">14 ngày"), bucket: backlogDaily.canGiaiTrinh.taiGiaiTrinh14, onClick: () => goToDanhSach("can-giai-trinh:tai_giai_trinh_14") },
                ]}
              />
              <StatCard
                size="sm"
                label={nhanTheoMoc(tr("Chưa giải trình >5 ngày"), moc)}
                value={backlogDaily.canGiaiTrinh.chuaGt5Ngay.remaining}
                sub={deltaSub(backlogDaily.canGiaiTrinh.chuaGt5Ngay)}
                tone="coral"
                muted={backlogDaily.canGiaiTrinh.chuaGt5Ngay.remaining === 0}
                onClick={() => goToDanhSach("can-giai-trinh:chua_gt_5_ngay")}
              />
              <StatCard
                size="sm"
                label={tr("Điều hòa >1 ngày")}
                value={backlogDaily.canGiaiTrinh.dieuHoa.remaining}
                sub={deltaSub(backlogDaily.canGiaiTrinh.dieuHoa)}
                tone="ocean"
                muted={backlogDaily.canGiaiTrinh.dieuHoa.remaining === 0}
                onClick={() => goToDanhSach("can-giai-trinh:dieu_hoa")}
              />
              <StatCard
                size="sm"
                label={tr("B2B >1 ngày")}
                value={backlogDaily.canGiaiTrinh.b2b.remaining}
                sub={deltaSub(backlogDaily.canGiaiTrinh.b2b)}
                tone="ocean"
                muted={backlogDaily.canGiaiTrinh.b2b.remaining === 0}
                onClick={() => goToDanhSach("can-giai-trinh:b2b")}
              />
              <StatCard
                size="sm"
                label={tr("NSKX >=2 ngày")}
                value={backlogDaily.canGiaiTrinh.nskx.remaining}
                sub={deltaSub(backlogDaily.canGiaiTrinh.nskx)}
                tone="coral"
                muted={backlogDaily.canGiaiTrinh.nskx.remaining === 0}
                onClick={() => goToDanhSach("can-giai-trinh:nskx")}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-2">
              <HeroStat
                label={tr("Tổng cần giải trình")}
                value={counts?.can_giai_trinh_tong ?? 0}
                tone="coral"
                onClick={() => goToDanhSach("can-giai-trinh:tong")}
              />
              {/* CHOT 2026-08-20: VIP/DMX/Loc tong dua len dau (ngay sau "Tong"), style "spotlight". */}
              <StatCard
                size="sm"
                spotlight
                label={tr("VIP/S.VIP chưa GT >=24h")}
                value={counts?.vip_24h ?? 0}
                tone="coral"
                muted={!counts?.vip_24h}
                onClick={() => goToDanhSach("can-giai-trinh:vip_24h")}
              />
              <DmxBreakdownCard
                total={counts?.dmx_3_ngay ?? 0}
                chuaGt3={counts?.dmx_chua_gt_3_ngay ?? 0}
                taiGiaiTrinh={counts?.dmx_tai_giai_trinh ?? 0}
                loKeHoach={counts?.dmx_lo_ke_hoach ?? 0}
                onClickTotal={() => goToDanhSach("can-giai-trinh:dmx_3_ngay")}
                onClickChuaGt3={() => goToDanhSach("can-giai-trinh:dmx_chua_gt_3_ngay")}
                onClickTaiGiaiTrinh={() => goToDanhSach("can-giai-trinh:dmx_tai_giai_trinh")}
                onClickLoKeHoach={() => goToDanhSach("can-giai-trinh:dmx_lo_ke_hoach")}
              />
              <StatCard
                size="sm"
                spotlight
                label={tr("Lọc tổng, BCN >1 ngày")}
                value={counts?.loc_tong_bcn ?? 0}
                tone="amber"
                muted={!counts?.loc_tong_bcn}
                onClick={() => goToDanhSach("can-giai-trinh:loc_tong_bcn")}
              />
              <StatCard size="sm" label={tr("Lỡ kế hoạch")} value={counts?.lo_ke_hoach ?? 0} tone="coral" muted={!counts?.lo_ke_hoach} onClick={() => goToDanhSach("can-giai-trinh:lo_ke_hoach")} />
              <StatCard
                size="sm"
                label={tr("Cần tái giải trình")}
                value={counts?.tai_giai_trinh ?? 0}
                tone="amber"
                muted={!counts?.tai_giai_trinh}
                onClick={() => goToDanhSach("can-giai-trinh:tai_giai_trinh")}
              />
              <StatCard
                size="sm"
                label={nhanTheoMoc(tr("Chưa giải trình >5 ngày"), moc)}
                value={counts?.chua_gt_5_ngay ?? 0}
                tone="coral"
                muted={!counts?.chua_gt_5_ngay}
                onClick={() => goToDanhSach("can-giai-trinh:chua_gt_5_ngay")}
              />
              <StatCard size="sm" label={tr("Điều hòa >1 ngày")} value={counts?.dieu_hoa ?? 0} tone="ocean" muted={!counts?.dieu_hoa} onClick={() => goToDanhSach("can-giai-trinh:dieu_hoa")} />
              <StatCard size="sm" label={tr("B2B >1 ngày")} value={counts?.b2b ?? 0} tone="ocean" muted={!counts?.b2b} onClick={() => goToDanhSach("can-giai-trinh:b2b")} />
              <StatCard size="sm" label={tr("NSKX >=2 ngày")} value={counts?.nskx ?? 0} tone="coral" muted={!counts?.nskx} onClick={() => goToDanhSach("can-giai-trinh:nskx")} />
            </div>
          )}

          <Card className="p-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div>
                <div className="font-display font-bold text-sm">{tr("Báo cáo tồn theo")} {REPORT_DIM_OPTIONS.find((d) => d.value === reportDim)?.label.toLowerCase()}</div>
                <div className="text-xs text-[var(--ink-400)] mt-0.5">{tr("Bấm vào 1 ô số để lọc thẳng xuống danh sách chi tiết.")}</div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Select value={reportDim} onChange={setReportDim} options={REPORT_DIM_OPTIONS} />
                <Btn variant="ghost" size="sm" onClick={() => exportRowsToExcel(exportKhuVucRows, "bao_cao_ton.xlsx", "Data", pivotExportLabels())}>
                  {tr("⬇ Xuất Excel")}</Btn>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="dense w-full text-sm">
                <thead>
                  <tr className="text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                    <th className="py-2 px-2 sticky left-0 bg-[var(--surface)] z-10 text-left">{REPORT_DIM_OPTIONS.find((d) => d.value === reportDim)?.label}</th>
                    <th className="py-2 px-2 text-center text-[var(--indigo-600)] font-semibold">{tr("Tổng tồn")}</th>
                    <th className="py-2 px-2 text-center">{tr("Trên 3n")}</th>
                    <th className="py-2 px-2 text-center">{tr("Trên 5n")}</th>
                    <th className="py-2 px-2 text-center">{tr("Trên 7n")}</th>
                    <th className="py-2 px-2 text-center">{tr("Trên 14n")}</th>
                    <th className="py-2 px-2 border-l border-[var(--line)] text-center">{showDailyCols ? tr("Đã GT (tháng)") : tr("Đã GT")}</th>
                    <th className="py-2 px-2 border-l border-[var(--line)] font-bold text-center">{showDailyCols ? tr("Cần GT (lũy kế)") : tr("Cần GT (tổng)")}</th>
                    {showDailyCols && (
                      <>
                        <th className="py-2 px-2 text-center">{tr("Tỷ lệ GT tháng")}</th>
                        <th className="py-2 px-2 border-l border-[var(--line)] bg-amber-50 text-amber-700 font-bold text-center">{tr("Cần GT (ngày)")}</th>
                        <th className="py-2 px-2 text-center">{tr("Đã GT (ngày)")}</th>
                        <th className="py-2 px-2 text-center">{tr("Tỷ lệ GT ngày")}</th>
                      </>
                    )}
                    <th className="py-2 px-2 text-center">{tr("Lỡ KH")}</th>
                    <th className="py-2 px-2 text-center">{tr("Tái GT")}</th>
                    <th className="py-2 px-2 text-center">{tr("ĐMX chưa GT >3n")}</th>
                    <th className="py-2 px-2 text-center">{tr("Chưa GT >5n")}</th>
                    <th className="py-2 px-2 text-center">{tr("Điều hòa >1n")}</th>
                    <th className="py-2 px-2 text-center">{tr("B2B >1n")}</th>
                    <th className="py-2 px-2 text-center">{tr("NSKX >=2n")}</th>
                    <th className="py-2 px-2 text-center">{tr("Thiếu LK")}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayKhuVucRows.length > 0 && (
                    <tr className="border-b border-[var(--line)] bg-slate-50 font-bold">
                      <td className="py-2 px-2 sticky left-0 bg-slate-50 z-10 text-left">{tr("Tổng cộng")}</td>
                      {/* 2026-11-10: dong Tong cong cung bam duoc (danh sach theo bo loc khu vuc dang chon, khong loc dim). */}
                      <td className="py-2 px-2 text-center">
                        <Pill tone={khuVucTotal.tong_ton > 0 ? "indigo" : "gray"} onClick={() => drillDown(null, "ton-hien-tai", "1")}>{khuVucTotal.tong_ton}</Pill>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Pill tone={khuVucTotal.tren_3 > 0 ? "amber" : "gray"} onClick={() => drillDown(null, "ton-hien-tai", "3")}>{khuVucTotal.tren_3}</Pill>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Pill tone={khuVucTotal.tren_5 > 0 ? "amber" : "gray"} onClick={() => drillDown(null, "ton-hien-tai", "5")}>{khuVucTotal.tren_5}</Pill>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Pill tone={khuVucTotal.tren_7 > 0 ? "amber" : "gray"} onClick={() => drillDown(null, "ton-hien-tai", "7")}>{khuVucTotal.tren_7}</Pill>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Pill tone={khuVucTotal.tren_14 > 0 ? "coral" : "gray"} onClick={() => drillDown(null, "ton-hien-tai", "14")}>{khuVucTotal.tren_14}</Pill>
                      </td>
                      <td className="py-2 px-2 border-l border-[var(--line)] text-center font-mono">{khuVucTotal.da_giai_trinh}</td>
                      <td className="py-2 px-2 border-l border-[var(--line)] text-center">
                        <NumCell value={khuVucTotal.can_giai_trinh_tong} bold onClick={showDailyCols ? undefined : () => drillDown(null, "can-giai-trinh:tong")} />
                      </td>
                      {showDailyCols && (
                        <>
                          <td className="py-2 px-2 text-center font-mono">{pct(khuVucTotal.da_giai_trinh, khuVucTotal.can_giai_trinh_tong)}%</td>
                          <td className="py-2 px-2 border-l border-[var(--line)] text-center bg-amber-50/70 font-mono text-amber-800 font-bold">
                            {khuVucTotal.trongNgayBaseline > 0 ? (
                              <button className="text-amber-700 hover:underline font-bold" onClick={() => drillDown(null, "can-giai-trinh:tong")}>
                                {khuVucTotal.trongNgayBaseline}
                              </button>
                            ) : (
                              khuVucTotal.trongNgayBaseline
                            )}
                          </td>
                          <td className="py-2 px-2 text-center font-mono">{khuVucTotal.trongNgayResolved}</td>
                          <td className="py-2 px-2 text-center font-mono">{pct(khuVucTotal.trongNgayResolved, khuVucTotal.trongNgayBaseline)}%</td>
                        </>
                      )}
                      <td className="py-2 px-2 text-center">
                        <NumCell value={khuVucTotal.lo_ke_hoach} onClick={() => drillDown(null, "can-giai-trinh:lo_ke_hoach")} />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <NumCell value={khuVucTotal.cho_giai_trinh_lai} onClick={() => drillDown(null, "can-giai-trinh:tai_giai_trinh")} />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <NumCell value={khuVucTotal.dmx_chua_gt_3_ngay} onClick={() => drillDown(null, "can-giai-trinh:dmx_chua_gt_3_ngay")} />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <NumCell value={khuVucTotal.chua_gt_5_ngay} onClick={() => drillDown(null, "can-giai-trinh:chua_gt_5_ngay")} />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <NumCell value={khuVucTotal.dieu_hoa_1_ngay} onClick={() => drillDown(null, "can-giai-trinh:dieu_hoa")} />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <NumCell value={khuVucTotal.b2b_1_ngay} onClick={() => drillDown(null, "can-giai-trinh:b2b")} />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <NumCell value={khuVucTotal.nskx_2_ngay} onClick={() => drillDown(null, "can-giai-trinh:nskx")} />
                      </td>
                      <td className="py-2 px-2 text-center font-mono">{khuVucTotal.thieu_linh_kien}</td>
                    </tr>
                  )}
                  {displayKhuVucRows.map((r) => (
                    <tr key={r.nhom} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50 group">
                      <td className="py-2 px-2 font-semibold sticky left-0 bg-[var(--surface)] group-hover:bg-slate-50 z-10 text-left">{reportDim === "khu_vuc" ? shortKhuVuc(r.nhom) : r.nhom}</td>
                      <td className="py-2 px-2 text-center">
                        <Pill tone={r.tong_ton > 0 ? "indigo" : "gray"} onClick={() => drillDown(r.nhom, "ton-hien-tai", "1")}>
                          {r.tong_ton}
                        </Pill>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Pill tone={r.tren_3 > 0 ? "amber" : "gray"} onClick={() => drillDown(r.nhom, "ton-hien-tai", "3")}>
                          {r.tren_3}
                        </Pill>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Pill tone={r.tren_5 > 0 ? "amber" : "gray"} onClick={() => drillDown(r.nhom, "ton-hien-tai", "5")}>
                          {r.tren_5}
                        </Pill>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Pill tone={r.tren_7 > 0 ? "amber" : "gray"} onClick={() => drillDown(r.nhom, "ton-hien-tai", "7")}>
                          {r.tren_7}
                        </Pill>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Pill tone={r.tren_14 > 0 ? "coral" : "gray"} onClick={() => drillDown(r.nhom, "ton-hien-tai", "14")}>
                          {r.tren_14}
                        </Pill>
                      </td>
                      <td className="py-2 px-2 border-l border-[var(--line)] text-center font-mono">{r.da_giai_trinh}</td>
                      <td className="py-2 px-2 border-l border-[var(--line)] text-center">
                        {/* showDailyCols: gia tri la tong luy ke thang (SUM nhieu ngay), khong con khop 1 danh
                            sach case id co dinh nao de "drill down" nua - chi con clickable o che do live. */}
                        <NumCell value={r.can_giai_trinh_tong} bold onClick={showDailyCols ? undefined : () => drillDown(r.nhom, "can-giai-trinh:tong")} />
                      </td>
                      {showDailyCols && (
                        <td className="py-2 px-2 text-center font-mono">{r.can_giai_trinh_tong ? `${pct(r.da_giai_trinh, r.can_giai_trinh_tong)}%` : "—"}</td>
                      )}
                      {showDailyCols &&
                        (() => {
                          const bucket = backlogDaily?.byKhuVuc[r.nhom];
                          return (
                            <>
                              <td className="py-2 px-2 border-l border-[var(--line)] text-center bg-amber-50/50 font-mono text-amber-800 font-semibold">
                                {bucket && bucket.baseline > 0 ? (
                                  <button className="text-amber-700 hover:underline font-bold" onClick={() => drillDown(r.nhom, "can-giai-trinh:tong")}>
                                    {bucket.baseline}
                                  </button>
                                ) : (
                                  bucket?.baseline ?? "—"
                                )}
                              </td>
                              <td className="py-2 px-2 text-center font-mono">{bucket?.resolved ?? "—"}</td>
                              <td className="py-2 px-2 text-center font-mono">{bucket ? `${pct(bucket.resolved, bucket.baseline)}%` : "—"}</td>
                            </>
                          );
                        })()}
                      <td className="py-2 px-2 text-center">
                        <NumCell value={r.lo_ke_hoach} onClick={() => drillDown(r.nhom, "can-giai-trinh:lo_ke_hoach")} />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <NumCell value={r.cho_giai_trinh_lai} onClick={() => drillDown(r.nhom, "can-giai-trinh:tai_giai_trinh")} />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <NumCell value={r.dmx_chua_gt_3_ngay} onClick={() => drillDown(r.nhom, "can-giai-trinh:dmx_chua_gt_3_ngay")} />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <NumCell value={r.chua_gt_5_ngay} onClick={() => drillDown(r.nhom, "can-giai-trinh:chua_gt_5_ngay")} />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <NumCell value={r.dieu_hoa_1_ngay} onClick={() => drillDown(r.nhom, "can-giai-trinh:dieu_hoa")} />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <NumCell value={r.b2b_1_ngay} onClick={() => drillDown(r.nhom, "can-giai-trinh:b2b")} />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <NumCell value={r.nskx_2_ngay} onClick={() => drillDown(r.nhom, "can-giai-trinh:nskx")} />
                      </td>
                      <td className="py-2 px-2 text-center font-mono">{r.thieu_linh_kien}</td>
                    </tr>
                  ))}
                  {displayKhuVucRows.length === 0 && (
                    <tr>
                      <td colSpan={showDailyCols ? 20 : 16} className="py-8 text-center text-[var(--ink-400)] text-sm">
                        {tr("Không có dữ liệu.")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-3 mt-3">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
              <div className="font-display font-bold text-sm">{tr("Tỷ lệ giải trình theo ngày")}</div>
              <div className="flex items-center gap-2 flex-wrap">
                <Btn variant="ghost" size="sm" onClick={() => exportRowsToExcel(trendExportRows, "ty_le_giai_trinh_theo_ngay.xlsx")}>
                  {tr("⬇ Xuất Excel")}</Btn>
                <input
                  type="month"
                  value={trendMonth}
                  onChange={(e) => setTrendMonth(e.target.value)}
                  className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                />
                <Btn variant="ghost" size="sm" onClick={downloadTrendMonth} loading={trendMonthDownloading}>
                  {tr("⬇ Tải cả tháng")}</Btn>
              </div>
            </div>
            <div className="text-xs text-[var(--ink-400)] mb-2">{tr("Chốt lúc 17h30 mỗi ngày, theo khu vực — 14 ngày gần nhất.")}</div>
            <div className="overflow-x-auto">
              <table className="dense w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                    <th className="py-2 pr-3 sticky left-0 bg-[var(--surface)] z-10">{tr("Khu vực")}</th>
                    {trendDays.map((day) => (
                      <th key={day} className="py-2 px-2 text-center">
                        {fmtDayShort(day)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedTrendRows.length > 0 && (
                    <tr className="border-b border-[var(--line)] bg-slate-50 font-bold">
                      <td className="py-2 pr-3 sticky left-0 bg-slate-50 z-10">{tr("Tổng cộng")}</td>
                      {trendDays.map((day) => {
                        const t = trendTotalByDay[day];
                        const status = trendDayExclusionStatus[day];
                        const cellBg = status === "partial" ? "bg-[var(--coral-100)]" : status === "full" ? "bg-[var(--amber-100)]" : "";
                        return (
                          <td key={day} className={`py-2 px-2 text-center ${cellBg}`} title={status === "partial" ? tr("1 số khu vực ngày này bị loại trừ - Tổng cộng không đại diện đủ 100% khu vực") : status === "full" ? tr("Ngày loại trừ") : undefined}>
                            {t && t.can > 0 ? (
                              <div>
                                <div className="font-mono">{pct(t.da, t.can)}%</div>
                                <div className="text-[10px] text-[var(--ink-400)] font-normal">
                                  {t.da}/{t.can}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[var(--ink-400)]">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                  {sortedTrendRows.map((row) => (
                    <tr key={row.khu_vuc} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50 group">
                      <td className="py-2 pr-3 font-semibold sticky left-0 bg-[var(--surface)] group-hover:bg-slate-50 z-10">{shortKhuVuc(row.khu_vuc)}</td>
                      {trendDays.map((day) => {
                        const found = row.days.find((d) => d.ngay === day);
                        const excluded = found && isNgayExcluded(day, row.khu_vuc);
                        return (
                          <td key={day} className={`py-2 px-2 text-center ${excluded ? "bg-[var(--amber-100)]" : ""}`} title={excluded ? tr("Ngày loại trừ - không tính vào lũy kế/tỷ lệ tháng") : undefined}>
                            {found ? (
                              <div>
                                <div className="font-mono font-semibold">{pct(found.da_giai_trinh, found.can_giai_trinh)}%</div>
                                <div className="text-[10px] text-[var(--ink-400)]">
                                  {found.da_giai_trinh}/{found.can_giai_trinh}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[var(--ink-400)]">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {sortedTrendRows.length === 0 && (
                    <tr>
                      <td colSpan={1 + trendDays.length} className="py-8 text-center text-[var(--ink-400)] text-sm">
                        {tr("Chưa có dữ liệu lịch sử (bắt đầu ghi nhận từ khi tính năng này triển khai).")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-3 mt-3">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
              <div className="font-display font-bold text-sm">{tr("Số ca tồn theo mốc thời gian")}</div>
              <Btn
                variant="ghost"
                size="sm"
                onClick={() =>
                  exportRowsToExcel(
                    (tonTrend?.rows ?? []).map((r) => ({
                      ngay: r.ngay,
                      tong_ton: r.tong,
                      tren_3_ngay: r.tren_3,
                      tu_5_ngay: r.tren_5,
                      tren_7_ngay: r.tren_7,
                      tren_14_ngay: r.tren_14,
                    })),
                    "so_ca_ton_theo_moc_thoi_gian.xlsx",
                    "Data",
                    { ngay: "Ngày (chốt 08:00)", tong_ton: "Tổng tồn", tren_3_ngay: "Tồn >3 ngày", tu_5_ngay: "Tồn ≥5 ngày", tren_7_ngay: "Tồn >7 ngày", tren_14_ngay: "Tồn >14 ngày" },
                  )
                }
              >
                {tr("⬇ Xuất Excel")}</Btn>
            </div>
            <div className="text-xs text-[var(--ink-400)] mb-2">
              {tr("Chốt lúc 08:00 mỗi ngày — chọn khoảng ngày để lọc. Đang hiển thị:")}{" "}
              <span className="font-semibold text-[var(--indigo-700)]">{tonTrendFilterLabel}</span>.
            </div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <label className="text-xs text-[var(--ink-400)] flex items-center gap-1.5">
                {tr("Từ ngày")}<input
                  type="date"
                  value={tonTrendFrom}
                  max={tonTrendTo}
                  onChange={(e) => setTonTrendFrom(e.target.value)}
                  className="focus-ring border border-[var(--line)] rounded-lg px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-[var(--ink-400)] flex items-center gap-1.5">
                {tr("Đến ngày")}<input
                  type="date"
                  value={tonTrendTo}
                  min={tonTrendFrom}
                  max={vnDateOffsetStr(0)}
                  onChange={(e) => setTonTrendTo(e.target.value)}
                  className="focus-ring border border-[var(--line)] rounded-lg px-2 py-1 text-sm"
                />
              </label>
              <div className="flex gap-1.5 ml-auto">
                <Btn
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTonTrendFrom(vnDateOffsetStr(7));
                    setTonTrendTo(vnDateOffsetStr(0));
                  }}
                >
                  {tr("7 ngày")}</Btn>
                <Btn
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTonTrendFrom(vnDateOffsetStr(14));
                    setTonTrendTo(vnDateOffsetStr(0));
                  }}
                >
                  {tr("14 ngày")}</Btn>
                <Btn
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTonTrendFrom(vnDateOffsetStr(90));
                    setTonTrendTo(vnDateOffsetStr(0));
                  }}
                >
                  {tr("90 ngày")}</Btn>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="dense w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                    <th className="py-2 pr-3">{tr("Ngày (chốt 08:00)")}</th>
                    <th className="py-2 px-2 text-right">{tr("Tổng tồn")}</th>
                    <th className="py-2 px-2 text-right">{tr("Tồn >3 ngày")}</th>
                    <th className="py-2 px-3 text-right text-[var(--indigo-700)] bg-[var(--indigo-100)] rounded-lg">{tr("Tồn ≥5 ngày")}</th>
                    <th className="py-2 px-2 text-right">{tr("Tồn >7 ngày")}</th>
                    <th className="py-2 px-2 text-right">{tr("Tồn >14 ngày")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(tonTrend?.rows ?? []).map((r) => (
                    <tr key={r.ngay} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50">
                      <td className="py-2 pr-3 font-semibold">{fmtDayShort(r.ngay)}</td>
                      <td className="py-2 px-2 text-right font-mono">{r.tong}</td>
                      <td className="py-2 px-2 text-right font-mono">{r.tren_3}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-[var(--indigo-700)] bg-[var(--indigo-100)]">{r.tren_5}</td>
                      <td className="py-2 px-2 text-right font-mono">{r.tren_7}</td>
                      <td className="py-2 px-2 text-right font-mono">{r.tren_14}</td>
                    </tr>
                  ))}
                  {(tonTrend?.rows ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[var(--ink-400)] text-sm">
                        {tr("Chưa có dữ liệu lịch sử trong khoảng ngày đã chọn.")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <TonTheoKtvCard khuVucFilter={khuVucFilter} filterLabel={tonTrendFilterLabel} />
        </>
      ) : view === "canh-bao-ton-cap1" ? (
        <CanhBaoTonCapView
          cap={1}
          canhBaoTon={canhBaoTon}
          canhBaoTonTrend={canhBaoTonTrend}
          trendDays={trendDays}
          metric={canhBaoTonMetricCap1}
          setMetric={setCanhBaoTonMetricCap1}
          goToDanhSach={goToDanhSach}
        />
      ) : view === "canh-bao-ton-cap2" ? (
        <CanhBaoTonCapView
          cap={2}
          canhBaoTon={canhBaoTon}
          canhBaoTonTrend={canhBaoTonTrend}
          trendDays={trendDays}
          metric={canhBaoTonMetricCap2}
          setMetric={setCanhBaoTonMetricCap2}
          goToDanhSach={goToDanhSach}
        />
      ) : (
        <div className="mt-2">
          <div className="flex items-center gap-2 flex-wrap bg-[var(--surface)] border border-[var(--line)] rounded-xl px-3 py-2 mb-2">
            <span className="text-xs font-semibold text-[var(--ink-400)]">{tr("Nhóm:")}</span>
            <Select
              value={nhomKey}
              onChange={(v) => {
                setNhomKey(v);
                // "canh-bao-ton:" chi co du lieu dong bang (khong co nhanh tinh song) - bat buoc
                // snapshot_0800 du chon thu cong tu dropdown hay bam StatCard (xem goToDanhSach).
                // "can-giai-trinh:ceo" (2026-10-22) cung vay - bucket canhBaoCap2 chi co trong snapshot 08:00, chon tu
                // dropdown ma khong bat snapshot thi backend tra INVALID_TAB ("Khong tai duoc du lieu").
                setListFromSnapshot0800(v.startsWith("canh-bao-ton:") || v === "can-giai-trinh:ceo");
                setDsTuoiTu("");
                setPage(1);
              }}
              options={nhomOptions}
            />
            {dsTab === "ton-hien-tai" && (
              <Select
                value={dsTuoiTu}
                onChange={(v) => {
                  setDsTuoiTu(v);
                  setPage(1);
                }}
                options={TON_TUOI_OPTIONS}
              />
            )}
            {dsTab !== "da-dong" && (
              <input
                type="text"
                value={idSearch}
                onChange={(e) => {
                  setIdSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={tr("Tìm theo ID/Serial…")}
                className="focus-ring w-40 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            )}
            {dsTab !== "da-dong" && (
              <div className="ml-auto flex items-center gap-2">
                <span
                  className={`text-[11px] ${dongBo.loi ? "text-[var(--coral-500)]" : "text-[var(--ink-400)]"}`}
                  title={tr("PO / đơn mua / đơn bảo hành: Google Sheet tự làm mới mỗi 2 giờ, app EO mỗi 5 phút; tồn kho mỗi 5 phút; ID đặt hàng gần nhất mỗi giờ.")}
                >
                  {dongBo.loi
                    ? tr("Lỗi đồng bộ: {0}", dongBo.loi)
                    : tr("Dữ liệu PO cập nhật {0}", fmtDateTime(dongBo.luc ?? pwSyncedAt) || "—")}
                </span>
                <Btn variant="ghost" size="sm" onClick={dongBoTruocKhiTai} disabled={dongBo.dang || poDangTai || exportRunner.busy}>
                  {dongBo.dang ? tr("⏳ Đang đồng bộ…") : tr("⟳ Đồng bộ trước khi tải")}
                </Btn>
                <Btn variant="ghost" size="sm" onClick={exportRunner.run(handleExport)} disabled={exportRunner.busy || dongBo.dang}>
                  {exportRunner.busy ? tr("⏳ Đang xuất…") : tr("⬇ Xuất Excel")}
                </Btn>
              </div>
            )}
          </div>
          {dsTab !== "da-dong" && (
            <div className="flex items-center gap-1.5 flex-wrap mb-2 text-xs">
              <span className="font-semibold text-[var(--ink-400)] mr-0.5">{tr("Bộ lọc:")}</span>
              {LOC_NHANH.map((lc) => {
                const f = locCot[lc.key];
                const nhan = lc.nhanGiaTri ?? ((v: string) => (v === GIA_TRI_TRONG ? tr("(Trống)") : (dl(v) ?? v)));
                return (
                  <LocCotPopover
                    key={lc.key}
                    kieu={lc.kieu}
                    tieuDe={lc.label}
                    value={f}
                    onChange={(v) => {
                      const next = { ...locCot };
                      if (v) next[lc.key] = v;
                      else delete next[lc.key];
                      setLocCot(next);
                    }}
                    layGiaTri={lc.kieu === "list" ? () => layGiaTriCot(lc.key) : undefined}
                    nhanGiaTri={nhan}
                    nut={({ dangBat, mo, ref }) => (
                      <button
                        ref={ref}
                        type="button"
                        onClick={mo}
                        className={`focus-ring inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors ${
                          dangBat
                            ? "border-[var(--ocean-500)] bg-[var(--ocean-100)] text-[var(--ocean-700)] font-semibold"
                            : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-600)] hover:border-[var(--ocean-400)]"
                        }`}
                      >
                        {lc.label}
                        {dangBat ? <span className="font-normal">: {tomTatLoc(f, nhan, lc.kieu)}</span> : <span className="opacity-50">▾</span>}
                      </button>
                    )}
                  />
                );
              })}
              {Object.values(locCot).some(locCotDangBat) && (
                <button type="button" onClick={() => setLocCot({})} className="ml-1 text-[var(--coral-600)] hover:underline">
                  {tr("✕ Xóa tất cả lọc")}
                </button>
              )}
            </div>
          )}
          {dsTab === "da-dong" ? (
            <DaDongMonthList columns={closedColumns} khuVucFilter={khuVucFilter} onRowClick={(c) => openCase(c.id, preferredCaseTab(c))} />
          ) : (
            <PaginatedTable
              columns={columns}
              rows={data?.rows ?? []}
              isLoading={isLoading}
              isError={isError}
              onRetry={refetch}
              page={page}
              pageSize={pageSize}
              total={data?.total ?? 0}
              onPageChange={setPage}
              onRowClick={(c) => openCase(c.id, preferredCaseTab(c))}
              rowKey={(c) => c.id}
              rowClassName={(c) => vipRowClassName(c.nhom_kh)}
              emptyText={tr("Không có ca nào trong nhóm này.")}
              sortBy={sortBy}
              sortDir={sortDir}
              onSortChange={(newSortBy, newSortDir) => {
                setSortBy(newSortBy);
                setSortDir(newSortDir);
                setPage(1);
              }}
              storageKey="backlog-list"
              colFilters={locCot}
              onColFiltersChange={setLocCot}
              loadFilterValues={layGiaTriCot}
              totalUnfiltered={data?.total_chua_loc}
              optionalColumns={optionalCaseColumns}
              defaultVisibleOptionalKeys={["sl_don_mua", "sl_don_bao_hanh", "ly_do_ton_tranh_chap_gan_nhat"]}
            />
          )}
        </div>
      )}
    </div>
  );
}
