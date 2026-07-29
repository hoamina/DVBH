import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../components/ui/Btn";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { StatCard } from "../components/ui/StatCard";
import { Tabs } from "../components/ui/Tabs";
import { Select } from "../components/ui/Select";
import { Modal } from "../components/ui/Modal";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { api, buildQuery, ApiError } from "../api/client";
import { fmtDateTime, type Paged } from "../types";
import { useToast } from "../components/ui/Toast";
import { useAuth, type AppUser } from "../auth/AuthContext";
import { QLDVBH_FILTER_VALUE } from "../constants";

interface ChoXuLyCase {
  id: string;
  khach_hang: string | null;
  khu_vuc: string | null;
  thoi_gian_hoan_thanh: string | null;
  last_ly_do_cham: string | null;
  so_ngay_cho: number;
}

interface TienTrinhRow {
  id: string;
  case_id: string;
  phan_loai_tranh_chap: string;
  muc_do: string;
  ngay_tao: string;
  khach_hang: string | null;
  khu_vuc: string | null;
  trang_thai_xu_ly: string | null;
  nguoi_xu_ly: string | null;
  ngay_xu_ly: string | null;
  thoi_gian_du_kien_xong: string | null;
  log_ghi_chu: string | null;
  so_ngay_ton: number;
}

interface TienTrinhStats {
  dangMo: number;
  ksnbTiepNhan: number;
  giamSatXuLy: number;
  quaHan: number;
  sapDenHan: number;
}

interface TranhChapLogRow {
  id: number;
  tien_trinh_id: string;
  nguoi_xu_ly: string;
  ngay_xu_ly: string;
  trang_thai_xu_ly: string;
  thoi_gian_du_kien_xong: string | null;
  ghi_chu: string | null;
  ket_qua_xu_ly: string | null;
  hai_long_sau_tranh_chap: string | null;
  created_at: string;
  updated_at: string;
}

interface TienTrinhDetail {
  tienTrinh: {
    id: string;
    case_id: string;
    phan_loai_tranh_chap: string;
    muc_do: string;
    ngay_tao: string;
    khach_hang: string | null;
    khu_vuc: string | null;
    tien_do_hoan_thanh: string | null;
    thoi_gian_hoan_thanh: string | null;
  };
  logs: TranhChapLogRow[];
}

interface PhanLoaiTranhChapRow {
  id: number;
  ten_phan_loai: string;
  bat_tat: number;
}

interface KetQuaXuLyTranhChapRow {
  id: number;
  ten_ket_qua: string;
  bat_tat: number;
}

const TRANG_THAI_LABELS: Record<string, string> = {
  "KSNB da tiep nhan": "KSNB đã tiếp nhận",
  "Giam sat dang xu ly": "Giám sát đang xử lý",
  "Da ket thuc tranh chap": "Đã kết thúc tranh chấp",
  "Da huy bo tranh chap": "Đã huỷ bỏ tranh chấp",
};
const TRANG_THAI_TONE: Record<string, BadgeTone> = {
  "KSNB da tiep nhan": "ocean",
  "Giam sat dang xu ly": "amber",
  "Da ket thuc tranh chap": "teal",
  "Da huy bo tranh chap": "gray",
};
const TRANG_THAI_LOG_OPTIONS = Object.entries(TRANG_THAI_LABELS).map(([value, label]) => ({ value, label }));
const TRANG_THAI_DONG = ["Da ket thuc tranh chap", "Da huy bo tranh chap"];
// Trang thai bat buoc 2 truong "Ket qua xu ly"/"Hai long sau tranh chap" (chot 2026-07-29) - khop
// TRANG_THAI_CAN_KET_QUA trong backend/src/lib/tranhChapTienTrinh.ts.
const TRANG_THAI_CAN_KET_QUA = "Da ket thuc tranh chap";

const MUC_DO_OPTIONS = [
  { value: "Binh thuong", label: "Bình thường" },
  { value: "Cao", label: "Cao" },
  { value: "Rat nghiem trong", label: "Rất nghiêm trọng" },
];
const MUC_DO_TONE: Record<string, BadgeTone> = { "Binh thuong": "gray", Cao: "amber", "Rat nghiem trong": "coral" };
const MUC_DO_LABELS: Record<string, string> = Object.fromEntries(MUC_DO_OPTIONS.map((o) => [o.value, o.label]));

const HAI_LONG_OPTIONS = [
  { value: "Khong xac dinh", label: "Không xác định" },
  { value: "Khong hai long", label: "Không hài lòng" },
  { value: "Binh thuong", label: "Bình thường" },
  { value: "Hai long", label: "Hài lòng" },
  { value: "Rat hai long", label: "Rất hài lòng" },
];

const HAN_OPTIONS = [
  { value: "", label: "Tất cả hạn xử lý" },
  { value: "qua-han", label: "Quá hạn" },
  { value: "sap-den-han", label: "Sắp đến hạn (≤1 ngày)" },
];

/** Khop voi canWriteTranhChap() trong backend/src/lib/tranhChapTienTrinh.ts - chi dung de AN/HIEN
 * nut thao tac cho gon giao dien, backend van la noi kiem tra thuc su. */
function canWriteTranhChap(user: AppUser, khuVucCa: string | null): boolean {
  if (user.la_ksnb_doi_tac) return true;
  if (user.vai_tro === "TBP DVBH" || user.vai_tro === "Admin") return true;
  if (user.vai_tro === "Giam sat") return !!khuVucCa && user.khu_vuc_phu_trach.includes(khuVucCa);
  return false;
}

/** Khop voi canEditTienTrinhMeta() trong backend - HEP HON canWriteTranhChap (khong gom Giam sat),
 * dung de AN/HIEN nut sua phan_loai_tranh_chap/muc_do. */
function canEditTienTrinhMeta(user: AppUser): boolean {
  return !!user.la_ksnb_doi_tac || user.vai_tro === "TBP DVBH" || user.vai_tro === "Admin";
}

function describeTranhChapError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "FORBIDDEN_ROLE") return "Bạn không có quyền thao tác trên ca/khu vực này.";
    if (err.code === "CASE_NOT_ELIGIBLE") return "Ca này không (còn) thuộc diện tranh chấp.";
    if (err.code === "TIEN_TRINH_DANG_MO") return "Ca này đang có 1 tiến trình chưa đóng — không thể tạo tiến trình mới.";
    if (err.code === "TIEN_TRINH_DA_DONG") return "Tiến trình đã đóng — không thể sửa phân loại/mức độ nữa.";
    if (err.code === "NOT_LATEST_LOG") return "Đã có log mới hơn được thêm — không thể sửa log này nữa.";
    if (err.code === "EDIT_WINDOW_EXPIRED") return "Đã quá 24h kể từ lúc tạo log — không thể sửa nữa.";
    if (err.code === "FORBIDDEN_NOT_AUTHOR") return "Chỉ người tạo log mới được sửa.";
    if (err.code === "MISSING_KET_QUA_XU_LY") return "Cần chọn Kết quả xử lý khi đóng tranh chấp.";
    if (err.code === "MISSING_HAI_LONG") return "Cần chọn Hài lòng sau tranh chấp khi đóng tranh chấp.";
  }
  return fallback;
}

const VIEWS = [
  { key: "cho-xu-ly", label: "Chờ xử lý" },
  { key: "tien-trinh", label: "Quản lý tiến trình" },
];

export function TranhChapModule({ openCase }: { openCase: (id: string) => void }) {
  const auth = useAuth();
  const user = auth.status === "authenticated" ? auth.user : null;
  const myAreas = user?.khu_vuc_phu_trach ?? [];
  const addToast = useToast();
  const qc = useQueryClient();

  const [view, setView] = useState("cho-xu-ly");
  const [page, setPage] = useState(1);
  const [khuVucFilter, setKhuVucFilter] = useState("");

  const [ttPage, setTtPage] = useState(1);
  const [ttKhuVuc, setTtKhuVuc] = useState("");
  const [ttPhanLoai, setTtPhanLoai] = useState("");
  const [ttMucDo, setTtMucDo] = useState("");
  const [ttTrangThai, setTtTrangThai] = useState("");
  const [ttHan, setTtHan] = useState("");
  const [ttCuaToi, setTtCuaToi] = useState(false);

  const [tiepNhanCase, setTiepNhanCase] = useState<ChoXuLyCase | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: khuVucOptions } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () => api.get<{ khuVuc: string[]; hang: string[] }>("/dashboard/filters"),
  });
  const { data: phanLoaiOptions } = useQuery({
    queryKey: ["settings-phan-loai-tranh-chap"],
    queryFn: () => api.get<{ rows: PhanLoaiTranhChapRow[] }>("/settings/phan-loai-tranh-chap"),
  });
  const { data: ketQuaOptions } = useQuery({
    queryKey: ["settings-ket-qua-xu-ly-tranh-chap"],
    queryFn: () => api.get<{ rows: KetQuaXuLyTranhChapRow[] }>("/settings/ket-qua-xu-ly-tranh-chap"),
  });

  const khuVucSelectOptions = [
    { value: "", label: "Tất cả khu vực" },
    { value: QLDVBH_FILTER_VALUE, label: "Tất cả DVBH (MB/MN...)" },
    ...(khuVucOptions?.khuVuc.map((k) => ({ value: k, label: k })) ?? []),
  ];

  // ---------- Tab "Cho xu ly" ----------
  const { data: choXuLy, isLoading: choXuLyLoading, isError: choXuLyError, refetch: refetchChoXuLy } = useQuery({
    queryKey: ["tranh-chap-cho-xu-ly", page, khuVucFilter],
    queryFn: () =>
      api.get<Paged<ChoXuLyCase> & { choHon3Ngay: number; choHon7Ngay: number }>(
        `/tranh-chap/cho-xu-ly${buildQuery({ page, pageSize: 10, khu_vuc: khuVucFilter })}`,
      ),
    enabled: view === "cho-xu-ly",
  });

  const tiepNhan = useMutation({
    mutationFn: (body: { phan_loai_tranh_chap: string; muc_do: string; ghi_chu?: string; thoi_gian_du_kien_xong?: string }) =>
      api.post(`/tranh-chap/${encodeURIComponent(tiepNhanCase?.id ?? "")}/tiep-nhan`, body),
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

  const choXuLyColumns: Column<ChoXuLyCase>[] = [
    { key: "id", header: "ID", render: (c) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{c.id}</span> },
    { key: "khach_hang", header: "Khách hàng", render: (c) => c.khach_hang ?? "—" },
    { key: "khu_vuc", header: "Khu vực", render: (c) => c.khu_vuc ?? "—" },
    {
      key: "ly_do",
      header: "Lý do quá hạn",
      render: (c) => (c.last_ly_do_cham ? <Badge tone="coral">{c.last_ly_do_cham}</Badge> : <span className="text-[var(--ink-400)] text-xs italic">—</span>),
    },
    { key: "hoan_thanh", header: "Hoàn thành", render: (c) => <span className="text-xs">{fmtDateTime(c.thoi_gian_hoan_thanh)}</span> },
    {
      key: "so_ngay_cho",
      header: "Số ngày chờ",
      render: (c) => <span className={`font-mono font-semibold ${c.so_ngay_cho > 7 ? "text-[var(--coral-500)]" : c.so_ngay_cho > 3 ? "text-[var(--amber-500)]" : ""}`}>{c.so_ngay_cho}</span>,
    },
    {
      key: "action",
      header: "",
      className: "text-right",
      render: (c) =>
        !user || canWriteTranhChap(user, c.khu_vuc) ? (
          <Btn size="sm" onClick={() => setTiepNhanCase(c)}>
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
    queryKey: ["tranh-chap-tien-trinh", ttPage, ttKhuVuc, ttPhanLoai, ttMucDo, ttTrangThai, ttHan, ttCuaToi],
    queryFn: () =>
      api.get<Paged<TienTrinhRow>>(
        `/tranh-chap/tien-trinh${buildQuery({
          page: ttPage,
          pageSize: 10,
          khu_vuc: ttKhuVuc,
          phan_loai: ttPhanLoai,
          muc_do: ttMucDo,
          trang_thai: ttTrangThai,
          han: ttHan,
          cua_toi: ttCuaToi ? "1" : "",
        })}`,
      ),
    enabled: view === "tien-trinh",
  });

  function resetTtFilterTo(partial: Partial<{ trangThai: string; han: string }>) {
    setTtTrangThai(partial.trangThai ?? "");
    setTtHan(partial.han ?? "");
    setTtPage(1);
  }

  const tienTrinhColumns: Column<TienTrinhRow>[] = [
    { key: "id", header: "Tiến trình", render: (r) => <span className="font-mono text-[var(--ocean-600)] font-semibold">{r.id}</span> },
    {
      key: "case_id",
      header: "Ca sự vụ",
      render: (r) => (
        <button
          className="font-mono text-xs text-[var(--ocean-600)] hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            openCase(r.case_id);
          }}
        >
          {r.case_id}
        </button>
      ),
    },
    { key: "khach_hang", header: "Khách hàng", render: (r) => r.khach_hang ?? "—" },
    { key: "khu_vuc", header: "Khu vực", render: (r) => r.khu_vuc ?? "—" },
    { key: "phan_loai", header: "Phân loại", render: (r) => <Badge tone="gray">{r.phan_loai_tranh_chap}</Badge> },
    { key: "muc_do", header: "Mức độ", render: (r) => <Badge tone={MUC_DO_TONE[r.muc_do] ?? "gray"}>{MUC_DO_LABELS[r.muc_do] ?? r.muc_do}</Badge> },
    {
      key: "trang_thai",
      header: "Trạng thái",
      render: (r) => (r.trang_thai_xu_ly ? <Badge tone={TRANG_THAI_TONE[r.trang_thai_xu_ly] ?? "gray"}>{TRANG_THAI_LABELS[r.trang_thai_xu_ly] ?? r.trang_thai_xu_ly}</Badge> : "—"),
    },
    { key: "nguoi_xu_ly", header: "Người xử lý gần nhất", render: (r) => r.nguoi_xu_ly ?? "—" },
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

  return (
    <div className="anim-in">
      <Tabs active={view} onChange={setView} tabs={VIEWS} />

      {view === "cho-xu-ly" ? (
        <div className="mt-4">
          <div className="text-sm text-[var(--ink-600)] mb-4">
            Ca có <b>"Nghi ngờ tranh chấp"</b> (điền bởi CRM khi đóng ca) nhưng <b>chưa từng tạo tiến trình xử lý</b>. Sắp theo số ngày chờ giảm dần — ưu tiên xử lý ca chờ lâu nhất.
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-4">{<KhuVucFilterControl value={khuVucFilter} onChange={(v) => { setKhuVucFilter(v); setPage(1); }} options={khuVucSelectOptions} myAreas={myAreas} />}</div>
          <div className="flex flex-wrap gap-3 mb-4">
            <StatCard label="Tổng ca chờ xử lý" value={choXuLy?.total ?? 0} tone="ocean" />
            <StatCard label="Chờ > 3 ngày" value={choXuLy?.choHon3Ngay ?? 0} tone="amber" />
            <StatCard label="Chờ > 7 ngày" value={choXuLy?.choHon7Ngay ?? 0} tone="coral" />
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
            rowKey={(c) => c.id}
            emptyText="Không có ca nào đang chờ xử lý tranh chấp."
          />
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <KhuVucFilterControl value={ttKhuVuc} onChange={(v) => { setTtKhuVuc(v); setTtPage(1); }} options={khuVucSelectOptions} myAreas={myAreas} />
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
              options={[{ value: "", label: "Đang mở (mặc định)" }, ...TRANG_THAI_LOG_OPTIONS, { value: Object.keys(TRANG_THAI_LABELS).join(","), label: "Tất cả (gồm đã đóng)" }]}
            />
            <Select value={ttHan} onChange={(v) => { setTtHan(v); setTtPage(1); }} options={HAN_OPTIONS} />
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
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <StatCard label="Đang mở" value={ttStats?.dangMo ?? 0} tone="ocean" onClick={() => resetTtFilterTo({})} />
            <StatCard label="KSNB đã tiếp nhận" value={ttStats?.ksnbTiepNhan ?? 0} tone="ocean" onClick={() => resetTtFilterTo({ trangThai: "KSNB da tiep nhan" })} />
            <StatCard label="Giám sát đang xử lý" value={ttStats?.giamSatXuLy ?? 0} tone="teal" onClick={() => resetTtFilterTo({ trangThai: "Giam sat dang xu ly" })} />
            <StatCard label="Sắp đến hạn (≤1 ngày)" value={ttStats?.sapDenHan ?? 0} tone="amber" onClick={() => resetTtFilterTo({ han: "sap-den-han" })} />
            <StatCard label="Quá hạn chưa đóng" value={ttStats?.quaHan ?? 0} tone="coral" onClick={() => resetTtFilterTo({ han: "qua-han" })} />
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
            onRowClick={(r) => setDetailId(r.id)}
            rowKey={(r) => r.id}
            emptyText="Không có tiến trình nào khớp bộ lọc."
          />
        </div>
      )}

      {tiepNhanCase && (
        <TiepNhanModal
          caseRow={tiepNhanCase}
          phanLoaiOptions={phanLoaiOptions?.rows.filter((r) => r.bat_tat) ?? []}
          onClose={() => setTiepNhanCase(null)}
          onSubmit={(body) => tiepNhan.mutate(body)}
          isPending={tiepNhan.isPending}
        />
      )}

      {detailId && (
        <TienTrinhDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          openCase={openCase}
          currentUser={user}
          phanLoaiOptions={phanLoaiOptions?.rows.filter((r) => r.bat_tat) ?? []}
          ketQuaOptions={ketQuaOptions?.rows.filter((r) => r.bat_tat) ?? []}
        />
      )}
    </div>
  );
}

function TiepNhanModal({
  caseRow,
  phanLoaiOptions,
  onClose,
  onSubmit,
  isPending,
}: {
  caseRow: ChoXuLyCase;
  phanLoaiOptions: PhanLoaiTranhChapRow[];
  onClose: () => void;
  onSubmit: (body: { phan_loai_tranh_chap: string; muc_do: string; ghi_chu?: string; thoi_gian_du_kien_xong?: string }) => void;
  isPending: boolean;
}) {
  const [phanLoai, setPhanLoai] = useState(phanLoaiOptions[0]?.ten_phan_loai ?? "");
  const [mucDo, setMucDo] = useState("Binh thuong");
  const [ngayDuKien, setNgayDuKien] = useState("");
  const [ghiChu, setGhiChu] = useState("");

  return (
    <Modal open onClose={onClose} title={`Tiếp nhận xử lý tranh chấp — ${caseRow.id}`}>
      <div className="space-y-3">
        <div className="text-sm text-[var(--ink-600)]">
          {caseRow.khach_hang ?? "—"} · {caseRow.khu_vuc ?? "—"}
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Phân loại tranh chấp</label>
          {phanLoaiOptions.length ? (
            <Select value={phanLoai} onChange={setPhanLoai} options={phanLoaiOptions.map((p) => p.ten_phan_loai)} className="w-full mt-1" />
          ) : (
            <div className="text-xs text-[var(--coral-500)] mt-1">Chưa có phân loại nào — vào Settings → Phân loại tranh chấp để thêm trước.</div>
          )}
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Mức độ</label>
          <Select value={mucDo} onChange={setMucDo} options={MUC_DO_OPTIONS} className="w-full mt-1" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Ngày dự kiến xử lý xong</label>
          <input type="date" value={ngayDuKien} onChange={(e) => setNgayDuKien(e.target.value)} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[var(--ink-400)]">Ghi chú</label>
          <textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} rows={2} className="focus-ring w-full mt-1 border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>
            Hủy
          </Btn>
          <Btn
            onClick={() => onSubmit({ phan_loai_tranh_chap: phanLoai, muc_do: mucDo, ghi_chu: ghiChu.trim() || undefined, thoi_gian_du_kien_xong: ngayDuKien || undefined })}
            disabled={!phanLoai || !mucDo || isPending}
          >
            Tiếp nhận
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function TienTrinhDetailModal({
  id,
  onClose,
  openCase,
  currentUser,
  phanLoaiOptions,
  ketQuaOptions,
}: {
  id: string;
  onClose: () => void;
  openCase: (id: string) => void;
  currentUser: AppUser | null;
  phanLoaiOptions: PhanLoaiTranhChapRow[];
  ketQuaOptions: KetQuaXuLyTranhChapRow[];
}) {
  const addToast = useToast();
  const qc = useQueryClient();
  const [newTrangThai, setNewTrangThai] = useState("");
  const [newNgayDuKien, setNewNgayDuKien] = useState("");
  const [newGhiChu, setNewGhiChu] = useState("");
  const [newKetQua, setNewKetQua] = useState("");
  const [newHaiLong, setNewHaiLong] = useState("");
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [editPhanLoai, setEditPhanLoai] = useState("");
  const [editMucDo, setEditMucDo] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["tranh-chap-tien-trinh-detail", id],
    queryFn: () => api.get<TienTrinhDetail>(`/tranh-chap/tien-trinh/${encodeURIComponent(id)}`),
  });

  function invalidateAfterWrite() {
    qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh-detail", id] });
    qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh"] });
    qc.invalidateQueries({ queryKey: ["tranh-chap-tien-trinh-stats"] });
    qc.invalidateQueries({ queryKey: ["notifications-count"] });
  }

  const addLog = useMutation({
    mutationFn: (body: {
      trang_thai_xu_ly: string;
      thoi_gian_du_kien_xong?: string;
      ghi_chu?: string;
      ket_qua_xu_ly?: string;
      hai_long_sau_tranh_chap?: string;
    }) => api.post(`/tranh-chap/tien-trinh/${encodeURIComponent(id)}/log`, body),
    onSuccess: () => {
      addToast("Đã thêm log xử lý");
      setNewTrangThai("");
      setNewNgayDuKien("");
      setNewGhiChu("");
      setNewKetQua("");
      setNewHaiLong("");
      invalidateAfterWrite();
    },
    onError: (err) => addToast(describeTranhChapError(err, "Không thể thêm log, thử lại sau.")),
  });

  const editLog = useMutation({
    mutationFn: ({
      logId,
      body,
    }: {
      logId: number;
      body: { trang_thai_xu_ly?: string; thoi_gian_du_kien_xong?: string; ghi_chu?: string; ket_qua_xu_ly?: string; hai_long_sau_tranh_chap?: string };
    }) => api.patch(`/tranh-chap/log/${logId}`, body),
    onSuccess: () => {
      addToast("Đã cập nhật log");
      setEditingLogId(null);
      invalidateAfterWrite();
    },
    onError: (err) => addToast(describeTranhChapError(err, "Không thể sửa log, thử lại sau.")),
  });

  const editMeta = useMutation({
    mutationFn: (body: { phan_loai_tranh_chap?: string; muc_do?: string }) => api.patch(`/tranh-chap/tien-trinh/${encodeURIComponent(id)}`, body),
    onSuccess: () => {
      addToast("Đã cập nhật phân loại/mức độ");
      setEditingMeta(false);
      invalidateAfterWrite();
    },
    onError: (err) => addToast(describeTranhChapError(err, "Không thể cập nhật, thử lại sau.")),
  });

  const tt = data?.tienTrinh;
  const logs = data?.logs ?? [];
  const latestLog = logs[0];
  const isDaDong = latestLog ? TRANG_THAI_DONG.includes(latestLog.trang_thai_xu_ly) : false;
  const canWrite = currentUser ? canWriteTranhChap(currentUser, tt?.khu_vuc ?? null) : false;
  const canEditMeta = currentUser ? canEditTienTrinhMeta(currentUser) && !isDaDong : false;

  function startEditMeta() {
    if (!tt) return;
    setEditPhanLoai(tt.phan_loai_tranh_chap);
    setEditMucDo(tt.muc_do);
    setEditingMeta(true);
  }

  return (
    <Modal open onClose={onClose} title={`Tiến trình ${id}`} width="max-w-2xl">
      {isLoading || !tt ? (
        <div className="text-sm text-[var(--ink-400)] py-6 text-center">Đang tải…</div>
      ) : (
        <div className="space-y-4">
          <div className="border border-[var(--line)] rounded-xl p-3 flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm flex-1 min-w-[200px]">
              <div className="font-semibold">{tt.khach_hang ?? "—"}</div>
              {editingMeta ? (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <Select value={editPhanLoai} onChange={setEditPhanLoai} options={phanLoaiOptions.map((p) => p.ten_phan_loai)} />
                  <Select value={editMucDo} onChange={setEditMucDo} options={MUC_DO_OPTIONS} />
                  <Btn size="sm" variant="ghost" onClick={() => setEditingMeta(false)}>
                    Hủy
                  </Btn>
                  <Btn size="sm" onClick={() => editMeta.mutate({ phan_loai_tranh_chap: editPhanLoai, muc_do: editMucDo })} disabled={editMeta.isPending}>
                    Lưu
                  </Btn>
                </div>
              ) : (
                <div className="text-xs text-[var(--ink-400)] mt-0.5 flex items-center gap-1.5 flex-wrap">
                  {tt.khu_vuc ?? "—"} · <Badge tone="gray">{tt.phan_loai_tranh_chap}</Badge>
                  <Badge tone={MUC_DO_TONE[tt.muc_do] ?? "gray"}>{MUC_DO_LABELS[tt.muc_do] ?? tt.muc_do}</Badge>
                  {canEditMeta && (
                    <button className="text-[var(--ocean-600)] underline" onClick={startEditMeta}>
                      Sửa
                    </button>
                  )}
                </div>
              )}
            </div>
            <Btn variant="ghost" size="sm" onClick={() => openCase(tt.case_id)}>
              Xem ca sự vụ ({tt.case_id}) →
            </Btn>
          </div>

          <div>
            <div className="text-xs font-semibold text-[var(--ink-400)] uppercase mb-2">Lịch sử xử lý</div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {logs.map((log, idx) => {
                const isLatest = idx === 0;
                const isAuthor = currentUser?.email === log.nguoi_xu_ly;
                const hoursSince = (Date.now() - new Date(log.created_at.replace(" ", "T") + "Z").getTime()) / 3600000 - 7;
                const canEdit = isLatest && isAuthor && hoursSince < 24;
                const isEditing = editingLogId === log.id;
                return (
                  <div key={log.id} className="border border-[var(--line)] rounded-lg p-2.5 text-sm">
                    {isEditing ? (
                      <EditLogForm
                        log={log}
                        ketQuaOptions={ketQuaOptions}
                        onCancel={() => setEditingLogId(null)}
                        onSave={(body) => editLog.mutate({ logId: log.id, body })}
                        isPending={editLog.isPending}
                      />
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <Badge tone={TRANG_THAI_TONE[log.trang_thai_xu_ly] ?? "gray"}>{TRANG_THAI_LABELS[log.trang_thai_xu_ly] ?? log.trang_thai_xu_ly}</Badge>
                          {canEdit && (
                            <button className="text-xs text-[var(--ocean-600)] underline" onClick={() => setEditingLogId(log.id)}>
                              Sửa (còn {Math.max(0, Math.ceil(24 - hoursSince))}h)
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-[var(--ink-400)] mt-1">
                          {log.nguoi_xu_ly} · {fmtDateTime(log.ngay_xu_ly)}
                          {log.thoi_gian_du_kien_xong ? ` · Dự kiến xong: ${log.thoi_gian_du_kien_xong}` : ""}
                        </div>
                        {(log.ket_qua_xu_ly || log.hai_long_sau_tranh_chap) && (
                          <div className="text-xs mt-1 flex gap-1.5 flex-wrap">
                            {log.ket_qua_xu_ly && <Badge tone="ocean">{log.ket_qua_xu_ly}</Badge>}
                            {log.hai_long_sau_tranh_chap && (
                              <Badge tone="teal">{HAI_LONG_OPTIONS.find((h) => h.value === log.hai_long_sau_tranh_chap)?.label ?? log.hai_long_sau_tranh_chap}</Badge>
                            )}
                          </div>
                        )}
                        {log.ghi_chu && <div className="text-xs mt-1 whitespace-pre-wrap">{log.ghi_chu}</div>}
                      </>
                    )}
                  </div>
                );
              })}
              {logs.length === 0 && <div className="text-xs text-[var(--ink-400)] italic">Chưa có log nào.</div>}
            </div>
          </div>

          {canWrite && (
            <div className="border-t border-[var(--line)] pt-3">
              <div className="text-xs font-semibold text-[var(--ink-400)] uppercase mb-2">{isDaDong ? "Tiến trình đã đóng" : "Thêm log xử lý mới"}</div>
              {!isDaDong && (
                <div className="space-y-2">
                  <Select value={newTrangThai} onChange={setNewTrangThai} options={[{ value: "", label: "Chọn trạng thái…" }, ...TRANG_THAI_LOG_OPTIONS]} className="w-full" />
                  <input
                    type="date"
                    value={newNgayDuKien}
                    onChange={(e) => setNewNgayDuKien(e.target.value)}
                    placeholder="Ngày dự kiến xong (để trống = giữ theo log trước)"
                    className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                  {newTrangThai === TRANG_THAI_CAN_KET_QUA && (
                    <>
                      <div>
                        <label className="text-xs font-semibold text-[var(--ink-400)]">Kết quả xử lý *</label>
                        {ketQuaOptions.length ? (
                          <Select
                            value={newKetQua}
                            onChange={setNewKetQua}
                            options={[{ value: "", label: "Chọn kết quả xử lý…" }, ...ketQuaOptions.map((k) => ({ value: k.ten_ket_qua, label: k.ten_ket_qua }))]}
                            className="w-full mt-1"
                          />
                        ) : (
                          <div className="text-xs text-[var(--coral-500)] mt-1">Chưa có danh mục — vào Settings → Kết quả xử lý tranh chấp để thêm trước.</div>
                        )}
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-[var(--ink-400)]">Hài lòng sau tranh chấp *</label>
                        <Select
                          value={newHaiLong}
                          onChange={setNewHaiLong}
                          options={[{ value: "", label: "Chọn mức hài lòng…" }, ...HAI_LONG_OPTIONS]}
                          className="w-full mt-1"
                        />
                      </div>
                    </>
                  )}
                  <textarea
                    value={newGhiChu}
                    onChange={(e) => setNewGhiChu(e.target.value)}
                    rows={2}
                    placeholder="Ghi chú…"
                    className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
                  />
                  <div className="flex justify-end">
                    <Btn
                      size="sm"
                      onClick={() =>
                        addLog.mutate({
                          trang_thai_xu_ly: newTrangThai,
                          thoi_gian_du_kien_xong: newNgayDuKien || undefined,
                          ghi_chu: newGhiChu.trim() || undefined,
                          ket_qua_xu_ly: newTrangThai === TRANG_THAI_CAN_KET_QUA ? newKetQua : undefined,
                          hai_long_sau_tranh_chap: newTrangThai === TRANG_THAI_CAN_KET_QUA ? newHaiLong : undefined,
                        })
                      }
                      disabled={!newTrangThai || (newTrangThai === TRANG_THAI_CAN_KET_QUA && (!newKetQua || !newHaiLong)) || addLog.isPending}
                    >
                      Thêm log
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function EditLogForm({
  log,
  ketQuaOptions,
  onCancel,
  onSave,
  isPending,
}: {
  log: TranhChapLogRow;
  ketQuaOptions: KetQuaXuLyTranhChapRow[];
  onCancel: () => void;
  onSave: (body: { trang_thai_xu_ly: string; thoi_gian_du_kien_xong?: string; ghi_chu?: string; ket_qua_xu_ly?: string; hai_long_sau_tranh_chap?: string }) => void;
  isPending: boolean;
}) {
  const [trangThai, setTrangThai] = useState(log.trang_thai_xu_ly);
  const [ngayDuKien, setNgayDuKien] = useState(log.thoi_gian_du_kien_xong ?? "");
  const [ghiChu, setGhiChu] = useState(log.ghi_chu ?? "");
  const [ketQua, setKetQua] = useState(log.ket_qua_xu_ly ?? "");
  const [haiLong, setHaiLong] = useState(log.hai_long_sau_tranh_chap ?? "");
  const canKetQua = trangThai === TRANG_THAI_CAN_KET_QUA;

  return (
    <div className="space-y-2">
      <Select value={trangThai} onChange={setTrangThai} options={TRANG_THAI_LOG_OPTIONS} className="w-full" />
      <input type="date" value={ngayDuKien} onChange={(e) => setNgayDuKien(e.target.value)} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
      {canKetQua && (
        <>
          <Select
            value={ketQua}
            onChange={setKetQua}
            options={[{ value: "", label: "Chọn kết quả xử lý…" }, ...ketQuaOptions.map((k) => ({ value: k.ten_ket_qua, label: k.ten_ket_qua }))]}
            className="w-full"
          />
          <Select value={haiLong} onChange={setHaiLong} options={[{ value: "", label: "Chọn mức hài lòng…" }, ...HAI_LONG_OPTIONS]} className="w-full" />
        </>
      )}
      <textarea value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} rows={2} className="focus-ring w-full border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm" />
      <div className="flex justify-end gap-2">
        <Btn variant="ghost" size="sm" onClick={onCancel}>
          Hủy
        </Btn>
        <Btn
          size="sm"
          onClick={() =>
            onSave({
              trang_thai_xu_ly: trangThai,
              thoi_gian_du_kien_xong: ngayDuKien || undefined,
              ghi_chu: ghiChu.trim() || undefined,
              ket_qua_xu_ly: canKetQua ? ketQua : undefined,
              hai_long_sau_tranh_chap: canKetQua ? haiLong : undefined,
            })
          }
          disabled={isPending || (canKetQua && (!ketQua || !haiLong))}
        >
          Lưu
        </Btn>
      </div>
    </div>
  );
}
