import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
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
import { useDiaGioiLoc, useOnDiaGioiModeChange, NHAN_CAP_1 } from "../lib/diaGioi";
import { TRANG_THAI_LUONG, CA_MOI_GAN, fmtVn } from "../components/LuongMailPanel";
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
  type LyDoTonTranhChapRow,
  type TheoDoiDoiTraRow,
  type TheoDoiDoiTraDaXacNhanRow,
} from "../lib/tranhChapShared";
import { tr } from "../i18n/tr";

// Gia tri ao cho o chon "thang" dung chung ca module (header) - phai KHOP CHINH XAC voi
// TRANH_CHAP_CON_TON_FILTER_VALUE ben backend/src/routes/tranhChap.ts (xem chu thich o do ve cach
// tung endpoint dien giai gia tri nay).
const TRANH_CHAP_CON_TON_FILTER_VALUE = "__con_ton__";

interface TienTrinhStats {
  dangMo: number;
  giamSatChuaXuLy: number;
  giamSatChuyenCskh: number;
  cskhDangXuLy: number;
  quaHan: number;
  sapDenHan: number;
  quaHanCapNhat: number;
}

interface TranhChapImportSummary {
  thanhCong: number;
  boQua: number;
  errors: string[];
}

const VIEWS = [
  { key: "cho-xu-ly", label: tr("Chờ xử lý") },
  { key: "doi-may", label: tr("KN đổi máy") },
  { key: "cho-xac-nhan-ai", label: tr("Chờ xác nhận AI") },
  { key: "theo-doi-doi-tra", label: tr("Theo dõi đổi trả") },
  { key: "luong-doi-tra", label: tr("Luồng duyệt đổi trả") },
  { key: "tien-trinh", label: tr("Quản lý tiến trình") },
];

// CHOT 2026-08-21: gia tri settings_phan_loai_tranh_chap.ten_phan_loai dung de loc tab "Đòi đổi máy"
// - PHAI khop dung hang so DOI_MAY_PHAN_LOAI ben backend/src/routes/tranhChap.ts (Admin doi ten trong
// Cai dat thi phai sua ca 2 noi).
const DOI_MAY_PHAN_LOAI = "KH đòi đổi máy";

// Tab "Luồng duyệt đổi trả" (v1.434): luong doi tra tu he theodoidoimay (mail de xuat -> duyet -> giao xu ly ->
// SO/DO -> ca moi) ghep thong tin ca DVBH - GET /tranh-chap/luong-doi-tra (backend loc pham vi + phan trang).
interface LuongDoiTraListRow {
  id: string;
  khach_hang: string | null;
  khu_vuc: string | null;
  nhom_kh: string | null;
  loai_yeu_cau: string | null;
  san_pham_bao_hanh: string | null;
  trang_thai: string;
  msg_count: number;
  de_xuat_at: string | null;
  duyet_at: string | null;
  last_at: string | null;
  ket_thuc_at: string | null;
  ket_thuc_boi: string;
  ca_moi_id: string | null;
  ca_moi_gan: string | null;
  ca_moi_tien_do: string | null;
  // Trang thai KN (tien trinh tranh chap moi nhat) cua ca - 'Chua xu ly' = chua co tien trinh nao.
  kn_trang_thai: string | null;
}

// Badge trang thai KN dung chung cho bang Luong doi tra; 'Chua xu ly' (chua tung tao tien trinh) hien "Chưa có KN".
function knTrangThaiBadge(s: string | null) {
  if (!s || s === "Chua xu ly") return <span className="text-xs text-[var(--ink-400)]">{tr("Chưa có KN")}</span>;
  return <Badge tone={TRANG_THAI_TONE[s] ?? "gray"}>{TRANG_THAI_LABELS[s] ?? s}</Badge>;
}

// Badge trang thai luong doi tra (cot moi o bang tien trinh KN, 2026-10-12).
function luongDoiTraStatusBadge(l: { trang_thai: string } | null | undefined) {
  if (!l) return <span className="text-xs text-[var(--ink-400)]">—</span>;
  if (l.trang_thai === "ket_thuc") return <Badge tone="gray">{tr("Đã kết thúc")}</Badge>;
  if (l.trang_thai === "thanh_cong") return <Badge tone="teal">{tr("Đổi trả thành công")}</Badge>;
  return <Badge tone={TRANG_THAI_LUONG[l.trang_thai]?.tone ?? "gray"}>{TRANG_THAI_LUONG[l.trang_thai]?.label ?? l.trang_thai}</Badge>;
}

// CHOT 2026-09-03: 1 bang PaginatedTable rieng cho MOI thang trong bang "Da xac nhan" cua tab "Theo
// doi doi tra" (yeu cau nguoi dung: "hiện theo tháng và chia nhỏ bảng") - tach thanh component rieng
// de moi thang co state trang (page) doc lap, khong dung chung 1 bien voi cac thang khac.
function DaXacNhanDoiTraMonthTable({
  thang,
  khuVuc,
  tinh,
  nhomKh,
  idSearch,
  openCase,
}: {
  thang: string;
  khuVuc: string;
  tinh: string;
  nhomKh: string;
  idSearch: string;
  openCase: (id: string, tab?: string) => void;
}) {
  const [page, setPage] = useState(1);
  const dgLoc = useDiaGioiLoc().buildDgLoc(tinh.split("|")) ?? undefined;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["tranh-chap-theo-doi-doi-tra-da-xac-nhan", thang, page, khuVuc, dgLoc, nhomKh, idSearch],
    queryFn: () =>
      api.get<Paged<TheoDoiDoiTraDaXacNhanRow>>(
        `/tranh-chap/theo-doi-doi-tra/da-xac-nhan${buildQuery({ thang, page, pageSize: 10, khu_vuc: khuVuc, dg_loc: dgLoc, nhom_kh: nhomKh, id: idSearch || undefined })}`,
      ),
  });

  const columns: Column<TheoDoiDoiTraDaXacNhanRow>[] = [
    { key: "id", header: "ID", render: (c) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{c.id}</span> },
    {
      key: "khach_hang",
      header: tr("Khách hàng"),
      render: (c) => (
        <>
          {isVipKh(c.nhom_kh) && <VipBadge />}
          {c.khach_hang ?? "—"}
        </>
      ),
    },
    { key: "khu_vuc", header: tr("Khu vực"), render: (c) => shortKhuVuc(c.khu_vuc) },
    { key: "loai_yeu_cau", header: tr("Loại yêu cầu"), render: (c) => <span className="text-xs">{c.loai_yeu_cau ?? "—"}</span> },
    { key: "xac_nhan_luc", header: tr("Xác nhận lúc"), render: (c) => <span className="text-xs">{fmtDateTime(c.theo_doi_doi_tra_xac_nhan_luc)}</span> },
    { key: "xac_nhan_boi", header: tr("Người xác nhận"), render: (c) => <span className="text-xs">{c.theo_doi_doi_tra_xac_nhan_boi ?? "—"}</span> },
    {
      key: "tien_trinh",
      header: tr("Tiến trình"),
      render: (c) => (c.co_tien_trinh ? <Badge tone="teal">{tr("Đã tiếp nhận")}</Badge> : <Badge tone="amber">{tr("Chưa tiếp nhận")}</Badge>),
    },
  ];

  return (
    <div className="mb-6">
      <div className="text-sm font-semibold text-[var(--ink-700)] mb-2">
        {tr("Tháng")} {thang} <span className="text-[var(--ink-400)] font-normal">({data?.total ?? 0} ca)</span>
      </div>
      <PaginatedTable
        columns={columns}
        rows={data?.rows ?? []}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
        page={page}
        pageSize={10}
        total={data?.total ?? 0}
        onPageChange={setPage}
        onRowClick={(r) => openCase(r.id, "tranh-chap")}
        rowKey={(r) => r.id}
        rowClassName={(r) => vipRowClassName(r.nhom_kh)}
        emptyText={tr("Không có ca nào.")}
        storageKey={`tranh-chap-theo-doi-doi-tra-da-xac-nhan-${thang}`}
      />
    </div>
  );
}

export function TranhChapModule({
  openCase,
  headerExtra,
}: {
  openCase: (id: string, tab?: string) => void;
  headerExtra?: HTMLElement | null;
}) {
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
  // "Địa giới cũ / mới" (2026-10-10): moi bo loc Tinh cua module (chon nhieu, "|") -> query param "dg_loc" (lib/diaGioi.ts).
  const diaGioi = useDiaGioiLoc();
  const dgLocOf = (v: string) => diaGioi.buildDgLoc(v.split("|")) ?? undefined;
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

  // CHOT 2026-08-22: badge do "(x)" tren tab "Cho xac nhan AI" - KHONG gate theo "view" (phai hien so
  // ngay ca khi dang o tab khac) nhung van re dung endpoint dem rieng, tan dung idx_case_nghi_ngo_
  // tranh_chap_2 (migration 0096) + cachedReport, khong quet toan bo case_dvbh (xem computeChoXacNhanAiCount
  // o backend/src/routes/tranhChap.ts).
  const { data: choXacNhanAiCountData } = useQuery({
    queryKey: ["tranh-chap-cho-xac-nhan-ai-count"],
    queryFn: () => api.get<{ count: number }>("/tranh-chap/cho-xac-nhan-ai/count"),
  });
  const { data: theoDoiDoiTraCountData } = useQuery({
    queryKey: ["tranh-chap-theo-doi-doi-tra-count"],
    queryFn: () => api.get<{ count: number }>("/tranh-chap/theo-doi-doi-tra/cho-danh-gia/count"),
  });

  // CHOT 2026-08-22: badge "(x)" cho 2 tab "KN đổi máy" va "Cho xu ly" - THEO YEU CAU NGUOI DUNG,
  // KHONG them endpoint/logic backend moi (khac tab "Cho xac nhan AI" o tren) - chi goi lai 2 API SAN
  // CO tu truoc (da co index + cachedReport rieng), tach khoi "enabled: view === ..." de luon fetch du
  // dang o tab nao. "dmStats" doc lai chinh xac cung 1 query voi tab "KN doi may" ben duoi (React Query
  // dung chung cache theo queryKey, khong ton them request khi nguoi dung mo tab do). "choXuLyBadge" goi
  // /cho-xu-ly voi pageSize=1, KHONG truyen khu_vuc/tinh/nhom_kh/thang (bo qua bo loc dang ap dung tren
  // UI) de lay tong so TOAN BO (trong pham vi quyen xem) on dinh, khong nhay theo bo loc nguoi dung dang
  // chinh o tab khac.
  const { data: dmStats } = useQuery({
    queryKey: ["tranh-chap-doi-may-stats"],
    queryFn: () => api.get<TienTrinhStats>(`/tranh-chap/tien-trinh/stats${buildQuery({ phan_loai: DOI_MAY_PHAN_LOAI })}`),
  });
  const { data: choXuLyBadge } = useQuery({
    queryKey: ["tranh-chap-cho-xu-ly-badge"],
    queryFn: () => api.get<{ unfilteredTotal: number }>(`/tranh-chap/cho-xu-ly${buildQuery({ page: 1, pageSize: 1 })}`),
  });

  // Badge tab "Luồng duyệt đổi trả" = so luong dang mo trong pham vi (khong theo bo loc dang chon).
  const { data: luongDoiTraBadge } = useQuery({
    queryKey: ["tranh-chap-luong-doi-tra", "badge"],
    queryFn: () => api.get<{ dangMo: number }>(`/tranh-chap/luong-doi-tra${buildQuery({ page: 1, pageSize: 1 })}`),
    staleTime: 5 * 60 * 1000,
  });
  const [ldPage, setLdPage] = useState(1);
  const [ldKhuVuc, setLdKhuVuc] = useLocalStorageState("filters:tranh-chap-ld-khu-vuc", "");
  const [ldTinh, setLdTinh] = useLocalStorageState("filters:tranh-chap-ld-tinh", "");
  const [ldNhomKh, setLdNhomKh] = useLocalStorageState("filters:tranh-chap-ld-nhom-kh", "");
  const [ldTrangThai, setLdTrangThai] = useLocalStorageState("filters:tranh-chap-ld-trang-thai", "dang_mo");
  const [ldBuoc, setLdBuoc] = useLocalStorageState("filters:tranh-chap-ld-buoc", "");
  const [ldIdSearch, setLdIdSearch] = useState("");
  const { data: ldData, isLoading: ldLoading, isError: ldError, refetch: refetchLd } = useQuery({
    queryKey: ["tranh-chap-luong-doi-tra", ldPage, ldKhuVuc, dgLocOf(ldTinh), ldNhomKh, ldTrangThai, ldBuoc, thangFilter, ldIdSearch],
    queryFn: () =>
      api.get<Paged<LuongDoiTraListRow> & { dangMo: number; error: string | null }>(
        `/tranh-chap/luong-doi-tra${buildQuery({ page: ldPage, pageSize: 20, khu_vuc: ldKhuVuc, dg_loc: dgLocOf(ldTinh), nhom_kh: ldNhomKh, trang_thai: ldTrangThai, buoc: ldBuoc, thang: thangFilter, id: ldIdSearch || undefined })}`,
      ),
    enabled: view === "luong-doi-tra",
  });
  const luongDoiTraColumns: Column<LuongDoiTraListRow>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{r.id}</span> },
    {
      key: "khach_hang",
      header: tr("Khách hàng"),
      render: (r) => (
        <>
          {isVipKh(r.nhom_kh) && <VipBadge />}
          {r.khach_hang ?? "—"}
        </>
      ),
    },
    { key: "khu_vuc", header: tr("Khu vực"), render: (r) => shortKhuVuc(r.khu_vuc) },
    { key: "san_pham", header: tr("Sản phẩm"), render: (r) => <span className="text-xs">{r.san_pham_bao_hanh ?? "—"}</span> },
    {
      key: "trang_thai",
      header: tr("Trạng thái luồng"),
      render: (r) =>
        r.ket_thuc_at ? (
          <Badge tone="gray">{tr("Đã kết thúc")}</Badge>
        ) : (
          <Badge tone={TRANG_THAI_LUONG[r.trang_thai]?.tone ?? "gray"}>{TRANG_THAI_LUONG[r.trang_thai]?.label ?? r.trang_thai}</Badge>
        ),
    },
    { key: "kn_trang_thai", header: tr("Trạng thái KN"), render: (r) => knTrangThaiBadge(r.kn_trang_thai) },
    { key: "de_xuat", header: tr("Đề xuất"), render: (r) => <span className="text-xs">{fmtVn(r.de_xuat_at)}</span> },
    { key: "duyet", header: tr("Duyệt"), render: (r) => <span className="text-xs">{fmtVn(r.duyet_at)}</span> },
    {
      key: "ca_moi",
      header: tr("Ca đổi"),
      render: (r) =>
        r.ca_moi_id ? (
          <span className="text-xs">
            <span className="font-mono font-semibold">{r.ca_moi_id}</span>
            {r.ca_moi_tien_do ? <span className="text-[var(--ink-500)]"> · {r.ca_moi_tien_do}</span> : null}
          </span>
        ) : r.ca_moi_gan && r.ca_moi_gan !== "chua_co" ? (
          <Badge tone={CA_MOI_GAN[r.ca_moi_gan]?.tone ?? "gray"}>{r.ca_moi_gan === "xac_nhan" ? tr("Không có ca mới") : (CA_MOI_GAN[r.ca_moi_gan]?.label ?? r.ca_moi_gan)}</Badge>
        ) : (
          <span className="text-xs text-[var(--ink-400)]">—</span>
        ),
    },
    {
      key: "last_at",
      header: tr("Mail gần nhất"),
      render: (r) => (
        <span className="text-xs">
          {fmtVn(r.last_at)}
          {r.msg_count ? " " + tr("({0} thư)", r.msg_count) : ""}
        </span>
      ),
    },
    {
      key: "ket_thuc",
      header: tr("Kết thúc"),
      render: (r) =>
        r.ket_thuc_at ? (
          <span className="text-xs">
            {fmtVn(r.ket_thuc_at)} · {r.ket_thuc_boi}
          </span>
        ) : (
          <span className="text-xs text-[var(--ink-400)]">—</span>
        ),
    },
  ];

  const viewsWithCount = VIEWS.map((v) => {
    if (v.key === "cho-xac-nhan-ai") return { ...v, count: choXacNhanAiCountData?.count };
    if (v.key === "theo-doi-doi-tra") return { ...v, count: theoDoiDoiTraCountData?.count };
    if (v.key === "luong-doi-tra") return { ...v, count: luongDoiTraBadge?.dangMo };
    if (v.key === "doi-may") return { ...v, count: dmStats?.dangMo };
    if (v.key === "cho-xu-ly") return { ...v, count: choXuLyBadge?.unfilteredTotal };
    return v;
  });

  const { data: aiData, isLoading: aiLoading, isError: aiError, refetch: refetchAi } = useQuery({
    queryKey: ["tranh-chap-cho-xac-nhan-ai", aiPage, aiKhuVuc, dgLocOf(aiTinh), aiNhomKh, thangFilter, aiIdSearch],
    queryFn: () =>
      api.get<Paged<ChoXuLyCase & { thoi_gian_hoan_thanh: string | null; last_ly_do_cham: string | null; so_ngay_cho: number }>>(
        `/tranh-chap/cho-xac-nhan-ai${buildQuery({ page: aiPage, pageSize: 10, khu_vuc: aiKhuVuc, dg_loc: dgLocOf(aiTinh), nhom_kh: aiNhomKh, thang: thangFilter, id: aiIdSearch || undefined })}`,
      ),
    enabled: view === "cho-xac-nhan-ai",
  });

  const xacNhanAi = useMutation({
    mutationFn: ({ id, ketQua }: { id: string; ketQua: "dung" | "khong_phai" }) => api.post(`/tranh-chap/${encodeURIComponent(id)}/xac-nhan-ai`, { ket_qua: ketQua }),
    onSuccess: (_data, variables) => {
      addToast(variables.ketQua === "dung" ? tr("Đã xác nhận: Đúng là tranh chấp — ca sẽ chuyển sang \"Chờ xử lý\".") : tr("Đã xác nhận: Không phải tranh chấp."));
      setConfirmingAiCase(null);
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xac-nhan-ai"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xac-nhan-ai-count"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xu-ly"] });
    },
    onError: (err) => {
      addToast(describeTranhChapError(err, tr("Không thể xác nhận, thử lại sau.")));
      setConfirmingAiCase(null);
    },
  });

  const choXacNhanAiColumns: Column<ChoXuLyRow>[] = [
    { key: "id", header: "ID", render: (c) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{c.id}</span> },
    {
      key: "khach_hang",
      header: tr("Khách hàng"),
      render: (c) => (
        <>
          {isVipKh(c.nhom_kh) && <VipBadge />}
          {c.khach_hang ?? "—"}
        </>
      ),
    },
    { key: "khu_vuc", header: tr("Khu vực"), render: (c) => shortKhuVuc(c.khu_vuc) },
    { key: "hoan_thanh", header: tr("Hoàn thành"), render: (c) => <span className="text-xs">{fmtDateTime(c.thoi_gian_hoan_thanh)}</span> },
    {
      key: "so_ngay_cho",
      header: tr("Số ngày chờ"),
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
              {tr("Đúng là tranh chấp")}</Btn>
            <Btn
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmingAiCase({ id: c.id, ketQua: "khong_phai" });
              }}
            >
              {tr("Không phải tranh chấp")}</Btn>
          </div>
        ) : (
          <span className="text-xs text-[var(--ink-400)] italic">{tr("Không có quyền")}</span>
        ),
    },
  ];

  // ---------- Tab "Theo dõi đổi trả" (theo_doi_doi_tra, CHOT 2026-09-03) ----------
  const [ddPage, setDdPage] = useState(1);
  const [ddKhuVuc, setDdKhuVuc] = useLocalStorageState("filters:tranh-chap-dd-khu-vuc", "");
  const [ddTinh, setDdTinh] = useLocalStorageState("filters:tranh-chap-dd-tinh", "");
  const [ddNhomKh, setDdNhomKh] = useLocalStorageState("filters:tranh-chap-dd-nhom-kh", "");
  const [ddIdSearch, setDdIdSearch] = useState("");
  const [ddSubView, setDdSubView] = useState<"cho-danh-gia" | "da-xac-nhan">("cho-danh-gia");
  const [confirmingDoiTraCase, setConfirmingDoiTraCase] = useState<{ id: string; ketQua: "dung" | "khong_phai" } | null>(null);

  const { data: ddData, isLoading: ddLoading, isError: ddError, refetch: refetchDd } = useQuery({
    queryKey: ["tranh-chap-theo-doi-doi-tra-cho-danh-gia", ddPage, ddKhuVuc, dgLocOf(ddTinh), ddNhomKh, ddIdSearch],
    queryFn: () =>
      api.get<Paged<TheoDoiDoiTraRow>>(
        `/tranh-chap/theo-doi-doi-tra/cho-danh-gia${buildQuery({ page: ddPage, pageSize: 10, khu_vuc: ddKhuVuc, dg_loc: dgLocOf(ddTinh), nhom_kh: ddNhomKh, id: ddIdSearch || undefined })}`,
      ),
    enabled: view === "theo-doi-doi-tra" && ddSubView === "cho-danh-gia",
  });

  const { data: ddThangList } = useQuery({
    queryKey: ["tranh-chap-theo-doi-doi-tra-thang-list"],
    queryFn: () => api.get<{ rows: string[] }>("/tranh-chap/theo-doi-doi-tra/da-xac-nhan/thang-list"),
    enabled: view === "theo-doi-doi-tra" && ddSubView === "da-xac-nhan",
  });

  const xacNhanDoiTra = useMutation({
    mutationFn: ({ id, ketQua }: { id: string; ketQua: "dung" | "khong_phai" }) => api.post(`/tranh-chap/${encodeURIComponent(id)}/xac-nhan-doi-tra`, { ket_qua: ketQua }),
    onSuccess: (_data, variables) => {
      addToast(variables.ketQua === "dung" ? tr("Đã xác nhận: Đúng là đổi trả — ca sẽ chuyển sang \"Chờ xử lý\".") : tr("Đã bỏ qua ca này."));
      setConfirmingDoiTraCase(null);
      qc.invalidateQueries({ queryKey: ["tranh-chap-theo-doi-doi-tra-cho-danh-gia"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-theo-doi-doi-tra-count"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-theo-doi-doi-tra-thang-list"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-theo-doi-doi-tra-da-xac-nhan"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xu-ly"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xu-ly-badge"] });
    },
    onError: (err) => {
      addToast(describeTranhChapError(err, tr("Không thể xác nhận, thử lại sau.")));
      setConfirmingDoiTraCase(null);
    },
  });

  const theoDoiDoiTraColumns: Column<TheoDoiDoiTraRow>[] = [
    { key: "id", header: "ID", render: (c) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{c.id}</span> },
    {
      key: "khach_hang",
      header: tr("Khách hàng"),
      render: (c) => (
        <>
          {isVipKh(c.nhom_kh) && <VipBadge />}
          {c.khach_hang ?? "—"}
        </>
      ),
    },
    { key: "khu_vuc", header: tr("Khu vực"), render: (c) => shortKhuVuc(c.khu_vuc) },
    { key: "loai_yeu_cau", header: tr("Loại yêu cầu"), render: (c) => <span className="text-xs">{c.loai_yeu_cau ?? "—"}</span> },
    { key: "luu_y_loi_linh_kien", header: tr("Lưu ý lỗi linh kiện"), render: (c) => <span className="text-xs">{c.luu_y_loi_linh_kien ?? "—"}</span> },
    { key: "hoan_thanh", header: tr("Hoàn thành"), render: (c) => <span className="text-xs">{fmtDateTime(c.thoi_gian_hoan_thanh)}</span> },
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
                setConfirmingDoiTraCase({ id: c.id, ketQua: "dung" });
              }}
            >
              {tr("Xác nhận đổi trả")}</Btn>
            <Btn
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmingDoiTraCase({ id: c.id, ketQua: "khong_phai" });
              }}
            >
              {tr("Bỏ qua")}</Btn>
          </div>
        ) : (
          <span className="text-xs text-[var(--ink-400)] italic">{tr("Không có quyền")}</span>
        ),
    },
  ];

  const [tiepNhanCase, setTiepNhanCase] = useState<ChoXuLyCase | null>(null);

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const res = await api.get<Paged<ChoXuLyCase & { thoi_gian_hoan_thanh: string | null; last_ly_do_cham: string | null; so_ngay_cho: number }>>(
        `/tranh-chap/cho-xu-ly${buildQuery({ page: 1, pageSize: 1000, khu_vuc: khuVucFilter, dg_loc: dgLocOf(tinhFilter), nhom_kh: nhomKhFilter, thang: thangFilter, min_days: minDaysFilter !== null ? String(minDaysFilter) : "", id: idSearch || undefined })}`
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
      addToast(tr("Xuất Excel thành công!"));
    } catch (err) {
      addToast(tr("Xuất Excel thất bại:") + " " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsExporting(false);
    }
  };

  const { data: khuVucOptions } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ khuVuc: string[]; hang: string[]; tinh: (string | null)[]; nhomKh: (string | null)[] }>("/dashboard/filters"),
  });
  const tinhSelectOptions = diaGioi.tinhOptions;
  useOnDiaGioiModeChange(() => {
    setTinhFilter("");
    setTtTinh("");
    setAiTinh("");
    setLdTinh("");
    setDdTinh("");
    setDmTinh("");
  });
  const nhomKhSelectOptions = (khuVucOptions?.nhomKh.filter((t): t is string => !!t) ?? []).sort((a, b) => a.localeCompare(b, "vi"));
  const { data: phanLoaiOptions } = useQuery({
    queryKey: ["settings-phan-loai-tranh-chap"],
    queryFn: () => api.get<{ rows: PhanLoaiTranhChapRow[] }>("/settings/phan-loai-tranh-chap"),
  });
  const { data: ketQuaOptions } = useQuery({
    queryKey: ["settings-ket-qua-xu-ly-tranh-chap"],
    queryFn: () => api.get<{ rows: KetQuaXuLyTranhChapRow[] }>("/settings/ket-qua-xu-ly-tranh-chap"),
  });
  const { data: lyDoTonOptions } = useQuery({
    queryKey: ["settings-ly-do-ton-tranh-chap"],
    queryFn: () => api.get<{ rows: LyDoTonTranhChapRow[] }>("/settings/ly-do-ton-tranh-chap"),
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
    { value: "", label: tr("Tất cả khu vực") },
    { value: QLDVBH_FILTER_VALUE, label: tr("Tất cả DVBH (MB/MN...)") },
    ...(khuVucOptions?.khuVuc.map((k) => ({ value: k, label: k })) ?? []),
  ];

  const monthSelectOptions = [
    { value: TRANH_CHAP_CON_TON_FILTER_VALUE, label: tr("Các ca tranh chấp, KN còn tồn") },
    ...(monthData?.months.map((m) => ({ value: m, label: m })) ?? []),
  ];

  // "thangFilter" dung chung nhieu tab (xem chu thich o "monthControl" ben duoi) - doi thang phai
  // reset ve trang 1 cho MOI tab dang doc truc tiep theo thang (Cho xu ly + Cho xac nhan AI), khong
  // chi tab dang mo, vi nguoi dung co the doi thang roi chuyen tab ma khong load lai trang 1.
  const isConTonFilter = thangFilter === TRANH_CHAP_CON_TON_FILTER_VALUE;
  // "bao-cao-khu-vuc" gom ca ca DA xu ly nen khi chon "con ton" se HOP them thang moi nhat (xem backend
  // TRANH_CHAP_CON_TON_FILTER_VALUE); "tai-khoan-ton" von da CHI gom tien trinh dang mo nen chi can bo
  // han che thang, khong can hop them gi - 2 the bao cao dung 2 dong nhan khac nhau cho dung ban chat.
  const thangFilterLabelBaoCao = isConTonFilter ? tr("Tháng mới nhất + các ca còn tồn") : thangFilter ? tr("Tháng {0}", thangFilter) : tr("Tất cả thời gian");
  const thangFilterLabelTaiKhoan = isConTonFilter ? tr("Các ca còn tồn (mọi thời gian)") : thangFilter ? tr("Tháng {0}", thangFilter) : tr("Tất cả thời gian");

  const handleThangFilterChange = (v: string) => {
    setThangFilter(v);
    setPage(1);
    setAiPage(1);
    setLdPage(1);
  };

  // ---------- Tab "Cho xu ly" ----------
  const [minDaysFilter, setMinDaysFilter] = useState<number | null>(null);
  const [idSearch, setIdSearch] = useState("");

  const { data: choXuLy, isLoading: choXuLyLoading, isError: choXuLyError, refetch: refetchChoXuLy } = useQuery({
    queryKey: ["tranh-chap-cho-xu-ly", page, khuVucFilter, dgLocOf(tinhFilter), nhomKhFilter, thangFilter, minDaysFilter, idSearch],
    queryFn: () =>
      api.get<Paged<ChoXuLyCase & { thoi_gian_hoan_thanh: string | null; last_ly_do_cham: string | null; so_ngay_cho: number }> & {
        choTuNgay3: number;
        choTuNgay7: number;
        choTuNgay10: number;
        choTuNgay14: number;
        unfilteredTotal: number;
      }>(
        `/tranh-chap/cho-xu-ly${buildQuery({ page, pageSize: 10, khu_vuc: khuVucFilter, dg_loc: dgLocOf(tinhFilter), nhom_kh: nhomKhFilter, thang: thangFilter, min_days: minDaysFilter !== null ? String(minDaysFilter) : "", id: idSearch || undefined })}`,
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
      ly_do_ton_tranh_chap?: string;
    }) => api.post(`/tranh-chap/${encodeURIComponent(tiepNhanCase?.id ?? "")}/tiep-nhan`, body),
    onSuccess: () => {
      addToast(tr("Đã tiếp nhận xử lý tranh chấp"));
      setTiepNhanCase(null);
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xu-ly"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh-stats"] });
      qc.invalidateQueries({ queryKey: ["notifications-count"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xac-nhan-ai"] });
      qc.invalidateQueries({ queryKey: ["tranh-chap-cho-xac-nhan-ai-count"] });
      setView("tien-trinh");
    },
    onError: (err) => addToast(describeTranhChapError(err, tr("Không thể tiếp nhận, thử lại sau."))),
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
      header: tr("Khách hàng"),
      render: (c) => (
        <>
          {isVipKh(c.nhom_kh) && <VipBadge />}
          {c.khach_hang ?? "—"}
        </>
      ),
    },
    { key: "khu_vuc", header: tr("Khu vực"), render: (c) => shortKhuVuc(c.khu_vuc) },
    {
      key: "ly_do",
      header: tr("Lý do quá hạn"),
      render: (c) =>
        c.is_gqkn_day_lai_gs ? (
          <Badge tone="amber">{tr("GQKN đẩy lại GS")}</Badge>
        ) : c.last_ly_do_cham ? (
          <Badge tone="coral">{c.last_ly_do_cham}</Badge>
        ) : (
          <span className="text-[var(--ink-400)] text-xs italic">—</span>
        ),
    },
    { key: "hoan_thanh", header: tr("Hoàn thành"), render: (c) => <span className="text-xs">{fmtDateTime(c.thoi_gian_hoan_thanh)}</span> },
    {
      key: "so_ngay_cho",
      header: tr("Số ngày chờ"),
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
            {tr("Xem tiến trình")}</Btn>
        ) : !user || canWriteTranhChap(user, c.khu_vuc) ? (
          <Btn
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setTiepNhanCase(c);
            }}
          >
            {tr("Tiếp nhận xử lý")}</Btn>
        ) : (
          <span className="text-xs text-[var(--ink-400)] italic">{tr("Không có quyền")}</span>
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
    queryKey: ["tranh-chap-tien-trinh", ttPage, ttKhuVuc, dgLocOf(ttTinh), ttNhomKh, ttPhanLoai, ttMucDo, ttTrangThai, ttHan, ttCuaToi, ttNguoiDangXuLy, ttLoaiDangXuLy, ttIdSearch],
    queryFn: () =>
      api.get<Paged<TienTrinhRow>>(
        `/tranh-chap/tien-trinh${buildQuery({
          page: ttPage,
          pageSize: 10,
          khu_vuc: ttKhuVuc,
          dg_loc: dgLocOf(ttTinh),
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
    { key: "id", header: tr("Tiến trình"), render: (r) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{r.id}</span> },
    { key: "case_id", header: tr("Ca sự vụ"), render: (r) => <span className="font-mono text-xs text-[var(--ocean-600)]">{r.case_id}</span> },
    {
      key: "khach_hang",
      header: tr("Khách hàng"),
      render: (r) => (
        <>
          {isVipKh(r.nhom_kh) && <VipBadge />}
          {r.khach_hang ?? "—"}
        </>
      ),
    },
    { key: "khu_vuc", header: tr("Khu vực"), render: (r) => shortKhuVuc(r.khu_vuc) },
    {
      key: "giam_sat_phu_trach",
      header: tr("Giám sát phụ trách"),
      render: (r) => (
        <>
          {r.giam_sat_phu_trach.length ? (
            <span className="text-xs">{r.giam_sat_phu_trach.map((g) => g.ten ?? g.email).join(", ")}</span>
          ) : (
            <span className="text-[var(--ink-400)] text-xs italic">—</span>
          )}
          {r.trang_thai_xu_ly === "Giam sat chua xu ly" && r.gs_tung_xu_ly.length > 0 && (
            <div className="text-[11px] text-[var(--amber-600)] mt-0.5">
              {tr("Từng xử lý:")} {r.gs_tung_xu_ly.map((g) => g.ten ?? g.email).join(", ")}
            </div>
          )}
        </>
      ),
    },
    { key: "phan_loai", header: tr("Phân loại"), render: (r) => <Badge tone={phanLoaiTone(r.phan_loai_tranh_chap)}>{r.phan_loai_tranh_chap}</Badge> },
    { key: "muc_do", header: tr("Mức độ"), render: (r) => <Badge tone={MUC_DO_TONE[r.muc_do] ?? "gray"}>{MUC_DO_LABELS[r.muc_do] ?? r.muc_do}</Badge> },
    {
      key: "trang_thai",
      header: tr("Trạng thái"),
      render: (r) => (r.trang_thai_xu_ly ? <Badge tone={TRANG_THAI_TONE[r.trang_thai_xu_ly] ?? "gray"}>{TRANG_THAI_LABELS[r.trang_thai_xu_ly] ?? r.trang_thai_xu_ly}</Badge> : "—"),
    },
    { key: "luong_doi_tra", header: tr("Luồng đổi trả"), render: (r) => luongDoiTraStatusBadge(r.luong_doi_tra) },
    { key: "nguoi_xu_ly", header: tr("Người xử lý gần nhất"), render: (r) => (r.nguoi_xu_ly ? formatPersonDisplay(r.nguoi_xu_ly, personDir) : "—") },
    {
      key: "ly_do_ton_tranh_chap_gan_nhat",
      header: tr("Lý do tồn tranh chấp gần nhất"),
      render: (r) => (r.ly_do_ton_tranh_chap_gan_nhat ? <span className="text-xs">{r.ly_do_ton_tranh_chap_gan_nhat}</span> : <span className="text-[var(--ink-400)] text-xs italic">—</span>),
    },
    {
      key: "dang_cho_nguoi_xu_ly",
      header: tr("Đang chờ ai?"),
      render: (r) => {
        if (!r.dang_cho_nguoi_xu_ly) return <span className="text-[var(--ink-400)] text-xs italic">—</span>;
        const u = handlingUsers.find((user) => user.email === r.dang_cho_nguoi_xu_ly);
        return <span className="text-xs font-semibold text-[var(--ocean-600)]">{u ? u.ten : r.dang_cho_nguoi_xu_ly}</span>;
      }
    },
    {
      key: "han",
      header: tr("Ngày dự kiến xong"),
      render: (r) => {
        if (!r.thoi_gian_du_kien_xong) return <span className="text-[var(--ink-400)] text-xs italic">—</span>;
        const isDong = r.trang_thai_xu_ly ? TRANG_THAI_DONG.includes(r.trang_thai_xu_ly) : false;
        const quaHan = !isDong && r.thoi_gian_du_kien_xong < new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
        return <span className={`text-xs font-semibold ${quaHan ? "text-[var(--coral-500)]" : ""}`}>{r.thoi_gian_du_kien_xong}</span>;
      },
    },
    { key: "so_ngay_ton", header: tr("Số ngày tồn"), render: (r) => <span className="font-mono">{r.so_ngay_ton}</span> },
    {
      key: "canh_bao_cap_nhat",
      header: tr("Cảnh báo"),
      render: (r) => {
        const isDong = r.trang_thai_xu_ly ? TRANG_THAI_DONG.includes(r.trang_thai_xu_ly) : false;
        if (isDong || !r.log_created_at) return <span className="text-[var(--ink-400)] text-xs italic">—</span>;
        // "log_created_at" la cot audit RAW UTC (khac cac cot VN-local con lai) - parse THANG nhu UTC
        // ("Z"), KHONG dung parseDbDateTime() (ham do gia dinh +07:00) de tranh lech ~7h (xem chu thich
        // trong tranhChapShared.ts).
        const logCreatedAtUtc = new Date(r.log_created_at.replace(" ", "T") + "Z");
        const soNgayQuaHanCapNhat = Math.floor((Date.now() - logCreatedAtUtc.getTime()) / 86400000);
        if (soNgayQuaHanCapNhat < 3) return <span className="text-[var(--ink-400)] text-xs italic">—</span>;
        const nguoiPhuTrach = r.dang_cho_nguoi_xu_ly || r.nguoi_xu_ly;
        return (
          <div>
            <Badge tone="coral">{tr("⚠ Chờ cập nhật")} {soNgayQuaHanCapNhat}d</Badge>
            {nguoiPhuTrach && <div className="text-[10px] text-[var(--ink-400)] mt-0.5">{formatPersonDisplay(nguoiPhuTrach, personDir)}</div>}
          </div>
        );
      },
    },
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

  const { data: dmData, isLoading: dmLoading, isError: dmError, refetch: refetchDm } = useQuery({
    queryKey: ["tranh-chap-doi-may-tien-trinh", dmPage, dmKhuVuc, dgLocOf(dmTinh), dmNhomKh, dmTrangThai, dmHan, dmIdSearch, dmNguoiDangXuLy, dmLoaiDangXuLy],
    queryFn: () =>
      api.get<Paged<TienTrinhRow>>(
        `/tranh-chap/tien-trinh${buildQuery({
          page: dmPage,
          pageSize: 10,
          khu_vuc: dmKhuVuc,
          dg_loc: dgLocOf(dmTinh),
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

  // SUA BUG (phan hoi nguoi dung 2026-09-05): "thangFilter" la state DUNG CHUNG cho nhieu tab (Cho
  // xu ly/Cho xac nhan AI/2 the bao cao) nhung truoc day chi co 1 o chon o filter bar rieng cua tab
  // "Cho xu ly" - sang tab "Cho xac nhan AI" van bi loc theo thang do (VD dang chon thang 8) ma
  // KHONG co o chon nao o tab do de nguoi dung biet/doi, tuong nham la danh sach trong do loi. Chuyen
  // o chon nay len header dung chung ca module (portal qua headerExtra, giong BacklogModule) de ro
  // rang day la bo loc TONG cho ca "Tranh chap, KN", khong rieng 1 tab nao.
  const monthControl = (
    <Select value={thangFilter} onChange={handleThangFilterChange} options={monthSelectOptions} />
  );

  return (
    <div className="anim-in">
      {headerExtra ? createPortal(monthControl, headerExtra) : <div className="flex items-center gap-2 flex-wrap mb-2">{monthControl}</div>}
      <Tabs active={view} onChange={setView} tabs={viewsWithCount} />

      {view === "cho-xu-ly" ? (
        <div className="mt-4">
          <div className="text-sm text-[var(--ink-600)] mb-4">
            {tr("Ca có")} <b>{tr("\"Nghi ngờ tranh chấp\"")}</b>  {tr("(điền bởi CRM khi đóng ca) hoặc")} <b>{tr("đã xác nhận thuộc diện \"Theo dõi đổi trả\"")}</b>{tr(", nhưng")} <b>{tr("chưa từng tạo tiến trình xử lý")}</b>{tr(". Sắp theo số ngày chờ giảm dần — ưu tiên xử lý ca chờ lâu nhất.")}</div>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <KhuVucFilterControl value={khuVucFilter} onChange={(v) => { setKhuVucFilter(v); setPage(1); }} options={khuVucSelectOptions} myAreas={myAreas} />
            <MultiSelectFilter label={NHAN_CAP_1[diaGioi.mode]} value={tinhFilter} onChange={(v) => { setTinhFilter(v); setPage(1); }} options={tinhSelectOptions} />
            <MultiSelectFilter label={tr("Nhóm KH")} value={nhomKhFilter} onChange={(v) => { setNhomKhFilter(v); setPage(1); }} options={nhomKhSelectOptions} />
            <IdSerialSearchInput
              value={idSearch}
              onChange={(v) => {
                setIdSearch(v);
                setPage(1);
              }}
            />
            {canImportTranhChap && (
              <Btn variant="ghost" size="sm" onClick={() => setShowImport((v) => !v)}>
                {showImport ? tr("Đóng import") : tr("📥 Import tranh chấp theo ID")}
              </Btn>
            )}
            <Btn variant="subtle" size="sm" onClick={handleExport} disabled={isExporting} className={canImportTranhChap ? "" : "ml-auto"}>
              {isExporting ? tr("📥 Đang tải...") : tr("📥 Tải danh sách chi tiết")}
            </Btn>
          </div>
          {/* CHOT 2026-08-12: import hang loat tranh chap theo ID - chi hien voi tai khoan duoc cap
              quyen (canImportTranhChap, xem migration 0052) hoac Admin, an mac dinh sau nut bat/tat
              (showImport) de khong choan man hinh voi da so nguoi dung khong dung tinh nang nay. */}
          {canImportTranhChap && showImport && (
            <ImportUploader<TranhChapImportSummary>
              description={
                <>
                  {tr("Nhập hàng loạt ca vào hàng đợi tranh chấp từ file Excel/CSV (3 cột")} <b className="font-mono">id</b>, <b className="font-mono">phan_loai_tranh_chap</b>,{" "}
                  <b className="font-mono">muc_do</b>{tr("). Mỗi ca tạo 1 tiến trình mới ở trạng thái \"Giám sát chưa xử lý\" — ca đã có tiến trình đang mở sẽ bị bỏ qua.")}</>
              }
              templateUrl="/api/tranh-chap/import/template"
              previewUrl="/tranh-chap/import/preview"
              commitUrl="/tranh-chap/import/commit"
              buildBody={(rows) => ({ rows })}
              renderSummary={(s) => (
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <StatCard label={tr("Sẵn sàng tạo tiến trình")} value={s.thanhCong} tone="teal" />
                  <StatCard label={tr("Bỏ qua")} value={s.boQua} tone={s.boQua > 0 ? "amber" : "gray"} />
                </div>
              )}
              getErrors={(s) => s.errors}
              successMessage={(s) => tr("Import thành công: {0} tiến trình tranh chấp mới", s.thanhCong)}
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
              label={tr("Tổng ca chờ xử lý")}
              value={choXuLy?.unfilteredTotal ?? choXuLy?.total ?? 0}
              tone="ocean"
              active={minDaysFilter === null}
              onClick={() => {
                setMinDaysFilter(null);
                setPage(1);
              }}
            />
            <StatCard
              label={tr("Chờ ≥3 ngày")}
              value={choXuLy?.choTuNgay3 ?? 0}
              tone="amber"
              active={minDaysFilter === 3}
              onClick={() => {
                setMinDaysFilter(3);
                setPage(1);
              }}
            />
            <StatCard
              label={tr("Chờ ≥7 ngày")}
              value={choXuLy?.choTuNgay7 ?? 0}
              tone="coral"
              active={minDaysFilter === 7}
              onClick={() => {
                setMinDaysFilter(7);
                setPage(1);
              }}
            />
            <StatCard
              label={tr("Chờ ≥10 ngày")}
              value={choXuLy?.choTuNgay10 ?? 0}
              tone="coral"
              active={minDaysFilter === 10}
              onClick={() => {
                setMinDaysFilter(10);
                setPage(1);
              }}
            />
            <StatCard
              label={tr("Chờ ≥14 ngày")}
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
                <div className="font-display font-bold text-sm">{tr("Báo cáo tranh chấp, khiếu nại theo khu vực")}</div>
                <div className="text-xs text-[var(--ink-400)] mt-0.5">{thangFilterLabelBaoCao}</div>
              </div>
              {reportLoading ? (
                <div className="text-center py-4 text-xs text-[var(--ink-400)]">{tr("Đang tải báo cáo...")}</div>
              ) : !reportData?.rows?.length ? (
                <div className="text-center py-4 text-xs text-[var(--ink-400)] italic">{tr("Không có dữ liệu báo cáo.")}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="dense w-full text-sm">
                    <thead>
                      <tr className="text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                        <th className="py-2 px-2 text-left">{tr("Khu vực")}</th>
                        <th className="py-2 px-2 text-center">{tr("Nghi ngờ tranh chấp")}</th>
                        <th className="py-2 px-2 text-center">{tr("KN phát sinh ngoài")}</th>
                        <th className="py-2 px-2 text-center text-[var(--coral-500)] font-bold">{tr("Chưa xử lý")}</th>
                        <th className="py-2 px-2 text-center text-[var(--amber-600)]">{tr("GQKN đẩy lại GS")}</th>
                        <th className="py-2 px-2 text-center text-[var(--ocean-600)] font-bold">{tr("Đã xử lý")}</th>
                        <th className="py-2 px-2 text-center">{tr("GS đã XL")}</th>
                        <th className="py-2 px-2 text-center">{tr("GS đang XL")}</th>
                        <th className="py-2 px-2 text-center">{tr("GS kết thúc")}</th>
                        <th className="py-2 px-2 text-center">{tr("Chuyển QGKN")}</th>
                        <th className="py-2 px-2 text-center">{tr("QGKN đang XL")}</th>
                        <th className="py-2 px-2 text-center">{tr("QGKN đã đóng")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-[var(--line)] bg-slate-50 font-bold">
                        <td className="py-2 px-2 text-left">{tr("Tổng cộng")}</td>
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
                          <td className="py-2 px-2 font-semibold text-left" style={cellStyle}>{r.khu_vuc ? shortKhuVuc(r.khu_vuc) : tr("Chưa rõ")}</td>
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
                <div className="font-display font-bold text-sm">{tr("Thống kê tồn đọng theo nhân sự")}</div>
                <div className="text-xs text-[var(--ink-400)] mt-0.5">{thangFilterLabelTaiKhoan}</div>
              </div>
              {taiKhoanTonLoading ? (
                <div className="text-center py-4 text-xs text-[var(--ink-400)]">{tr("Đang tải thống kê...")}</div>
              ) : !taiKhoanTonRows.length ? (
                <div className="text-center py-4 text-xs text-[var(--ink-400)] italic">{tr("Không có ca tồn theo nhân sự.")}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="dense w-full text-sm">
                    <thead>
                      <tr className="text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                        <th className="py-2 px-2 text-left">{tr("Nhân sự")}</th>
                        <th className="py-2 px-2 text-center text-[var(--coral-500)] font-bold">{tr("Xử lý chưa xong")}</th>
                        <th className="py-2 px-2 text-center text-[var(--ocean-600)] font-bold">{tr("Được nhắc tên xử lý")}</th>
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
            emptyText={tr("Không có ca nào đang chờ xử lý tranh chấp.")}
            storageKey="tranh-chap-cho-xu-ly"
          />
        </div>
      ) : view === "doi-may" ? (
        <div className="mt-4">
          <div className="text-sm text-[var(--ink-600)] mb-4">
            {tr("Tất cả tiến trình tranh chấp có phân loại")} <b>"{DOI_MAY_PHAN_LOAI}"</b>  {tr("— nhóm rủi ro cao cần theo dõi sát (chi phí đổi máy, ảnh hưởng tồn kho).")}</div>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <KhuVucFilterControl value={dmKhuVuc} onChange={(v) => { setDmKhuVuc(v); setDmPage(1); }} options={khuVucSelectOptions} myAreas={myAreas} />
            <MultiSelectFilter label={NHAN_CAP_1[diaGioi.mode]} value={dmTinh} onChange={(v) => { setDmTinh(v); setDmPage(1); }} options={tinhSelectOptions} />
            <MultiSelectFilter label={tr("Nhóm KH")} value={dmNhomKh} onChange={(v) => { setDmNhomKh(v); setDmPage(1); }} options={nhomKhSelectOptions} />
            <IdSerialSearchInput value={dmIdSearch} onChange={(v) => { setDmIdSearch(v); setDmPage(1); }} />
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <StatCard label={tr("Đang mở")} value={dmStats?.dangMo ?? 0} tone="ocean" active={dmTrangThai === "" && dmHan === ""} onClick={() => resetDmFilterTo({})} />
            <StatCard
              label={tr("Giám sát chưa xử lý")}
              value={dmStats?.giamSatChuaXuLy ?? 0}
              tone="gray"
              active={dmTrangThai === "Giam sat chua xu ly"}
              onClick={() => resetDmFilterTo({ trangThai: "Giam sat chua xu ly" })}
            />
            <StatCard
              label={tr("Sắp đến hạn (≤1 ngày)")}
              value={dmStats?.sapDenHan ?? 0}
              tone="amber"
              active={dmHan === "sap-den-han"}
              onClick={() => resetDmFilterTo({ han: "sap-den-han" })}
            />
            <StatCard label={tr("Quá hạn chưa đóng")} value={dmStats?.quaHan ?? 0} tone="coral" active={dmHan === "qua-han"} onClick={() => resetDmFilterTo({ han: "qua-han" })} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card className="p-4">
              <div className="mb-3">
                <div className="font-display font-bold text-sm">{tr("Đòi đổi máy theo khu vực")}</div>
              </div>
              {dmKhuVucReportLoading ? (
                <div className="text-center py-4 text-xs text-[var(--ink-400)]">{tr("Đang tải báo cáo...")}</div>
              ) : !dmKhuVucReport?.rows?.length ? (
                <div className="text-center py-4 text-xs text-[var(--ink-400)] italic">{tr("Không có dữ liệu báo cáo.")}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="dense w-full text-sm">
                    <thead>
                      <tr className="text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                        <th className="py-2 px-2 text-left">{tr("Khu vực")}</th>
                        <th className="py-2 px-2 text-center text-[var(--ocean-600)] font-bold">{tr("Đang mở")}</th>
                        <th className="py-2 px-2 text-center text-[var(--coral-500)] font-bold">{tr("Quá hạn")}</th>
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
                            <td className="py-2 px-2 font-semibold text-left" style={cellStyle}>{r.khu_vuc ? shortKhuVuc(r.khu_vuc) : tr("Chưa rõ")}</td>
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
                <div className="font-display font-bold text-sm">{tr("Tồn đọng theo nhân sự")}</div>
              </div>
              {dmTaiKhoanTonLoading ? (
                <div className="text-center py-4 text-xs text-[var(--ink-400)]">{tr("Đang tải thống kê...")}</div>
              ) : !dmTaiKhoanTonRows.length ? (
                <div className="text-center py-4 text-xs text-[var(--ink-400)] italic">{tr("Không có ca tồn theo nhân sự.")}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="dense w-full text-sm">
                    <thead>
                      <tr className="text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                        <th className="py-2 px-2 text-left">{tr("Nhân sự")}</th>
                        <th className="py-2 px-2 text-center text-[var(--coral-500)] font-bold">{tr("Xử lý chưa xong")}</th>
                        <th className="py-2 px-2 text-center text-[var(--ocean-600)] font-bold">{tr("Được nhắc tên xử lý")}</th>
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
            emptyText={tr("Không có tiến trình 'đòi đổi máy' nào khớp bộ lọc.")}
            storageKey="tranh-chap-doi-may"
          />
        </div>
      ) : view === "cho-xac-nhan-ai" ? (
        <div className="mt-4">
          <div className="text-sm text-[var(--ink-600)] mb-4">
            Ca do <b>{tr("AI phát hiện")}</b>  {tr("có khả năng là tranh chấp (")}<code className="font-mono text-xs">nghi_ngo_tranh_chap = 2</code>{tr(") nhưng")} <b>{tr("chưa được con người xác nhận")}</b>{tr(". Bấm")}{" "}
            <b>{tr("\"Đúng là tranh chấp\"")}</b>  {tr("để chuyển ca sang danh sách \"Chờ xử lý\" như bình thường, hoặc")} <b>{tr("\"Không phải tranh chấp\"")}</b>  {tr("để loại bỏ vĩnh viễn (ca sẽ không hiện lại ở đây kể cả khi AI phát hiện lại).")}</div>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <KhuVucFilterControl value={aiKhuVuc} onChange={(v) => { setAiKhuVuc(v); setAiPage(1); }} options={khuVucSelectOptions} myAreas={myAreas} />
            <MultiSelectFilter label={NHAN_CAP_1[diaGioi.mode]} value={aiTinh} onChange={(v) => { setAiTinh(v); setAiPage(1); }} options={tinhSelectOptions} />
            <MultiSelectFilter label={tr("Nhóm KH")} value={aiNhomKh} onChange={(v) => { setAiNhomKh(v); setAiPage(1); }} options={nhomKhSelectOptions} />
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
            emptyText={tr("Không có ca nào đang chờ xác nhận AI phát hiện.")}
            storageKey="tranh-chap-cho-xac-nhan-ai"
          />
          <Modal
            open={!!confirmingAiCase}
            onClose={() => setConfirmingAiCase(null)}
            title={confirmingAiCase?.ketQua === "dung" ? tr("Xác nhận: Đúng là tranh chấp?") : tr("Xác nhận: Không phải tranh chấp?")}
            width="max-w-md"
          >
            {confirmingAiCase && (
              <div className="space-y-4">
                <div className="text-sm text-[var(--ink-700)]">
                  {confirmingAiCase.ketQua === "dung"
                    ? tr("Ca {0} sẽ được xác nhận là tranh chấp thật và chuyển sang danh sách \"Chờ xử lý\".", confirmingAiCase.id)
                    : tr("Ca {0} sẽ bị loại vĩnh viễn khỏi danh sách chờ xác nhận AI — không thể hoàn tác, kể cả khi AI phát hiện lại sau này.", confirmingAiCase.id)}
                </div>
                <div className="flex justify-end gap-2">
                  <Btn variant="ghost" onClick={() => setConfirmingAiCase(null)}>
                    {tr("Hủy")}</Btn>
                  <Btn
                    variant={confirmingAiCase.ketQua === "dung" ? "success" : "danger"}
                    disabled={xacNhanAi.isPending}
                    onClick={() => xacNhanAi.mutate(confirmingAiCase)}
                  >
                    {xacNhanAi.isPending ? tr("Đang lưu…") : confirmingAiCase.ketQua === "dung" ? tr("Đúng là tranh chấp") : tr("Không phải tranh chấp")}
                  </Btn>
                </div>
              </div>
            )}
          </Modal>
        </div>
      ) : view === "theo-doi-doi-tra" ? (
        <div className="mt-4">
          <div className="text-sm text-[var(--ink-600)] mb-4">
            {tr("Ca có")} <b>{tr("\"Loại yêu cầu\"")}</b>  {tr("và")} <b>{tr("\"Lưu ý lỗi linh kiện\"")}</b>  {tr("khớp danh mục đổi trả/đổi máy trong Cài đặt (tự động tính khi import). Bấm")} <b>{tr("\"Xác nhận đổi trả\"")}</b>  {tr("để chuyển ca sang")} <b>{tr("\"Chờ xử lý\"")}</b>  {tr("xử lý như 1 khiếu nại bình thường, hoặc")} <b>{tr("\"Bỏ qua\"")}</b>  {tr("để loại bỏ vĩnh viễn.")}</div>
          <div className="flex items-center gap-2 mb-4">
            <Btn size="sm" variant={ddSubView === "cho-danh-gia" ? "primary" : "ghost"} onClick={() => setDdSubView("cho-danh-gia")}>
              {tr("Chưa đánh giá")} {theoDoiDoiTraCountData?.count !== undefined ? `(${theoDoiDoiTraCountData.count})` : ""}
            </Btn>
            <Btn size="sm" variant={ddSubView === "da-xac-nhan" ? "primary" : "ghost"} onClick={() => setDdSubView("da-xac-nhan")}>
              {tr("Đã xác nhận")}</Btn>
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <KhuVucFilterControl value={ddKhuVuc} onChange={(v) => { setDdKhuVuc(v); setDdPage(1); }} options={khuVucSelectOptions} myAreas={myAreas} />
            <MultiSelectFilter label={NHAN_CAP_1[diaGioi.mode]} value={ddTinh} onChange={(v) => { setDdTinh(v); setDdPage(1); }} options={tinhSelectOptions} />
            <MultiSelectFilter label={tr("Nhóm KH")} value={ddNhomKh} onChange={(v) => { setDdNhomKh(v); setDdPage(1); }} options={nhomKhSelectOptions} />
            <IdSerialSearchInput
              value={ddIdSearch}
              onChange={(v) => {
                setDdIdSearch(v);
                setDdPage(1);
              }}
            />
          </div>
          {ddSubView === "cho-danh-gia" ? (
            <>
              <PaginatedTable
                columns={theoDoiDoiTraColumns}
                rows={ddData?.rows ?? []}
                isLoading={ddLoading}
                isError={ddError}
                onRetry={refetchDd}
                page={ddPage}
                pageSize={10}
                total={ddData?.total ?? 0}
                onPageChange={setDdPage}
                onRowClick={(c) => openCase(c.id, "tranh-chap")}
                rowKey={(c) => c.id}
                rowClassName={(c) => vipRowClassName(c.nhom_kh)}
                emptyText={tr("Không có ca nào đang chờ đánh giá theo dõi đổi trả.")}
                storageKey="tranh-chap-theo-doi-doi-tra-cho-danh-gia"
              />
              <Modal
                open={!!confirmingDoiTraCase}
                onClose={() => setConfirmingDoiTraCase(null)}
                title={confirmingDoiTraCase?.ketQua === "dung" ? tr("Xác nhận: Đúng là đổi trả?") : tr("Bỏ qua ca này?")}
                width="max-w-md"
              >
                {confirmingDoiTraCase && (
                  <div className="space-y-4">
                    <div className="text-sm text-[var(--ink-700)]">
                      {confirmingDoiTraCase.ketQua === "dung"
                        ? tr("Ca {0} sẽ được xác nhận thuộc diện theo dõi đổi trả, hiện trong bảng \"Đã xác nhận\" của tab này, và chuyển sang danh sách \"Chờ xử lý\" để xử lý như 1 khiếu nại bình thường.", confirmingDoiTraCase.id)
                        : tr("Ca {0} sẽ bị loại vĩnh viễn khỏi danh sách chờ đánh giá — không thể hoàn tác.", confirmingDoiTraCase.id)}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Btn variant="ghost" onClick={() => setConfirmingDoiTraCase(null)}>
                        {tr("Hủy")}</Btn>
                      <Btn
                        variant={confirmingDoiTraCase.ketQua === "dung" ? "success" : "danger"}
                        disabled={xacNhanDoiTra.isPending}
                        onClick={() => xacNhanDoiTra.mutate(confirmingDoiTraCase)}
                      >
                        {xacNhanDoiTra.isPending ? tr("Đang lưu…") : confirmingDoiTraCase.ketQua === "dung" ? tr("Xác nhận đổi trả") : tr("Bỏ qua")}
                      </Btn>
                    </div>
                  </div>
                )}
              </Modal>
            </>
          ) : (ddThangList?.rows ?? []).length === 0 ? (
            <div className="text-sm text-[var(--ink-400)] italic py-6 text-center">{tr("Chưa có ca nào được xác nhận.")}</div>
          ) : (
            (ddThangList?.rows ?? []).map((thang) => (
              <DaXacNhanDoiTraMonthTable key={thang} thang={thang} khuVuc={ddKhuVuc} tinh={ddTinh} nhomKh={ddNhomKh} idSearch={ddIdSearch} openCase={openCase} />
            ))
          )}
        </div>
      ) : view === "luong-doi-tra" ? (
        <div className="mt-4">
          <div className="text-sm text-[var(--ink-600)] mb-4">
            {tr("Các ca có")} <b>{tr("luồng mail đổi trả")}</b> (CC <span className="font-mono">theodoidoimay@gmail.com</span>{tr("): Phát sinh → Karofi tiếp nhận → Đề xuất đổi → Duyệt → Giao xử lý → SO/DO → Mở ca đổi → Đổi trả thành công. Bấm 1 dòng để mở ca ở tab")} <b>{tr("\"Đổi trả\"")}</b>  {tr("(kết thúc luồng, gán ca đổi thủ công).")}</div>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <KhuVucFilterControl value={ldKhuVuc} onChange={(v) => { setLdKhuVuc(v); setLdPage(1); }} options={khuVucSelectOptions} myAreas={myAreas} />
            <MultiSelectFilter label={NHAN_CAP_1[diaGioi.mode]} value={ldTinh} onChange={(v) => { setLdTinh(v); setLdPage(1); }} options={tinhSelectOptions} />
            <MultiSelectFilter label={tr("Nhóm KH")} value={ldNhomKh} onChange={(v) => { setLdNhomKh(v); setLdPage(1); }} options={nhomKhSelectOptions} />
            <Select
              value={ldTrangThai}
              onChange={(v) => { setLdTrangThai(v); setLdPage(1); }}
              options={[
                { value: "dang_mo", label: tr("Đang mở") },
                { value: "ket_thuc", label: tr("Đã kết thúc") },
                { value: "", label: tr("Tất cả") },
              ]}
            />
            <Select
              value={ldBuoc}
              onChange={(v) => { setLdBuoc(v); setLdPage(1); }}
              options={[{ value: "", label: tr("Tất cả bước") }, ...Object.entries(TRANG_THAI_LUONG).map(([value, x]) => ({ value, label: x.label }))]}
            />
            <IdSerialSearchInput
              value={ldIdSearch}
              onChange={(v) => {
                setLdIdSearch(v);
                setLdPage(1);
              }}
            />
          </div>
          {ldData?.error && <div className="text-xs text-red-600 italic mb-2">{tr("Không tải được dữ liệu từ hệ Theo dõi đổi máy (")}{ldData.error}).</div>}
          <PaginatedTable
            columns={luongDoiTraColumns}
            rows={ldData?.rows ?? []}
            isLoading={ldLoading}
            isError={ldError}
            onRetry={refetchLd}
            page={ldPage}
            pageSize={20}
            total={ldData?.total ?? 0}
            onPageChange={setLdPage}
            onRowClick={(r) => openCase(r.id, "luong-mail")}
            rowKey={(r) => r.id}
            rowClassName={(r) => vipRowClassName(r.nhom_kh)}
            emptyText={tr("Không có luồng đổi trả nào.")}
            storageKey="tranh-chap-luong-doi-tra"
          />
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <KhuVucFilterControl value={ttKhuVuc} onChange={(v) => { setTtKhuVuc(v); setTtPage(1); }} options={khuVucSelectOptions} myAreas={myAreas} />
            <MultiSelectFilter label={NHAN_CAP_1[diaGioi.mode]} value={ttTinh} onChange={(v) => { setTtTinh(v); setTtPage(1); }} options={tinhSelectOptions} />
            <MultiSelectFilter label={tr("Nhóm KH")} value={ttNhomKh} onChange={(v) => { setTtNhomKh(v); setTtPage(1); }} options={nhomKhSelectOptions} />
            <Select
              value={ttPhanLoai}
              onChange={(v) => { setTtPhanLoai(v); setTtPage(1); }}
              options={[{ value: "", label: tr("Tất cả phân loại") }, ...(phanLoaiOptions?.rows.map((r) => ({ value: r.ten_phan_loai, label: r.ten_phan_loai })) ?? [])]}
            />
            <Select
              value={ttMucDo}
              onChange={(v) => { setTtMucDo(v); setTtPage(1); }}
              options={[{ value: "", label: tr("Tất cả mức độ") }, ...MUC_DO_OPTIONS]}
            />
            <Select
              value={ttTrangThai}
              onChange={(v) => { setTtTrangThai(v); setTtPage(1); }}
              options={[
                { value: "", label: tr("Đang mở (mặc định)") },
                { value: KSNB_WATCH_STATUSES.join(","), label: tr("🔎 Cần GQKN theo dõi (Chuyển CSKH / CSKH đang xử lý)") },
                ...TRANG_THAI_LOG_OPTIONS,
                { value: Object.keys(TRANG_THAI_LABELS).join(","), label: tr("Tất cả (gồm đã đóng)") },
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
                  { value: "", label: tr("Tất cả người đang xử lý") },
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
                  { value: "", label: tr("Tất cả (Chưa xong + Được nhắc)") },
                  { value: "chua-xong", label: tr("Xử lý chưa xong") },
                  { value: "duoc-nhac-ten", label: tr("Được nhắc tên xử lý") },
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
              {tr("Của tôi")}</Btn>
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
            <StatCard label={tr("Đang mở")} value={ttStats?.dangMo ?? 0} tone="ocean" active={ttTrangThai === "" && ttHan === ""} onClick={() => resetTtFilterTo({})} />
            <StatCard
              label={tr("Giám sát chưa xử lý")}
              value={ttStats?.giamSatChuaXuLy ?? 0}
              tone="gray"
              active={ttTrangThai === "Giam sat chua xu ly"}
              onClick={() => resetTtFilterTo({ trangThai: "Giam sat chua xu ly" })}
            />
            <StatCard
              label={tr("🔎 Cần GQKN theo dõi")}
              value={(ttStats?.giamSatChuyenCskh ?? 0) + (ttStats?.cskhDangXuLy ?? 0)}
              tone="teal"
              active={ttTrangThai === KSNB_WATCH_STATUSES.join(",")}
              onClick={() => resetTtFilterTo({ trangThai: KSNB_WATCH_STATUSES.join(",") })}
            />
            <StatCard
              label={tr("Sắp đến hạn (≤1 ngày)")}
              value={ttStats?.sapDenHan ?? 0}
              tone="amber"
              active={ttHan === "sap-den-han"}
              onClick={() => resetTtFilterTo({ han: "sap-den-han" })}
            />
            <StatCard label={tr("Quá hạn chưa đóng")} value={ttStats?.quaHan ?? 0} tone="coral" active={ttHan === "qua-han"} onClick={() => resetTtFilterTo({ han: "qua-han" })} />
            {/* CHOT 2026-08-22: "Qua han cap nhat" - ca dang MO nhung >=3 ngay chua co log moi (khac
                "Qua han chua dong" la han thoi_gian_du_kien_xong tu chon). Khong co onClick/active vi
                KHONG co bo loc server-side tuong ung (chi so lieu tong tu /tien-trinh/stats - xem cot
                canh bao rieng tung dong trong bang ben duoi de xem chi tiet ca nao). */}
            <StatCard
              label={tr("⚠ Quá hạn cập nhật (≥3 ngày)")}
              value={ttStats?.quaHanCapNhat ?? 0}
              tone="coral"
              active={ttHan === "qua-han-cap-nhat"}
              onClick={() => resetTtFilterTo({ han: "qua-han-cap-nhat" })}
            />
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
            emptyText={tr("Không có tiến trình nào khớp bộ lọc.")}
            storageKey="tranh-chap-tien-trinh"
          />
        </div>
      )}

      {tiepNhanCase && (
        <TiepNhanModal
          caseRow={tiepNhanCase}
          phanLoaiOptions={phanLoaiOptions?.rows.filter((r) => r.bat_tat) ?? []}
          ketQuaOptions={ketQuaOptions?.rows.filter((r) => r.bat_tat) ?? []}
          lyDoTonOptions={lyDoTonOptions?.rows.filter((r) => r.bat_tat) ?? []}
          onClose={() => setTiepNhanCase(null)}
          onSubmit={(body) => tiepNhan.mutate(body)}
          isPending={tiepNhan.isPending}
        />
      )}
    </div>
  );
}
