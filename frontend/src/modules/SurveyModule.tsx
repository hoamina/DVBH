import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs } from "../components/ui/Tabs";
import { Btn } from "../components/ui/Btn";
import { Badge, statusTone } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { KhuVucFilterControl } from "../components/KhuVucFilterControl";
import { PaginatedTable, type Column } from "../components/ui/PaginatedTable";
import { ChartCanvas } from "../components/chart/ChartCanvas";
import { api, buildQuery } from "../api/client";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../auth/AuthContext";
import { LOAI_LOI_META, LOAI_LOI_KEYS, type LoaiLoi, type ViPhamRow } from "../types";
import { exportRowsToExcel } from "../lib/exportExcel";
import { CASE_FIELD_LABELS } from "../lib/caseFieldLabels";

// Khop dung field tra ve tu backend GET /survey?tab=... (xem SELECT trong backend/src/routes/survey.ts) -
// gop ca 2 hinh dang hang co the co (CanKhaoSatRow cho can-khao-sat/qua-han-khao-sat, ViPhamRow cho
// cho-qc/da-xu-ly), du 1 lan xuat chi co 1 trong 2 hinh dang.
const SURVEY_EXPORT_LABELS: Record<string, string> = {
  ...CASE_FIELD_LABELS,
  case_id: "Ca",
  ket_qua_goi_id: "ID cuộc gọi khảo sát",
  loai_loi: "Loại lỗi",
  ket_qua_cap_1: "Kết quả cấp 1",
  chot_bo_cap_2: "Chốt cấp 2",
  nguoi_ghi_nhan: "Người ghi nhận",
  ngay_ghi_nhan: "Ngày ghi nhận",
  nguoi_chot: "Người chốt",
  ngay_chot: "Ngày chốt",
  need_loi_120p: "Nghi ngờ lỗi 120 phút",
  need_loi_qua_han_24h: "Nghi ngờ hẹn quá 24h",
  need_loi_lo_ke_hoach: "Nghi ngờ lỡ kế hoạch",
  need_loi_kh_hen_lai: "Nghi ngờ KH hẹn lại",
};
import { QLDVBH_FILTER_VALUE } from "../constants";
import { SurveyCallWorkspace } from "./SurveyCallWorkspace";
import { useSurveyCandidates } from "../hooks/useSurveyCandidates";
import { TinhHuyenFilterControl } from "../components/TinhHuyenFilterControl";

interface FunnelData {
  nghiNgo: number;
  canKhaoSat: number;
  choQc: number;
  daXuLy: number;
}
interface LeaderboardRow {
  nhom?: string;
  giam_sat_email?: string;
  giam_sat?: string | null;
  so_vi_pham: number;
}
interface TrendRow {
  ngay: string;
  so_cuoc_goi: number;
}

export interface CanKhaoSatRow {
  id: string;
  khach_hang: string | null;
  khu_vuc: string | null;
  assigned_to: string | null;
  need_loi_120p: number;
  need_loi_qua_han_24h: number;
  need_loi_lo_ke_hoach: number;
  need_loi_kh_hen_lai: number;
  mo_ta_loi?: string | null;
  ky_thuat_vien?: string | null;
  tinh?: string | null;
  quan_huyen?: string | null;
  thoi_gian_cskh_tiep_nhan?: string | null;
  thoi_gian_hen_xu_ly?: string | null;
  thoi_gian_hoan_thanh?: string | null;
  link_crm?: string | null;
  noi_dung_xu_ly?: string | null;
}

interface SurveyBaoCaoRow {
  nhom: string;
  tong_tiep_nhan: number;
  tong_hoan_thanh: number;
  nghi_ngo_120p: number;
  nghi_ngo_24h: number;
  nghi_ngo_lkh: number;
  nghi_ngo_hl: number;
  da_goi_120p: number;
  da_goi_24h: number;
  da_goi_lkh: number;
  da_goi_hl: number;
  vi_pham_120p: number;
  vi_pham_24h: number;
  vi_pham_lkh: number;
  vi_pham_hl: number;
  tong_cuoc_goi: number;
  goi_thanh_cong: number;
  ty_le_nghi_ngo_120p: number;
  ty_le_nghi_ngo_24h: number;
  ty_le_nghi_ngo_lkh: number;
  ty_le_nghi_ngo_hl: number;
  ty_le_vi_pham_120p: number;
  ty_le_vi_pham_24h: number;
  ty_le_vi_pham_lkh: number;
  ty_le_vi_pham_hl: number;
  ty_le_da_goi_120p: number;
  ty_le_da_goi_24h: number;
  ty_le_da_goi_lkh: number;
  ty_le_da_goi_hl: number;
  ty_le_vi_pham_tren_da_goi_120p: number;
  ty_le_vi_pham_tren_da_goi_24h: number;
  ty_le_vi_pham_tren_da_goi_lkh: number;
  ty_le_vi_pham_tren_da_goi_hl: number;
  ty_le_da_goi_hen_lai_toan_he_thong: number;
  ty_le_ktv_chu_dong_toan_he_thong: number;
  ty_le_goi_thanh_cong: number;
}

const SURVEY_REPORT_DIM_OPTIONS = [
  { value: "khu_vuc", label: "Khu vực" },
  { value: "tinh", label: "Tỉnh" },
  { value: "ky_thuat_vien", label: "KTV" },
];

const SURVEY_BAO_CAO_EXPORT_LABELS: Record<string, string> = {
  nhom: "Nhóm",
  tong_tiep_nhan: "Tiếp nhận",
  tong_hoan_thanh: "Hoàn thành",
  nghi_ngo_120p: "Nghi ngờ 120 phút",
  ty_le_nghi_ngo_120p: "% Nghi ngờ 120 phút",
  da_goi_120p: "Đã gọi 120 phút",
  ty_le_da_goi_120p: "% Đã gọi 120 phút",
  vi_pham_120p: "Vi phạm 120 phút",
  ty_le_vi_pham_120p: "% Vi phạm 120 phút",
  ty_le_vi_pham_tren_da_goi_120p: "% Vi phạm / đã gọi 120 phút",
  nghi_ngo_24h: "Nghi ngờ quá 24h",
  ty_le_nghi_ngo_24h: "% Nghi ngờ quá 24h",
  da_goi_24h: "Đã gọi quá 24h",
  ty_le_da_goi_24h: "% Đã gọi quá 24h",
  vi_pham_24h: "Vi phạm quá 24h",
  ty_le_vi_pham_24h: "% Vi phạm quá 24h",
  ty_le_vi_pham_tren_da_goi_24h: "% Vi phạm / đã gọi quá 24h",
  nghi_ngo_lkh: "Nghi ngờ lỡ kế hoạch",
  ty_le_nghi_ngo_lkh: "% Nghi ngờ lỡ kế hoạch",
  da_goi_lkh: "Đã gọi lỡ kế hoạch",
  ty_le_da_goi_lkh: "% Đã gọi lỡ kế hoạch",
  vi_pham_lkh: "Vi phạm lỡ kế hoạch",
  ty_le_vi_pham_lkh: "% Vi phạm lỡ kế hoạch",
  ty_le_vi_pham_tren_da_goi_lkh: "% Vi phạm / đã gọi lỡ kế hoạch",
  nghi_ngo_hl: "Nghi ngờ hẹn lại",
  ty_le_nghi_ngo_hl: "% Nghi ngờ hẹn lại",
  da_goi_hl: "Đã gọi hẹn lại",
  ty_le_da_goi_hl: "% Đã gọi hẹn lại",
  vi_pham_hl: "Vi phạm hẹn lại",
  ty_le_vi_pham_hl: "% Vi phạm hẹn lại",
  ty_le_vi_pham_tren_da_goi_hl: "% Vi phạm / đã gọi hẹn lại",
  ty_le_da_goi_hen_lai_toan_he_thong: "% Đã gọi hẹn lại toàn hệ thống",
  ty_le_ktv_chu_dong_toan_he_thong: "% KTV chủ động toàn hệ thống",
  tong_cuoc_goi: "Tổng cuộc gọi",
  goi_thanh_cong: "Gọi thành công",
  ty_le_goi_thanh_cong: "% Gọi thành công",
};

// 1 o trong bang "Bao cao khao sat theo khu vuc" cho 1 loai nghi ngo (120p/24h/lo-ke-hoach/hen-lai) -
// 3 dong: Nghi ngo (bam duoc, drill xuong "can-khao-sat"), Da goi, Vi pham (kem % tren so da goi).
function renderLoaiCell(p: {
  nghiNgo: number;
  tyLeNghiNgo: number;
  daGoi: number;
  tyLeDaGoi: number;
  viPham: number;
  tyLeViPham: number;
  tyLeViPhamTrenDaGoi: number;
  onNghiNgoClick?: () => void;
}) {
  return (
    <div className="text-xs leading-snug whitespace-nowrap">
      <div>
        Nghi ngờ:{" "}
        {p.onNghiNgoClick ? (
          <button className="font-mono text-[var(--ocean-600)] hover:underline" onClick={p.onNghiNgoClick}>
            {p.nghiNgo}
          </button>
        ) : (
          <span className="font-mono">{p.nghiNgo}</span>
        )}{" "}
        ({p.tyLeNghiNgo}%)
      </div>
      <div className="text-[var(--ink-400)]">
        Đã gọi: <span className="font-mono">{p.daGoi}</span> ({p.tyLeDaGoi}%)
      </div>
      <div className="text-[var(--coral-500)]">
        Vi phạm: <span className="font-mono">{p.viPham}</span> ({p.tyLeViPham}% · {p.tyLeViPhamTrenDaGoi}% / đã gọi)
      </div>
    </div>
  );
}

export const FLAG_TO_LOAI: Record<string, LoaiLoi> = {
  need_loi_120p: "Loi 120 phut",
  need_loi_qua_han_24h: "Hen qua 24h",
  need_loi_lo_ke_hoach: "Loi lo ke hoach",
  need_loi_kh_hen_lai: "KH hen lai",
};

export function neededLoaiLoi(row: CanKhaoSatRow): LoaiLoi[] {
  return Object.entries(FLAG_TO_LOAI)
    .filter(([field]) => (row as unknown as Record<string, number>)[field])
    .map(([, loai]) => loai);
}

const VIEWS = [
  { key: "bao-cao", label: "Báo cáo" },
  { key: "danh-sach", label: "Danh sách chi tiết" },
];

const PAGE_SIZE = 20;

export function SurveyModule({ openCase }: { openCase: (id: string) => void }) {
  const [view, setView] = useState("bao-cao");
  const [tab, setTab] = useState("can-khao-sat");
  const [page, setPage] = useState(1);
  const [khuVucFilter, setKhuVucFilter] = useState("");
  // Bo loc mo rong cho "Bao cao khao sat theo khu vuc" (Phan C) - tinh/quanHuyen/ktv cung duoc
  // drillDown() set khi bam vao 1 o so trong bang pivot (giong khuVucFilter da co), nen anh huong
  // ca "Danh sach chi tiet" (xem matchAllFilters/filterParams ben duoi), khong chi rieng bang pivot.
  const [reportDim, setReportDim] = useState("khu_vuc");
  const [tinhFilter, setTinhFilter] = useState("");
  const [quanHuyenFilter, setQuanHuyenFilter] = useState("");
  const [ktvFilter, setKtvFilter] = useState("");
  const [nguoiKhaoSatFilter, setNguoiKhaoSatFilter] = useState("");
  const [thangReport, setThangReport] = useState(() => new Date().toISOString().slice(0, 7));
  const auth = useAuth();
  const role = auth.status === "authenticated" ? auth.user.vai_tro : null;
  const myAreas = auth.status === "authenticated" ? auth.user.khu_vuc_phu_trach : [];
  const addToast = useToast();
  const qc = useQueryClient();

  const isQC = role === "QC" || role === "Admin";
  const isLead = role === "TN CSKH" || role === "TBP CSKH" || role === "Admin";
  const canSurvey = ["CSKH", "TN CSKH", "TBP CSKH", "Admin"].includes(role ?? "");
  // NV CSKH (nhan vien khao sat truc tiep) chi can vao "Che do goi khao sat" de xu ly tung ca, khong
  // can xem "Danh sach chi tiet" (bang lien can khao sat/qua han/cho QC/da xu ly) - tab nay chi danh
  // cho vai tro quan ly (TN CSKH/TBP CSKH/QC/Admin) theo doi tong the.
  const canViewDanhSach = role !== "CSKH";
  const visibleViews = canViewDanhSach ? VIEWS : VIEWS.filter((v) => v.key !== "danh-sach");
  const effectiveView = canViewDanhSach ? view : "bao-cao";

  const filterParams = { khu_vuc: khuVucFilter, tinh: tinhFilter, quan_huyen: quanHuyenFilter, ky_thuat_vien: ktvFilter };

  // "Can khao sat"/"Qua han khao sat" tinh san tu snapshot R2 1 file (xem hooks/useSurveyCandidates.ts
  // + backend/src/lib/surveySnapshot.ts) - khong con goi song server moi lan xem, chi loc client-side
  // ben duoi (matchAllFilters) - ke ca tinh/quan_huyen/ky_thuat_vien moi them cho Phan C, vi cac
  // truong nay da co san tren CanKhaoSatRow (snapshot).
  const { canKhaoSat: canKhaoSatAll, quaHanKhaoSat: quaHanKhaoSatAll, isThrottled: candidatesThrottled, refetch: refetchCandidates } = useSurveyCandidates();

  function matchAllFilters(row: { khu_vuc: string | null; tinh?: string | null; quan_huyen?: string | null; ky_thuat_vien?: string | null }): boolean {
    if (khuVucFilter) {
      if (khuVucFilter === QLDVBH_FILTER_VALUE) {
        if (!row.khu_vuc || !row.khu_vuc.includes("qldvbh")) return false;
      } else {
        const set = new Set(
          khuVucFilter
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        );
        if (!row.khu_vuc || !set.has(row.khu_vuc)) return false;
      }
    }
    if (tinhFilter && row.tinh !== tinhFilter) return false;
    if (quanHuyenFilter && row.quan_huyen !== quanHuyenFilter) return false;
    if (ktvFilter && row.ky_thuat_vien !== ktvFilter) return false;
    return true;
  }

  const canKhaoSatRows = useMemo(
    () => canKhaoSatAll.filter(matchAllFilters),
    [canKhaoSatAll, khuVucFilter, tinhFilter, quanHuyenFilter, ktvFilter],
  );
  const quaHanKhaoSatRows = useMemo(
    () => quaHanKhaoSatAll.filter(matchAllFilters),
    [quaHanKhaoSatAll, khuVucFilter, tinhFilter, quanHuyenFilter, ktvFilter],
  );

  const { data: choQc } = useQuery({
    queryKey: ["survey", "cho-qc", filterParams],
    queryFn: () => api.get<{ rows: ViPhamRow[] }>(`/survey${buildQuery({ tab: "cho-qc", ...filterParams })}`),
    enabled: view === "danh-sach" && tab === "cho-qc",
  });
  const { data: daXuLy } = useQuery({
    queryKey: ["survey", "da-xu-ly", filterParams],
    queryFn: () => api.get<{ rows: ViPhamRow[] }>(`/survey${buildQuery({ tab: "da-xu-ly", ...filterParams })}`),
    enabled: view === "danh-sach" && tab === "da-xu-ly",
  });
  const { data: counts } = useQuery({
    queryKey: ["survey-counts", khuVucFilter],
    queryFn: () => api.get<Record<string, number>>(`/survey/counts${buildQuery({ khu_vuc: khuVucFilter })}`),
  });
  const { data: baoCaoKhuVuc } = useQuery({
    queryKey: ["survey-bao-cao-khu-vuc", reportDim, khuVucFilter, tinhFilter, quanHuyenFilter, ktvFilter, nguoiKhaoSatFilter, thangReport],
    queryFn: () =>
      api.get<{ rows: SurveyBaoCaoRow[]; thang: string }>(
        `/survey/bao-cao-khu-vuc${buildQuery({
          dim: reportDim,
          khu_vuc: khuVucFilter,
          tinh: tinhFilter,
          quan_huyen: quanHuyenFilter,
          ky_thuat_vien: ktvFilter,
          nguoi_khao_sat: nguoiKhaoSatFilter,
          thang: thangReport,
        })}`,
      ),
  });
  const { data: khuVucOptions } = useQuery({
    queryKey: ["dashboard-filters"],
    queryFn: () =>
      api.get<{ khuVuc: string[]; hang: string[]; tinh: string[]; kyThuatVien: string[]; tinhHuyen: Record<string, string[]> }>("/dashboard/filters"),
  });
  const { data: cskhList } = useQuery({
    queryKey: ["cskh-list"],
    queryFn: () => api.get<{ rows: { email: string; ten: string | null }[] }>("/survey/cskh-list"),
    enabled: isLead,
  });
  const { data: funnel } = useQuery({
    queryKey: ["vi-pham-funnel"],
    queryFn: () => api.get<FunnelData>("/vi-pham/funnel"),
  });
  const { data: ktvBoard } = useQuery({
    queryKey: ["vi-pham-leaderboard", "ktv"],
    queryFn: () => api.get<{ rows: LeaderboardRow[] }>("/vi-pham/leaderboard?by=ktv"),
  });
  const { data: giamSatBoard } = useQuery({
    queryKey: ["vi-pham-leaderboard", "giam-sat"],
    queryFn: () => api.get<{ rows: LeaderboardRow[] }>("/vi-pham/leaderboard?by=giam-sat"),
  });
  const { data: trend } = useQuery({
    queryKey: ["survey-trend"],
    queryFn: () => api.get<{ rows: TrendRow[] }>("/survey/trend?days=30"),
  });
  const trendRows = trend?.rows ?? [];

  const groupedViPham = useMemo(() => {
    const list = tab === "cho-qc" ? choQc?.rows ?? [] : daXuLy?.rows ?? [];
    const g = new Map<string, ViPhamRow[]>();
    for (const v of list) {
      if (!g.has(v.case_id)) g.set(v.case_id, []);
      g.get(v.case_id)!.push(v);
    }
    return Array.from(g.entries()).map(([caseId, vs]) => ({ caseId, vs }));
  }, [tab, choQc, daXuLy]);

  // Bam vao 1 o so trong bang "Bao cao khao sat theo khu vuc" - gan gia tri dong do vao dung bo loc
  // ung voi reportDim dang chon (giong drillDown trong BacklogModule.tsx), roi chuyen sang Danh
  // sach chi tiet voi tab tuong ung. "nguoiKhaoSatFilter" KHONG tham gia (chi anh huong tu so bang
  // bao cao, khong phai 1 dim de nhom/loc danh sach).
  function drillDown(value: string, targetTab: string) {
    if (reportDim === "khu_vuc") setKhuVucFilter(value);
    else if (reportDim === "tinh") setTinhFilter(value);
    else if (reportDim === "quan_huyen") setQuanHuyenFilter(value);
    else if (reportDim === "ky_thuat_vien") setKtvFilter(value);
    setTab(targetTab);
    setPage(1);
    setView("danh-sach");
  }

  const [assignModal, setAssignModal] = useState<CanKhaoSatRow | null>(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  const qcDecide = useMutation({
    mutationFn: ({ id, chot }: { id: string; chot: boolean }) => api.patch(`/vi-pham/${id}/cap2`, { chot }),
    onSuccess: (_d, vars) => {
      addToast(`QC đã ${vars.chot ? "chốt" : "bỏ"} vi phạm cấp 2 cho ${vars.id}`);
      qc.invalidateQueries({ queryKey: ["survey"] });
      qc.invalidateQueries({ queryKey: ["survey-counts"] });
    },
  });

  async function handleExport() {
    if (tab === "can-khao-sat" || tab === "qua-han-khao-sat") {
      const rows = tab === "can-khao-sat" ? canKhaoSatRows : quaHanKhaoSatRows;
      await exportRowsToExcel(rows, `khao_sat_${tab}.xlsx`, "Data", SURVEY_EXPORT_LABELS);
      return;
    }
    const res = await api.get<{ rows: Record<string, unknown>[] }>(`/survey${buildQuery({ tab, export: true, ...filterParams })}`);
    await exportRowsToExcel(res.rows, `khao_sat_${tab}.xlsx`, "Data", SURVEY_EXPORT_LABELS);
  }

  return (
    <div className="anim-in">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="text-sm text-[var(--ink-600)] max-w-2xl">
          Các ca được hệ thống tự động gắn cờ <b>“nghi ngờ vi phạm – cần khảo sát”</b>. CSKH xác minh thực tế qua điện thoại trước khi kết luận có vi phạm hay không.
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap mb-1 mt-2">
        <KhuVucFilterControl
          value={khuVucFilter}
          onChange={(v) => {
            setKhuVucFilter(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "Tất cả khu vực" },
            { value: QLDVBH_FILTER_VALUE, label: "Tất cả DVBH (MB/MN...)" },
            ...(khuVucOptions?.khuVuc.map((k) => ({ value: k, label: k })) ?? []),
          ]}
          myAreas={myAreas}
        />
        {canSurvey && (
          <Btn size="sm" onClick={() => setWorkspaceOpen(true)}>
            🎧 Vào chế độ gọi khảo sát
          </Btn>
        )}
      </div>

      <Tabs active={effectiveView} onChange={setView} tabs={visibleViews} />

      {effectiveView === "bao-cao" ? (
        <div className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <Card className="p-4 lg:col-span-2">
              <div className="font-display font-bold text-sm mb-3">Phễu xử lý vi phạm</div>
              <ChartCanvas
                type="bar"
                data={{
                  labels: ["Nghi ngờ vi phạm", "Cần khảo sát", "Chờ QC chốt cấp 2", "Đã xử lý xong"],
                  datasets: [
                    {
                      label: "Số ca",
                      data: [funnel?.nghiNgo ?? 0, funnel?.canKhaoSat ?? 0, funnel?.choQc ?? 0, funnel?.daXuLy ?? 0],
                      backgroundColor: ["#D98A1F", "#1591C9", "#D84C4C", "#159C93"],
                      borderRadius: 6,
                    },
                  ],
                }}
                options={{ indexAxis: "y" as const }}
              />
            </Card>
            <Card className="p-4">
              <div className="font-display font-bold text-sm mb-3">Xu hướng cuộc gọi khảo sát (30 ngày)</div>
              <ChartCanvas
                type="line"
                data={{
                  labels: trendRows.map((r) => new Date(r.ngay).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })),
                  datasets: [{ label: "Số cuộc gọi", data: trendRows.map((r) => r.so_cuoc_goi), borderColor: "#159C93", backgroundColor: "rgba(21,156,147,0.1)", tension: 0.35, fill: true, pointRadius: 2 }],
                }}
              />
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card className="p-4">
              <div className="font-display font-bold text-sm mb-3">Top 10 KTV nhiều vi phạm đã xác nhận nhất</div>
              <ChartCanvas
                type="bar"
                data={{
                  labels: (ktvBoard?.rows ?? []).map((r) => r.nhom ?? "—"),
                  datasets: [{ label: "Số vi phạm", data: (ktvBoard?.rows ?? []).map((r) => r.so_vi_pham), backgroundColor: "#D84C4C", borderRadius: 6 }],
                }}
                options={{ indexAxis: "y" as const }}
              />
            </Card>
            <Card className="p-4">
              <div className="font-display font-bold text-sm mb-3">Top 10 Giám sát nhiều vi phạm đã xác nhận nhất</div>
              <ChartCanvas
                type="bar"
                data={{
                  labels: (giamSatBoard?.rows ?? []).map((r) => r.giam_sat ?? r.giam_sat_email ?? "—"),
                  datasets: [{ label: "Số vi phạm", data: (giamSatBoard?.rows ?? []).map((r) => r.so_vi_pham), backgroundColor: "#D98A1F", borderRadius: 6 }],
                }}
                options={{ indexAxis: "y" as const }}
              />
            </Card>
          </div>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <div className="font-display font-bold text-sm">Báo cáo khảo sát theo khu vực</div>
                {canViewDanhSach && <div className="text-xs text-[var(--ink-400)] mt-0.5">Bấm vào số "Nghi ngờ" để lọc thẳng xuống danh sách chi tiết.</div>}
              </div>
              <Btn
                variant="ghost"
                size="sm"
                onClick={() =>
                  exportRowsToExcel(baoCaoKhuVuc?.rows ?? [], "bao_cao_khao_sat_khu_vuc.xlsx", "Data", SURVEY_BAO_CAO_EXPORT_LABELS)
                }
              >
                ⬇ Xuất Excel
              </Btn>
            </div>

            <div className="flex items-center gap-2 flex-wrap mb-3">
              <Select
                value={reportDim}
                onChange={(v) => {
                  setReportDim(v);
                  setPage(1);
                }}
                options={[
                  ...SURVEY_REPORT_DIM_OPTIONS,
                  ...(tinhFilter ? [{ value: "quan_huyen", label: "Quận/Huyện" }] : []),
                ]}
              />
              <TinhHuyenFilterControl
                tinh={tinhFilter}
                quanHuyen={quanHuyenFilter}
                tinhOptions={khuVucOptions?.tinh ?? []}
                tinhHuyenMap={khuVucOptions?.tinhHuyen ?? {}}
                onTinhChange={setTinhFilter}
                onQuanHuyenChange={setQuanHuyenFilter}
              />
              <Select
                value={ktvFilter}
                onChange={setKtvFilter}
                options={[{ value: "", label: "Tất cả KTV" }, ...(khuVucOptions?.kyThuatVien ?? []).map((k) => ({ value: k, label: k }))]}
              />
              {isLead && (
                <Select
                  value={nguoiKhaoSatFilter}
                  onChange={setNguoiKhaoSatFilter}
                  options={[{ value: "", label: "Tất cả CSKH khảo sát" }, ...(cskhList?.rows ?? []).map((u) => ({ value: u.email, label: u.ten ?? u.email }))]}
                />
              )}
              <input
                type="month"
                value={thangReport}
                onChange={(e) => setThangReport(e.target.value)}
                className="focus-ring border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-sm"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="dense w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--ink-400)] text-xs uppercase border-b border-[var(--line)]">
                    <th className="py-2 pr-3">{SURVEY_REPORT_DIM_OPTIONS.find((d) => d.value === reportDim)?.label ?? (reportDim === "quan_huyen" ? "Quận/Huyện" : "Nhóm")}</th>
                    <th className="py-2 pr-3">Tiếp nhận</th>
                    <th className="py-2 pr-3">Hoàn thành</th>
                    <th className="py-2 pr-3">120 phút</th>
                    <th className="py-2 pr-3">Quá 24h</th>
                    <th className="py-2 pr-3">Lỡ kế hoạch</th>
                    <th className="py-2 pr-3">Hẹn lại</th>
                    <th className="py-2 pr-3">% Gọi hẹn lại toàn HT</th>
                    <th className="py-2 pr-3">% KTV chủ động toàn HT</th>
                    <th className="py-2 pr-3">Gọi thành công</th>
                  </tr>
                </thead>
                <tbody>
                  {(baoCaoKhuVuc?.rows ?? []).map((r) => (
                    <tr key={r.nhom} className="border-b border-[var(--line)] last:border-0 hover:bg-slate-50 align-top">
                      <td className="py-2 pr-3 font-semibold">{r.nhom}</td>
                      <td className="py-2 pr-3 font-mono">{r.tong_tiep_nhan}</td>
                      <td className="py-2 pr-3 font-mono">{r.tong_hoan_thanh}</td>
                      <td className="py-2 pr-3">
                        {renderLoaiCell({
                          nghiNgo: r.nghi_ngo_120p,
                          tyLeNghiNgo: r.ty_le_nghi_ngo_120p,
                          daGoi: r.da_goi_120p,
                          tyLeDaGoi: r.ty_le_da_goi_120p,
                          viPham: r.vi_pham_120p,
                          tyLeViPham: r.ty_le_vi_pham_120p,
                          tyLeViPhamTrenDaGoi: r.ty_le_vi_pham_tren_da_goi_120p,
                          onNghiNgoClick: canViewDanhSach ? () => drillDown(r.nhom, "can-khao-sat") : undefined,
                        })}
                      </td>
                      <td className="py-2 pr-3">
                        {renderLoaiCell({
                          nghiNgo: r.nghi_ngo_24h,
                          tyLeNghiNgo: r.ty_le_nghi_ngo_24h,
                          daGoi: r.da_goi_24h,
                          tyLeDaGoi: r.ty_le_da_goi_24h,
                          viPham: r.vi_pham_24h,
                          tyLeViPham: r.ty_le_vi_pham_24h,
                          tyLeViPhamTrenDaGoi: r.ty_le_vi_pham_tren_da_goi_24h,
                          onNghiNgoClick: canViewDanhSach ? () => drillDown(r.nhom, "can-khao-sat") : undefined,
                        })}
                      </td>
                      <td className="py-2 pr-3">
                        {renderLoaiCell({
                          nghiNgo: r.nghi_ngo_lkh,
                          tyLeNghiNgo: r.ty_le_nghi_ngo_lkh,
                          daGoi: r.da_goi_lkh,
                          tyLeDaGoi: r.ty_le_da_goi_lkh,
                          viPham: r.vi_pham_lkh,
                          tyLeViPham: r.ty_le_vi_pham_lkh,
                          tyLeViPhamTrenDaGoi: r.ty_le_vi_pham_tren_da_goi_lkh,
                          onNghiNgoClick: canViewDanhSach ? () => drillDown(r.nhom, "can-khao-sat") : undefined,
                        })}
                      </td>
                      <td className="py-2 pr-3">
                        {renderLoaiCell({
                          nghiNgo: r.nghi_ngo_hl,
                          tyLeNghiNgo: r.ty_le_nghi_ngo_hl,
                          daGoi: r.da_goi_hl,
                          tyLeDaGoi: r.ty_le_da_goi_hl,
                          viPham: r.vi_pham_hl,
                          tyLeViPham: r.ty_le_vi_pham_hl,
                          tyLeViPhamTrenDaGoi: r.ty_le_vi_pham_tren_da_goi_hl,
                          onNghiNgoClick: canViewDanhSach ? () => drillDown(r.nhom, "can-khao-sat") : undefined,
                        })}
                      </td>
                      <td className="py-2 pr-3 font-mono">{r.ty_le_da_goi_hen_lai_toan_he_thong}%</td>
                      <td className="py-2 pr-3 font-mono">{r.ty_le_ktv_chu_dong_toan_he_thong}%</td>
                      <td className="py-2 pr-3 font-mono">
                        {r.goi_thanh_cong}/{r.tong_cuoc_goi} ({r.ty_le_goi_thanh_cong}%)
                      </td>
                    </tr>
                  ))}
                  {(baoCaoKhuVuc?.rows ?? []).length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-[var(--ink-400)] text-sm">
                        Không có dữ liệu.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            {(tinhFilter || quanHuyenFilter || ktvFilter) && (
              <div className="text-xs text-[var(--ink-400)]">
                Đang lọc thêm:{" "}
                {[tinhFilter && `Tỉnh "${tinhFilter}"`, quanHuyenFilter && `Huyện "${quanHuyenFilter}"`, ktvFilter && `KTV "${ktvFilter}"`].filter(Boolean).join(", ")}{" "}
                <button
                  className="text-[var(--ocean-600)] underline"
                  onClick={() => {
                    setTinhFilter("");
                    setQuanHuyenFilter("");
                    setKtvFilter("");
                    setPage(1);
                  }}
                >
                  Xóa bộ lọc
                </button>
              </div>
            )}
            <Btn variant="ghost" size="sm" onClick={handleExport} className="ml-auto">
              ⬇ Xuất Excel
            </Btn>
          </div>
          <Tabs
            active={tab}
            onChange={(k) => {
              setTab(k);
              setPage(1);
            }}
            tabs={[
              { key: "can-khao-sat", label: "Cần khảo sát", count: counts?.["can-khao-sat"] },
              { key: "qua-han-khao-sat", label: "Quá hạn khảo sát", count: counts?.["qua-han-khao-sat"] },
              { key: "cho-qc", label: "Chờ QC chốt cấp 2", count: counts?.["cho-qc"] },
              { key: "da-xu-ly", label: "Đã xử lý xong", count: counts?.["da-xu-ly"] },
            ]}
          />

          {tab === "can-khao-sat" && isLead && (
            <div className="flex justify-end mb-2">
              <Btn variant="ghost" size="sm" onClick={() => setBulkAssignOpen(true)}>
                ⇄ Gán CSKH hàng loạt
              </Btn>
            </div>
          )}
          {bulkAssignOpen && <BulkAssignModal onClose={() => setBulkAssignOpen(false)} canKhaoSatRows={canKhaoSatRows} onDataChanged={refetchCandidates} />}

          {tab === "qua-han-khao-sat" && (
            <div className="text-xs text-[var(--ink-400)] mb-2">Ca đã hoàn thành quá 3 ngày mà chưa khảo sát — có thể gọi hoặc bỏ qua nếu đã quá muộn.</div>
          )}
          {(tab === "can-khao-sat" || tab === "qua-han-khao-sat") && candidatesThrottled && (
            <div className="text-xs text-[var(--ink-400)] italic mb-2">Đã đạt giới hạn tải, đang hiển thị dữ liệu đã lưu gần nhất — tự thử lại sau ít phút.</div>
          )}

          {(tab === "can-khao-sat" || tab === "qua-han-khao-sat") &&
            (() => {
              const fullRows = tab === "can-khao-sat" ? canKhaoSatRows : quaHanKhaoSatRows;
              const columns: Column<CanKhaoSatRow>[] = [
                { key: "id", header: "Ca", render: (row) => (
                  <span className="font-mono text-[var(--ocean-600)] font-semibold cursor-pointer" onClick={() => openCase(row.id)}>
                    {row.id}
                  </span>
                ) },
                { key: "khach_hang", header: "Khách hàng / Khu vực", render: (row) => (
                  <>
                    {row.khach_hang}
                    <div className="text-xs text-[var(--ink-400)]">{row.khu_vuc}</div>
                  </>
                ) },
                { key: "loai_loi", header: "Loại lỗi nghi ngờ", render: (row) => (
                  <div className="flex flex-wrap gap-1">
                    {neededLoaiLoi(row).map((loai) => (
                      <Badge key={loai} tone="ocean">
                        {LOAI_LOI_META[loai].short}
                      </Badge>
                    ))}
                  </div>
                ) },
                { key: "assigned_to", header: "Phân công", render: (row) => <span className="text-xs">{row.assigned_to || <span className="italic text-[var(--ink-400)]">Chưa phân công</span>}</span> },
                {
                  key: "action",
                  header: "",
                  className: "text-right",
                  render: (row) =>
                    isLead ? (
                      <div className="flex gap-1.5 justify-end">
                        <Btn size="sm" variant="ghost" onClick={() => setAssignModal(row)}>
                          Phân công
                        </Btn>
                      </div>
                    ) : null,
                },
              ];
              return (
                <PaginatedTable
                  columns={columns}
                  rows={fullRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
                  isLoading={false}
                  isError={false}
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={fullRows.length}
                  onPageChange={setPage}
                  rowKey={(row) => row.id}
                  emptyText="Không có mục nào."
                />
              );
            })()}

          {(tab === "cho-qc" || tab === "da-xu-ly") &&
            (() => {
              const columns: Column<(typeof groupedViPham)[number]>[] = [
                {
                  key: "caseId",
                  header: "Ca",
                  render: ({ caseId }) => (
                    <span className="font-mono text-[var(--ocean-600)] font-semibold cursor-pointer" onClick={() => openCase(caseId)}>
                      #{caseId}
                    </span>
                  ),
                },
                {
                  key: "khach_hang",
                  header: "Khách hàng / Khu vực",
                  render: ({ vs }) => (
                    <>
                      {vs[0].khach_hang}
                      <div className="text-xs text-[var(--ink-400)]">{vs[0].khu_vuc}</div>
                    </>
                  ),
                },
                {
                  key: "ket_qua",
                  header: "Kết quả khảo sát",
                  render: ({ vs }) => (
                    <div className="flex flex-wrap gap-1">
                      {vs.map((v) => (
                        <Badge key={v.id} tone={statusTone(v.chot_bo_cap_2 !== null ? (v.chot_bo_cap_2 ? "đã xác nhận" : "Không vi phạm") : "chờ QC")}>
                          {LOAI_LOI_META[v.loai_loi]?.short ?? v.loai_loi} · {v.ket_qua_cap_1}
                        </Badge>
                      ))}
                    </div>
                  ),
                },
                {
                  key: "action",
                  header: "",
                  className: "text-right",
                  render: ({ caseId, vs }) => (
                    <div className="text-right">
                      {tab === "cho-qc" && isQC && (
                        <div className="flex gap-1.5 justify-end flex-wrap">
                          {vs.map((v) => (
                            <span key={v.id} className="flex gap-1">
                              <Btn size="sm" variant="success" onClick={() => qcDecide.mutate({ id: v.id, chot: true })}>
                                Chốt {LOAI_LOI_META[v.loai_loi]?.short}
                              </Btn>
                              <Btn size="sm" variant="danger" onClick={() => qcDecide.mutate({ id: v.id, chot: false })}>
                                Bỏ {LOAI_LOI_META[v.loai_loi]?.short}
                              </Btn>
                            </span>
                          ))}
                        </div>
                      )}
                      {tab === "cho-qc" && !isQC && <span className="text-xs text-[var(--ink-400)] italic">Chờ QC xử lý</span>}
                      {tab === "da-xu-ly" && (
                        <Btn size="sm" variant="ghost" onClick={() => openCase(caseId)}>
                          Xem chi tiết
                        </Btn>
                      )}
                    </div>
                  ),
                },
              ];
              return (
                <PaginatedTable
                  columns={columns}
                  rows={groupedViPham.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
                  isLoading={false}
                  isError={false}
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={groupedViPham.length}
                  onPageChange={setPage}
                  rowKey={({ caseId }) => caseId}
                  emptyText="Không có mục nào."
                />
              );
            })()}
        </div>
      )}

      {assignModal && <AssignModal row={assignModal} onClose={() => setAssignModal(null)} onDataChanged={refetchCandidates} />}
      {workspaceOpen && <SurveyCallWorkspace onExit={() => setWorkspaceOpen(false)} openCase={openCase} initialKhuVuc={khuVucFilter} />}
    </div>
  );
}

function AssignModal({ row, onClose, onDataChanged }: { row: CanKhaoSatRow; onClose: () => void; onDataChanged: () => void }) {
  const { data: cskhList } = useQuery({
    queryKey: ["cskh-list"],
    queryFn: () => api.get<{ rows: { email: string; ten: string | null }[] }>("/survey/cskh-list"),
  });
  const [cskh, setCskh] = useState("");
  const [openAll, setOpenAll] = useState(false);
  const addToast = useToast();
  const qc = useQueryClient();

  const submit = useMutation({
    mutationFn: () => api.post("/survey/assign", { case_id: row.id, assigned_to: openAll ? null : cskh || null }),
    onSuccess: () => {
      addToast(`Đã phân công khảo sát ca ${row.id}`);
      qc.invalidateQueries({ queryKey: ["survey"] });
      qc.invalidateQueries({ queryKey: ["survey-counts"] });
      onDataChanged();
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title={`Phân công khảo sát — Ca ${row.id}`}>
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={openAll} onChange={(e) => setOpenAll(e.target.checked)} /> Mở cho tất cả CSKH cùng nhận (ai gọi trước được tính năng suất)
        </label>
        {!openAll && (
          <div>
            <label className="text-xs font-semibold text-[var(--ink-400)]">Phân công cho CSKH cụ thể</label>
            <Select
              value={cskh}
              onChange={setCskh}
              options={[{ value: "", label: "— Chọn CSKH —" }, ...(cskhList?.rows ?? []).map((u) => ({ value: u.email, label: u.ten ?? u.email }))]}
              className="w-full mt-1"
            />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>
            Hủy
          </Btn>
          <Btn onClick={() => submit.mutate()} disabled={submit.isPending || (!openAll && !cskh)}>
            Xác nhận phân công
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

interface BulkAssignSummary {
  capNhat: number;
  loi: number;
  errors: string[];
}

function BulkAssignModal({
  onClose,
  canKhaoSatRows,
  onDataChanged,
}: {
  onClose: () => void;
  canKhaoSatRows: CanKhaoSatRow[];
  onDataChanged: () => void;
}) {
  const [step, setStep] = useState<"idle" | "preview">("idle");
  const [preview, setPreview] = useState<BulkAssignSummary | null>(null);
  const [rows, setRows] = useState<{ id?: string; assigned_to?: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addToast = useToast();
  const qc = useQueryClient();

  async function handleDownload() {
    await exportRowsToExcel(canKhaoSatRows, "can_khao_sat_gan_cskh.xlsx");
  }

  const previewMutation = useMutation({
    mutationFn: (rows: { id?: string; assigned_to?: string }[]) => api.post<BulkAssignSummary>("/survey/assign-bulk/preview", { rows }),
    onSuccess: (summary) => {
      setPreview(summary);
      setStep("preview");
    },
    onError: () => addToast("Không đọc được file, kiểm tra lại định dạng."),
  });

  const commitMutation = useMutation({
    mutationFn: () => api.post<BulkAssignSummary>("/survey/assign-bulk/commit", { rows }),
    onSuccess: (summary) => {
      addToast(`Đã gán CSKH cho ${summary.capNhat} ca`);
      qc.invalidateQueries({ queryKey: ["survey"] });
      qc.invalidateQueries({ queryKey: ["survey-counts"] });
      onDataChanged();
      onClose();
    },
    onError: () => addToast("Gán CSKH hàng loạt thất bại, thử lại sau."),
  });

  async function handleFileChosen(file: File) {
    const XLSX = await import("xlsx");
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      const workbook = XLSX.read(data, { type: "binary" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<{ id?: string; assigned_to?: string }>(sheet, { defval: "" });
      setRows(parsed);
      previewMutation.mutate(parsed);
    };
    reader.readAsBinaryString(file);
  }

  return (
    <Modal open onClose={onClose} title="Gán CSKH hàng loạt" width="max-w-xl">
      <div className="text-sm text-[var(--ink-600)] mb-4">
        1. Tải danh sách hiện tại (có cột <b className="font-mono">assigned_to</b>) → 2. Điền email CSKH phụ trách cho từng dòng trong Excel → 3. Tải file đã điền lên
        đây để cập nhật hàng loạt.
      </div>
      <Btn variant="ghost" size="sm" onClick={handleDownload} className="mb-4">
        ⬇ Tải danh sách hiện tại
      </Btn>

      {step === "idle" && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer border-2 border-dashed border-[var(--ocean-100)] rounded-2xl p-8 text-center hover:border-[var(--ocean-400)] hover:bg-[var(--ocean-100)]/20 transition-colors"
        >
          <div className="text-2xl mb-2">⇩</div>
          <div className="font-semibold text-sm text-[var(--ink-900)]">{previewMutation.isPending ? "Đang phân tích file…" : "Bấm để chọn file đã điền"}</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileChosen(file);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {step === "preview" && preview && (
        <div className="anim-in">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl bg-[var(--teal-500)]/10 p-3">
              <div className="text-xs text-[var(--ink-400)]">Sẽ cập nhật</div>
              <div className="text-xl font-bold text-[var(--teal-500)]">{preview.capNhat}</div>
            </div>
            <div className="rounded-xl bg-[var(--coral-500)]/10 p-3">
              <div className="text-xs text-[var(--ink-400)]">Lỗi</div>
              <div className="text-xl font-bold text-[var(--coral-500)]">{preview.loi}</div>
            </div>
          </div>
          {preview.errors.length > 0 && (
            <div className="text-xs text-[var(--coral-500)] mb-4 max-h-24 overflow-y-auto">
              {preview.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Btn onClick={() => commitMutation.mutate()} disabled={commitMutation.isPending || preview.capNhat === 0}>
              {commitMutation.isPending ? "Đang cập nhật…" : "Xác nhận gán CSKH"}
            </Btn>
            <Btn
              variant="ghost"
              onClick={() => {
                setStep("idle");
                setPreview(null);
              }}
            >
              Hủy
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}
