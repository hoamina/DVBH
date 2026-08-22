import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { StatCard } from "../components/ui/StatCard";
import { Tabs } from "../components/ui/Tabs";
import { Select } from "../components/ui/Select";
import { Modal } from "../components/ui/Modal";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import { TiepNhanModal } from "../components/TienTrinhPanel";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { api, buildQuery } from "../api/client";
import { fmtDateTime, type Paged } from "../types";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { QLDVBH_FILTER_VALUE } from "../constants";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { exportRowsToExcel } from "../lib/exportExcel";
import { shortKhuVuc } from "../lib/khuVucShortLabel";
import { IdSerialSearchInput } from "../components/IdSerialSearchInput";
import { ImportUploader } from "../components/ImportUploader";
import { isVipKh, vipRowClassName, VipBadge } from "../lib/vipHighlight";
import { usePersonDirectory, formatPersonDisplay } from "../lib/personDisplay";
import {
  TRANG_THAI_LABELS,
  TRANG_THAI_TONE,
  TRANG_THAI_LOG_OPTIONS,
  TRANG_THAI_DONG,
  KSNB_WATCH_STATUSES,
  MUC_DO_OPTIONS,
  MUC_DO_TONE,
  MUC_DO_LABELS,
  HAN_OPTIONS,
  canWriteTranhChap,
  canConfirmAiTranhChap,
  phanLoaiTone,
  describeTranhChapError,
  type ChoXuLyCase,
  type TienTrinhRow,
  type PhanLoaiTranhChapRow,
  type KetQuaXuLyTranhChapRow,
} from "../lib/tranhChapShared";

interface TienTrinhStats {
  dangMo: number;
  giamSatChuaXuLy: number;
  giamSatChuyenCskh: number;
  cskhDangXuLy: number;
  quaHan: number;
  sapDenHan: number;
}

interface TranhChapImportSummary {
  thanhCong: number;
  boQua: number;
  errors: string[];
}

const VIEWS = [
  { key: "cho-xu-ly", label: "Chờ xử lý" },
  { key: "doi-may", label: "Đòi đổi máy" },
  { key: "cho-xac-nhan-ai", label: "Chờ xác nhận AI" },
  { key: "tien-trinh", label: "Quản lý tiến trình" },
];

// CHOT 2026-08-21: gia tri settings_phan_loai_tranh_chap.ten_phan_loai dung de loc tab "Đòi đổi máy"
// - PHAI khop dung hang so DOI_MAY_PHAN_LOAI ben backend/src/routes/tranhChap.ts (Admin doi ten trong
// Cai dat thi phai sua ca 2 noi).
const DOI_MAY_PHAN_LOAI = "KH đòi đổi máy";

export function TranhChapModule({ openCase }: { openCase: (id: string, tab?: string) => void }) {
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;
  const myAreas = user?.khu_vuc_phu_trach ?? [];
  const addToast = useToast();
  const qc = useQueryClient();
  const personDir = usePersonDirectory();
  // CHOT 2026-08-12: quyen import hang loat tranh chap theo ID - rieng biet voi canWriteTranhChap()
  // (ghi tung ca qua "Tiep nhan"), xem migration 0052_users_import_tranh_chap.sql.
  const canImportTranhChap = user?.vai_tro === "Admin" || !!user?.co_the_import_tranh_chap;
  const [showImport, setShowImport] = useState(false);

  const [view, setView] = useLocalStorageState("filters:tranh-chap-view", "cho-xu-ly");
  const [page, setPage] = useState(1);
  const [khuVucFilter, setKhuVucFilter] = useLocalStorageState("filters:tranh-chap-khu-vuc", "");
  // CHOT 2026-08-20: bo loc "Tinh" (chon nhieu tinh cung luc) - chi luu localStorage phia client,
  // khong can dong bo server (giong moi bo loc khac cua module nay, xem useLocalStorageState).
  const [tinhFilter, setTinhFilter] = useLocalStorageState("filters:tranh-chap-tinh", "");
  // CHOT 2026-08-20: them loc "Nhom KH" (chon nhieu) - mirror pattern cua "Tinh" o tren, mirror
  // BacklogModule.tsx.
  const [nhomKhFilter, setNhomKhFilter] = useLocalStorageState("filters:tranh-chap-nhom-kh", "");
  const [thangFilter, setThangFilter] = useLocalStorageState("filters:tranh-chap-thang", new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7));

  const [ttPage, setTtPage] = useState(1);
  const [ttKhuVuc, setTtKhuVuc] = useLocalStorageState("filters:tranh-chap-tt-khu-vuc", "");
  const [ttTinh, setTtTinh] = useLocalStorageState("filters:tranh-chap-tt-tinh", "");
  const [ttNhomKh, setTtNhomKh] = useLocalStorageState("filters:tranh-chap-tt-nhom-kh", "");
  const [ttPhanLoai, setTtPhanLoai] = useLocalStorageState("filters:tranh-chap-tt-phan-loai", "");
  const [ttMucDo, setTtMucDo] = useLocalStorageState("filters:tranh-chap-tt-muc-do", "");
  const [ttTrangThai, setTtTrangThai] = useLocalStorageState("filters:tranh-chap-tt-trang-thai", "");
  const [ttHan, setTtHan] = useLocalStorageState("filters:tranh-chap-tt-han", "");
  const [ttCuaToi, setTtCuaToi] = useState(false);
  const [ttNguoiDangXuLy, setTtNguoiDangXuLy] = useLocalStorageState("filters:tranh-chap-tt-nguoi-dang-xu-ly", "");
  const [ttLoaiDangXuLy, setTtLoaiDangXuLy] = useLocalStorageState("filters:tranh-chap-tt-loai-dang-xu-ly", "");
  const [ttIdSearch, setTtIdSearch] = useState("");

  // ---------- Tab "Cho xac nhan AI" (nghi_ngo_tranh_chap = 2, CHOT 2026-08-20) ----------
  const [aiPage, setAiPage] = useState(1);
  const [aiKhuVuc, setAiKhuVuc] = useLocalStorageState("filters:tranh-chap-ai-khu-vuc", "");
  const [aiTinh, setAiTinh] = useLocalStorageState("filters:tranh-chap-ai-tinh", "");
  const [aiNhomKh, setAiNhomKh] = useLocalStorageState("filters:tranh-chap-ai-nhom-kh", "");
  const [aiIdSearch, setAiIdSearch] = useState("");
  const [confirmingAiCase, setConfirmingAiCase] = useState<{ id: string; ketQua: "dung" | "khong_phai" } | null>(null);

  const { data: aiData, isLoading: aiLoading, isError: aiError, refetch: refetchAi } = useQuery({
    queryKey: ["tranh-chap-cho-xac-nhan-ai", aiPage, aiKhuVuc, aiTinh, aiNhomKh, thangFilter, aiIdSearch],
    queryFn: () =>
      api.get<Paged<ChoXuLyCase & { thoi_gian_hoan_thanh: string | null; last_ly_do_cham: string | null; so_ngay_cho: number }>>(
        `/tranh-chap/cho-xac-nhan-ai${buildQuery({ page: aiPage, pageSize: 10, khu_vuc: aiKhuVuc, tinh: aiTinh, nhom_kh: aiNhomKh, thang: thangFilter, id: aiIdSearch || undefined })}`,
      ),
    enabled: view === "cho-xac-nhan-ai",
  });

  const xacNhanAi = useMutation({
    mutationFn: ({ id, ketQua }: { id: string; ketQua: "dung" | "khong_phai" }) => api.post(`/tranh-chap/${encodeURIComponent(id)}/xac-nhan-ai`, { ket_qua: ketQua }),
    onSuccess: (_data, variables) => {
      addToast(variables.ketQua === "dung" ? "Đã xác nhận: Đúng là tranh chấp — ca sẽ chuyển sang \"Chờ xử lý\"." : "Đã xác nhận: Không phải tranh chấp.");
      setConfirmingAiCase(null);
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xac-nhan-ai"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xu-ly"] });
    },
    onError: (err) => {
      addToast(describeTranhChapError(err, "Không thể xác nhận, thử lại sau."));
      setConfirmingAiCase(null);
    },
  });

  const choXacNhanAiColumns: Column<ChoXuLyRow>[] = [
    { key: "id", header: "ID", render: (c) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{c.id}</span> },
    {
      key: "khach_hang",
      header: "Khách hàng",
      render: (c) => (
        <>
          {isVipKh(c.nhom_kh) && <VipBadge />}
          {c.khach_hang ?? "—"}
        </>
      ),
    },
    { key: "khu_vuc", header: "Khu vực", render: (c) => shortKhuVuc(c.khu_vuc) },
    { key: "hoan_thanh", header: "Hoàn thành", render: (c) => <span className="text-xs">{fmtDateTime(c.thoi_gian_hoan_thanh)}</span> },
    {
      key: "so_ngay_cho",
      header: "Số ngày chờ",
      render: (c) => soNgayChoPill(c.so_ngay_cho),
    },
    {
      key: "action",
      header: "",
      className: "text-right",
      render: (c) =>
        !user || canConfirmAiTranhChap(user, c.khu_vuc) ? (
          <div className="flex justify-end gap-1.5">
            <Btn
              size="sm"
              variant="success"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmingAiCase({ id: c.id, ketQua: "dung" });
              }}
            >
              Đúng là tranh chấp
            </Btn>
            <Btn
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmingAiCase({ id: c.id, ketQua: "khong_phai" });
              }}
            >
              Không phải tranh chấp
            </Btn>
          </div>
        ) : (
          <span className="text-xs text-[var(--ink-400)] italic">Không có quyền</span>
        ),
    },
  ];

  const [tiepNhanCase, setTiepNhanCase] = useState<ChoXuLyCase | null>(null);

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const res = await api.get<Paged<ChoXuLyCase & { thoi_gian_hoan_thanh: string | null; last_ly_do_cham: string | null; so_ngay_cho: number }>>(
        `/tranh-chap/cho-xu-ly${buildQuery({ page: 1, pageSize: 1000, khu_vuc: khuVucFilter, tinh: tinhFilter, nhom_kh: nhomKhFilter, thang: thangFilter, min_days: minDaysFilter !== null ? String(minDaysFilter) : "", id: idSearch || undefined })}`
      );
      
      const headerLabels = {
        id: "Mã ca",
        khach_hang: "Khách hàng",
        khu_vuc: "Khu vực",
        thoi_gian_hoan_thanh: "Thời gian hoàn thành",
        so_ngay_cho: "Số ngày chờ",
        last_ly_do_cham: "Lý do tồn gần nhất",
      };

      const mappedRows = res.rows.map((row) => ({
        id: row.id,
        khach_hang: row.khach_hang,
        khu_vuc: row.khu_vuc,
        thoi_gian_hoan_thanh: row.thoi_gian_hoan_thanh ? fmtDateTime(row.thoi_gian_hoan_thanh) : "",
        so_ngay_cho: row.so_ngay_cho,
        last_ly_do_cham: row.last_ly_do_cham || "",
      }));

      await exportRowsToExcel(mappedRows, "danh_sach_cho_xu_ly_tranh_chap.xlsx", "ChoXuLy", headerLabels);
      addToast("Xuất Excel thành công!");
    } catch (err) {
      addToast("Xuất Excel thất bại: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsExporting(false);
    }
  };

  const { data: khuVucOptions } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ khuVuc: string[]; hang: string[]; tinh: (string | null)[]; nhomKh: (string | null)[] }>("/dashboard/filters"),
  });
  const tinhSelectOptions = (khuVucOptions?.tinh.filter((t): t is string => !!t) ?? []).sort((a, b) => a.localeCompare(b, "vi"));
  const nhomKhSelectOptions = (khuVucOptions?.nhomKh.filter((t): t is string => !!t) ?? []).sort((a, b) => a.localeCompare(b, "vi"));
  const { data: phanLoaiOptions } = useQuery({
    queryKey: ["settings-phan-loai-tranh-chap"],
    queryFn: () => api.get<{ rows: PhanLoaiTranhChapRow[] }>("/settings/phan-loai-tranh-chap"),
  });
  const { data: ketQuaOptions } = useQuery({
    queryKey: ["settings-ket-qua-xu-ly-tranh-chap"],
    queryFn: () => api.get<{ rows: KetQuaXuLyTranhChapRow[] }>("/settings/ket-qua-xu-ly-tranh-chap"),
  });

  const { data: monthData } = useQuery({
    queryKey: ["dashboard-months"],
    queryFn: () => api.get<{ months: string[] }>("/dashboard/months"),
  });

  const { data: handlingUsersData } = useQuery({
    queryKey: ["tranh-chap-handling-users"],
    queryFn: () => api.get<{ rows: { email: string; ten: string; vai_tro: string }[] }>("/tranh-chap/handling-users"),
  });
  const handlingUsers = handlingUsersData?.rows ?? [];

  const { data: filterUsersData } = useQuery({
    queryKey: ["tranh-chap-filter-users", ttKhuVuc],
    queryFn: () => api.get<{ rows: { email: string; ten: string; vai_tro: string }[] }>(`/tranh-chap/tai-khoan-ton${buildQuery({ khu_vuc: ttKhuVuc })}`),
  });
  const filterUsers = filterUsersData?.rows ?? [];

  const { data: taiKhoanTonData, isLoading: taiKhoanTonLoading } = useQuery({
    queryKey: ["tranh-chap-tai-khoan-ton", khuVucFilter, thangFilter],
    queryFn: () => api.get<{ rows: { email: string; ten: string; vai_tro: string; chua_xong_count: number; duoc_nhac_ten_count: number }[] }>(`/tranh-chap/tai-khoan-ton${buildQuery({ khu_vuc: khuVucFilter, thang: thangFilter })}`),
    enabled: view === "cho-xu-ly",
  });
  const taiKhoanTonRows = taiKhoanTonData?.rows ?? [];

  const handleAccountCountClick = (email: string, type: "chua-xong" | "duoc-nhac-ten") => {
    setView("tien-trinh");
    setTtNguoiDangXuLy(email);
    setTtLoaiDangXuLy(type);
    
    // Clear other restrictive filters so we can load the selected user's cases successfully
    setTtKhuVuc("");
    setTtPhanLoai("");
    setTtMucDo("");
    setTtTrangThai("");
    setTtHan("");
    setTtCuaToi(false);
    
    setTtPage(1);
  };

  const khuVucSelectOptions = [
    { value: "", label: "Tất cả khu vực" },
    { value: QLDVBH_FILTER_VALUE, label: "Tất cả DVBH (MB/MN...)" },
    ...(khuVucOptions?.khuVuc.map((k) => ({ value: k, label: k })) ?? []),
  ];

  const monthSelectOptions = [
    ...(monthData?.months.map((m) => ({ value: m, label: m })) ?? []),
  ];

  // ---------- Tab "Cho xu ly" ----------
  const [minDaysFilter, setMinDaysFilter] = useState<number | null>(null);
  const [idSearch, setIdSearch] = useState("");

  const { data: choXuLy, isLoading: choXuLyLoading, isError: choXuLyError, refetch: refetchChoXuLy } = useQuery({
    queryKey: ["tranh-chap-cho-xu-ly", page, khuVucFilter, tinhFilter, nhomKhFilter, thangFilter, minDaysFilter, idSearch],
    queryFn: () =>
      api.get<Paged<ChoXuLyCase & { thoi_gian_hoan_thanh: string | null; last_ly_do_cham: string | null; so_ngay_cho: number }> & {
        choTuNgay3: number;
        choTuNgay7: number;
        choTuNgay10: number;
        choTuNgay14: number;
        unfilteredTotal: number;
      }>(
        `/tranh-chap/cho-xu-ly${buildQuery({ page, pageSize: 10, khu_vuc: khuVucFilter, tinh: tinhFilter, nhom_kh: nhomKhFilter, thang: thangFilter, min_days: minDaysFilter !== null ? String(minDaysFilter) : "", id: idSearch || undefined })}`,
      ),
    enabled: view === "cho-xu-ly",
  });

  interface TranhChapKhuVucReportRow {
    khu_vuc: string | null;
    count_nghi_ngo: number;
    count_phat_sinh_ngoai: number;
    count_chua_xu_ly: number;
    count_da_xu_ly: number;
    count_gs_da_xu_ly: number;
    count_gs_dang_xu_ly: number;
    count_gs_ket_thuc: number;
    count_chuyen_qgkn: number;
    count_qgkn_dang_xu_ly: number;
    count_qgkn_da_dong: number;
    // CHOT 2026-08-20: so ca dang o "Giam sat chua xu ly" DO CSKH "Chuyen lai giam sat xu ly" (khac
    // ca moi tao tien trinh lan dau) - da duoc CONG vao count_chua_xu_ly o tren, cot nay chi de HIEN
    // THI RIENG (xem IS_GQKN_DAY_LAI_GS_EXPR o backend).
    count_gqkn_day_lai_gs: number;
  }

  const { data: reportData, isLoading: reportLoading } = useQuery({
    queryKey: ["tranh-chap-bao-cao-khu-vuc", thangFilter],
    queryFn: () => api.get<{ rows: TranhChapKhuVucReportRow[] }>(`/tranh-chap/bao-cao-khu-vuc${buildQuery({ thang: thangFilter })}`),
    enabled: view === "cho-xu-ly",
  });

  const totals = useMemo(() => {
    const rows = reportData?.rows ?? [];
    return rows.reduce(
      (acc, r) => {
        acc.nghi_ngo += r.count_nghi_ngo ?? 0;
        acc.phat_sinh_ngoai += r.count_phat_sinh_ngoai ?? 0;
        acc.chua_xu_ly += r.count_chua_xu_ly ?? 0;
        acc.da_xu_ly += r.count_da_xu_ly ?? 0;
        acc.gs_da_xu_ly += r.count_gs_da_xu_ly ?? 0;
        acc.gs_dang_xu_ly += r.count_gs_dang_xu_ly ?? 0;
        acc.gs_ket_thuc += r.count_gs_ket_thuc ?? 0;
        acc.chuyen_qgkn += r.count_chuyen_qgkn ?? 0;
        acc.qgkn_dang_xu_ly += r.count_qgkn_dang_xu_ly ?? 0;
        acc.qgkn_da_dong += r.count_qgkn_da_dong ?? 0;
        acc.gqkn_day_lai_gs += r.count_gqkn_day_lai_gs ?? 0;
        return acc;
      },
      {
        nghi_ngo: 0,
        phat_sinh_ngoai: 0,
        chua_xu_ly: 0,
        da_xu_ly: 0,
        gs_da_xu_ly: 0,
        gs_dang_xu_ly: 0,
        gs_ket_thuc: 0,
        chuyen_qgkn: 0,
        qgkn_dang_xu_ly: 0,
        qgkn_da_dong: 0,
        gqkn_day_lai_gs: 0,
      }
    );
  }, [reportData]);

  const tiepNhan = useMutation({
    mutationFn: (body: {
      phan_loai_tranh_chap: string;
      muc_do: string;
      trang_thai_xu_ly: string;
      ghi_chu?: string;
      thoi_gian_du_kien_xong?: string;
      ket_qua_xu_ly?: string;
      hai_long_sau_tranh_chap?: string;
    }) => api.post(`/tranh-chap/${encodeURIComponent(tiepNhanCase?.id ?? "")}/tiep-nhan`, body),
    onSuccess: () => {
      addToast("Đã tiếp nhận xử lý tranh chấp");
      setTiepNhanCase(null);
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xu-ly"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh-stats"] });
      qc.invalidateQueries({ queryKey: ["notifications-count"] });
      setView("tien-trinh");
    },
    onError: (err) => addToast(describeTranhChapError(err, "Không thể tiếp nhận, thử lại sau.")),
  });

  type ChoXuLyRow = ChoXuLyCase & { thoi_gian_hoan_thanh: string | null; last_ly_do_cham: string | null; so_ngay_cho: number };

  // Cung 1 thang mau leo thang voi 4 StatCard "Cho >=X ngay" o duoi - CHOT 2026-08-06 (thiet ke lai
  // dong bo): 0-2 ngay binh thuong, 3-6 amber, 7-9 coral nhat, 10-13 coral dam hon, >=14 coral to dac
  // (nen dam + chu trang) de tach biet ro nhat nhom qua han nghiem trong nhat.
  function soNgayChoPill(days: number) {
    const base = "font-mono font-bold text-xs px-2 py-0.5 rounded-full";
    if (days >= 14) return <span className={`${base} bg-[var(--coral-500)] text-white`}>{days}</span>;
    if (days >= 10) return <span className={`${base} bg-[var(--coral-100)] text-[var(--coral-500)] ring-1 ring-[var(--coral-500)]`}>{days}</span>;
    if (days >= 7) return <span className={`${base} bg-[var(--coral-100)] text-[var(--coral-500)]`}>{days}</span>;
    if (days >= 3) return <span className={`${base} bg-[var(--amber-100)] text-[var(--amber-500)]`}>{days}</span>;
    return <span className="font-mono text-xs text-[var(--ink-600)]">{days}</span>;
  }

  const choXuLyColumns: Column<ChoXuLyRow>[] = [
    { key: "id", header: "ID", render: (c) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{c.id}</span> },
    {
      key: "khach_hang",
      header: "Khách hàng",
      render: (c) => (
        <>
          {isVipKh(c.nhom_kh) && <VipBadge />}
          {c.khach_hang ?? "—"}
        </>
      ),
    },
    { key: "khu_vuc", header: "Khu vực", render: (c) => shortKhuVuc(c.khu_vuc) },
    {
      key: "ly_do",
      header: "Lý do quá hạn",
      render: (c) =>
        c.is_gqkn_day_lai_gs ? (
          <Badge tone="amber">GQKN đẩy lại GS</Badge>
        ) : c.last_ly_do_cham ? (
          <Badge tone="coral">{c.last_ly_do_cham}</Badge>
        ) : (
          <span className="text-[var(--ink-400)] text-xs italic">—</span>
        ),
    },
    { key: "hoan_thanh", header: "Hoàn thành", render: (c) => <span className="text-xs">{fmtDateTime(c.thoi_gian_hoan_thanh)}</span> },
    {
      key: "so_ngay_cho",
      header: "Số ngày chờ",
      render: (c) => soNgayChoPill(c.so_ngay_cho),
    },
    {
      key: "action",
      header: "",
      className: "text-right",
      render: (c) =>
        c.is_gqkn_day_lai_gs ? (
          <Btn
            size="sm"
            variant="subtle"
            onClick={(e) => {
              e.stopPropagation();
              setTtIdSearch(c.id);
              setView("tien-trinh");
            }}
          >
            Xem tiến trình
          </Btn>
        ) : !user || canWriteTranhChap(user, c.khu_vuc) ? (
          <Btn
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setTiepNhanCase(c);
            }}
          >
            Tiếp nhận xử lý
          </Btn>
        ) : (
          <span className="text-xs text-[var(--ink-400)] italic">Không có quyền</span>
        ),
    },
  ];

  // ---------- Tab "Tien trinh" ----------
  const { data: ttStats } = useQuery({
    queryKey: ["tranh-chap-tien-trinh-stats"],
    queryFn: () => api.get<TienTrinhStats>("/tranh-chap/tien-trinh/stats"),
    enabled: view === "tien-trinh",
  });
  const { data: ttData, isLoading: ttLoading, isError: ttError, refetch: refetchTt } = useQuery({
    queryKey: ["tranh-chap-tien-trinh", ttPage, ttKhuVuc, ttTinh, ttNhomKh, ttPhanLoai, ttMucDo, ttTrangThai, ttHan, ttCuaToi, ttNguoiDangXuLy, ttLoaiDangXuLy, ttIdSearch],
    queryFn: () =>
      api.get<Paged<TienTrinhRow>>(
        `/tranh-chap/tien-trinh${buildQuery({
          page: ttPage,
          pageSize: 10,
          khu_vuc: ttKhuVuc,
          tinh: ttTinh,
          nhom_kh: ttNhomKh,
          phan_loai: ttPhanLoai,
          muc_do: ttMucDo,
          trang_thai: ttTrangThai,
          han: ttHan,
          cua_toi: ttCuaToi ? "1" : "",
          nguoi_dang_xu_ly: ttNguoiDangXuLy,
          loai_dang_xu_ly: ttLoaiDangXuLy,
          id: ttIdSearch || undefined,
        })}`,
      ),
    enabled: view === "tien-trinh",
  });

  function resetTtFilterTo(partial: Partial<{ trangThai: string; han: string }>) {
    setTtTrangThai(partial.trangThai ?? "");
    setTtHan(partial.han ?? "");
    setTtNguoiDangXuLy("");
    setTtLoaiDangXuLy("");
    setTtPage(1);
  }

  const tienTrinhColumns: Column<TienTrinhRow>[] = [
    { key: "id", header: "Tiến trình", render: (r) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{r.id}</span> },
    { key: "case_id", header: "Ca sự vụ", render: (r) => <span className="font-mono text-xs text-[var(--ocean-600)]">{r.case_id}</span> },
    {
      key: "khach_hang",
      header: "Khách hàng",
      render: (r) => (
        <>
          {isVipKh(r.nhom_kh) && <VipBadge />}
          {r.khach_hang ?? "—"}
        </>
      ),
    },
    { key: "khu_vuc", header: "Khu vực", render: (r) => shortKhuVuc(r.khu_vuc) },
    {
      key: "giam_sat_phu_trach",
      header: "Giám sát phụ trách",
      render: (r) => (
        <>
          {r.giam_sat_phu_trach.length ? (
            <span className="text-xs">{r.giam_sat_phu_trach.map((g) => g.ten ?? g.email).join(", ")}</span>
          ) : (
            <span className="text-[var(--ink-400)] text-xs italic">—</span>
          )}
          {r.trang_thai_xu_ly === "Giam sat chua xu ly" && r.gs_tung_xu_ly.length > 0 && (
            <div className="text-[11px] text-[var(--amber-600)] mt-0.5">
              Từng xử lý: {r.gs_tung_xu_ly.map((g) => g.ten ?? g.email).join(", ")}
            </div>
          )}
        </>
      ),
    },
    { key: "phan_loai", header: "Phân loại", render: (r) => <Badge tone={phanLoaiTone(r.phan_loai_tranh_chap)}>{r.phan_loai_tranh_chap}</Badge> },
    { key: "muc_do", header: "Mức độ", render: (r) => <Badge tone={MUC_DO_TONE[r.muc_do] ?? "gray"}>{MUC_DO_LABELS[r.muc_do] ?? r.muc_do}</Badge> },
    {
      key: "trang_thai",
      header: "Trạng thái",
      render: (r) => (r.trang_thai_xu_ly ? <Badge tone={TRANG_THAI_TONE[r.trang_thai_xu_ly] ?? "gray"}>{TRANG_THAI_LABELS[r.trang_thai_xu_ly] ?? r.trang_thai_xu_ly}</Badge> : "—"),
    },
    { key: "nguoi_xu_ly", header: "Người xử lý gần nhất", render: (r) => (r.nguoi_xu_ly ? formatPersonDisplay(r.nguoi_xu_ly, personDir) : "—") },
    {
      key: "dang_cho_nguoi_xu_ly",
      header: "Đang chờ ai?",
      render: (r) => {
        if (!r.dang_cho_nguoi_xu_ly) return <span className="text-[var(--ink-400)] text-xs italic">—</span>;
        const u = handlingUsers.find((user) => user.email === r.dang_cho_nguoi_xu_ly);
        return <span className="text-xs font-semibold text-[var(--ocean-600)]">{u ? u.ten : r.dang_cho_nguoi_xu_ly}</span>;
      }
    },
    {
      key: "han",
      header: "Ngày dự kiến xong",
      render: (r) => {
        if (!r.thoi_gian_du_kien_xong) return <span className="text-[var(--ink-400)] text-xs italic">—</span>;
        const isDong = r.trang_thai_xu_ly ? TRANG_THAI_DONG.includes(r.trang_thai_xu_ly) : false;
        const quaHan = !isDong && r.thoi_gian_du_kien_xong < new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
        return <span className={`text-xs font-semibold ${quaHan ? "text-[var(--coral-500)]" : ""}`}>{r.thoi_gian_du_kien_xong}</span>;
      },
    },
    { key: "so_ngay_ton", header: "Số ngày tồn", render: (r) => <span className="font-mono">{r.so_ngay_ton}</span> },
  ];

  // ---------- Tab "Đòi đổi máy" (CHOT 2026-08-21) - view loc CO DINH theo DOI_MAY_PHAN_LOAI cua tab
  // "Quan ly tien trinh" (moi ca thuoc tab nay LUON da co tien trinh, vi phan_loai_tranh_chap la cot
  // cua tranh_chap_tien_trinh - khac tab "Cho xu ly" la ca CHUA co tien trinh nao). Tai su dung dung
  // API /tien-trinh (da ho tro filter "phan_loai" san co) + tienTrinhColumns/TienTrinhRow ben tren -
  // khong tao khai niem/cot moi de giu dung "3-5s" (thiet ke da chot voi nguoi dung 2026-08-21).
  const [dmPage, setDmPage] = useState(1);
  const [dmKhuVuc, setDmKhuVuc] = useLocalStorageState("filters:tranh-chap-dm-khu-vuc", "");
  const [dmTinh, setDmTinh] = useLocalStorageState("filters:tranh-chap-dm-tinh", "");
  const [dmNhomKh, setDmNhomKh] = useLocalStorageState("filters:tranh-chap-dm-nhom-kh", "");
  const [dmTrangThai, setDmTrangThai] = useState("");
  const [dmHan, setDmHan] = useState("");
  const [dmIdSearch, setDmIdSearch] = useState("");
  const [dmNguoiDangXuLy, setDmNguoiDangXuLy] = useState("");
  const [dmLoaiDangXuLy, setDmLoaiDangXuLy] = useState("");

  function resetDmFilterTo(partial: Partial<{ trangThai: string; han: string }>) {
    setDmTrangThai(partial.trangThai ?? "");
    setDmHan(partial.han ?? "");
    setDmNguoiDangXuLy("");
    setDmLoaiDangXuLy("");
    setDmPage(1);
  }

  const handleDmAccountCountClick = (email: string, type: "chua-xong" | "duoc-nhac-ten") => {
    setDmNguoiDangXuLy(email);
    setDmLoaiDangXuLy(type);
    setDmKhuVuc("");
    setDmTrangThai("");
    setDmHan("");
    setDmPage(1);
  };

  const { data: dmStats } = useQuery({
    queryKey: ["tranh-chap-doi-may-stats"],
    queryFn: () => api.get<TienTrinhStats>(`/tranh-chap/tien-trinh/stats${buildQuery({ phan_loai: DOI_MAY_PHAN_LOAI })}`),
    enabled: view === "doi-may",
  });

  const { data: dmData, isLoading: dmLoading, isError: dmError, refetch: refetchDm } = useQuery({
    queryKey: ["tranh-chap-doi-may-tien-trinh", dmPage, dmKhuVuc, dmTinh, dmNhomKh, dmTrangThai, dmHan, dmIdSearch, dmNguoiDangXuLy, dmLoaiDangXuLy],
    queryFn: () =>
      api.get<Paged<TienTrinhRow>>(
        `/tranh-chap/tien-trinh${buildQuery({
          page: dmPage,
          pageSize: 10,
          khu_vuc: dmKhuVuc,
          tinh: dmTinh,
          nhom_kh: dmNhomKh,
          phan_loai: DOI_MAY_PHAN_LOAI,
          trang_thai: dmTrangThai,
          han: dmHan,
          id: dmIdSearch || undefined,
          nguoi_dang_xu_ly: dmNguoiDangXuLy,
          loai_dang_xu_ly: dmLoaiDangXuLy,
        })}`,
      ),
    enabled: view === "doi-may",
  });

  const { data: dmKhuVucReport, isLoading: dmKhuVucReportLoading } = useQuery({
    queryKey: ["tranh-chap-doi-may-theo-khu-vuc"],
    queryFn: () => api.get<{ rows: { khu_vuc: string | null; dang_mo: number; qua_han: number }[] }>("/tranh-chap/doi-may/theo-khu-vuc"),
    enabled: view === "doi-may",
  });

  const { data: dmTaiKhoanTon, isLoading: dmTaiKhoanTonLoading } = useQuery({
    queryKey: ["tranh-chap-doi-may-tai-khoan-ton", dmKhuVuc],
    queryFn: () =>
      api.get<{ rows: { email: string; ten: string; vai_tro: string; chua_xong_count: number; duoc_nhac_ten_count: number }[] }>(
        `/tranh-chap/tai-khoan-ton${buildQuery({ khu_vuc: dmKhuVuc, phan_loai: DOI_MAY_PHAN_LOAI })}`,
      ),
    enabled: view === "doi-may",
  });
  const dmTaiKhoanTonRows = dmTaiKhoanTon?.rows ?? [];

  return (
    <div className="anim-in">
      <Tabs active={view} onChange={setView} tabs={VIEWS} />

      {view === "cho-xu-ly" ? (
        <div className="mt-4">
          <div className="text-sm text-[var(--ink-600)] mb-4">
            Ca có <b>"Nghi ngờ tranh chấp"</b> (điền bởi CRM khi đóng ca) nhưng <b>chưa từng tạo tiến trình xử lý</b>. Sắp theo số ngày chờ giảm dần — ưu tiên xử lý ca chờ lâu nhất.
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <KhuVucFilterControl value={khuVucFilter} onChange={(v) => { setKhuVucFilter(v); setPage(1); }} options={khuVucSelectOptions} myAreas={myAreas} />
            <MultiSelectFilter label="Tỉnh" value={tinhFilter} onChange={(v) => { setTinhFilter(v); setPage(1); }} options={tinhSelectOptions} />
            <MultiSelectFilter label="Nhóm KH" value={nhomKhFilter} onChange={(v) => { setNhomKhFilter(v); setPage(1); }} options={nhomKhSelectOptions} />
            <Select
              value={thangFilter}
              onChange={(v) => { setThangFilter(v); setPage(1); }}
              options={monthSelectOptions}
            />
            <IdSerialSearchInput
              value={idSearch}
              onChange={(v) => {
                setIdSearch(v);
                setPage(1);
              }}
            />
            {canImportTranhChap && (
              <Btn variant="ghost" size="sm" onClick={() => setShowImport((v) => !v)}>
                {showImport ? "Đóng import" : "📥 Import tranh chấp theo ID"}
              </Btn>
            )}
            <Btn variant="subtle" size="sm" onClick={handleExport} disabled={isExporting} className={canImportTranhChap ? "" : "ml-auto"}>
              {isExporting ? "📥 Đang tải..." : "📥 Tải danh sách chi tiết"}
            </Btn>
          </div>
          {/* CHOT 2026-08-12: import hang loat tranh chap theo ID - chi hien voi tai khoan duoc cap
              quyen (canImportTranhChap, xem migration 0052) hoac Admin, an mac dinh sau nut bat/tat
              (showImport) de khong choan man hinh voi da so nguoi dung khong dung tinh nang nay. */}
          {canImportTranhChap && showImport && (
            <ImportUploader<TranhChapImportSummary>
              description={
                <>
                  Nhập hàng loạt ca vào hàng đợi tranh chấp từ file Excel/CSV (3 cột <b className="font-mono">id</b>, <b className="font-mono">phan_loai_tranh_chap</b>,{" "}
                  <b className="font-mono">muc_do</b>). Mỗi ca tạo 1 tiến trình mới ở trạng thái "Giám sát chưa xử lý" — ca đã có tiến trình đang mở sẽ bị bỏ qua.
                </>
              }
              templateUrl="/api/tranh-chap/import/template"
              previewUrl="/tranh-chap/import/preview"
              commitUrl="/tranh-chap/import/commit"
              buildBody={(rows) => ({ rows })}
              renderSummary={(s) => (
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <StatCard label="Sẵn sàng tạo tiến trình" value={s.thanhCong} tone="teal" />
                  <StatCard label="Bỏ qua" value={s.boQua} tone={s.boQua > 0 ? "amber" : "gray"} />
                </div>
              )}
              getErrors={(s) => s.errors}
              successMessage={(s) => `Import thành công: ${s.thanhCong} tiến trình tranh chấp mới`}
              invalidateKeys={[
                ["tranh-chap-cho-xu-ly"],
                ["tranh-chap-tien-trinh"],
                ["tranh-chap-tien-trinh-stats"],
                ["tranh-chap-bao-cao-khu-vuc"],
                ["notifications-count"],
              ]}
            />
          )}
          {/* Thang leo thang "cho bao lau" (CHOT 2026-08-06 - thiet ke lai) - dung chung 1 quy uoc
              "active" cua StatCard (xem components/ui/StatCard.tsx) thay vi tung div rieng bam boc
              rieng nhu truoc (khong dong bo voi tab "Quan ly tien trinh" ben duoi). */}
          <div className="flex flex-wrap gap-3 mb-4">
            <StatCard
              label="Tổng ca chờ xử lý"
              value={choXuLy?.unfilteredTotal ?? choXuLy?.total ?? 0}
              tone="ocean"
              active={minDaysFilter === null}
              onClick={() => {
                setMinDaysFilter(null);
                setPage(1);
              }}
            />
            <StatCard
              label="Chờ ≥3 ngày"
              value={choXuLy?.choTuNgay3 ?? 0}
              tone="amber"
              active={minDaysFilter === 3}
              onClick={() => {
                setMinDaysFilter(3);
                setPage(1);
              }}
            />
            <StatCard
              label="Chờ ≥7 ngày"
              value={choXuLy?.choTuNgay7 ?? 0}
              tone="coral"
              active={minDaysFilter === 7}
              onClick={() => {
                setMinDaysFilter(7);
                setPage(1);
              }}
            />
            <StatCard
              label="Chờ ≥10 ngày"
              value={choXuLy?.choTuNgay10 ?? 0}
              tone="coral"
              active={minDaysFilter === 10}
              onClick={() => {
                setMinDaysFilter(10);
                setPage(1);
              }}
            />
            <StatCard
              label="Chờ ≥14 ngày"
              value={choXuLy?.choTuNgay14 ?? 0}
              tone="coral"
              active={minDaysFilter === 14}
              onClick={() => {
                setMinDaysFilter(14);
                setPage(1);
              }}
            />
          </div>

          {/* CHOT 2026-08-06 (thiet ke lai): truoc dung --paper/--ink-50..800/--ocean-50/--coral-600 -
              KHONG co dinh nghia nao trong tokens.css (chi co --ink-900/600/400, --ocean-950..100,
              --coral-500/100...) nen ca khoi nay am tham to mau mac dinh trinh duyet, khac han phan
              con lai cua app. Doi sang Card + token that, khop dung kieu bang pivot "Bao cao ton theo
              khu vuc" o BacklogModule.tsx de dong bo giao dien giua 2 module. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card className="p-4">
              <div className="mb-3">
                <div className="font-display font-bold text-sm">Báo cáo tranh chấp, khiếu nại theo khu vực</div>
                {thangFilter && <div className="text-xs text-[var(--ink-400)] mt-0.5">Tháng {thangFilter}</div>}
              </div>
              {reportLoading ? (
                <div className="text-center py-4 text-xs text-[var(--ink-400)]">Đang tải báo cáo...</div>
              ) : !reportData?.rows?.length ? (
                <div className="text-center py-4 text-xs text-[var(--ink-400)] italic">Không có dữ liệu báo cáo.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="dense w-full text-sm">
                    <thead>
                      <tr className="text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                        <th className="py-2 px-2 text-left">Khu vực</th>
                        <th className="py-2 px-2 text-center">Nghi ngờ tranh chấp</th>
                        <th className="py-2 px-2 text-center">KN phát sinh ngoài</th>
                        <th className="py-2 px-2 text-center text-[var(--coral-500)] font-bold">Chưa xử lý</th>
                        <th className="py-2 px-2 text-center text-[var(--amber-600)]">GQKN đẩy lại GS</th>
                        <th className="py-2 px-2 text-center text-[var(--ocean-600)] font-bold">Đã xử lý</th>
                        <th className="py-2 px-2 text-center">GS đã XL</th>
                        <th className="py-2 px-2 text-center">GS đang XL</th>
                        <th className="py-2 px-2 text-center">GS kết thúc</th>
                        <th className="py-2 px-2 text-center">Chuyển QGKN</th>
                        <th className="py-2 px-2 text-center">QGKN đang XL</th>
                        <th className="py-2 px-2 text-center">QGKN đã đóng</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-[var(--line)] bg-slate-50 font-bold">
                        <td className="py-2 px-2 text-left">Tổng cộng</td>
                        <td className="py-2 px-2 text-center font-mono">{totals.nghi_ngo}</td>
                        <td className="py-2 px-2 text-center font-mono">{totals.phat_sinh_ngoai}</td>
                        <td className="py-2 px-2 text-center font-mono text-[var(--coral-500)]">{totals.chua_xu_ly}</td>
                        <td className="py-2 px-2 text-center font-mono text-[var(--amber-600)]">{totals.gqkn_day_lai_gs}</td>
                        <td className="py-2 px-2 text-center font-mono text-[var(--ocean-600)]">{totals.da_xu_ly}</td>
                        <td className="py-2 px-2 text-center font-mono">{totals.gs_da_xu_ly}</td>
                        <td className="py-2 px-2 text-center font-mono">{totals.gs_dang_xu_ly}</td>
                        <td className="py-2 px-2 text-center font-mono">{totals.gs_ket_thuc}</td>
                        <td className="py-2 px-2 text-center font-mono">{totals.chuyen_qgkn}</td>
                        <td className="py-2 px-2 text-center font-mono">{totals.qgkn_dang_xu_ly}</td>
                        <td className="py-2 px-2 text-center font-mono">{totals.qgkn_da_dong}</td>
                      </tr>
                      {reportData.rows.map((r, idx) => {
                        // background-color tren <tr> khong dam bao ve dung o moi trinh duyet (da kiem
                        // chung thuc te: rule CSS dung, nhung <tr> khong ap dung, ke ca voi style inline)
                        // - to nen tung <td> thay vi ca hang de chac chan hien thi dung moi noi.
                        const cellStyle = khuVucFilter === r.khu_vuc ? { backgroundColor: "var(--ocean-100)" } : undefined;
                        return (
                          <tr
                            key={r.khu_vuc ?? idx}
                            onClick={() => {
                              if (r.khu_vuc) {
                                setKhuVucFilter(r.khu_vuc);
                                setPage(1);
                              }
                            }}
                            className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
                          >
                          <td className="py-2 px-2 font-semibold text-left" style={cellStyle}>{r.khu_vuc ? shortKhuVuc(r.khu_vuc) : "Chưa rõ"}</td>
                          <td className="py-2 px-2 text-center font-mono text-[var(--ink-600)]" style={cellStyle}>{r.count_nghi_ngo}</td>
                          <td className="py-2 px-2 text-center font-mono text-[var(--ink-600)]" style={cellStyle}>{r.count_phat_sinh_ngoai}</td>
                          <td className="py-2 px-2 text-center font-mono font-semibold text-[var(--coral-500)]" style={cellStyle}>{r.count_chua_xu_ly}</td>
                          <td className="py-2 px-2 text-center font-mono text-[var(--amber-600)]" style={cellStyle}>{r.count_gqkn_day_lai_gs}</td>
                          <td className="py-2 px-2 text-center font-mono font-semibold text-[var(--ocean-600)]" style={cellStyle}>{r.count_da_xu_ly}</td>
                          <td className="py-2 px-2 text-center font-mono text-[var(--ink-600)]" style={cellStyle}>{r.count_gs_da_xu_ly}</td>
                          <td className="py-2 px-2 text-center font-mono text-[var(--ink-600)]" style={cellStyle}>{r.count_gs_dang_xu_ly}</td>
                          <td className="py-2 px-2 text-center font-mono text-[var(--ink-600)]" style={cellStyle}>{r.count_gs_ket_thuc}</td>
                          <td className="py-2 px-2 text-center font-mono text-[var(--ink-600)]" style={cellStyle}>{r.count_chuyen_qgkn}</td>
                          <td className="py-2 px-2 text-center font-mono text-[var(--ink-600)]" style={cellStyle}>{r.count_qgkn_dang_xu_ly}</td>
                          <td className="py-2 px-2 text-center font-mono text-[var(--ink-600)]" style={cellStyle}>{r.count_qgkn_da_dong}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="mb-3">
                <div className="font-display font-bold text-sm">Thống kê tồn đọng theo nhân sự</div>
                {thangFilter ? (
                  <div className="text-xs text-[var(--ink-400)] mt-0.5">Tháng {thangFilter}</div>
                ) : (
                  <div className="text-xs text-[var(--ink-400)] mt-0.5">Tất cả thời gian</div>
                )}
              </div>
              {taiKhoanTonLoading ? (
                <div className="text-center py-4 text-xs text-[var(--ink-400)]">Đang tải thống kê...</div>
              ) : !taiKhoanTonRows.length ? (
                <div className="text-center py-4 text-xs text-[var(--ink-400)] italic">Không có ca tồn theo nhân sự.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="dense w-full text-sm">
                    <thead>
                      <tr className="text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                        <th className="py-2 px-2 text-left">Nhân sự</th>
                        <th className="py-2 px-2 text-center text-[var(--coral-500)] font-bold">Xử lý chưa xong</th>
                        <th className="py-2 px-2 text-center text-[var(--ocean-600)] font-bold">Được nhắc tên xử lý</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taiKhoanTonRows.map((r, idx) => (
                        <tr key={r.email ?? idx} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-2 text-left">
                            <span className="font-semibold block">{r.ten}</span>
                            <span className="text-[10px] text-[var(--ink-400)] block">{r.vai_tro} — {r.email}</span>
                          </td>
                          <td className="py-2 px-2 text-center font-mono">
                            {r.chua_xong_count > 0 ? (
                              <button
                                onClick={() => handleAccountCountClick(r.email, "chua-xong")}
                                className="font-semibold text-[var(--coral-500)] hover:underline px-2 py-1 rounded bg-[var(--coral-100)] text-xs"
                              >
                                {r.chua_xong_count}
                              </button>
                            ) : (
                              <span className="text-[var(--ink-400)] text-xs">—</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center font-mono">
                            {r.duoc_nhac_ten_count > 0 ? (
                              <button
                                onClick={() => handleAccountCountClick(r.email, "duoc-nhac-ten")}
                                className="font-semibold text-[var(--ocean-600)] hover:underline px-2 py-1 rounded bg-[var(--ocean-100)] text-xs"
                              >
                                {r.duoc_nhac_ten_count}
                              </button>
                            ) : (
                              <span className="text-[var(--ink-400)] text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <PaginatedTable
            columns={choXuLyColumns}
            rows={choXuLy?.rows ?? []}
            isLoading={choXuLyLoading}
            isError={choXuLyError}
            onRetry={refetchChoXuLy}
            page={page}
            pageSize={10}
            total={choXuLy?.total ?? 0}
            onPageChange={setPage}
            onRowClick={(c) => openCase(c.id, "tranh-chap")}
            rowKey={(c) => c.id}
            rowClassName={(c) => vipRowClassName(c.nhom_kh)}
            emptyText="Không có ca nào đang chờ xử lý tranh chấp."
            storageKey="tranh-chap-cho-xu-ly"
          />
        </div>
      ) : view === "doi-may" ? (
        <div className="mt-4">
          <div className="text-sm text-[var(--ink-600)] mb-4">
            Tất cả tiến trình tranh chấp có phân loại <b>"{DOI_MAY_PHAN_LOAI}"</b> — nhóm rủi ro cao cần theo dõi sát (chi phí đổi máy, ảnh hưởng tồn kho).
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <KhuVucFilterControl value={dmKhuVuc} onChange={(v) => { setDmKhuVuc(v); setDmPage(1); }} options={khuVucSelectOptions} myAreas={myAreas} />
            <MultiSelectFilter label="Tỉnh" value={dmTinh} onChange={(v) => { setDmTinh(v); setDmPage(1); }} options={tinhSelectOptions} />
            <MultiSelectFilter label="Nhóm KH" value={dmNhomKh} onChange={(v) => { setDmNhomKh(v); setDmPage(1); }} options={nhomKhSelectOptions} />
            <IdSerialSearchInput value={dmIdSearch} onChange={(v) => { setDmIdSearch(v); setDmPage(1); }} />
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <StatCard label="Đang mở" value={dmStats?.dangMo ?? 0} tone="ocean" active={dmTrangThai === "" && dmHan === ""} onClick={() => resetDmFilterTo({})} />
            <StatCard
              label="Giám sát chưa xử lý"
              value={dmStats?.giamSatChuaXuLy ?? 0}
              tone="gray"
              active={dmTrangThai === "Giam sat chua xu ly"}
              onClick={() => resetDmFilterTo({ trangThai: "Giam sat chua xu ly" })}
            />
            <StatCard
              label="Sắp đến hạn (≤1 ngày)"
              value={dmStats?.sapDenHan ?? 0}
              tone="amber"
              active={dmHan === "sap-den-han"}
              onClick={() => resetDmFilterTo({ han: "sap-den-han" })}
            />
            <StatCard label="Quá hạn chưa đóng" value={dmStats?.quaHan ?? 0} tone="coral" active={dmHan === "qua-han"} onClick={() => resetDmFilterTo({ han: "qua-han" })} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card className="p-4">
              <div className="mb-3">
                <div className="font-display font-bold text-sm">Đòi đổi máy theo khu vực</div>
              </div>
              {dmKhuVucReportLoading ? (
                <div className="text-center py-4 text-xs text-[var(--ink-400)]">Đang tải báo cáo...</div>
              ) : !dmKhuVucReport?.rows?.length ? (
                <div className="text-center py-4 text-xs text-[var(--ink-400)] italic">Không có dữ liệu báo cáo.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="dense w-full text-sm">
                    <thead>
                      <tr className="text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                        <th className="py-2 px-2 text-left">Khu vực</th>
                        <th className="py-2 px-2 text-center text-[var(--ocean-600)] font-bold">Đang mở</th>
                        <th className="py-2 px-2 text-center text-[var(--coral-500)] font-bold">Quá hạn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dmKhuVucReport.rows.map((r, idx) => {
                        const cellStyle = dmKhuVuc === r.khu_vuc ? { backgroundColor: "var(--ocean-100)" } : undefined;
                        return (
                          <tr
                            key={r.khu_vuc ?? idx}
                            onClick={() => {
                              if (r.khu_vuc) {
                                setDmKhuVuc(r.khu_vuc);
                                setDmPage(1);
                              }
                            }}
                            className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
                          >
                            <td className="py-2 px-2 font-semibold text-left" style={cellStyle}>{r.khu_vuc ? shortKhuVuc(r.khu_vuc) : "Chưa rõ"}</td>
                            <td className="py-2 px-2 text-center font-mono font-semibold text-[var(--ocean-600)]" style={cellStyle}>{r.dang_mo}</td>
                            <td className="py-2 px-2 text-center font-mono font-semibold text-[var(--coral-500)]" style={cellStyle}>{r.qua_han}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="mb-3">
                <div className="font-display font-bold text-sm">Tồn đọng theo nhân sự</div>
              </div>
              {dmTaiKhoanTonLoading ? (
                <div className="text-center py-4 text-xs text-[var(--ink-400)]">Đang tải thống kê...</div>
              ) : !dmTaiKhoanTonRows.length ? (
                <div className="text-center py-4 text-xs text-[var(--ink-400)] italic">Không có ca tồn theo nhân sự.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="dense w-full text-sm">
                    <thead>
                      <tr className="text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                        <th className="py-2 px-2 text-left">Nhân sự</th>
                        <th className="py-2 px-2 text-center text-[var(--coral-500)] font-bold">Xử lý chưa xong</th>
                        <th className="py-2 px-2 text-center text-[var(--ocean-600)] font-bold">Được nhắc tên xử lý</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dmTaiKhoanTonRows.map((r, idx) => (
                        <tr key={r.email ?? idx} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-2 text-left">
                            <span className="font-semibold block">{r.ten}</span>
                            <span className="text-[10px] text-[var(--ink-400)] block">{r.vai_tro} — {r.email}</span>
                          </td>
                          <td className="py-2 px-2 text-center font-mono">
                            {r.chua_xong_count > 0 ? (
                              <button
                                onClick={() => handleDmAccountCountClick(r.email, "chua-xong")}
                                className="font-semibold text-[var(--coral-500)] hover:underline px-2 py-1 rounded bg-[var(--coral-100)] text-xs"
                              >
                                {r.chua_xong_count}
                              </button>
                            ) : (
                              <span className="text-[var(--ink-400)] text-xs">—</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center font-mono">
                            {r.duoc_nhac_ten_count > 0 ? (
                              <button
                                onClick={() => handleDmAccountCountClick(r.email, "duoc-nhac-ten")}
                                className="font-semibold text-[var(--ocean-600)] hover:underline px-2 py-1 rounded bg-[var(--ocean-100)] text-xs"
                              >
                                {r.duoc_nhac_ten_count}
                              </button>
                            ) : (
                              <span className="text-[var(--ink-400)] text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <PaginatedTable
            columns={tienTrinhColumns}
            rows={dmData?.rows ?? []}
            isLoading={dmLoading}
            isError={dmError}
            onRetry={refetchDm}
            page={dmPage}
            pageSize={10}
            total={dmData?.total ?? 0}
            onPageChange={setDmPage}
            onRowClick={(r) => openCase(r.case_id, "tranh-chap")}
            rowKey={(r) => r.id}
            rowClassName={(r) => vipRowClassName(r.nhom_kh)}
            emptyText="Không có tiến trình 'đòi đổi máy' nào khớp bộ lọc."
            storageKey="tranh-chap-doi-may"
          />
        </div>
      ) : view === "cho-xac-nhan-ai" ? (
        <div className="mt-4">
          <div className="text-sm text-[var(--ink-600)] mb-4">
            Ca do <b>AI phát hiện</b> có khả năng là tranh chấp (<code className="font-mono text-xs">nghi_ngo_tranh_chap = 2</code>) nhưng <b>chưa được con người xác nhận</b>. Bấm{" "}
            <b>"Đúng là tranh chấp"</b> để chuyển ca sang danh sách "Chờ xử lý" như bình thường, hoặc <b>"Không phải tranh chấp"</b> để loại bỏ vĩnh viễn (ca sẽ không hiện lại ở đây kể cả khi AI phát hiện lại).
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <KhuVucFilterControl value={aiKhuVuc} onChange={(v) => { setAiKhuVuc(v); setAiPage(1); }} options={khuVucSelectOptions} myAreas={myAreas} />
            <MultiSelectFilter label="Tỉnh" value={aiTinh} onChange={(v) => { setAiTinh(v); setAiPage(1); }} options={tinhSelectOptions} />
            <MultiSelectFilter label="Nhóm KH" value={aiNhomKh} onChange={(v) => { setAiNhomKh(v); setAiPage(1); }} options={nhomKhSelectOptions} />
            <IdSerialSearchInput
              value={aiIdSearch}
              onChange={(v) => {
                setAiIdSearch(v);
                setAiPage(1);
              }}
            />
          </div>
          <PaginatedTable
            columns={choXacNhanAiColumns}
            rows={aiData?.rows ?? []}
            isLoading={aiLoading}
            isError={aiError}
            onRetry={refetchAi}
            page={aiPage}
            pageSize={10}
            total={aiData?.total ?? 0}
            onPageChange={setAiPage}
            onRowClick={(c) => openCase(c.id, "tranh-chap")}
            rowKey={(c) => c.id}
            rowClassName={(c) => vipRowClassName(c.nhom_kh)}
            emptyText="Không có ca nào đang chờ xác nhận AI phát hiện."
            storageKey="tranh-chap-cho-xac-nhan-ai"
          />
          <Modal
            open={!!confirmingAiCase}
            onClose={() => setConfirmingAiCase(null)}
            title={confirmingAiCase?.ketQua === "dung" ? "Xác nhận: Đúng là tranh chấp?" : "Xác nhận: Không phải tranh chấp?"}
            width="max-w-md"
          >
            {confirmingAiCase && (
              <div className="space-y-4">
                <div className="text-sm text-[var(--ink-700)]">
                  {confirmingAiCase.ketQua === "dung"
                    ? `Ca ${confirmingAiCase.id} sẽ được xác nhận là tranh chấp thật và chuyển sang danh sách "Chờ xử lý".`
                    : `Ca ${confirmingAiCase.id} sẽ bị loại vĩnh viễn khỏi danh sách chờ xác nhận AI — không thể hoàn tác, kể cả khi AI phát hiện lại sau này.`}
                </div>
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" onClick={() => setConfirmingAiCase(null)}>
                    Hủy
                  </Btn>
                  <Btn
                    variant={confirmingAiCase.ketQua === "dung" ? "success" : "danger"}
                    disabled={xacNhanAi.isPending}
                    onClick={() => xacNhanAi.mutate(confirmingAiCase)}
                  >
                    {xacNhanAi.isPending ? "Đang lưu…" : confirmingAiCase.ketQua === "dung" ? "Đúng là tranh chấp" : "Không phải tranh chấp"}
                  </Btn>
                </div>
              </div>
            )}
          </Modal>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <KhuVucFilterControl value={ttKhuVuc} onChange={(v) => { setTtKhuVuc(v); setTtPage(1); }} options={khuVucSelectOptions} myAreas={myAreas} />
            <MultiSelectFilter label="Tỉnh" value={ttTinh} onChange={(v) => { setTtTinh(v); setTtPage(1); }} options={tinhSelectOptions} />
            <MultiSelectFilter label="Nhóm KH" value={ttNhomKh} onChange={(v) => { setTtNhomKh(v); setTtPage(1); }} options={nhomKhSelectOptions} />
            <Select
              value={ttPhanLoai}
              onChange={(v) => { setTtPhanLoai(v); setTtPage(1); }}
              options={[{ value: "", label: "Tất cả phân loại" }, ...(phanLoaiOptions?.rows.map((r) => ({ value: r.ten_phan_loai, label: r.ten_phan_loai })) ?? [])]}
            />
            <Select
              value={ttMucDo}
              onChange={(v) => { setTtMucDo(v); setTtPage(1); }}
              options={[{ value: "", label: "Tất cả mức độ" }, ...MUC_DO_OPTIONS]}
            />
            <Select
              value={ttTrangThai}
              onChange={(v) => { setTtTrangThai(v); setTtPage(1); }}
              options={[
                { value: "", label: "Đang mở (mặc định)" },
                { value: KSNB_WATCH_STATUSES.join(","), label: "🔎 Cần GQKN theo dõi (Chuyển CSKH / CSKH đang xử lý)" },
                ...TRANG_THAI_LOG_OPTIONS,
                { value: Object.keys(TRANG_THAI_LABELS).join(","), label: "Tất cả (gồm đã đóng)" },
              ]}
            />
            <Select value={ttHan} onChange={(v) => { setTtHan(v); setTtPage(1); }} options={HAN_OPTIONS} />
            <Select
              value={ttNguoiDangXuLy}
              onChange={(v) => {
                setTtNguoiDangXuLy(v);
                setTtPage(1);
                if (!v) setTtLoaiDangXuLy("");
              }}
              options={(() => {
                const opts = [
                  { value: "", label: "Tất cả người đang xử lý" },
                  ...filterUsers.map((u) => ({ value: u.email, label: `${u.ten} (${u.vai_tro})` })),
                ];
                if (ttNguoiDangXuLy && !filterUsers.some((u) => u.email === ttNguoiDangXuLy)) {
                  const matched = handlingUsers.find((u) => u.email === ttNguoiDangXuLy);
                  if (matched) {
                    opts.push({ value: matched.email, label: `${matched.ten} (${matched.vai_tro})` });
                  }
                }
                return opts;
              })()}
            />
            {ttNguoiDangXuLy && (
              <Select
                value={ttLoaiDangXuLy}
                onChange={(v) => { setTtLoaiDangXuLy(v); setTtPage(1); }}
                options={[
                  { value: "", label: "Tất cả (Chưa xong + Được nhắc)" },
                  { value: "chua-xong", label: "Xử lý chưa xong" },
                  { value: "duoc-nhac-ten", label: "Được nhắc tên xử lý" },
                ]}
              />
            )}
            <Btn
              variant={ttCuaToi ? "primary" : "ghost"}
              size="sm"
              onClick={() => {
                setTtCuaToi(!ttCuaToi);
                setTtPage(1);
              }}
            >
              Của tôi
            </Btn>
            <IdSerialSearchInput
              value={ttIdSearch}
              onChange={(v) => {
                setTtIdSearch(v);
                setTtPage(1);
              }}
            />
          </div>

          {/* CHOT 2026-08-06: them "active" (dong bo voi tab "Cho xu ly" o tren) - truoc bam vao 1 the
              o day khong co phan hoi thi giac nao cho biet dang loc theo tieu chi nao. */}
          <div className="flex flex-wrap gap-3 mb-4">
            <StatCard label="Đang mở" value={ttStats?.dangMo ?? 0} tone="ocean" active={ttTrangThai === "" && ttHan === ""} onClick={() => resetTtFilterTo({})} />
            <StatCard
              label="Giám sát chưa xử lý"
              value={ttStats?.giamSatChuaXuLy ?? 0}
              tone="gray"
              active={ttTrangThai === "Giam sat chua xu ly"}
              onClick={() => resetTtFilterTo({ trangThai: "Giam sat chua xu ly" })}
            />
            <StatCard
              label="🔎 Cần GQKN theo dõi"
              value={(ttStats?.giamSatChuyenCskh ?? 0) + (ttStats?.cskhDangXuLy ?? 0)}
              tone="teal"
              active={ttTrangThai === KSNB_WATCH_STATUSES.join(",")}
              onClick={() => resetTtFilterTo({ trangThai: KSNB_WATCH_STATUSES.join(",") })}
            />
            <StatCard
              label="Sắp đến hạn (≤1 ngày)"
              value={ttStats?.sapDenHan ?? 0}
              tone="amber"
              active={ttHan === "sap-den-han"}
              onClick={() => resetTtFilterTo({ han: "sap-den-han" })}
            />
            <StatCard label="Quá hạn chưa đóng" value={ttStats?.quaHan ?? 0} tone="coral" active={ttHan === "qua-han"} onClick={() => resetTtFilterTo({ han: "qua-han" })} />
          </div>

          <PaginatedTable
            columns={tienTrinhColumns}
            rows={ttData?.rows ?? []}
            isLoading={ttLoading}
            isError={ttError}
            onRetry={refetchTt}
            page={ttPage}
            pageSize={10}
            total={ttData?.total ?? 0}
            onPageChange={setTtPage}
            onRowClick={(r) => openCase(r.case_id, "tranh-chap")}
            rowKey={(r) => r.id}
            rowClassName={(r) => vipRowClassName(r.nhom_kh)}
            emptyText="Không có tiến trình nào khớp bộ lọc."
            storageKey="tranh-chap-tien-trinh"
          />
        </div>
      )}

      {tiepNhanCase && (
        <TiepNhanModal
          caseRow={tiepNhanCase}
          phanLoaiOptions={phanLoaiOptions?.rows.filter((r) => r.bat_tat) ?? []}
          ketQuaOptions={ketQuaOptions?.rows.filter((r) => r.bat_tat) ?? []}
          onClose={() => setTiepNhanCase(null)}
          onSubmit={(body) => tiepNhan.mutate(body)}
          isPending={tiepNhan.isPending}
        />
      )}
    </div>
  );
}
