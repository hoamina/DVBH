import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn } from "../components/ui/Btn";
import { Badge } from "../components/ui/Badge";
import { StatCard } from "../components/ui/StatCard";
import { Tabs } from "../components/ui/Tabs";
import { Select } from "../components/ui/Select";
import { Modal } from "../components/ui/Modal";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { TiepNhanModal, TienTrinhPanel } from "../components/TienTrinhPanel";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { api, buildQuery } from "../api/client";
import { fmtDateTime, type Paged } from "../types";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { QLDVBH_FILTER_VALUE } from "../constants";
import {
  TRANG_THAI_LABELS,
  TRANG_THAI_TONE,
  TRANG_THAI_LOG_OPTIONS,
  TRANG_THAI_DONG,
  MUC_DO_OPTIONS,
  MUC_DO_TONE,
  MUC_DO_LABELS,
  HAN_OPTIONS,
  canWriteTranhChap,
  describeTranhChapError,
  type ChoXuLyCase,
  type TienTrinhRow,
  type PhanLoaiTranhChapRow,
  type KetQuaXuLyTranhChapRow,
} from "../lib/tranhChapShared";

interface TienTrinhStats {
  dangMo: number;
  ksnbTiepNhan: number;
  giamSatXuLy: number;
  quaHan: number;
  sapDenHan: number;
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
      api.get<Paged<ChoXuLyCase & { thoi_gian_hoan_thanh: string | null; last_ly_do_cham: string | null; so_ngay_cho: number }> & {
        choHon3Ngay: number;
        choHon7Ngay: number;
      }>(`/tranh-chap/cho-xu-ly${buildQuery({ page, pageSize: 10, khu_vuc: khuVucFilter })}`),
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

  type ChoXuLyRow = ChoXuLyCase & { thoi_gian_hoan_thanh: string | null; last_ly_do_cham: string | null; so_ngay_cho: number };

  const choXuLyColumns: Column<ChoXuLyRow>[] = [
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
        <Modal open onClose={() => setDetailId(null)} title={`Tiến trình ${detailId}`} width="max-w-2xl">
          <TienTrinhPanel
            id={detailId}
            currentUser={user}
            phanLoaiOptions={phanLoaiOptions?.rows.filter((r) => r.bat_tat) ?? []}
            ketQuaOptions={ketQuaOptions?.rows.filter((r) => r.bat_tat) ?? []}
            onOpenCase={openCase}
          />
        </Modal>
      )}
    </div>
  );
}
